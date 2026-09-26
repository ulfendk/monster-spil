// End-to-end check of player levels and badges on the server: devices tell it their level
// and badges, everyone sees them, and the scoreboard shows the level.
//   DATA_DIR=/tmp/levels-test FAMILY_CODE=test123 PORT=2582 node server/dist/index.js
//   node scripts/e2e-levels.mjs ws://localhost:2582 test123
import { Client } from "colyseus.js";

const [url = "ws://localhost:2582", code = "test123"] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (cond, ms = 5000) => { for (let t = 0; t < ms && !cond(); t += 50) await wait(50); };
let failed = 0;
const check = (name, ok) => { console.log(ok ? "PASS" : "FAIL", name); if (!ok) failed++; };

async function join(id, extra) {
  const room = await new Client(url).joinOrCreate("lobby", { playerId: id, navn: id, avatarId: "figur1", farve: "#ff0000", gameId: "familien", familyCode: code, areaId: "startskoven", x: 32, y: 24, ...extra });
  const got = { hello: null, players: [], scores: null };
  room.onMessage("hello", (m) => (got.hello = m));
  room.onMessage("players", (m) => (got.players = m));
  room.onMessage("scores", (m) => (got.scores = m));
  for (const t of ["playerMoved", "raid", "beasts", "caves", "game", "terrain", "disaster", "food"]) room.onMessage(t, () => {});
  return { room, got };
}
const seen = (p, id) => p.got.players.find((x) => x.playerId === id);

const far = await join("far", { level: 12, badges: ["foerste-fangst", "dragetaemmer"] });
const lille = await join("lille", { level: 2, badges: [] });
await until(() => seen(lille, "far") && seen(far, "lille"));
check("hello says protocol 13 or newer", lille.got.hello?.protocolVersion >= 13);
check("everyone sees Far's level and badges", seen(lille, "far")?.level === 12 && seen(lille, "far")?.badges?.includes("dragetaemmer"));
lille.room.send("profile", { level: 3, badges: ["hulegaenger"] });
await until(() => seen(far, "lille")?.level === 3);
check("a level-up reaches everyone at once", seen(far, "lille")?.level === 3 && seen(far, "lille")?.badges?.[0] === "hulegaenger");
lille.room.send("profile", { level: 999, badges: ["hulegaenger"] });
lille.room.send("profile", { level: 4, badges: ["<script>", "ok-badge"] });
await wait(500);
check("nonsense is ignored: no level 999, no odd badge ids", seen(far, "lille")?.level === 4 && seen(far, "lille")?.badges?.join() === "ok-badge");
far.room.send("getScores", {});
await until(() => far.got.scores);
const rows = far.got.scores?.rows ?? [];
check("the scoreboard shows everyone's level", rows.find((r) => r.playerId === "far")?.level === 12 && rows.find((r) => r.playerId === "lille")?.level === 4);
const old = await join("gammel", {});
await until(() => seen(far, "gammel"));
check("a device from before levels simply has none", seen(far, "gammel") && seen(far, "gammel").level === undefined);

for (const p of [far, lille, old]) await p.room.leave();
console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
