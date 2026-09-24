import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { currentRaid, freshRaid, raidView, scoreboard, weekIdFor, type BossDefinition } from "@monster-spil/shared";
import { clientAddress, FamilyGate } from "./family-gate.js";
import type { FamilyStore } from "./family-store.js";
import type { SaveBackups } from "./save-backups.js";
import { bossForWeek } from "./bosses.js";
import { ADMIN_PAGE } from "./admin-page.js";

/**
 * The parent's admin portal at /admin, served by the game server itself. Off unless
 * ADMIN_PASSWORD is set. Logging in (same wrong-guess lockout as the family code)
 * gives a 12-hour session cookie; the page then uses a small JSON API:
 *
 *   GET  /admin                          the page
 *   POST /admin/login  {password}        → session cookie
 *   POST /admin/logout
 *   GET  /admin/api/state                players, scores, backups, the dragon
 *   POST /admin/api/players/<id>/delete  forget a player (scores, backup, rewards)
 *   POST /admin/api/dragon  {action:"reset"} | {action:"hp", hp}
 *   POST /admin/api/scores/clear         remove this week's points
 *   GET  /admin/api/backups[/<id>]       download one backup, or all
 */
export interface AdminDeps {
  password: string | undefined;
  store: FamilyStore;
  backups: SaveBackups;
  bosses: BossDefinition[];
  /** Who is connected right now (playerIds). */
  online: () => Set<string>;
  /** Tell connected players about changed state (the dragon, the player list). */
  changed: () => void;
}

const SESSION_MS = 12 * 60 * 60 * 1000;
const COOKIE = "mj_admin";
const MAX_BODY = 10_000;

export class AdminPortal {
  private sessions = new Map<string, number>();
  private gate: FamilyGate;

  constructor(private readonly deps: AdminDeps) {
    this.gate = new FamilyGate(deps.password);
  }

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
    if (!this.deps.password) return json(res, 404, { error: "admin portal is off (set ADMIN_PASSWORD)" });
    const method = req.method ?? "GET";

    if (pathname === "/admin" && method === "GET") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...SECURITY_HEADERS }).end(ADMIN_PAGE);
      return;
    }
    if (pathname === "/admin/login" && method === "POST") {
      const body = await readJson(req);
      const address = clientAddress(req.headers, req.socket.remoteAddress ?? "unknown");
      if (!this.gate.check(address, body?.password)) return json(res, 401, { error: "forkert adgangskode" });
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

    if (pathname === "/admin/api/state" && method === "GET") return json(res, 200, await this.state());

    const del = /^\/admin\/api\/players\/([^/]+)\/delete$/.exec(pathname);
    if (del && method === "POST") return json(res, 200, await this.deletePlayer(decodeURIComponent(del[1]!)));

    if (pathname === "/admin/api/dragon" && method === "POST") {
      const body = await readJson(req);
      const result = this.dragon(body);
      return json(res, result.ok ? 200 : 400, result);
    }
    if (pathname === "/admin/api/scores/clear" && method === "POST") {
      const before = this.deps.store.data.events.length;
      this.deps.store.data.events = [];
      this.deps.store.changed();
      return json(res, 200, { ok: true, removed: before });
    }
    if (pathname === "/admin/api/backups" && method === "GET") {
      const list = await this.deps.backups.list();
      const all = await Promise.all(list.map(async (b) => ({ playerId: b.playerId, ...(await this.deps.backups.get(b.playerId)) })));
      return download(res, `monsterjagt-backups-${today()}.json`, { exportedAt: new Date().toISOString(), backups: all });
    }
    const one = /^\/admin\/api\/backups\/([^/]+)$/.exec(pathname);
    if (one && method === "GET") {
      const id = decodeURIComponent(one[1]!);
      const backup = await this.deps.backups.get(id);
      if (!backup) return json(res, 404, { error: "ingen backup" });
      return download(res, `monsterjagt-${slug(backup.save.player.navn)}-${today()}.json`, backup);
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

  /** Everything the page shows. */
  private async state() {
    const { store } = this.deps;
    const now = new Date();
    const online = this.deps.online();
    const backups = new Map((await this.deps.backups.list()).map((b) => [b.playerId, b]));
    const rows = new Map(scoreboard(store.data.events, store.data.players, now).map((r) => [r.playerId, r]));
    const ids = new Set([...Object.keys(store.data.players), ...backups.keys()]);
    const players = [...ids].map((playerId) => {
      const p = store.data.players[playerId];
      const b = backups.get(playerId);
      const r = rows.get(playerId);
      return {
        playerId,
        navn: p?.navn ?? b?.navn ?? "?",
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
    return { players, dragon: { ...raidView(raid), navn: boss.navn }, scoreEvents: store.data.events.length };
  }

  /** Forgets a player: scoreboard entry and points, unclaimed rewards, and their backup. */
  private async deletePlayer(playerId: string) {
    const { store, backups } = this.deps;
    const known = playerId in store.data.players;
    delete store.data.players[playerId];
    delete store.data.rewards[playerId];
    store.data.events = store.data.events.filter((e) => e.playerId !== playerId);
    const backupRemoved = await backups.remove(playerId);
    store.changed();
    this.deps.changed();
    return { ok: known || backupRemoved, backupRemoved, wasOnline: this.deps.online().has(playerId) };
  }

  private dragon(body: { action?: unknown; hp?: unknown } | undefined): { ok: boolean; error?: string } {
    const { store } = this.deps;
    const now = new Date();
    const boss = bossForWeek(this.deps.bosses, weekIdFor(now));
    if (body?.action === "reset") {
      store.data.raid = freshRaid(boss, weekIdFor(now));
    } else if (body?.action === "hp" && typeof body.hp === "number" && Number.isFinite(body.hp)) {
      const raid = currentRaid(store.data.raid, boss, now);
      const hp = Math.round(Math.min(raid.maxHp, Math.max(0, body.hp)));
      // Setting HP by hand never hands out rewards; 0 just puts the dragon to sleep.
      store.data.raid = { ...raid, hp, ...(hp > 0 ? { defeatedAt: undefined, finalBlowBy: undefined } : { defeatedAt: now.toISOString() }) };
    } else {
      return { ok: false, error: "ukendt handling" };
    }
    store.changed();
    this.deps.changed();
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
