import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { clientAddress, type KeyGate } from "./key-gate.js";
import { MAX_BACKUP_BYTES } from "./save-backups.js";
import type { GameInfo, GameRegistry } from "./games.js";

/**
 * Plain-HTTP endpoints a device uses before it can join a game's lobby:
 *
 *   GET /game           → { gameId, navn } of the game the key belongs to (adding a game)
 *   GET /backups        → that game's backed-up players (name, colour, figure, …)
 *   GET /backups/<id>   → that player's saved game
 *   PUT /backups/<id>   {save} → stores it as that player's backup (how devices back up;
 *                       streamed, up to MAX_BACKUP_BYTES — no websocket message holds a save)
 *   POST /transfer      {save} → stores it as that player's backup and gives a one-time
 *                       code, so the game can move to a new address (see below)
 *   GET /transfer/<code> → { gameId, navn, key, playerId }, once, within TRANSFER_MS
 *
 * All but the last need the spilnøgle in an `X-Game-Key` header (older clients send
 * `X-Family-Code`) and count wrong guesses in the same KeyGate as joining a lobby. The code
 * stands in for the key: it's long and random, works once, and runs out. Returns false
 * for other paths.
 *
 * Moving: when the game gets a new address (the old GitHub Pages app built with
 * VITE_MOVED_TO), the old app sends each game's save here, gets a code per game, and opens
 * the new address with the codes; the new app redeems them and restores the players.
 */

/** How long a moving code stays valid. */
export const TRANSFER_MS = 15 * 60_000;
/** A body may be a whole save (plus its wrapping): as big as a backup may be. */
const MAX_BODY = MAX_BACKUP_BYTES + 64 * 1024;

interface Transfer {
  gameId: string;
  playerId: string;
  expires: number;
}
const transfers = new Map<string, Transfer>();

/** The JSON body, or "too big" (past MAX_BODY: reading stops), or undefined (not JSON). */
function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    let size = 0;
    let over = false;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      if (over) return;
      size += c.length;
      if (size > MAX_BODY) {
        over = true;
        chunks.length = 0;
        resolve("too big");
      } else chunks.push(c);
    });
    req.on("end", () => {
      if (over) return;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        resolve(undefined);
      }
    });
    req.on("error", () => resolve(undefined));
  });
}
export function handleBackupRequest(
  req: IncomingMessage,
  res: ServerResponse,
  deps: { gate: KeyGate; registry: GameRegistry; allowedOrigins: string[] }
): boolean {
  const url = new URL(req.url ?? "/", "http://localhost");
  const transfer = url.pathname === "/transfer" || url.pathname.startsWith("/transfer/");
  if (url.pathname !== "/game" && url.pathname !== "/backups" && !url.pathname.startsWith("/backups/") && !transfer) return false;

  // The game is served from another origin (GitHub Pages), so answer CORS preflights.
  const origin = req.headers.origin;
  const allow = deps.allowedOrigins.length === 0 ? "*" : origin && deps.allowedOrigins.includes(origin) ? origin : deps.allowedOrigins[0]!;
  res.setHeader("Access-Control-Allow-Origin", allow);
  res.setHeader("Access-Control-Allow-Headers", "x-game-key, x-family-code, content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return true;
  }

  const send = (status: number, body: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(JSON.stringify(body));
  };
  // Redeeming a moving code: the code is the permission, no key needed.
  if (url.pathname.startsWith("/transfer/") && req.method === "GET") {
    const now = Date.now();
    for (const [code, t] of transfers) if (t.expires < now) transfers.delete(code);
    const code = decodeURIComponent(url.pathname.slice("/transfer/".length));
    const t = transfers.get(code);
    transfers.delete(code);
    const game = t && deps.registry.get(t.gameId);
    if (!t || !game) {
      send(404, { error: "unknown or used code" });
      return true;
    }
    send(200, { gameId: game.id, navn: game.navn, key: game.key, playerId: t.playerId });
    return true;
  }
  const backupUpload = req.method === "PUT" && url.pathname.startsWith("/backups/");
  const wanted = url.pathname === "/transfer" ? "POST" : backupUpload ? "PUT" : "GET";
  if (req.method !== wanted) {
    send(405, { error: "method not allowed" });
    return true;
  }
  const header = req.headers["x-game-key"] ?? req.headers["x-family-code"];
  const given = Array.isArray(header) ? header[0] : header;
  const game: GameInfo | undefined = deps.gate.attempt(clientAddress(req.headers, req.socket.remoteAddress ?? "unknown"), () => deps.registry.byKey(given));
  if (!game) {
    send(401, { error: "spilnøgle" });
    return true;
  }

  if (url.pathname === "/game") {
    send(200, { gameId: game.id, navn: game.navn });
    return true;
  }
  if (backupUpload) {
    const id = decodeURIComponent(url.pathname.slice("/backups/".length));
    void readBody(req).then(async (body) => {
      if (body === "too big") return send(413, { error: "save too big" });
      const save = (body as { save?: { player?: { id?: unknown } } } | undefined)?.save;
      // Each save goes under its own player's id, nowhere else.
      if (save?.player?.id !== id) return send(400, { error: "not this player's save" });
      const savedAt = new Date();
      const problem = await deps.registry.backups(game.id).put(id, save, savedAt);
      send(problem ? 400 : 200, problem ? { error: problem } : { savedAt: savedAt.toISOString() });
    }, () => send(500, { error: "could not store" }));
    return true;
  }
  if (url.pathname === "/transfer") {
    void readBody(req).then(async (body) => {
      if (body === "too big") return send(413, { error: "save too big" });
      const save = (body as { save?: { player?: { id?: unknown } } } | undefined)?.save;
      const playerId = save?.player?.id;
      if (typeof playerId !== "string") return send(400, { error: "no save" });
      // The freshest save goes with the player: it becomes their backup, which the new app restores.
      const problem = await deps.registry.backups(game.id).put(playerId, save);
      if (problem) return send(400, { error: problem });
      const code = randomBytes(18).toString("base64url");
      transfers.set(code, { gameId: game.id, playerId, expires: Date.now() + TRANSFER_MS });
      send(200, { code });
    }, () => send(500, { error: "could not store" }));
    return true;
  }
  const backups = deps.registry.backups(game.id);
  if (url.pathname === "/backups") {
    void backups.list().then((list) => send(200, list), () => send(500, { error: "could not read backups" }));
  } else {
    const id = decodeURIComponent(url.pathname.slice("/backups/".length));
    void backups.get(id).then((b) => (b ? send(200, b) : send(404, { error: "no backup" })), () => send(500, { error: "could not read backup" }));
  }
  return true;
}
