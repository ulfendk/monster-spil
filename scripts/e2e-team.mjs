// End-to-end check of teaming up against the dragon with scripted players.
//   DATA_DIR=/tmp/team-test FAMILY_CODE=test123 PORT=2599 node server/dist/index.js
//   node scripts/e2e-team.mjs ws://localhost:2599 test123
// Use a fresh DATA_DIR: the test may beat the dragon, which then sleeps until Monday.
import { Client } from "colyseus.js";

const [url = "ws://localhost:2599", code = "test123"] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok) => { console.log(ok ? "PASS" : "FAIL", name); if (!ok) failed++; };

const seat = (id, power = 30, hp = 40) => ({
  active: { instanceId: id + "-i", speciesId: "helt", ownerId: id, niveau: 1, currentHp: 1, caughtAt: "2026-01-01" },
  species: { id: "helt", navn: "Helt", type: "vand", baseStats: { hp, angreb: 30, forsvar: 20, fart: 20 }, spriteFront: "a.png", spriteBack: "b.png" },
  moves: [{ id: "slag", navn: "Slag", type: "vand", power, accuracy: 1 }],
});

async function join(id, x, y) {
  const room = await new Client(url).joinOrCreate("lobby", { playerId: id, navn: id, avatarId: "a", farve: "#ff0000", gameId: "familien", familyCode: code, areaId: "startskoven", x, y });
  const got = { raid: null, team: null, ended: [], problems: [], players: [] };
  room.onMessage("raid", (m) => (got.raid = m));
  room.onMessage("team", (m) => (got.team = m));
  room.onMessage("teamEnded", (m) => got.ended.push(m));
  room.onMessage("problem", (m) => got.problems.push(m.reason));
  room.onMessage("players", (m) => (got.players = m));
  for (const t of ["hello", "playerMoved", "raidBattle", "reward", "scores"]) room.onMessage(t, () => {});
  return { room, got };
}

const anna = await join("anna", 4, 3);
const bo = await join("bo", 6, 3);
const carl = await join("carl", 30, 30);
await wait(400);

anna.room.send("teamCreate", { seat: seat("anna") }); await wait(250);
check("the leader's team gathers", anna.got.team?.phase === "gathering" && anna.got.team.leaderId === "anna");
check("everyone sees a team gathering at the lair", carl.got.raid?.gathering?.leaderId === "anna" && carl.got.raid.gathering.size === 1);
const teamId = anna.got.team.id;

carl.room.send("teamJoin", { teamId, seat: seat("carl") }); await wait(200);
check("joining from far away is refused", carl.got.problems.includes("too far away") && anna.got.team.members.length === 1);
bo.room.send("teamCreate", { seat: seat("bo") }); await wait(200);
check("a second team can't gather at the same time", bo.got.problems.includes("a team is already at the dragon"));
bo.room.send("teamJoin", { teamId, seat: seat("bo") }); await wait(250);
check("a player next to the lair joins", anna.got.team.members.length === 2 && bo.got.team?.phase === "gathering");
check("team members are busy (can't be invited)", anna.got.players.find((p) => p.playerId === "bo")?.busy === true);
bo.room.send("teamStart", { teamId }); await wait(200);
check("only the leader can start", bo.got.problems.includes("only the leader can start") && anna.got.team.phase === "gathering");

anna.room.send("teamStart", { teamId }); await wait(250);
check("the fight starts for both", anna.got.team.phase === "active" && bo.got.team.phase === "active");
check("HP is multiplied by the team factor (×1.25 for two)", anna.got.team.members.every((m) => m.maxHp === 50) && anna.got.team.hpFactor === 1.25);
check("each sees their own monster against the dragon", bo.got.team.battle?.participants[0].playerId === "bo");
check("the gathering is no longer offered", !carl.got.raid.gathering);

const hpBefore = anna.got.raid.hp;
anna.room.send("teamAction", { teamId, action: { kind: "move", moveId: "slag" } }); await wait(200);
check("the turn waits for everyone", anna.got.team.battle.turn === 0 && JSON.stringify(bo.got.team.answered) === '["anna"]');
bo.room.send("teamAction", { teamId, action: { kind: "move", moveId: "slag" } }); await wait(300);
check("then everyone acts, and the shared HP drops", anna.got.team.battle.turn === 1 && carl.got.raid.hp < hpBefore);

// Bo walks away mid-fight (disconnects): Anna fights on.
await bo.room.leave(); await wait(300);
check("a member who leaves is out, the rest fight on", anna.got.team.members.find((m) => m.playerId === "bo")?.status === "left" && anna.got.team.phase === "active");

// Anna flees: nobody left, the team has lost.
anna.room.send("teamAction", { teamId, action: { kind: "flee" } }); await wait(300);
check("when nobody is left the fight ends (lost)", anna.got.team.phase === "done" && anna.got.team.outcome === "lost");
check("the dragon keeps the damage it took", carl.got.raid.hp < hpBefore && carl.got.raid.contributors === 2);
anna.room.send("raidStart", { seat: seat("anna") }); await wait(200);
check("team members rest afterwards", anna.got.problems.includes("resting"));

// A leader who leaves while gathering cancels the team for everyone.
const dan = await join("dan", 4, 4);
const eva = await join("eva", 6, 4);
await wait(300);
dan.room.send("teamCreate", { seat: seat("dan") }); await wait(200);
eva.room.send("teamJoin", { teamId: dan.got.team.id, seat: seat("eva") }); await wait(200);
dan.room.send("teamLeave", { teamId: dan.got.team.id }); await wait(250);
check("the leader leaving while gathering cancels it for everyone", eva.got.ended.some((e) => e.reason === "cancelled") && !carl.got.raid.gathering);

// A strong team beats the dragon: rewards for both.
let rewards = 0;
eva.room.onMessage("reward", () => rewards++);
dan.room.onMessage("reward", () => rewards++);
dan.room.send("teamCreate", { seat: seat("dan", 150, 150) }); await wait(200);
eva.room.send("teamJoin", { teamId: dan.got.team.id, seat: seat("eva", 150, 150) }); await wait(200);
dan.room.send("teamStart", { teamId: dan.got.team.id }); await wait(250);
const tid = dan.got.team.id;
for (let i = 0; i < 30 && dan.got.team?.phase === "active"; i++) {
  dan.room.send("teamAction", { teamId: tid, action: { kind: "move", moveId: "slag" } });
  eva.room.send("teamAction", { teamId: tid, action: { kind: "move", moveId: "slag" } });
  await wait(150);
}
await wait(300);
check("a team can beat the dragon", dan.got.team.outcome === "won" && carl.got.raid.defeated === true);
check("everyone who hurt it gets a reward (dan and eva here)", rewards === 2);

for (const p of [anna, carl, dan, eva]) await p.room.leave();
console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
