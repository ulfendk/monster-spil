import http from "node:http";
import { Server, matchMaker } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { LOBBY_ROOM } from "@monster-spil/shared";
import { LobbyRoom } from "./LobbyRoom.js";
import { KeyGate } from "./key-gate.js";
import { GameRegistry } from "./games.js";
import { loadBeasts, loadBosses } from "./bosses.js";
import { loadAreas, loadCaveConfig, loadDisasterConfigs } from "./areas.js";
import { handleBackupRequest } from "./backup-http.js";
import { AdminPortal } from "./admin.js";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createStaticHandler } from "./static-files.js";

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

// The built game, served from here too (the Docker image has it): CLIENT_DIR, or client/dist next to the server.
const clientDir = process.env.CLIENT_DIR ?? fileURLToPath(new URL("../../client/dist/", import.meta.url));
const serveClient = existsSync(clientDir) ? createStaticHandler(clientDir) : undefined;

// Colyseus adds its /matchmake routes in front of this handler; everything else lands here.
let backupDeps: Parameters<typeof handleBackupRequest>[2] | undefined;
let admin: AdminPortal | undefined;
const httpServer = http.createServer((req, res) => {
  if (admin?.handle(req, res)) return;
  if (backupDeps && handleBackupRequest(req, res, backupDeps)) return;
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }
  const notFound = () => {
    if (res.headersSent) return;
    res.writeHead(404);
    res.end();
  };
  if (!serveClient) return notFound();
  serveClient(req, res).then((served) => served || notFound(), notFound);
});

const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
const production = process.env.NODE_ENV === "production";
const adminPassword = process.env.ADMIN_PASSWORD?.trim() || undefined;
// Every game (its players, scores, dragon and backups) lives under DATA_DIR (a volume in Docker).
// FAMILY_CODE is only read once: to turn a pre-games server's family into the game "Familien".
const dataDir = process.env.DATA_DIR ?? "data";
const registry = await GameRegistry.open(dataDir, process.env.FAMILY_CODE);
if (registry.list().length === 0) {
  if (production && !adminPassword) {
    // Nobody could ever join: say so loudly instead of running an empty server.
    console.error("No games yet and ADMIN_PASSWORD is not set — refusing to start. Set ADMIN_PASSWORD and create a game at /admin (see docs/self-hosting.md).");
    process.exit(1);
  }
  console.warn("No games yet: create one in the admin portal at /admin (or set FAMILY_CODE once to create \"Familien\").");
} else if (process.env.FAMILY_CODE && registry.byKey(process.env.FAMILY_CODE) === undefined) {
  console.warn("FAMILY_CODE is ignored now that games exist: keys are managed at /admin.");
}
// One lockout counter for every key guess (joining, adding a game, restoring); the admin portal has its own.
const gate = new KeyGate();
const bosses = await loadBosses();
const beasts = await loadBeasts();
const caveConfig = await loadCaveConfig();
// The maps: where food grows (never on a dragon's lair) and what disasters can change.
const areas = await loadAreas(bosses.map((b) => b.lair));
const disasterConfigs = await loadDisasterConfigs();
backupDeps = { gate, registry, allowedOrigins };
// The parent's admin portal at /admin — only with ADMIN_PASSWORD set.
admin = new AdminPortal({ password: adminPassword, registry, bosses, beasts, disasterConfigs, room: (gameId) => LobbyRoom.byGame.get(gameId), openRoom: (gameId) => openRoom(gameId) });
if (adminPassword && registry.byKey(adminPassword)) {
  console.warn("WARNING: ADMIN_PASSWORD is also a game's spilnøgle — anyone who can play that game can use the admin portal.");
}
// One room per game: a client joins with its gameId and must bring that game's key.
gameServer.define(LOBBY_ROOM, LobbyRoom, { registry, gate, bosses, beasts, caveConfig, areas, disasterConfigs }).filterBy(["gameId"]);

/**
 * Every game's room runs from the start (not only once someone joins), so its
 * disasters happen and its map changes even while nobody is playing.
 */
async function openRoom(gameId: string): Promise<void> {
  if (LobbyRoom.byGame.has(gameId)) return;
  try {
    await matchMaker.createRoom(LOBBY_ROOM, { gameId });
  } catch (error) {
    console.error(`Could not open the room for game ${gameId}:`, error);
  }
}
gameServer.onShutdown(() => registry.flush());

await gameServer.listen(port);
for (const game of registry.list()) await openRoom(game.id);
console.log(`Monsterjagt server listening on :${port} (${registry.list().length} games, data in ${dataDir}; admin portal ${adminPassword ? "on at /admin" : "off"}; ${serveClient ? `serving the game from ${clientDir}` : "not serving the game (no client build)"})`);

// Colyseus itself handles SIGINT/SIGTERM (docker stop) with a graceful shutdown.
