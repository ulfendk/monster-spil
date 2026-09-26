// End-to-end check of natural disasters: warning, strike, map changes, the UFO's alien, admin controls.
//   DATA_DIR=/tmp/dis-test FAMILY_CODE=test123 ADMIN_PASSWORD=adm1n PORT=2596 node server/dist/index.js
//   node scripts/e2e-disasters.mjs ws://localhost:2596 test123 adm1n
import { Client } from "colyseus.js";

const [url = "ws://localhost:2596", code = "test123", password = "adm1n"] = process.argv.slice(2);
const http = url.replace(/^ws/, "http");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (cond, ms = 20000) => { for (let t = 0; t < ms && !cond(); t += 50) await wait(50); };
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
// Nothing random during the test: stop the schedule (a trigger still works).
await call(`${G}/disasters/settings`, { method: "POST", body: { enabled: false } });

const join = async (id, x, y) => {
  const room = await new Client(url).joinOrCreate("lobby", { gameId: "familien", gameKey: code, playerId: id, navn: id, avatarId: "figur1", farve: "#e46876", areaId: "startskoven", x, y });
  const got = { terrain: null, recent: [], warnings: [], strikes: [], spawnBattle: null, problems: [], food: [] };
  room.onMessage("terrain", (m) => { got.terrain = m.terrain; got.recent = m.recent; });
  room.onMessage("disaster", (m) => (m.phase === "warning" ? got.warnings : got.strikes).push(m));
  room.onMessage("spawnBattle", (m) => (got.spawnBattle = m));
  room.onMessage("problem", (m) => got.problems.push(m.reason));
  room.onMessage("food", (m) => (got.food = m));
  for (const t of ["hello", "players", "playerMoved", "raid", "game", "backupAck"]) room.onMessage(t, () => {});
  return { room, got };
};

// Anna stands on the north road; Bo far away at the start.
const anna = await join("anna", 40, 10);
const bo = await join("bo", 32, 24);
await until(() => anna.got.terrain && bo.got.terrain);
check("the map's changes are sent on join (none yet)", Object.keys(anna.got.terrain.overrides).length === 0);

// A meteor right next to Anna.
const trig = await call(`${G}/disasters/trigger`, { method: "POST", body: { kind: "meteor", target: { x: 42, y: 10 } } });
check("a parent can trigger a disaster", trig.status === 200);
await until(() => anna.got.warnings.length && bo.got.warnings.length, 3000);
const warning = anna.got.warnings[0];
check("everyone gets the warning, with the danger area and a countdown", warning?.kind === "meteor" && warning.danger.includes("40,10") && Date.parse(warning.strikeAt) > Date.now());
check("a second one can't start while one is on its way", (await call(`${G}/disasters/trigger`, { method: "POST", body: {} })).status === 409);
await until(() => anna.got.strikes.length, 15000);
const strike = anna.got.strikes[0];
check("it strikes after the warning; Anna (in the danger area) is caught, Bo is not", strike?.struck?.includes("anna") && !strike.struck.includes("bo"));
await until(() => Object.keys(anna.got.terrain?.overrides ?? {}).length > 0);
const o = anna.got.terrain.overrides;
check("the map changed: a crater where it hit", o["42,10"]?.ground === 8 && !o["42,10"].until);
check("and burnt ground around it that will heal", Object.values(o).some((t) => t.ground === 7 && t.until));
check("where Anna stands stays walkable", !o["40,10"] || ![2, 4, 6, 10, 11, 13].includes(o["40,10"].ground));
check("rare monsters now live in the crater", anna.got.terrain.zones.some((z) => z.speciesId === "stjernesten" && z.tiles.includes("42,10")));
// Both get the same update, but not necessarily at the same moment: wait for Bo's too.
await until(() => JSON.stringify(bo.got.terrain) === JSON.stringify(anna.got.terrain));
check("everyone sees the same map", JSON.stringify(bo.got.terrain) === JSON.stringify(anna.got.terrain));

// The UFO: Bo walks over; the first to claim the alien gets to battle it.
await call(`${G}/disasters/trigger`, { method: "POST", body: { kind: "ufo", target: { x: 20, y: 24 } } });
await until(() => bo.got.terrain?.spawns?.length, 15000);
const spawn = bo.got.terrain.spawns[0];
check("a UFO crash leaves a wreck and the alien next to it", bo.got.terrain.overrides["20,24"]?.ground === 13 && spawn?.speciesId === "rumling");
bo.room.send("spawnClaim", { spawnId: spawn.id });
await until(() => bo.got.problems.length, 1000);
check("you have to stand next to it", bo.got.problems.includes("too far away"));
const next = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].map(([dx, dy]) => ({ x: spawn.x + dx, y: spawn.y + dy })).find((p) => !bo.got.terrain.overrides[`${p.x},${p.y}`] || ![2, 4, 6, 10, 11, 13].includes(bo.got.terrain.overrides[`${p.x},${p.y}`].ground));
bo.room.send("move", { areaId: "startskoven", ...next });
anna.room.send("move", { areaId: "startskoven", ...next });
await wait(200);
bo.room.send("spawnClaim", { spawnId: spawn.id });
await until(() => bo.got.spawnBattle);
check("next to it, the claim is granted: battle!", bo.got.spawnBattle?.speciesId === "rumling");
anna.room.send("spawnClaim", { spawnId: spawn.id });
await until(() => anna.got.problems.length);
check("someone else can't claim it meanwhile", anna.got.problems.includes("someone else is battling it"));
bo.room.send("spawnDone", { spawnId: spawn.id, caught: true });
await until(() => anna.got.terrain.spawns.length === 0);
check("caught: it's gone for everyone", anna.got.terrain.spawns.length === 0);

// A hurricane scatters extra food.
const foodBefore = anna.got.food.length;
await call(`${G}/disasters/trigger`, { method: "POST", body: { kind: "hurricane", target: { x: 20, y: 36 } } });
await until(() => anna.got.strikes.length >= 3, 15000);
await wait(300);
check("a hurricane blows extra food onto the map", anna.got.food.length > foodBefore);

// The admin portal: state, history, heal, reset, settings.
let state = await (await call(`${G}/state`)).json();
check("the admin state lists the history", state.disasters.history.length === 3 && state.disasters.history[0].kind === "hurricane" && state.disasters.history[2].struck === 1);
check("and counts the changes", state.disasters.changes.soft > 0 && state.disasters.changes.hard > 0 && state.disasters.changes.zones > 0);
check("stopped: no next disaster planned", state.disasters.settings.enabled === false && !state.disasters.nextAt);
await call(`${G}/disasters/settings`, { method: "POST", body: { enabled: true, meanMinutes: 60, randomness: 0 } });
state = await (await call(`${G}/state`)).json();
const inMin = (Date.parse(state.disasters.nextAt) - Date.now()) / 60000;
check("switched on: the next one is planned by the settings", state.disasters.settings.enabled && inMin > 59 && inMin < 61);
await call(`${G}/disasters/settings`, { method: "POST", body: { enabled: false } });
await call(`${G}/disasters/heal`, { method: "POST" });
state = await (await call(`${G}/state`)).json();
check("heal: soft changes gone, hard ones stay", state.disasters.changes.soft === 0 && state.disasters.changes.hard > 0);
await wait(200);
check("players see the healed map", Object.values(anna.got.terrain.overrides).every((t) => !t.until));

// Coming back later: the map as it is, and news of what happened.
await bo.room.leave();
const bo2 = await join("bo", 32, 24);
await until(() => bo2.got.terrain);
check("rejoining gets the changed map and the day's news", Object.keys(bo2.got.terrain.overrides).length > 0 && bo2.got.recent.length === 3);

await call(`${G}/disasters/reset`, { method: "POST" });
await until(() => Object.keys(anna.got.terrain.overrides).length === 0);
check("reset: the map is back as drawn", Object.keys(anna.got.terrain.overrides).length === 0 && anna.got.terrain.zones.length === 0);

await anna.room.leave();
await bo2.room.leave();
console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
