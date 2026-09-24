import type { IncomingMessage, ServerResponse } from "node:http";
import { clientAddress, type KeyGate } from "./key-gate.js";
import type { GameInfo, GameRegistry } from "./games.js";

/**
 * Plain-HTTP endpoints a device uses before it can join a game's lobby:
 *
 *   GET /game           → { gameId, navn } of the game the key belongs to (adding a game)
 *   GET /backups        → that game's backed-up players (name, colour, figure, …)
 *   GET /backups/<id>   → that player's saved game
 *
 * All need the spilnøgle in an `X-Game-Key` header (older clients send `X-Family-Code`)
 * and count wrong guesses in the same KeyGate as joining a lobby. Returns false for
 * other paths.
 */
export function handleBackupRequest(
  req: IncomingMessage,
  res: ServerResponse,
  deps: { gate: KeyGate; registry: GameRegistry; allowedOrigins: string[] }
): boolean {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname !== "/game" && url.pathname !== "/backups" && !url.pathname.startsWith("/backups/")) return false;

  // The game is served from another origin (GitHub Pages), so answer CORS preflights.
  const origin = req.headers.origin;
  const allow = deps.allowedOrigins.length === 0 ? "*" : origin && deps.allowedOrigins.includes(origin) ? origin : deps.allowedOrigins[0]!;
  res.setHeader("Access-Control-Allow-Origin", allow);
  res.setHeader("Access-Control-Allow-Headers", "x-game-key, x-family-code");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return true;
  }

  const send = (status: number, body: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(JSON.stringify(body));
  };
  if (req.method !== "GET") {
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
  const backups = deps.registry.backups(game.id);
  if (url.pathname === "/backups") {
    void backups.list().then((list) => send(200, list), () => send(500, { error: "could not read backups" }));
  } else {
    const id = decodeURIComponent(url.pathname.slice("/backups/".length));
    void backups.get(id).then((b) => (b ? send(200, b) : send(404, { error: "no backup" })), () => send(500, { error: "could not read backup" }));
  }
  return true;
}
