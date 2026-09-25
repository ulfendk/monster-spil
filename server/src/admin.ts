import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  DISASTER_KINDS,
  cleanDisasterSettings,
  cleanRoamSettings,
  currentRaid,
  freshRaid,
  raidView,
  scoreboard,
  weekIdFor,
  type BossDefinition,
  type DisasterConfigs,
  type DisasterKind,
} from "@monster-spil/shared";
import { clientAddress, KeyGate } from "./key-gate.js";
import type { GameRegistry } from "./games.js";
import type { LobbyRoom } from "./LobbyRoom.js";
import { bossForWeek } from "./bosses.js";
import { ADMIN_PAGE } from "./admin-page.js";

/**
 * The parent's admin portal at /admin, served by the game server itself. Off unless
 * ADMIN_PASSWORD is set. Logging in (with its own wrong-guess lockout) gives a 12-hour
 * session cookie; the page then uses a small JSON API:
 *
 *   GET  /admin                                  the page
 *   POST /admin/login  {password}                → session cookie
 *   POST /admin/logout
 *   GET  /admin/api/games                        every game, with its key and player counts
 *   POST /admin/api/games  {navn, key}           create a game
 *   and per game, under /admin/api/games/<gameId>:
 *   GET  /state                                  players, scores, backups, the dragon
 *   POST /rename  {navn}   /key  {key}   /delete  (changing the key or deleting sends everyone away)
 *   POST /players/<id>/delete                    forget a player (scores, backup, rewards)
 *   POST /players/<id>/rename  {navn}            the device takes the new name when it connects
 *   POST /dragon  {action:"reset"} | {action:"hp", hp} | {action:"roam", enabled, meanMinutes, randomness} | {action:"fly"}
 *   POST /scores/clear                           remove this week's points
 *   POST /disasters/settings  {enabled, meanMinutes, randomness, kinds}
 *   POST /disasters/trigger  {kind?, target?}    one now (random kind and place when not given)
 *   POST /disasters/heal                         heal every soft change now
 *   POST /disasters/reset                        every map back to how it was drawn
 *   GET  /backups[/<id>]                         download one backup, or all
 */
export interface AdminDeps {
  password: string | undefined;
  registry: GameRegistry;
  bosses: BossDefinition[];
  disasterConfigs: DisasterConfigs;
  /** The game's room (every game has one while the server runs). */
  room: (gameId: string) => LobbyRoom | undefined;
  /** Opens a game's room (a new game's, or one that failed to open). */
  openRoom: (gameId: string) => Promise<void>;
}

const SESSION_MS = 12 * 60 * 60 * 1000;
const COOKIE = "mj_admin";
const MAX_BODY = 10_000;
/** Same limit as the name field when a player is set up on the device. */
const PLAYER_NAME_MAX = 12;

type Json = Record<string, unknown> | undefined;

export class AdminPortal {
  private sessions = new Map<string, number>();
  private gate = new KeyGate();

  constructor(private readonly deps: AdminDeps) {}

  /** Handles /admin requests; returns false for any other path. */
  handle(req: IncomingMessage, res: ServerResponse): boolean {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== "/admin" && !url.pathname.startsWith("/admin/")) return false;
    void this.route(req, res, url.pathname).catch((error: unknown) => {
      console.error("Admin portal error:", error);
      if (!res.headersSent) json(res, 500, { error: "server error" });
    });
    return true;
  }

  private async route(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<void> {
    const password = this.deps.password;
    if (!password) return json(res, 404, { error: "admin portal is off (set ADMIN_PASSWORD)" });
    const method = req.method ?? "GET";

    if (pathname === "/admin" && method === "GET") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...SECURITY_HEADERS }).end(ADMIN_PAGE);
      return;
    }
    if (pathname === "/admin/login" && method === "POST") {
      const body = await readJson(req);
      const address = clientAddress(req.headers, req.socket.remoteAddress ?? "unknown");
      if (!this.gate.check(address, body?.password, password)) return json(res, 401, { error: "forkert adgangskode" });
      const token = randomBytes(32).toString("base64url");
      this.sessions.set(token, Date.now() + SESSION_MS);
      res.setHeader("Set-Cookie", cookie(req, token, SESSION_MS / 1000));
      return json(res, 200, { ok: true });
    }
    if (pathname === "/admin/logout" && method === "POST") {
      const token = sessionToken(req);
      if (token) this.sessions.delete(token);
      res.setHeader("Set-Cookie", cookie(req, "", 0));
      return json(res, 200, { ok: true });
    }

    // Everything below needs a session.
    if (!this.loggedIn(req)) return json(res, 401, { error: "ikke logget ind" });
    // State changes must come from the page itself (no cross-site form posts).
    if (method === "POST" && req.headers["x-admin"] !== "1") return json(res, 403, { error: "missing x-admin header" });

    const { registry } = this.deps;
    if (pathname === "/admin/api/games" && method === "GET") return json(res, 200, { games: await this.games() });
    if (pathname === "/admin/api/games" && method === "POST") {
      const body = await readJson(req);
      const made = await registry.create(body?.navn, body?.key);
      if (made.ok) await this.deps.openRoom(made.game.id);
      return json(res, made.ok ? 200 : 400, made.ok ? { ok: true, gameId: made.game.id } : made);
    }

    const scoped = /^\/admin\/api\/games\/([^/]+)(\/.*)$/.exec(pathname);
    if (!scoped) return json(res, 404, { error: "not found" });
    const gameId = decodeURIComponent(scoped[1]!);
    const game = registry.get(gameId);
    if (!game) return json(res, 404, { error: "intet spil" });
    const sub = scoped[2]!;
    const room = this.deps.room(gameId);

    if (sub === "/state" && method === "GET") return json(res, 200, await this.state(gameId));
    if (sub === "/rename" && method === "POST") {
      const done = await registry.rename(gameId, (await readJson(req))?.navn);
      if (done.ok) room?.adminRenamedGame(done.game.navn);
      return json(res, done.ok ? 200 : 400, done.ok ? { ok: true } : done);
    }
    if (sub === "/key" && method === "POST") {
      const done = await registry.setKey(gameId, (await readJson(req))?.key);
      if (done.ok) room?.adminKickAll(false);
      return json(res, done.ok ? 200 : 400, done.ok ? { ok: true, kicked: room?.onlineIds().size ?? 0 } : done);
    }
    if (sub === "/delete" && method === "POST") {
      room?.adminKickAll(true);
      return json(res, 200, { ok: await registry.remove(gameId) });
    }

    const player = /^\/players\/([^/]+)\/(delete|rename)$/.exec(sub);
    if (player && method === "POST") {
      const playerId = decodeURIComponent(player[1]!);
      if (player[2] === "delete") return json(res, 200, await this.deletePlayer(gameId, playerId));
      const result = await this.renamePlayer(gameId, playerId, (await readJson(req))?.navn);
      return json(res, result.ok ? 200 : 400, result);
    }

    if (sub === "/dragon" && method === "POST") {
      const result = await this.dragon(gameId, await readJson(req));
      return json(res, result.ok ? 200 : 400, result);
    }
    if (sub === "/scores/clear" && method === "POST") {
      const store = await registry.store(gameId);
      const before = store.data.events.length;
      store.data.events = [];
      store.changed();
      return json(res, 200, { ok: true, removed: before });
    }
    const disaster = /^\/disasters\/(settings|trigger|heal|reset)$/.exec(sub);
    if (disaster && method === "POST") {
      if (!room) await this.deps.openRoom(gameId);
      const world = this.deps.room(gameId)?.world;
      if (!world) return json(res, 503, { error: "spillet kører ikke" });
      const body = await readJson(req);
      if (disaster[1] === "settings") {
        const store = await registry.store(gameId);
        store.data.world.settings = cleanDisasterSettings(body, store.data.world.settings);
        world.settingsChanged();
        return json(res, 200, { ok: true, settings: store.data.world.settings });
      }
      if (disaster[1] === "trigger") {
        const kind = typeof body?.kind === "string" && (DISASTER_KINDS as string[]).includes(body.kind) ? (body.kind as DisasterKind) : undefined;
        const at = body?.target as { x?: unknown; y?: unknown } | undefined;
        const target = Number.isInteger(at?.x) && Number.isInteger(at?.y) ? { x: at!.x as number, y: at!.y as number } : undefined;
        const refusal = world.start(kind, new Date(), target);
        return json(res, refusal ? 409 : 200, refusal ? { ok: false, error: refusal } : { ok: true });
      }
      if (disaster[1] === "heal") world.healAll();
      else world.resetAll();
      return json(res, 200, { ok: true });
    }

    const backups = registry.backups(gameId);
    if (sub === "/backups" && method === "GET") {
      const list = await backups.list();
      const all = await Promise.all(list.map(async (b) => ({ playerId: b.playerId, ...(await backups.get(b.playerId)) })));
      return download(res, `monsterjagt-${slug(game.navn)}-backups-${today()}.json`, { game: game.navn, exportedAt: new Date().toISOString(), backups: all });
    }
    const one = /^\/backups\/([^/]+)$/.exec(sub);
    if (one && method === "GET") {
      const backup = await backups.get(decodeURIComponent(one[1]!));
      if (!backup) return json(res, 404, { error: "ingen backup" });
      return download(res, `monsterjagt-${slug(game.navn)}-${slug(backup.save.player.navn)}-${today()}.json`, backup);
    }
    return json(res, 404, { error: "not found" });
  }

  private loggedIn(req: IncomingMessage): boolean {
    const token = sessionToken(req);
    const expires = token ? this.sessions.get(token) : undefined;
    if (!token || !expires) return false;
    if (expires < Date.now()) {
      this.sessions.delete(token);
      return false;
    }
    return true;
  }

  /** The game list: name, key (for handing out) and how many play it. */
  private async games() {
    const { registry } = this.deps;
    return Promise.all(
      registry.list().map(async (g) => {
        const store = await registry.store(g.id);
        return { id: g.id, navn: g.navn, key: g.key, createdAt: g.createdAt, players: Object.keys(store.data.players).length, online: this.deps.room(g.id)?.onlineIds().size ?? 0 };
      })
    );
  }

  /** Everything the page shows for one game. */
  private async state(gameId: string) {
    const { registry } = this.deps;
    const store = await registry.store(gameId);
    const now = new Date();
    const online = this.deps.room(gameId)?.onlineIds() ?? new Set<string>();
    const backups = new Map((await registry.backups(gameId).list()).map((b) => [b.playerId, b]));
    const rows = new Map(scoreboard(store.data.events, store.data.players, now).map((r) => [r.playerId, r]));
    const ids = new Set([...Object.keys(store.data.players), ...backups.keys()]);
    const players = [...ids].map((playerId) => {
      const p = store.data.players[playerId];
      const b = backups.get(playerId);
      const r = rows.get(playerId);
      return {
        playerId,
        navn: store.data.renames[playerId] ?? p?.navn ?? b?.navn ?? "?",
        renamePending: playerId in store.data.renames,
        farve: p?.farve ?? b?.farve ?? "#727169",
        avatarId: p?.avatarId ?? b?.avatarId,
        lastSeen: p?.lastSeen,
        online: online.has(playerId),
        points: r?.points ?? 0,
        backup: b ? { savedAt: b.savedAt, creatures: b.creatures } : undefined,
        pendingRewards: store.data.rewards[playerId]?.length ?? 0,
      };
    });
    players.sort((a, b) => (b.lastSeen ?? b.backup?.savedAt ?? "").localeCompare(a.lastSeen ?? a.backup?.savedAt ?? ""));
    const boss = bossForWeek(this.deps.bosses, weekIdFor(now));
    const raid = currentRaid(store.data.raid, boss, now);
    const world = store.data.world;
    const room = this.deps.room(gameId);
    const areas = Object.values(world.areas);
    const disasters = {
      settings: world.settings,
      nextAt: room?.world?.nextAt,
      active: room?.world?.activeView,
      history: world.history,
      kinds: DISASTER_KINDS.map((kind) => ({ kind, navn: this.deps.disasterConfigs[kind].navn })),
      changes: {
        soft: areas.reduce((n, a) => n + Object.values(a.overrides).filter((o) => o.until).length, 0),
        hard: areas.reduce((n, a) => n + Object.values(a.overrides).filter((o) => !o.until).length, 0),
        zones: areas.reduce((n, a) => n + a.zones.length, 0),
        spawns: areas.reduce((n, a) => n + a.spawns.length, 0),
      },
    };
    const roam = {
      settings: store.data.roam.settings,
      nextAt: room?.roam?.nextAt,
      flying: room?.roam?.isFlying() ?? false,
    };
    return { players, dragon: { ...raidView(raid), navn: boss.navn, lair: raid.lair ?? boss.lair, home: boss.lair, roam }, scoreEvents: store.data.events.length, disasters };
  }

  /** Forgets a player: scoreboard entry and points, unclaimed rewards, and their backup. */
  private async deletePlayer(gameId: string, playerId: string) {
    const { registry } = this.deps;
    const store = await registry.store(gameId);
    const known = playerId in store.data.players;
    delete store.data.players[playerId];
    delete store.data.rewards[playerId];
    delete store.data.renames[playerId];
    store.data.events = store.data.events.filter((e) => e.playerId !== playerId);
    const backupRemoved = await registry.backups(gameId).remove(playerId);
    store.changed();
    const room = this.deps.room(gameId);
    room?.adminChanged();
    return { ok: known || backupRemoved, backupRemoved, wasOnline: room?.onlineIds().has(playerId) ?? false };
  }

  /** A new name: shown on the scoreboard now, and taken by the device the next time it connects (at once if online). */
  private async renamePlayer(gameId: string, playerId: string, raw: unknown): Promise<{ ok: boolean; error?: string }> {
    const navn = typeof raw === "string" ? raw.normalize("NFC").trim().replace(/\s+/g, " ") : "";
    if (!navn || navn.length > PLAYER_NAME_MAX) return { ok: false, error: `navnet skal have 1-${PLAYER_NAME_MAX} tegn` };
    const { registry } = this.deps;
    const store = await registry.store(gameId);
    const known = store.data.players[playerId];
    if (!known && !(await registry.backups(gameId).get(playerId))) return { ok: false, error: "ukendt spiller" };
    if (known) known.navn = navn;
    store.data.renames[playerId] = navn;
    store.changed();
    this.deps.room(gameId)?.adminRenamedPlayer(playerId, navn);
    return { ok: true };
  }

  private async dragon(gameId: string, body: Json): Promise<{ ok: boolean; error?: string }> {
    const store = await this.deps.registry.store(gameId);
    const now = new Date();
    const boss = bossForWeek(this.deps.bosses, weekIdFor(now));
    if (body?.action === "reset") {
      // Full HP again, but it stays where it is (a new week is what sends it home).
      store.data.raid = { ...freshRaid(boss, weekIdFor(now)), ...(store.data.raid?.lair ? { lair: store.data.raid.lair } : {}) };
    } else if (body?.action === "roam" || body?.action === "fly") {
      const roam = this.deps.room(gameId)?.roam;
      if (!roam) return { ok: false, error: "spillet kører ikke" };
      if (body.action === "roam") {
        store.data.roam.settings = cleanRoamSettings(body, store.data.roam.settings);
        roam.settingsChanged();
        store.changed();
        return { ok: true };
      }
      const problem = roam.fly();
      return problem ? { ok: false, error: problem === "busy" ? "nogen kæmper mod dragen eller en katastrofe er på vej — prøv igen om lidt" : problem } : { ok: true };
    } else if (body?.action === "hp" && typeof body.hp === "number" && Number.isFinite(body.hp)) {
      const raid = currentRaid(store.data.raid, boss, now);
      const hp = Math.round(Math.min(raid.maxHp, Math.max(0, body.hp)));
      // Setting HP by hand never hands out rewards; 0 just puts the dragon to sleep.
      store.data.raid = { ...raid, hp, ...(hp > 0 ? { defeatedAt: undefined, finalBlowBy: undefined } : { defeatedAt: now.toISOString() }) };
    } else {
      return { ok: false, error: "ukendt handling" };
    }
    store.changed();
    this.deps.room(gameId)?.adminChanged();
    return { ok: true };
  }
}

const SECURITY_HEADERS = {
  "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", ...SECURITY_HEADERS }).end(JSON.stringify(body));
}

function download(res: ServerResponse, filename: string, body: unknown): void {
  res
    .writeHead(200, {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      ...SECURITY_HEADERS,
    })
    .end(JSON.stringify(body, null, 2));
}

function readJson(req: IncomingMessage): Promise<Record<string, unknown> | undefined> {
  return new Promise((resolve) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) req.destroy();
      else chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf-8")) as Record<string, unknown>);
      } catch {
        resolve(undefined);
      }
    });
    req.on("error", () => resolve(undefined));
  });
}

function sessionToken(req: IncomingMessage): string | undefined {
  const raw = req.headers.cookie ?? "";
  for (const part of raw.split(";")) {
    const [k, v] = part.trim().split("=");
    if (k === COOKIE && v) return v;
  }
  return undefined;
}

/** HttpOnly, SameSite=Strict, and Secure when the proxy says the page came over https. */
function cookie(req: IncomingMessage, value: string, maxAgeS: number): string {
  const secure = req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
  return `${COOKIE}=${value}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=${Math.round(maxAgeS)}${secure}`;
}

const today = () => new Date().toISOString().slice(0, 10);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9æøå]+/g, "-").replace(/^-|-$/g, "") || "spiller";
