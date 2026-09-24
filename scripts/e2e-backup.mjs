// End-to-end check of save backups: stored via the lobby, restored over HTTP.
//   DATA_DIR=/tmp/backup-test FAMILY_CODE=test123 PORT=2599 node server/dist/index.js
//   node scripts/e2e-backup.mjs ws://localhost:2599 test123
import { Client } from "colyseus.js";

const [url = "ws://localhost:2599", code = "test123"] = process.argv.slice(2);
const http = url.replace(/^ws/, "http");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (cond, ms = 2000) => { for (let t = 0; t < ms && !cond(); t += 50) await wait(50); };
let failed = 0;
const check = (name, ok) => { console.log(ok ? "PASS" : "FAIL", name); if (!ok) failed++; };

const room = await new Client(url).joinOrCreate("lobby", { playerId: "anna-1", navn: "Anna", avatarId: "figur2", farve: "#e46876", gameId: "familien", familyCode: code, areaId: "startskoven", x: 32, y: 24 });
const acks = [];
room.onMessage("backupAck", (m) => acks.push(m));
for (const t of ["hello", "players", "playerMoved", "raid", "food"]) room.onMessage(t, () => {});
await wait(300);

const save = { version: 1, player: { id: "anna-1", navn: "Anna", avatarId: "figur2", farve: "#e46876" }, creatures: [{ instanceId: "c1", speciesId: "flammepels" }, { instanceId: "c2", speciesId: "stenbid" }], bag: ["🍎"] };
room.send("backup", { save }); await until(() => acks.length === 1);
check("a backup of my own save is stored", "savedAt" in (acks[0] ?? {}));
room.send("backup", { save: { ...save, player: { ...save.player, id: "bo-2" } } }); await until(() => acks.length === 2);
check("someone else's save is refused", acks[1]?.error === "not your save");

const get = (path, familyCode) => fetch(`${http}${path}`, { headers: familyCode ? { "x-family-code": familyCode } : {} });
check("listing without the family code is refused", (await get("/backups")).status === 401);
check("listing with a wrong code is refused", (await get("/backups", "nope")).status === 401);
const list = await (await get("/backups", code)).json();
check("the list shows the backed-up player", list.length === 1 && list[0].navn === "Anna" && list[0].creatures === 2 && list[0].avatarId === "figur2");
const got = await (await get("/backups/anna-1", code)).json();
check("fetching the backup returns the whole save", got.save.bag[0] === "🍎" && got.save.creatures.length === 2 && typeof got.savedAt === "string");
check("an unknown player has no backup", (await get("/backups/nobody", code)).status === 404);
check("path tricks don't escape the backup folder", [404, 401].includes((await get("/backups/..%2Ffamily", code)).status));
const pre = await fetch(`${http}/backups`, { method: "OPTIONS", headers: { origin: "https://example.github.io", "access-control-request-headers": "x-family-code" } });
check("the browser's CORS preflight is answered", pre.status === 204 && (pre.headers.get("access-control-allow-headers") ?? "").includes("x-family-code"));

await room.leave();
console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
