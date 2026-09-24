import type { IncomingMessage, ServerResponse } from "node:http";
import { clientAddress, type FamilyGate } from "./family-gate.js";
import type { SaveBackups } from "./save-backups.js";

/**
 * HTTP endpoints for restoring a backup onto a new or reinstalled device — plain HTTP
 * because at that point the app has no player yet to join the lobby with:
 *
 *   GET /backups        → the family's backed-up players (name, colour, figure, …)
 *   GET /backups/<id>   → that player's saved game
 *
 * Both need the family code in an `X-Family-Code` header and count wrong guesses in
 * the same FamilyGate as joining the lobby. Returns false for other paths.
 */
export function handleBackupRequest(
  req: IncomingMessage,
  res: ServerResponse,
  deps: { gate: FamilyGate; backups: SaveBackups; allowedOrigins: string[] }
): boolean {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname !== "/backups" && !url.pathname.startsWith("/backups/")) return false;

  // The game is served from another origin (GitHub Pages), so answer CORS preflights.
  const origin = req.headers.origin;
  const allow = deps.allowedOrigins.length === 0 ? "*" : origin && deps.allowedOrigins.includes(origin) ? origin : deps.allowedOrigins[0]!;
  res.setHeader("Access-Control-Allow-Origin", allow);
  res.setHeader("Access-Control-Allow-Headers", "x-family-code");
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
  const code = req.headers["x-family-code"];
  if (!deps.gate.check(clientAddress(req.headers, req.socket.remoteAddress ?? "unknown"), Array.isArray(code) ? code[0] : code)) {
    send(401, { error: "familiekode" });
    return true;
  }

  const id = decodeURIComponent(url.pathname.slice("/backups/".length));
  if (url.pathname === "/backups") {
    void deps.backups.list().then((list) => send(200, list), () => send(500, { error: "could not read backups" }));
  } else {
    void deps.backups.get(id).then((b) => (b ? send(200, b) : send(404, { error: "no backup" })), () => send(500, { error: "could not read backup" }));
  }
  return true;
}
