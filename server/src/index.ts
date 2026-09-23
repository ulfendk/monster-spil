import http from "node:http";
import { Server, matchMaker } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { LOBBY_ROOM } from "@monster-spil/shared";
import { LobbyRoom } from "./LobbyRoom.js";
import { FamilyGate } from "./family-gate.js";

const port = Number(process.env.PORT ?? 2567);

// Comma-separated origins allowed to call the matchmaking endpoint from a
// browser, e.g. "https://<user>.github.io". Unset = allow any origin (fine on
// a home LAN, but note this is only a browser-side courtesy, not authentication).
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

if (allowedOrigins.length > 0) {
  matchMaker.controller.getCorsHeaders = (req) => {
    const origin = req.headers?.origin;
    return { "Access-Control-Allow-Origin": origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0]! };
  };
}

// Colyseus adds its /matchmake routes in front of this handler; everything else lands here.
const httpServer = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }
  res.writeHead(404);
  res.end();
});

const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
const gate = new FamilyGate(process.env.FAMILY_CODE?.trim() || undefined);
if (gate.isOpen) console.warn("WARNING: FAMILY_CODE is not set — anyone who can reach this server can join. Fine for local dev only.");
gameServer.define(LOBBY_ROOM, LobbyRoom, { gate });

await gameServer.listen(port);
console.log(`Monsterjagt server listening on :${port}`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void gameServer.gracefullyShutdown().finally(() => process.exit(0));
  });
}
