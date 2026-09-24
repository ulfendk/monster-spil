// End-to-end check of the lobby server with scripted players (no browser needed).
//   FAMILY_CODE=test123 PORT=2599 node server/dist/index.js     # in one terminal
//   node scripts/e2e-lobby.mjs ws://localhost:2599 test123      # in another
// Covers: hello/version, positions, movement broadcast, adjacency rule for trades
// and duels, away status, and disappearing on disconnect.
import { Client } from "colyseus.js";

const [url = "ws://localhost:2599", code = "test123"] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok) => { console.log(ok ? "PASS" : "FAIL", name); if (!ok) failed++; };

const seat = (id) => ({
  active: { instanceId: id + "-i", speciesId: "s", ownerId: id, niveau: 1, currentHp: 10, caughtAt: "2026-01-01" },
  species: { id: "s", navn: "Test", type: "ild", baseStats: { hp: 10, angreb: 10, forsvar: 10, fart: 10 }, spriteFront: "a.png", spriteBack: "b.png", catchRate: 0 },
  moves: [{ id: "hit", navn: "Hit", type: "vand", power: 20, accuracy: 1 }],
});

async function join(id, pos) {
  const room = await new Client(url).joinOrCreate("lobby", { playerId: id, navn: id, avatarId: "a", farve: "#ff0000", familyCode: code, ...pos });
  const got = { hello: null, players: [], moved: [], problems: [], trades: [], duels: [] };
  room.onMessage("hello", (m) => (got.hello = m));
  room.onMessage("players", (m) => (got.players = m));
  room.onMessage("playerMoved", (m) => got.moved.push(m));
  room.onMessage("problem", (m) => got.problems.push(m.reason));
  room.onMessage("trade", (m) => got.trades.push(m));
  room.onMessage("duel", (m) => got.duels.push(m));
  return { room, got };
}
const at = (x, y) => ({ areaId: "skov", x, y });

const a = await join("alice", at(10, 10));
const b = await join("bob", at(30, 30));
const c = await join("carol"); // an old-style client: no position
await wait(400);

check("hello carries protocol version 3 or newer", a.got.hello?.protocolVersion >= 3);
const bobInList = a.got.players.find((p) => p.playerId === "bob");
check("players carry their join position", bobInList?.x === 30 && bobInList?.y === 30 && bobInList?.areaId === "skov");
check("a client without a position is listed but nowhere", a.got.players.find((p) => p.playerId === "carol")?.areaId === "");

// movement
b.room.send("move", at(11, 11));
await wait(200);
check("others see a move", a.got.moved.at(-1)?.playerId === "bob" && a.got.moved.at(-1)?.x === 11);
check("the mover is not sent their own move", b.got.moved.length === 0);
b.room.send("move", { areaId: "skov", x: -5, y: 1.5 });
b.room.send("move", "junk");
await wait(200);
check("invalid positions are ignored", a.got.moved.length === 1);

// far apart -> refused (move bob far again)
b.room.send("move", at(30, 30)); await wait(150);
a.room.send("invite", { toPlayerId: "bob" }); await wait(200);
check("trade invite refused when far apart", a.got.problems.includes("too far away") && a.got.trades.length === 0);
a.room.send("duelInvite", { toPlayerId: "bob", seat: seat("alice") }); await wait(200);
check("duel invite refused when far apart", a.got.duels.length === 0);
a.room.send("invite", { toPlayerId: "carol" }); await wait(200);
check("invite refused for a player with no position", a.got.trades.length === 0);

// diagonal neighbour -> accepted
b.room.send("move", at(11, 11)); await wait(150);
a.room.send("invite", { toPlayerId: "bob" }); await wait(250);
check("trade invite accepted when touching diagonally", a.got.trades.at(-1)?.phase === "invited");
a.room.send("cancel", { tradeId: a.got.trades.at(-1).id }); await wait(200);

// away
b.room.send("away", { away: true }); await wait(200);
check("away is broadcast", a.got.players.find((p) => p.playerId === "bob")?.away === true);
a.room.send("duelInvite", { toPlayerId: "bob", seat: seat("alice") }); await wait(200);
check("invite refused while the other is away", a.got.problems.filter((p) => p === "player is busy").length >= 1 && a.got.duels.length === 0);
b.room.send("away", { away: false }); await wait(200);
a.room.send("duelInvite", { toPlayerId: "bob", seat: seat("alice") }); await wait(250);
check("duel invite accepted once back and adjacent", a.got.duels.at(-1)?.phase === "invited");
a.room.send("duelCancel", { duelId: a.got.duels.at(-1).id }); await wait(200);

// leaving
await c.room.leave(); await wait(300);
check("a player who leaves disappears from the list", !a.got.players.some((p) => p.playerId === "carol"));

await a.room.leave(); await b.room.leave();
console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
