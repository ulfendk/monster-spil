// End-to-end check of the minigames' work on the shared map: felling trees and digging holes.
//   DATA_DIR=/tmp/work-test FAMILY_CODE=test123 ADMIN_PASSWORD=adm1n PORT=2581 node server/dist/index.js
//   node scripts/e2e-work.mjs ws://localhost:2581 test123 adm1n
import { readFileSync } from "node:fs";
import { Client } from "colyseus.js";

const [url = "ws://localhost:2581", code = "test123", password = "adm1n"] = process.argv.slice(2);
const http = url.replace(/^ws/, "http");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (cond, ms = 5000) => { for (let t = 0; t < ms && !cond(); t += 50) await wait(50); };
let failed = 0;
const check = (name, ok) => { console.log(ok ? "PASS" : "FAIL", name); if (!ok) failed++; };

const map = JSON.parse(readFileSync(new URL("../shared/content/areas/startskoven.json", import.meta.url), "utf8"));
const meta = JSON.parse(readFileSync(new URL("../shared/content/areas/startskoven.meta.json", import.meta.url), "utf8"));
const T = meta.terrain;
const tile = (x, y) => map.layers[0].data[y * map.width + x];
const grass = (x, y) => map.layers[1].data[y * map.width + x];
// A tree with plain ground right below it, in from the edge, and a patch of plain ground to dig.
let tree, stand;
for (let y = 30; y < 100 && !tree; y++) for (let x = 70; x < 150 && !tree; x++) {
  if (tile(x, y) === T.tree && tile(x, y + 1) === T.ground && !grass(x, y + 1)) { tree = { x, y }; stand = { x, y: y + 1 }; }
}
let path;
for (let x = 70; x < 150 && !path; x++) if (tile(x, 72) === T.path) path = { x, y: 72 };

let cookie = "";
const call = async (p, body) => {
  const res = await fetch(`${http}${p}`, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", "x-admin": "1", ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const c = res.headers.get("set-cookie"); if (c) cookie = c.split(";")[0];
  return res;
};
await call("/admin/login", { password });
const G = "/admin/api/games/familien";
await call(`${G}/disasters/settings`, { enabled: false });

const room = await new Client(url).joinOrCreate("lobby", { playerId: "hugger", navn: "Hugger", avatarId: "figur1", farve: "#ff0000", gameId: "familien", familyCode: code, areaId: "startskoven", x: stand.x, y: stand.y + 5 });
const got = { hello: null, terrain: null, done: [], problems: [] };
room.onMessage("hello", (m) => (got.hello = m));
room.onMessage("terrain", (m) => (got.terrain = m.terrain));
room.onMessage("workDone", (m) => got.done.push(m));
room.onMessage("problem", (m) => got.problems.push(m.reason));
for (const t of ["players", "playerMoved", "raid", "beasts", "caves", "game", "disaster", "food"]) room.onMessage(t, () => {});
await until(() => got.hello && got.terrain);
check("hello says protocol 14 or newer", got.hello?.protocolVersion >= 14);

room.send("work", { kind: "cut", x: tree.x, y: tree.y });
await until(() => got.problems.length);
check("a tree too far away can't be felled", got.problems.at(-1) === "cannot work here");
room.send("move", { areaId: "startskoven", ...stand });
await wait(200);
room.send("work", { kind: "cut", x: tree.x, y: tree.y });
await until(() => got.done.length);
const key = `${tree.x},${tree.y}`;
await until(() => got.terrain?.overrides?.[key]);
check("next to it, the tree is felled: a stump for everyone to see", got.done[0]?.kind === "cut" && got.terrain.overrides[key]?.ground === T.stump && typeof got.terrain.overrides[key]?.until === "string");
room.send("work", { kind: "cut", x: tree.x, y: tree.y });
await until(() => got.problems.length > 1);
check("a stump isn't a tree: it can't be felled again", got.problems.at(-1) === "cannot work here");

room.send("work", { kind: "dig", x: stand.x, y: stand.y });
const dugKey = `${stand.x},${stand.y}`;
await until(() => got.terrain?.overrides?.[dugKey]);
check("digging where I stand leaves a hole", got.terrain.overrides[dugKey]?.ground === T.hole);
room.send("work", { kind: "dig", x: stand.x, y: stand.y });
await until(() => got.problems.length > 2);
check("the same hole can't be dug twice", got.problems.at(-1) === "cannot work here");
room.send("move", { areaId: "startskoven", ...path });
await wait(200);
room.send("work", { kind: "dig", x: path.x, y: path.y });
await until(() => got.problems.length > 3);
check("a path can't be dug", got.problems.at(-1) === "cannot work here");
room.send("work", { kind: "dig", x: stand.x, y: stand.y });
await until(() => got.problems.length > 4);
check("and only where I stand", got.problems.at(-1) === "cannot work here");

check("a parent's 'heal the map' grows the tree back and fills the hole", (await call(`${G}/disasters/heal`, {})).status === 200);
await until(() => !got.terrain?.overrides?.[key] && !got.terrain?.overrides?.[dugKey]);
check("both are gone", !got.terrain?.overrides?.[key] && !got.terrain?.overrides?.[dugKey]);

await room.leave();
console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
