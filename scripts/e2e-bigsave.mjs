// End-to-end check that saves of any realistic size back up (and move) without trouble:
// over plain HTTP, streamed, up to 16 MB — and the old websocket route for devices that
// haven't updated yet doesn't throw anyone off.
//   DATA_DIR=/tmp/big-test FAMILY_CODE=test123 PORT=2584 node server/dist/index.js
//   node scripts/e2e-bigsave.mjs http://localhost:2584 test123
import { Client } from "colyseus.js";

const [base = "http://localhost:2584", key = "test123"] = process.argv.slice(2);
let failed = 0;
const check = (name, ok) => { console.log(ok ? "PASS" : "FAIL", name); if (!ok) failed++; };

const now = new Date().toISOString();
const saveWith = (id, monsters) => ({
  version: 1, player: { id, navn: "Stor", avatarId: "figur1", farve: "#ff0000" },
  creatures: Array.from({ length: monsters }, () => ({ instanceId: crypto.randomUUID(), speciesId: "stenbid", ownerId: id, niveau: 1, currentHp: 30, caughtAt: now })),
  seenSpeciesIds: ["stenbid"], caughtCounts: { stenbid: monsters }, pendingScore: [], bag: [], position: { areaId: "startskoven", x: 32, y: 24 }, createdAt: now, updatedAt: now,
});
const put = (id, body, k = key) => fetch(`${base}/backups/${id}`, { method: "PUT", headers: { "x-game-key": k, "content-type": "application/json" }, body: JSON.stringify(body) });

for (const monsters of [6_000, 30_000, 75_000]) {
  const save = saveWith("stor-1", monsters);
  const mb = (JSON.stringify(save).length / 1024 / 1024).toFixed(1);
  const res = await put("stor-1", { save });
  const back = await (await fetch(`${base}/backups/stor-1`, { headers: { "x-game-key": key } })).json();
  check(`a ${mb} MB save (${monsters} monsters) is backed up and comes back whole`, res.status === 200 && back?.save?.creatures?.length === monsters);
}
check("a save can't be stored under another player", (await put("someone-else", { save: saveWith("stor-1", 3) })).status === 400);
check("a wrong key stores nothing", (await put("stor-1", { save: saveWith("stor-1", 3) }, "forkert-noegle")).status === 401);
const tooBig = await put("stor-1", { save: { ...saveWith("stor-1", 1), junk: "x".repeat(17 * 1024 * 1024) } });
check("past 16 MB it is refused, not crashed on", tooBig.status === 413);
check("the server is fine afterwards", (await fetch(`${base}/health`)).ok);

// A device that hasn't updated yet still backs up over the websocket, and stays connected.
const room = await new Client(base.replace(/^http/, "ws")).joinOrCreate("lobby", { playerId: "gammel", navn: "Gammel", avatarId: "figur1", farve: "#ff0000", gameId: "familien", familyCode: key, areaId: "startskoven", x: 32, y: 24 });
for (const t of ["hello", "players", "playerMoved", "raid", "beasts", "caves", "game", "terrain", "disaster", "food"]) room.onMessage(t, () => {});
let left, ack;
room.onLeave((c) => (left = c));
room.onMessage("backupAck", (m) => (ack = m));
room.send("backup", { save: saveWith("gammel", 2_000) });
await new Promise((r) => setTimeout(r, 1500));
check("an old-style websocket backup of 2,000 monsters goes through and the device stays connected", left === undefined && typeof ack?.savedAt === "string");
await room.leave();

console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
