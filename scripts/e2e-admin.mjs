// End-to-end check of the admin portal.
//   DATA_DIR=/tmp/admin-test FAMILY_CODE=test123 ADMIN_PASSWORD=adm1n PORT=2599 node server/dist/index.js
//   node scripts/e2e-admin.mjs ws://localhost:2599 test123 adm1n
import { Client } from "colyseus.js";

const [url = "ws://localhost:2599", code = "test123", password = "adm1n"] = process.argv.slice(2);
const http = url.replace(/^ws/, "http");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (cond, ms = 2000) => { for (let t = 0; t < ms && !cond(); t += 50) await wait(50); };
let failed = 0;
const check = (name, ok) => { console.log(ok ? "PASS" : "FAIL", name); if (!ok) failed++; };

// Two players: Anna (with a backup, some points) stays online; Bo leaves.
const join = async (id, navn) => {
  const room = await new Client(url).joinOrCreate("lobby", { playerId: id, navn, avatarId: "figur2", farve: "#e46876", gameId: "familien", familyCode: code, areaId: "startskoven", x: 32, y: 24 });
  const got = { raid: null, acks: 0 };
  room.onMessage("raid", (m) => (got.raid = m));
  room.onMessage("backupAck", () => got.acks++);
  for (const t of ["hello", "players", "playerMoved", "food", "scoreReportAck"]) room.onMessage(t, () => {});
  return { room, got };
};
const anna = await join("anna-a", "Anna");
const bo = await join("bo-b", "Bo");
await wait(300);
anna.room.send("backup", { save: { version: 1, player: { id: "anna-a", navn: "Anna", avatarId: "figur2", farve: "#e46876" }, creatures: [{}, {}] } });
bo.room.send("backup", { save: { version: 1, player: { id: "bo-b", navn: "Bo", avatarId: "figur6", farve: "#7fb4ca" }, creatures: [{}] } });
bo.room.send("scoreReport", { events: [{ id: "c-bo-1", kind: "catch", at: new Date().toISOString() }] });
await until(() => anna.got.acks && bo.got.acks);
await bo.room.leave();
await wait(200);

let cookie = "";
const call = async (path, { method = "GET", body, admin = true } = {}) => {
  const res = await fetch(`${http}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(admin ? { "x-admin": "1" } : {}), ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  return res;
};

check("the page is served", (await call("/admin")).headers.get("content-type")?.includes("text/html"));
check("the API needs a login", (await call("/admin/api/games/familien/state")).status === 401);
check("a wrong password is refused", (await call("/admin/login", { method: "POST", body: { password: "nope" } })).status === 401);
check("the family code is not the admin password", (await call("/admin/login", { method: "POST", body: { password: code } })).status === 401);
const login = await call("/admin/login", { method: "POST", body: { password } });
check("the right password logs in with an HttpOnly, SameSite=Strict cookie", login.status === 200 && cookie.startsWith("mj_admin="));

const state = await (await call("/admin/api/games/familien/state")).json();
const annaRow = state.players.find((p) => p.playerId === "anna-a");
const boRow = state.players.find((p) => p.playerId === "bo-b");
check("the state lists players with backups, points and who is online", annaRow?.online === true && boRow?.online === false && boRow.points === 1 && annaRow.backup?.creatures === 2);
check("the state shows the dragon", state.dragon.hp === state.dragon.maxHp && typeof state.dragon.navn === "string");

check("changes need the page's x-admin header", (await call("/admin/api/games/familien/scores/clear", { method: "POST", admin: false })).status === 403);

const one = await call("/admin/api/games/familien/backups/anna-a");
check("one backup downloads as a file", one.headers.get("content-disposition")?.includes("attachment") && (await one.json()).save.player.navn === "Anna");
const all = await (await call("/admin/api/games/familien/backups")).json();
check("all backups download as one file", all.backups.length === 2);

const del = await (await call("/admin/api/games/familien/players/bo-b/delete", { method: "POST" })).json();
const after = await (await call("/admin/api/games/familien/state")).json();
check("deleting a player removes their scores and backup", del.backupRemoved === true && !after.players.some((p) => p.playerId === "bo-b"));
const restoreList = await (await fetch(`${http}/backups`, { headers: { "x-family-code": code } })).json();
check("a deleted player is gone from the restore list too", !restoreList.some((b) => b.playerId === "bo-b"));

await call("/admin/api/games/familien/dragon", { method: "POST", body: { action: "hp", hp: 123 } });
await until(() => anna.got.raid?.hp === 123);
check("setting the dragon's HP reaches players online", anna.got.raid?.hp === 123);
await call("/admin/api/games/familien/dragon", { method: "POST", body: { action: "hp", hp: 0 } });
await until(() => anna.got.raid?.defeated === true);
check("HP 0 puts the dragon to sleep", anna.got.raid?.defeated === true);
await call("/admin/api/games/familien/dragon", { method: "POST", body: { action: "reset" } });
await until(() => anna.got.raid?.hp === anna.got.raid?.maxHp && !anna.got.raid?.defeated);
check("reset wakes it with full HP", anna.got.raid?.hp === anna.got.raid?.maxHp && anna.got.raid?.defeated === false);
check("an unknown dragon action is refused", (await call("/admin/api/games/familien/dragon", { method: "POST", body: { action: "explode" } })).status === 400);

const cleared = await (await call("/admin/api/games/familien/scores/clear", { method: "POST" })).json();
check("clearing the week removes the points", cleared.ok === true && (await (await call("/admin/api/games/familien/state")).json()).scoreEvents === 0);

await call("/admin/logout", { method: "POST" });
check("after logging out the API is closed again", (await call("/admin/api/games/familien/state")).status === 401);

await anna.room.leave();
console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
