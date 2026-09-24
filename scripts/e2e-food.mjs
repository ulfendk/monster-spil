// End-to-end check of food on the map and the dragon rest after fainting.
//   DATA_DIR=/tmp/food-test FAMILY_CODE=test123 PORT=2599 node server/dist/index.js
//   node scripts/e2e-food.mjs ws://localhost:2599 test123
import { Client } from "colyseus.js";

const [url = "ws://localhost:2599", code = "test123"] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok) => { console.log(ok ? "PASS" : "FAIL", name); if (!ok) failed++; };

async function join(id, x, y) {
  const room = await new Client(url).joinOrCreate("lobby", { playerId: id, navn: id, avatarId: "a", farve: "#ff0000", gameId: "familien", familyCode: code, areaId: "startskoven", x, y });
  const got = { food: [], taken: [], battles: [], problems: [], hello: null };
  room.onMessage("hello", (m) => (got.hello = m));
  room.onMessage("food", (m) => (got.food = m));
  room.onMessage("foodTaken", (m) => got.taken.push(m));
  room.onMessage("raidBattle", (m) => got.battles.push(m));
  room.onMessage("problem", (m) => got.problems.push(m.reason));
  for (const t of ["players", "playerMoved", "raid", "reward"]) room.onMessage(t, () => {});
  return { room, got };
}

const a = await join("anna", 32, 24);
const b = await join("bo", 10, 10);
await wait(400);
check("hello carries protocol version 6 or newer", a.got.hello?.protocolVersion >= 6);
check("food is sent on join (14 on the map)", a.got.food.length === 14 && a.got.food.every((f) => f.areaId === "startskoven"));
const apple = a.got.food[0];

b.room.send("foodTake", { foodId: apple.id }); await wait(200);
check("food far away can't be taken", b.got.taken.length === 0 && a.got.food.length === 14);

a.room.send("move", { areaId: "startskoven", x: apple.x, y: apple.y }); await wait(150);
a.room.send("foodTake", { foodId: apple.id }); await wait(250);
check("stepping onto food takes it", a.got.taken[0]?.foodId === apple.id && a.got.taken[0].kind === apple.kind);
check("everyone sees it gone", b.got.food.length === 13 && !b.got.food.some((f) => f.id === apple.id));

b.room.send("move", { areaId: "startskoven", x: apple.x, y: apple.y }); await wait(150);
b.room.send("foodTake", { foodId: apple.id }); await wait(200);
check("the same food can't be taken twice", b.got.taken.length === 0);

// Fainting against the dragon: no rest on the server (the device passes out instead).
const weak = (id) => ({
  active: { instanceId: id, speciesId: "s", ownerId: id, niveau: 1, currentHp: 1, caughtAt: "x" },
  species: { id: "s", navn: "S", type: "graes", baseStats: { hp: 1, angreb: 1, forsvar: 1, fart: 1 }, spriteFront: "a", spriteBack: "b" },
  moves: [{ id: "m", navn: "M", type: "graes", power: 1, accuracy: 1 }],
});
a.room.send("move", { areaId: "startskoven", x: 4, y: 3 }); await wait(150);
a.room.send("raidStart", { seat: weak("anna") }); await wait(200);
for (let i = 0; i < 5 && a.got.battles.at(-1)?.battle.outcome === "ongoing"; i++) {
  a.room.send("raidAction", { action: { kind: "move", moveId: "m" } }); await wait(150);
}
check("a weak monster faints against the dragon", a.got.battles.at(-1)?.battle.outcome === "lost");
a.room.send("raidStart", { seat: weak("anna") }); await wait(200);
check("after fainting there is no server rest (passing out happens on the device)", !a.got.problems.includes("resting") && a.got.battles.at(-1)?.battle.outcome === "ongoing");
a.room.send("raidAction", { action: { kind: "flee" } }); await wait(200);
a.room.send("raidStart", { seat: weak("anna") }); await wait(200);
check("fleeing still means a rest", a.got.problems.includes("resting"));

await a.room.leave(); await b.room.leave();
console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
