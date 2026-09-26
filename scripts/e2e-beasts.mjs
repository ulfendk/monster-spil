// End-to-end check of visiting beasts: a sand serpent beaten alone, a giant eagle beaten by
// a team, a gathering team sent home when a parent sends the beast away, and admin controls.
//   DATA_DIR=/tmp/beast-test FAMILY_CODE=test123 ADMIN_PASSWORD=adm1n PORT=2597 node server/dist/index.js
//   node scripts/e2e-beasts.mjs ws://localhost:2597 test123 adm1n
import { readFileSync } from "node:fs";
import { Client } from "colyseus.js";

const [url = "ws://localhost:2597", code = "test123", password = "adm1n"] = process.argv.slice(2);
const http = url.replace(/^ws/, "http");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (cond, ms = 12000) => { for (let t = 0; t < ms && !cond(); t += 50) await wait(50); };
let failed = 0;
const check = (name, ok) => { console.log(ok ? "PASS" : "FAIL", name); if (!ok) failed++; };

const map = JSON.parse(readFileSync(new URL("../shared/content/areas/startskoven.json", import.meta.url), "utf8"));
const meta = JSON.parse(readFileSync(new URL("../shared/content/areas/startskoven.meta.json", import.meta.url), "utf8"));
const tile = (x, y) => map.layers[0].data[y * map.width + x];

let cookie = "";
const call = async (path, { method = "GET", body } = {}) => {
  const res = await fetch(`${http}${path}`, {
    method,
    headers: { "content-type": "application/json", "x-admin": "1", ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  return res;
};
await call("/admin/login", { method: "POST", body: { password } });
const G = "/admin/api/games/familien";
const beasts = (body) => call(`${G}/beasts`, { method: "POST", body });
// Nothing random during the test: only what we ask for.
await call(`${G}/dragon`, { method: "POST", body: { action: "roam", enabled: false } });
await call(`${G}/disasters/settings`, { method: "POST", body: { enabled: false } });
await beasts({ action: "settings", enabled: false });

const seat = (id) => ({
  active: { instanceId: id + "-i", speciesId: "helt", ownerId: id, niveau: 1, currentHp: 1, caughtAt: "2026-01-01" },
  species: { id: "helt", navn: "Helt", type: "vand", baseStats: { hp: 150, angreb: 60, forsvar: 60, fart: 60 }, spriteFront: "a.png", spriteBack: "b.png" },
  moves: [{ id: "slag", navn: "Slag", type: "vand", power: 150, accuracy: 1 }],
});
const at = (x, y) => ({ areaId: "startskoven", x, y });
async function join(id, pos) {
  const room = await new Client(url).joinOrCreate("lobby", { playerId: id, navn: id, avatarId: "a", farve: "#ff0000", gameId: "familien", familyCode: code, ...pos });
  const got = { hello: null, beasts: null, battles: [], problems: [], rewards: [], team: null, ended: [], scores: null };
  room.onMessage("hello", (m) => (got.hello = m));
  room.onMessage("beasts", (m) => (got.beasts = m));
  room.onMessage("raidBattle", (m) => got.battles.push(m));
  room.onMessage("problem", (m) => got.problems.push(m.reason));
  room.onMessage("reward", (m) => got.rewards.push(m));
  room.onMessage("team", (m) => (got.team = m));
  room.onMessage("teamEnded", (m) => got.ended.push(m));
  room.onMessage("scores", (m) => (got.scores = m));
  for (const t of ["players", "playerMoved", "raid", "game", "terrain", "disaster", "food", "backupAck", "foodTaken"]) room.onMessage(t, () => {});
  return { room, got };
}
const beastOf = (p, kind) => p.got.beasts?.find((b) => b.beastId === kind);
/** Walks a player to the tile beside a beast (the server trusts positions; the map isn't checked). */
const standBy = (p, b) => p.room.send("move", at(b.x + 1, b.y));

const alice = await join("alice", at(32, 24));
const bob = await join("bob", at(32, 25));
const cia = await join("cia", at(33, 24));
await until(() => alice.got.beasts && bob.got.beasts && cia.got.beasts);
check("hello says protocol 11", alice.got.hello?.protocolVersion === 11);
check("no beasts at first (visits are off)", alice.got.beasts.length === 0);

// ---- a sand serpent, beaten alone
check("a parent can call a sand serpent", (await beasts({ action: "call", beastId: "sandslange" })).status === 200);
await until(() => beastOf(alice, "sandslange"));
const serpent = beastOf(alice, "sandslange");
check("everyone sees it come up", Boolean(serpent && beastOf(bob, "sandslange")));
check("it rose from sand", serpent && tile(serpent.x, serpent.y) === meta.terrain.sand);
check("full HP: 250", serpent?.hp === 250 && serpent?.maxHp === 250 && !serpent.defeated);
check("it leaves in about 15 minutes", Math.abs(Date.parse(serpent.leavesAt) - Date.now() - 15 * 60_000) < 30_000);
const again = await beasts({ action: "call", beastId: "sandslange" });
check("only one of a kind at a time", again.status === 400);

alice.room.send("raidStart", { seat: seat("alice"), targetId: serpent.id });
await until(() => alice.got.problems.length);
check("too far away to fight it", alice.got.problems.at(-1) === "too far away");

standBy(alice, serpent);
await wait(200);
alice.room.send("raidStart", { seat: seat("alice"), targetId: serpent.id });
await until(() => alice.got.battles.length);
check("next to it, an attempt starts, tagged with the beast", alice.got.battles[0]?.targetId === serpent.id && alice.got.battles[0].battle.participants[1].species.id === "sandslange");
for (let turn = 0; turn < 20; turn++) {
  const last = alice.got.battles.at(-1);
  if (last.battle.outcome !== "ongoing" || last.over) break;
  const n = alice.got.battles.length;
  alice.room.send("raidAction", { action: { kind: "move", moveId: "slag" } });
  await until(() => alice.got.battles.length > n);
}
const lastSolo = alice.got.battles.at(-1);
check("Alice beats the serpent", lastSolo.battle.outcome === "won" && lastSolo.targetId === serpent.id);
await until(() => alice.got.rewards.length && !beastOf(alice, "sandslange"));
check("she gets a serpent hatchling for it", alice.got.rewards[0]?.reason === "beast" && alice.got.rewards[0]?.creature.speciesId === "slangeunge");
check("the beaten serpent is gone for everyone", !beastOf(alice, "sandslange") && !beastOf(bob, "sandslange"));
alice.room.send("getScores", {});
await until(() => alice.got.scores);
const aliceRow = alice.got.scores?.rows.find((r) => r.playerId === "alice");
check("the scoreboard counts it: a big beast and 3 + 2 points", aliceRow?.dragons === 1 && aliceRow?.points === 5);

// ---- a giant eagle, beaten by a team
check("a parent can call a giant eagle", (await beasts({ action: "call", beastId: "kaempeoern" })).status === 200);
await until(() => beastOf(bob, "kaempeoern"));
const eagle = beastOf(bob, "kaempeoern");
let trees = 0;
for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && tile(eagle.x + dx, eagle.y + dy) === meta.terrain.tree) trees++;
check("it landed on open ground at a forest's edge", tile(eagle.x, eagle.y) === meta.terrain.ground && trees >= 3);
standBy(bob, eagle);
standBy(cia, eagle);
await wait(200);
bob.room.send("teamCreate", { seat: seat("bob"), targetId: eagle.id });
await until(() => bob.got.team && beastOf(cia, "kaempeoern")?.gathering);
check("Bob gathers a team at the eagle; everyone sees it gathering", bob.got.team?.targetId === eagle.id && beastOf(cia, "kaempeoern").gathering?.teamId === bob.got.team.id);
cia.room.send("teamJoin", { teamId: bob.got.team.id, seat: seat("cia") });
await until(() => bob.got.team?.members.length === 2);
bob.room.send("teamStart", { teamId: bob.got.team.id });
await until(() => bob.got.team?.phase === "active" && cia.got.team?.phase === "active");
check("the team fight starts for both", bob.got.team?.phase === "active" && cia.got.team?.targetId === eagle.id);
for (let turn = 0; turn < 20 && bob.got.team?.phase === "active"; turn++) {
  const t = bob.got.team.id;
  const before = bob.got.team.battle?.turn;
  bob.room.send("teamAction", { teamId: t, action: { kind: "move", moveId: "slag" } });
  cia.room.send("teamAction", { teamId: t, action: { kind: "move", moveId: "slag" } });
  await until(() => bob.got.team?.battle?.turn !== before || bob.got.team?.phase !== "active");
}
check("the team beats the eagle", bob.got.team?.phase === "done" && bob.got.team?.outcome === "won");
await until(() => bob.got.rewards.length && cia.got.rewards.length);
check("both get an eaglet", bob.got.rewards[0]?.creature.speciesId === "oerneunge" && cia.got.rewards[0]?.creature.speciesId === "oerneunge");

// ---- a gathering team is sent home when the beast leaves
await beasts({ action: "call", beastId: "sandslange" });
await until(() => beastOf(alice, "sandslange"));
const second = beastOf(alice, "sandslange");
const dan = await join("dan", at(second.x - 1, second.y));
await until(() => dan.got.beasts);
dan.room.send("teamCreate", { seat: seat("dan"), targetId: second.id });
await until(() => dan.got.team);
check("Dan gathers a team at the new serpent", dan.got.team?.phase === "gathering");
let state = await (await call(`${G}/state`)).json();
check("the admin sees it, with its place, HP and leaving time", state.beasts.active.length === 1 && state.beasts.active[0].navn === "Sandslangen" && state.beasts.active[0].x === second.x);
const dismiss = await beasts({ action: "dismiss", id: second.id });
check("a parent can send it away (a gathering team doesn't hold it)", dismiss.status === 200);
await until(() => dan.got.ended.length);
check("Dan's team is sent home: the beast is gone", dan.got.ended[0]?.reason === "gone");
await until(() => !beastOf(alice, "sandslange"));
check("it is gone for everyone", !beastOf(alice, "sandslange") && !beastOf(dan, "sandslange"));

// ---- settings
const saved = await beasts({ action: "settings", enabled: true, meanMinutes: 1, stayMinutes: 999, randomness: 0.2 });
state = await (await call(`${G}/state`)).json();
check("settings are clamped and stored", saved.status === 200 && state.beasts.settings.enabled === true && state.beasts.settings.meanMinutes === 5 && state.beasts.settings.stayMinutes === 120);
check("each kind has its next visit planned", state.beasts.kinds.length === 2 && state.beasts.kinds.every((k) => k.nextAt));
await beasts({ action: "settings", enabled: false });

for (const p of [alice, bob, cia, dan]) await p.room.leave();
console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
