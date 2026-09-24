import http from "node:http";
import { Server, matchMaker } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { LOBBY_ROOM } from "@monster-spil/shared";
import { LobbyRoom } from "./LobbyRoom.js";
import { FamilyGate } from "./family-gate.js";
import { FamilyStore } from "./family-store.js";
import { loadBosses } from "./bosses.js";
import { loadFoodSpots } from "./areas.js";
import { SaveBackups } from "./save-backups.js";
import { handleBackupRequest } from "./backup-http.js";
import { AdminPortal } from "./admin.js";
import path from "node:path";

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
  res.writeHead(404);
  res.end();
});

const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
const gate = new FamilyGate(process.env.FAMILY_CODE?.trim() || undefined);
if (gate.isOpen) {
  // The Docker image sets NODE_ENV=production. A missing code there would silently leave the server open to anyone, so fail loudly instead.
  if (process.env.NODE_ENV === "production") {
    console.error("FAMILY_CODE is not set — refusing to start. Set it to the family code (see docs/self-hosting.md).");
    process.exit(1);
  }
  console.warn("WARNING: FAMILY_CODE is not set — anyone who can reach this server can join. Fine for local dev only.");
}
// Scores, the dragon and unclaimed rewards are kept in DATA_DIR/family.json (a volume in Docker).
const dataDir = process.env.DATA_DIR ?? "data";
const store = await FamilyStore.open(dataDir);
const bosses = await loadBosses();
// Food grows on open ground; never on a dragon's lair.
const foodSpots = await loadFoodSpots(bosses.map((b) => b.lair));
// A copy of every player's save, for restoring onto a new or reinstalled device.
const backups = new SaveBackups(path.join(dataDir, "saves"));
backupDeps = { gate, backups, allowedOrigins };
// The parent's admin portal at /admin — only with ADMIN_PASSWORD set.
const adminPassword = process.env.ADMIN_PASSWORD?.trim() || undefined;
admin = new AdminPortal({
  password: adminPassword,
  store,
  backups,
  bosses,
  online: () => LobbyRoom.current?.onlineIds() ?? new Set(),
  changed: () => LobbyRoom.current?.adminChanged(),
});
if (adminPassword && adminPassword === process.env.FAMILY_CODE?.trim()) {
  console.warn("WARNING: ADMIN_PASSWORD is the same as FAMILY_CODE — anyone who can play can use the admin portal.");
}
gameServer.define(LOBBY_ROOM, LobbyRoom, { gate, store, bosses, foodSpots, backups });
gameServer.onShutdown(() => store.flush());

await gameServer.listen(port);
console.log(`Monsterjagt server listening on :${port} (data in ${dataDir}; admin portal ${adminPassword ? "on at /admin" : "off"})`);

// Colyseus itself handles SIGINT/SIGTERM (docker stop) with a graceful shutdown.
