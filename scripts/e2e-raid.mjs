// End-to-end check of the dragon raid and the weekly scoreboard with scripted players.
//   DATA_DIR=/tmp/raid-test FAMILY_CODE=test123 PORT=2599 node server/dist/index.js
//   node scripts/e2e-raid.mjs ws://localhost:2599 test123
// Use a fresh DATA_DIR: the test beats the dragon, which then sleeps until Monday.
import { Client } from "colyseus.js";
import { randomUUID } from "node:crypto";

const [url = "ws://localhost:2599", code = "test123"] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/** Waits until `cond()` holds (or `ms` passes), so checks don't depend on a machine's speed. */
const until = async (cond, ms = 2000) => {
  for (let t = 0; t < ms && !cond(); t += 50) await wait(50);
};
let failed = 0;
const check = (name, ok) => { console.log(ok ? "PASS" : "FAIL", name); if (!ok) failed++; };

// A hero strong enough to finish the 600 HP dragon in a handful of attempts.
const seat = (id, power = 150) => ({
  active: { instanceId: id + "-i", speciesId: "helt", ownerId: id, niveau: 1, currentHp: 1, caughtAt: "2026-01-01" },
  species: { id: "helt", navn: "Helt", type: "vand", baseStats: { hp: 150, angreb: 60, forsvar: 60, fart: 60 }, spriteFront: "a.png", spriteBack: "b.png" },
  moves: [{ id: "slag", navn: "Slag", type: "vand", power, accuracy: 1 }],
});

async function join(id, pos) {
  const room = await new Client(url).joinOrCreate("lobby", { playerId: id, navn: id, avatarId: "a", farve: "#ff0000", familyCode: code, ...pos });
  const got = { hello: null, raid: null, battles: [], problems: [], scores: null, acks: [], rewards: [] };
  room.onMessage("hello", (m) => (got.hello = m));
  room.onMessage("raid", (m) => (got.raid = m));
  room.onMessage("raidBattle", (m) => got.battles.push(m));
  room.onMessage("problem", (m) => got.problems.push(m.reason));
  room.onMessage("scores", (m) => (got.scores = m));
  room.onMessage("scoreReportAck", (m) => got.acks.push(...m.ids));
  room.onMessage("reward", (m) => got.rewards.push(m));
  for (const t of ["players", "playerMoved", "duel", "duelEnded"]) room.onMessage(t, () => {});
  return { room, got };
}
const at = (x, y) => ({ areaId: "startskoven", x, y });

let a = await join("alice", at(32, 24));
const b = await join("bob", at(6, 4));
await wait(400);
check("hello carries protocol version 4 or newer", a.got.hello?.protocolVersion >= 4);
check("the dragon is sent on join, awake with full HP", a.got.raid?.hp === 600 && a.got.raid?.defeated === false);

a.room.send("raidStart", { seat: seat("alice") }); await wait(200);
check("attacking from far away is refused", a.got.problems.includes("too far away") && a.got.battles.length === 0);

a.room.send("move", at(4, 3)); await wait(150);
a.room.send("raidStart", { seat: seat("alice", 20) }); await wait(200);
check("next to the lair an attempt starts in boss mode", a.got.battles.at(-1)?.battle.mode === "boss");
a.room.send("raidAction", { action: { kind: "catch" } }); await wait(150);
check("catching the dragon is refused", a.got.problems.includes("unknown action"));
a.room.send("raidAction", { action: { kind: "move", moveId: "slag" } }); await wait(250);
check("a hit lowers the shared HP everyone sees", b.got.raid.hp < 600 && b.got.raid.hp === a.got.raid.hp);
a.room.send("raidAction", { action: { kind: "flee" } }); await wait(200);
const fled = a.got.battles.at(-1);
check("fleeing ends the attempt with a rest time", fled.battle.outcome === "fled" && Date.parse(fled.restUntil) > Date.now());
a.room.send("raidStart", { seat: seat("alice") }); await wait(200);
check("a new attempt is refused while resting", a.got.problems.includes("resting"));

// Bob finishes it off over as many attempts as needed (his rest is skipped by reconnecting as a fresh id isn't allowed, so hit hard).
let turns = 0;
b.room.send("raidStart", { seat: seat("bob") }); await wait(200);
while (!b.got.raid.defeated && turns < 40) {
  b.room.send("raidAction", { action: { kind: "move", moveId: "slag" } }); await wait(120);
  turns++;
}
check("the dragon can be beaten", b.got.raid.defeated === true && b.got.raid.hp === 0);
check("both attackers are counted", b.got.raid.contributors === 2);
check("the one who beat it wins that battle", b.got.battles.at(-1)?.battle.winnerId === "bob");
check("everyone who hurt it gets a baby dragon", a.got.rewards[0]?.creature.speciesId === "drageunge" && b.got.rewards[0]?.creature.ownerId === "bob");
b.room.send("raidStart", { seat: seat("bob") }); await wait(200);
check("a beaten dragon sleeps", b.got.problems.includes("dragon sleeping"));

// Scoreboard
const catchId = randomUUID();
const old = new Date(Date.now() - 9 * 86400000).toISOString();
a.room.send("scoreReport", { events: [{ id: catchId, kind: "catch", at: new Date().toISOString() }, { id: "old-one", kind: "catch", at: old }] }); await wait(150);
a.room.send("scoreReport", { events: [{ id: catchId, kind: "catch", at: new Date().toISOString() }] }); await wait(150);
check("reported catches are acknowledged, including duplicates and stale ones", a.got.acks.filter((x) => x === catchId).length === 2 && a.got.acks.includes("old-one"));
a.got.scores = null;
a.room.send("getScores", {}); await until(() => a.got.scores);
const rowA = a.got.scores?.rows.find((r) => r.playerId === "alice");
const rowB = a.got.scores?.rows.find((r) => r.playerId === "bob");
check("a duplicate or stale catch counts once", rowA?.catches === 1);
check("the final blow is worth more than helping", rowB?.dragons === 1 && rowA?.dragons === 1 && rowB.points > rowA.points - rowA.catches);

// Rewards are kept until acknowledged, and re-sent on rejoin.
await a.room.leave(); await wait(300);
a = await join("alice", at(32, 24)); await wait(400);
check("an unacknowledged reward is re-sent on rejoin", a.got.rewards.length === 1);
a.room.send("rewardAck", { rewardId: a.got.rewards[0].rewardId }); await wait(200);
await a.room.leave(); await wait(300);
a = await join("alice", at(32, 24)); await wait(400);
check("an acknowledged reward is not sent again", a.got.rewards.length === 0);
a.room.send("getScores", {}); await until(() => a.got.scores);
check("offline family members stay on the scoreboard", a.got.scores?.rows.length === 2);

// A won duel counts too.
a.room.send("move", at(10, 10)); b.room.send("move", at(11, 10)); await wait(200);
let duelId;
b.room.onMessage("duel", (m) => (duelId = m.id));
a.room.send("duelInvite", { toPlayerId: "bob", seat: seat("alice") }); await wait(300);
b.room.send("duelAccept", { duelId, seat: seat("bob", 1) }); await wait(250);
for (let i = 0; i < 10; i++) {
  a.room.send("duelAction", { duelId, action: { kind: "move", moveId: "slag" } });
  b.room.send("duelAction", { duelId, action: { kind: "move", moveId: "slag" } });
  await wait(150);
}
a.got.scores = null;
a.room.send("getScores", {}); await until(() => a.got.scores);
check("a won duel is on the scoreboard", a.got.scores?.rows.find((r) => r.playerId === "alice")?.duels === 1);

await a.room.leave(); await b.room.leave();
console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
