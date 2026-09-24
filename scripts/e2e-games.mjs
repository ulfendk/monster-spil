// End-to-end check of several games on one server: keys, separation, and the parent's controls.
//   DATA_DIR=/tmp/games-test ADMIN_PASSWORD=adm1n PORT=2598 node server/dist/index.js
//   node scripts/e2e-games.mjs ws://localhost:2598 adm1n
import { Client } from "colyseus.js";

const [url = "ws://localhost:2598", password = "adm1n"] = process.argv.slice(2);
const http = url.replace(/^ws/, "http");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (cond, ms = 2000) => { for (let t = 0; t < ms && !cond(); t += 50) await wait(50); };
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

// Two games, made by the parent.
const made = async (navn, key) => (await (await call("/admin/api/games", { method: "POST", body: { navn, key } })).json()).gameId;
const home = await made("Familien", "Glad-Ræv-123");
const school = await made("Klassen 2.B", "modig-ugle-472");
check("games are created", typeof home === "string" && typeof school === "string" && home !== school);
check("a key already in use is refused", (await call("/admin/api/games", { method: "POST", body: { navn: "X", key: "MODIG-UGLE-472" } })).status === 400);

const lookup = async (key) => fetch(`${http}/game`, { headers: { "x-game-key": key } });
const found = await (await lookup(" glad-ræv-123 ")).json();
check("a key finds its game (ignoring case and spaces)", found.gameId === home && found.navn === "Familien");

const join = async (gameId, key, id, navn = id) => {
  const room = await new Client(url).joinOrCreate("lobby", { gameId, gameKey: key, playerId: id, navn, avatarId: "figur1", farve: "#e46876", areaId: "startskoven", x: 32, y: 24 });
  const got = { players: [], game: null, renamed: null, left: null };
  room.onMessage("players", (p) => (got.players = p));
  room.onMessage("game", (m) => (got.game = m));
  room.onMessage("renamed", (m) => (got.renamed = m));
  for (const t of ["hello", "playerMoved", "food", "raid", "backupAck", "scores"]) room.onMessage(t, () => {});
  room.onLeave((code) => (got.left = code));
  return { room, got };
};
const refused = async (gameId, key) => {
  try {
    const r = await join(gameId, key, "outsider");
    await r.room.leave();
    return false;
  } catch (e) {
    return e.code === 4401;
  }
};

const anna = await join(home, "glad-ræv-123", "anna");
const bo = await join(school, "modig-ugle-472", "bo");
const cy = await join(school, "modig-ugle-472", "cy");
await until(() => cy.got.players.length === 2 && anna.got.players.length === 1);
check("each game has its own players", anna.got.players.map((p) => p.playerId).join() === "anna" && cy.got.players.length === 2);
check("the game's name is sent on join", anna.got.game?.navn === "Familien" && bo.got.game?.gameId === school);
check("another game's key doesn't open a game", await refused(home, "modig-ugle-472"));
check("an unknown game is refused like a wrong key", await refused("findes-ikke", "glad-ræv-123"));

// Scores and backups stay in their game.
bo.room.send("scoreReport", { events: [{ id: "c-bo-1", kind: "catch", at: new Date().toISOString() }] });
bo.room.send("backup", { save: { version: 1, player: { id: "bo", navn: "bo", avatarId: "figur1", farve: "#e46876" }, creatures: [{}] } });
await wait(400);
const homeState = await (await call(`/admin/api/games/${home}/state`)).json();
const schoolState = await (await call(`/admin/api/games/${school}/state`)).json();
check("the scoreboard is per game", homeState.scoreEvents === 0 && schoolState.scoreEvents === 1);
const homeBackups = await (await fetch(`${http}/backups`, { headers: { "x-game-key": "glad-ræv-123" } })).json();
const schoolBackups = await (await fetch(`${http}/backups`, { headers: { "x-game-key": "modig-ugle-472" } })).json();
check("backups are per game", homeBackups.length === 0 && schoolBackups.length === 1 && schoolBackups[0].playerId === "bo");
const list = await (await call("/admin/api/games")).json();
check("the admin list shows keys and who is online", list.games.find((g) => g.id === school)?.online === 2 && list.games.find((g) => g.id === home)?.key === "glad-ræv-123");

// Renaming a player reaches their device at once, and others see it.
await call(`/admin/api/games/${school}/players/bo/rename`, { method: "POST", body: { navn: "Bobo" } });
await until(() => bo.got.renamed && cy.got.players.some((p) => p.navn === "Bobo"));
check("a renamed player's device is told", bo.got.renamed?.navn === "Bobo");
check("other players see the new name", cy.got.players.some((p) => p.playerId === "bo" && p.navn === "Bobo"));
check("a too-long name is refused", (await call(`/admin/api/games/${school}/players/bo/rename`, { method: "POST", body: { navn: "x".repeat(13) } })).status === 400);
// Offline: the new name waits for the next join.
await cy.room.leave();
await call(`/admin/api/games/${school}/players/cy/rename`, { method: "POST", body: { navn: "Cecilie" } });
const cy2 = await join(school, "modig-ugle-472", "cy", "cy");
await until(() => cy2.got.renamed);
check("an offline player gets the new name when they come back", cy2.got.renamed?.navn === "Cecilie" && bo.got.players.some((p) => p.navn === "Cecilie"));
await cy2.room.leave();
const cy3 = await join(school, "modig-ugle-472", "cy", "Cecilie");
await wait(300);
check("once the device uses the new name, it isn't sent again", cy3.got.renamed === null);
await cy3.room.leave();

// Renaming the game.
await call(`/admin/api/games/${school}/rename`, { method: "POST", body: { navn: "Klassen" } });
await until(() => bo.got.game?.navn === "Klassen");
check("a renamed game reaches connected devices", bo.got.game?.navn === "Klassen");

// Changing the key sends everyone away with "wrong key"; the old key stops working.
await call(`/admin/api/games/${school}/key`, { method: "POST", body: { key: "ny-nøgle-99" } });
await until(() => bo.got.left !== null);
check("changing the key sends players away with code 4401", bo.got.left === 4401);
check("the old key no longer works", await refused(school, "modig-ugle-472"));
const bo2 = await join(school, "ny-nøgle-99", "bo", "Bobo");
check("the new key works", Boolean(bo2.room));
check("the other game was not touched", anna.got.left === null);

// Deleting a game.
await call(`/admin/api/games/${school}/delete`, { method: "POST" });
await until(() => bo2.got.left !== null);
check("deleting a game sends its players away", bo2.got.left === 4401);
check("a deleted game can't be joined", await refused(school, "ny-nøgle-99"));
check("its key finds nothing", (await lookup("ny-nøgle-99")).status === 401);
check("it is gone from the admin list", !(await (await call("/admin/api/games")).json()).games.some((g) => g.id === school));

await anna.room.leave();
console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
