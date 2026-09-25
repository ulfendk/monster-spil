// End-to-end check of the roaming dragon: flights, the fight rules around them, admin controls.
//   DATA_DIR=/tmp/roam-test FAMILY_CODE=test123 ADMIN_PASSWORD=adm1n PORT=2595 node server/dist/index.js
//   node scripts/e2e-roam.mjs ws://localhost:2595 test123 adm1n
import { Client } from "colyseus.js";

const [url = "ws://localhost:2595", code = "test123", password = "adm1n"] = process.argv.slice(2);
const http = url.replace(/^ws/, "http");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (cond, ms = 12000) => { for (let t = 0; t < ms && !cond(); t += 50) await wait(50); };
let failed = 0;
const check = (name, ok) => { console.log(ok ? "PASS" : "FAIL", name); if (!ok) failed++; };

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
const dragon = (body) => call(`${G}/dragon`, { method: "POST", body });
// No random flights or disasters during the test: only the ones we ask for.
await dragon({ action: "roam", enabled: false });
await call(`${G}/disasters/settings`, { method: "POST", body: { enabled: false } });

const seat = (id) => ({
  active: { instanceId: id + "-i", speciesId: "helt", ownerId: id, niveau: 1, currentHp: 1, caughtAt: "2026-01-01" },
  species: { id: "helt", navn: "Helt", type: "vand", baseStats: { hp: 150, angreb: 60, forsvar: 60, fart: 60 }, spriteFront: "a.png", spriteBack: "b.png" },
  moves: [{ id: "slag", navn: "Slag", type: "vand", power: 20, accuracy: 1 }],
});
const at = (x, y) => ({ areaId: "startskoven", x, y });
async function join(id, pos) {
  const room = await new Client(url).joinOrCreate("lobby", { playerId: id, navn: id, avatarId: "a", farve: "#ff0000", gameId: "familien", familyCode: code, ...pos });
  const got = { raid: null, flights: [], battles: [], problems: [], food: [] };
  room.onMessage("raid", (m) => (got.raid = m));
  room.onMessage("dragonFlight", (m) => got.flights.push({ ...m, at: Date.now() }));
  room.onMessage("raidBattle", (m) => got.battles.push(m));
  room.onMessage("problem", (m) => got.problems.push(m.reason));
  room.onMessage("food", (m) => (got.food = m));
  for (const t of ["hello", "players", "playerMoved", "game", "terrain", "disaster", "backupAck"]) room.onMessage(t, () => {});
  return { room, got };
}

// Alice waits next to the dragon's home lair (5,3); Bob far away.
const alice = await join("alice", at(4, 3));
const bob = await join("bob", at(32, 24));
await until(() => alice.got.raid && bob.got.raid);
check("the raid view says where the dragon sits (its home lair at first)", alice.got.raid.lair?.x === 5 && alice.got.raid.lair?.y === 3);
let state = await (await call(`${G}/state`)).json();
check("the admin sees the perch, the home lair and that roaming is off", state.dragon.lair.x === 5 && state.dragon.home.x === 5 && state.dragon.roam.settings.enabled === false && !state.dragon.roam.nextAt);

// A flight.
const fly = await dragon({ action: "fly" });
check("a parent can send it flying", fly.status === 200);
await until(() => alice.got.flights.length && bob.got.flights.length, 3000);
const flight = alice.got.flights[0];
check("everyone sees the flight from the old perch to a new one", flight && flight.from.x === 5 && flight.from.y === 3 && bob.got.flights.length === 1 && flight.ms > 1000);
const dist = Math.hypot(flight.to.x - flight.from.x, flight.to.y - flight.from.y);
check("the new perch is a good way off, inside the map and not on a player", dist >= 12 && flight.to.x > 2 && flight.to.y > 2 && !(flight.to.x === 32 && flight.to.y === 24));
await until(() => alice.got.raid.lair.x !== 5 || alice.got.raid.lair.y !== 3, 1000);
check("the raid view has the new perch", alice.got.raid.lair.x === flight.to.x && alice.got.raid.lair.y === flight.to.y && bob.got.raid.lair.x === flight.to.x);

// While it is in the air nobody can fight it.
bob.room.send("move", at(flight.to.x + 1, flight.to.y));
await wait(100);
bob.room.send("raidStart", { seat: seat("bob") });
await until(() => bob.got.problems.length, 1000);
check("nobody can fight it while it flies", bob.got.problems.includes("dragon flying") && bob.got.battles.length === 0);
check("a second flight can't start while one is under way", (await dragon({ action: "fly" })).status === 400);
await wait(Math.max(0, flight.at + flight.ms + 400 - Date.now()));
bob.room.send("raidStart", { seat: seat("bob") });
await until(() => bob.got.battles.length, 2000);
check("after landing, fighting it at its new perch works", bob.got.battles.at(-1)?.battle.mode === "boss");
check("the old perch is empty: Alice can't fight it from there", (alice.room.send("raidStart", { seat: seat("alice") }), await wait(300), alice.got.problems.includes("too far away")));

// Busy: it doesn't take off in the middle of a fight.
const busy = await dragon({ action: "fly" });
const busyBody = await busy.json();
check("it won't fly while someone is fighting it", busy.status === 400 && /kæmper/.test(busyBody.error ?? ""));
bob.room.send("raidAction", { action: { kind: "flee" } });
await until(() => bob.got.battles.at(-1)?.battle.outcome === "fled", 2000);
await wait(300);

// No food on the perch, and a player standing where it might land is never chosen.
const perch = alice.got.raid.lair;
check("no food lies on the dragon's perch", !bob.got.food.some((f) => f.x === perch.x && f.y === perch.y));

// Settings and the schedule.
await dragon({ action: "roam", enabled: true, meanMinutes: 60, randomness: 0 });
state = await (await call(`${G}/state`)).json();
const inMin = (Date.parse(state.dragon.roam.nextAt) - Date.now()) / 60000;
check("switched on: the next flight is planned by the settings", state.dragon.roam.settings.enabled && inMin > 59 && inMin < 61);
await dragon({ action: "roam", meanMinutes: 1, randomness: 9 });
state = await (await call(`${G}/state`)).json();
check("odd settings are clamped", state.dragon.roam.settings.meanMinutes === 5 && state.dragon.roam.settings.randomness === 1);
await dragon({ action: "roam", enabled: false });

// A reset keeps the dragon where it is.
await dragon({ action: "reset" });
await wait(300);
check("resetting the dragon's HP leaves it on its perch", alice.got.raid.lair.x === perch.x && alice.got.raid.hp === 600);

// A sleeping dragon doesn't fly.
await dragon({ action: "hp", hp: 0 });
const asleep = await dragon({ action: "fly" });
check("a sleeping dragon stays put", asleep.status === 400 && /sover/.test((await asleep.json()).error ?? ""));
await dragon({ action: "reset" });

// Roaming survives the server keeping state: the perch is in the admin state too.
state = await (await call(`${G}/state`)).json();
check("the admin state shows the perch", state.dragon.lair.x === perch.x && state.dragon.lair.y === perch.y);

await alice.room.leave();
await bob.room.leave();
console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
