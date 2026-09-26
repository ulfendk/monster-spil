// End-to-end check of caves: a parent opens one, players go in (once each), it closes.
//   DATA_DIR=/tmp/cave-test FAMILY_CODE=test123 ADMIN_PASSWORD=adm1n PORT=2589 node server/dist/index.js
//   node scripts/e2e-caves.mjs ws://localhost:2589 test123 adm1n
import { readFileSync } from "node:fs";
import { Client } from "colyseus.js";

const [url = "ws://localhost:2589", code = "test123", password = "adm1n"] = process.argv.slice(2);
const http = url.replace(/^ws/, "http");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (cond, ms = 8000) => { for (let t = 0; t < ms && !cond(); t += 50) await wait(50); };
let failed = 0;
const check = (name, ok) => { console.log(ok ? "PASS" : "FAIL", name); if (!ok) failed++; };

const map = JSON.parse(readFileSync(new URL("../shared/content/areas/startskoven.json", import.meta.url), "utf8"));
const meta = JSON.parse(readFileSync(new URL("../shared/content/areas/startskoven.meta.json", import.meta.url), "utf8"));
const config = JSON.parse(readFileSync(new URL("../shared/content/caves.json", import.meta.url), "utf8"));
const tile = (x, y) => map.layers[0].data[y * map.width + x];
const walkable = (x, y) => x >= 0 && y >= 0 && x < map.width && y < map.height && !meta.collisionGids.includes(tile(x, y));

let cookie = "";
const call = async (path, { method = "GET", body } = {}) => {
  const res = await fetch(`${http}${path}`, { method, headers: { "content-type": "application/json", "x-admin": "1", ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  return res;
};
await call("/admin/login", { method: "POST", body: { password } });
const G = "/admin/api/games/familien";
const caves = (body) => call(`${G}/caves`, { method: "POST", body });
await call(`${G}/dragon`, { method: "POST", body: { action: "roam", enabled: false } });
await call(`${G}/disasters/settings`, { method: "POST", body: { enabled: false } });
await call(`${G}/beasts`, { method: "POST", body: { action: "settings", enabled: false } });
await caves({ action: "settings", enabled: false });

const at = (x, y) => ({ areaId: "startskoven", x, y });
async function join(id, pos) {
  const room = await new Client(url).joinOrCreate("lobby", { playerId: id, navn: id, avatarId: "a", farve: "#ff0000", gameId: "familien", familyCode: code, ...pos });
  const got = { hello: null, caves: null, visits: [], problems: [] };
  room.onMessage("hello", (m) => (got.hello = m));
  room.onMessage("caves", (m) => (got.caves = m));
  room.onMessage("caveVisit", (m) => got.visits.push(m));
  room.onMessage("problem", (m) => got.problems.push(m.reason));
  for (const t of ["players", "playerMoved", "raid", "beasts", "game", "terrain", "disaster", "food", "backupAck"]) room.onMessage(t, () => {});
  return { room, got };
}

const alice = await join("alice", at(32, 24));
const bob = await join("bob", at(33, 24));
await until(() => alice.got.caves && bob.got.caves);
check("hello says protocol 12", alice.got.hello?.protocolVersion === 12);
check("no cave at first (they're off)", alice.got.caves.length === 0);

check("a parent can open a cave", (await caves({ action: "open" })).status === 200);
await until(() => alice.got.caves.length && bob.got.caves.length);
const cave = alice.got.caves[0];
check("everyone sees it", Boolean(cave && bob.got.caves[0]?.id === cave.id));
const front = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: cave.x + dx, y: cave.y + dy })).find((p) => walkable(p.x, p.y));
check("it opened in a mountain face you can walk up to", tile(cave.x, cave.y) === meta.terrain.mountain && Boolean(front));
check("only one open at a time", (await caves({ action: "open" })).status === 400);

alice.room.send("caveEnter", { caveId: cave.id });
await until(() => alice.got.problems.length);
check("too far away to go in", alice.got.problems.at(-1) === "too far away");

alice.room.send("move", at(front.x, front.y));
bob.room.send("move", at(front.x, front.y));
await wait(200);
alice.room.send("caveEnter", { caveId: cave.id });
await until(() => alice.got.visits.length);
const visit = alice.got.visits[0];
check("next to it, Alice goes in: monsters and balls from caves.json", visit?.caveId === cave.id && visit.balls === config.balls && visit.speciesIds.length === config.monsters);
check("only cave monsters are in there", visit.speciesIds.every((id) => config.species.some((s) => s.speciesId === id)));
await until(() => alice.got.caves[0]?.visitedBy.includes("alice"));
check("everyone can see she has been in", bob.got.caves[0]?.visitedBy.includes("alice"));
alice.room.send("caveEnter", { caveId: cave.id });
await until(() => alice.got.problems.length > 1);
check("once per opening", alice.got.problems.at(-1) === "cave visited");
bob.room.send("caveEnter", { caveId: cave.id });
await until(() => bob.got.visits.length);
check("Bob gets his own visit", bob.got.visits[0]?.caveId === cave.id && Number.isInteger(bob.got.visits[0].seed));

let state = await (await call(`${G}/state`)).json();
check("the admin sees it and who has been in", state.caves.active[0]?.id === cave.id && state.caves.active[0].visitedBy.length === 2);
check("a parent can close it", (await caves({ action: "close", id: cave.id })).status === 200);
await until(() => alice.got.caves.length === 0);
check("it's gone for everyone", alice.got.caves.length === 0 && bob.got.caves.length === 0);
bob.room.send("caveEnter", { caveId: cave.id });
await until(() => bob.got.problems.length);
check("a closed cave can't be entered", bob.got.problems.at(-1) === "cave closed");

await caves({ action: "settings", enabled: true, meanMinutes: 1, openMinutes: 9999, randomness: 0.3 });
state = await (await call(`${G}/state`)).json();
check("settings are clamped; the next opening is planned", state.caves.settings.meanMinutes === 5 && state.caves.settings.openMinutes === 240 && Boolean(state.caves.nextAt));
await caves({ action: "settings", enabled: false });

for (const p of [alice, bob]) await p.room.leave();
console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
