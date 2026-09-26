// End-to-end check of moving the game to a new address (one-time codes), and of the
// server serving the game itself. Against the Docker image (or any server with a client build):
//   docker run -p 2588:2567 -e ADMIN_PASSWORD=adm1n -e FAMILY_CODE=test123 <image>
//   node scripts/e2e-move.mjs http://localhost:2588 test123
const [base = "http://localhost:2588", key = "test123"] = process.argv.slice(2);
let failed = 0;
const check = (name, ok) => { console.log(ok ? "PASS" : "FAIL", name); if (!ok) failed++; };
const post = (body, k = key) => fetch(`${base}/transfer`, { method: "POST", headers: { "x-game-key": k, "content-type": "application/json" }, body: JSON.stringify(body) });

const now = new Date().toISOString();
const save = { version: 1, player: { id: "flyt-e2e", navn: "Flyt", avatarId: "figur2", farve: "#ff0000" }, creatures: [{ instanceId: "c1", speciesId: "istap", ownerId: "flyt-e2e", niveau: 1, currentHp: 36, caughtAt: now }], seenSpeciesIds: ["istap"], caughtCounts: {}, pendingScore: [], bag: [], position: { areaId: "startskoven", x: 32, y: 24 }, createdAt: now, updatedAt: now };

check("a wrong key gets no code", (await post({ save }, "forkert-noegle")).status === 401);
check("no save, no code", (await post({})).status === 400);
const res = await post({ save });
const { code } = await res.json();
check("the right key and a save give a code", res.status === 200 && typeof code === "string" && code.length >= 20);
const backup = await (await fetch(`${base}/backups/flyt-e2e`, { headers: { "x-game-key": key } })).json();
check("the save became the player's backup", backup?.save?.creatures?.[0]?.speciesId === "istap");
const first = await fetch(`${base}/transfer/${code}`);
const body = await first.json();
check("the code gives the game, its key and the player", first.status === 200 && body.gameId === "familien" && body.key === key && body.playerId === "flyt-e2e");
check("a code works only once", (await fetch(`${base}/transfer/${code}`)).status === 404);
check("a made-up code gets nothing", (await fetch(`${base}/transfer/not-a-real-code-at-all`)).status === 404);

const page = await fetch(`${base}/`);
check("the server serves the game itself", page.status === 200 && (await page.text()).includes("Monsterjagt") && page.headers.get("cache-control") === "no-cache");
check("the service worker is never cached", (await fetch(`${base}/sw.js`)).headers.get("cache-control") === "no-cache");
const escape = await (await fetch(`${base}/..%2f..%2f..%2fetc%2fpasswd`)).text();
check("no way out of the game's folder", !escape.includes("root:"));
check("the admin portal is still there", (await fetch(`${base}/admin`)).status === 200);

console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
