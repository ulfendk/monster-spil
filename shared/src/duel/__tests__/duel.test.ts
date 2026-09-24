import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createDuel,
  acceptDuel,
  submitAction,
  timeoutTurn,
  forfeitDuel,
  cancelDuel,
  duelView,
  MAX_MISSED_TURNS,
  type DuelSession,
} from "../duel-session.js";
import { sanitizeSeat } from "../sanitize.js";
import { outcomeFor } from "../../battle/engine.js";
import { makeSpecies, makeMove, makeParticipant } from "../../battle/__tests__/fixtures.js";

const move = makeMove({ power: 300, accuracy: 1 });
const fast = makeSpecies({ id: "fast", baseStats: { hp: 10, angreb: 10, forsvar: 10, fart: 20 } });
const slow = makeSpecies({ id: "slow", baseStats: { hp: 10, angreb: 10, forsvar: 10, fart: 5 } });
const sturdy = makeSpecies({ id: "sturdy", baseStats: { hp: 500, angreb: 1, forsvar: 50, fart: 5 } });

function unwrap(r: { ok: boolean } & Record<string, unknown>): DuelSession {
  assert.ok(r.ok, JSON.stringify(r));
  return r.session as DuelSession;
}

function active(a = fast, b = slow): DuelSession {
  const invited = unwrap(createDuel("d1", "a", "b", makeParticipant("a", a, [move])));
  return unwrap(acceptDuel(invited, "b", makeParticipant("b", b, [move]), 42));
}

const atk = { kind: "move" as const, moveId: move.id };

test("cannot duel yourself, and the seat must be your own", () => {
  assert.equal(createDuel("d", "a", "a", makeParticipant("a", fast, [move])).ok, false);
  assert.equal(createDuel("d", "a", "b", makeParticipant("b", fast, [move])).ok, false);
});

test("only the invitee can accept, once, with their own seat", () => {
  const invited = unwrap(createDuel("d", "a", "b", makeParticipant("a", fast, [move])));
  assert.equal(acceptDuel(invited, "a", makeParticipant("a", slow, [move]), 1).ok, false);
  assert.equal(acceptDuel(invited, "b", makeParticipant("a", slow, [move]), 1).ok, false);
  const started = unwrap(acceptDuel(invited, "b", makeParticipant("b", slow, [move]), 1));
  assert.equal(started.phase, "active");
  assert.equal(started.battle?.mode, "pvp");
  assert.equal(acceptDuel(started, "b", makeParticipant("b", slow, [move]), 1).ok, false);
});

test("a turn only resolves once both players have answered, and answers can't be changed", () => {
  const s = unwrap(submitAction(active(sturdy, sturdy), "a", atk));
  assert.equal(s.battle?.turn, 0);
  assert.deepEqual(duelView(s).answered, ["a"]);
  assert.equal(submitAction(s, "a", atk).ok, false);
  const done = unwrap(submitAction(s, "b", atk));
  assert.equal(done.battle?.turn, 1);
  assert.deepEqual(done.pending, {});
});

test("the view never leaks what the other player chose", () => {
  const s = unwrap(submitAction(active(), "a", atk));
  const json = JSON.stringify(duelView(s));
  assert.ok(!json.includes("pending"));
  assert.ok(!json.includes(move.id + '"}'), "chosen move id must not be in the view's answered list");
  assert.deepEqual(duelView(s).answered, ["a"]);
});

test("rejects unknown moves, strangers and inactive duels", () => {
  const s = active();
  assert.equal(submitAction(s, "a", { kind: "move", moveId: "nope" }).ok, false);
  assert.equal(submitAction(s, "x", atk).ok, false);
  const invited = unwrap(createDuel("d", "a", "b", makeParticipant("a", fast, [move])));
  assert.equal(submitAction(invited, "a", atk).ok, false);
  assert.equal(submitAction(s, "a", { kind: "catch" } as never).ok, false);
});

test("a knockout ends the duel with the right winner for both seats", () => {
  let s = unwrap(submitAction(active(), "a", atk));
  s = unwrap(submitAction(s, "b", atk));
  assert.equal(s.phase, "done");
  assert.equal(s.battle?.winnerId, "a");
  assert.equal(outcomeFor(s.battle!, "a"), "won");
  assert.equal(outcomeFor(s.battle!, "b"), "lost");
});

test("the same seed and choices always give the same result", () => {
  const run = () => {
    let s = active(sturdy, sturdy);
    s = unwrap(submitAction(s, "a", atk));
    s = unwrap(submitAction(s, "b", atk));
    return JSON.stringify(s.battle);
  };
  assert.equal(run(), run());
});

test("forfeit gives the win to the opponent; forfeiting an unanswered invite just cancels it", () => {
  const f = forfeitDuel(active(sturdy, sturdy), "b");
  assert.equal(f.phase, "done");
  assert.equal(f.battle?.winnerId, "a");
  const invited = unwrap(createDuel("d", "a", "b", makeParticipant("a", fast, [move])));
  assert.equal(forfeitDuel(invited, "a").phase, "cancelled");
});

test("a silent player is skipped on timeout and forfeits after MAX_MISSED_TURNS", () => {
  let s = unwrap(submitAction(active(sturdy, sturdy), "a", atk));
  s = unwrap(timeoutTurn(s));
  assert.equal(s.phase, "active");
  assert.equal(s.missed["b"], 1);
  assert.equal(s.missed["a"], 0);
  for (let i = 1; i < MAX_MISSED_TURNS; i++) {
    s = unwrap(submitAction(s, "a", atk));
    s = unwrap(timeoutTurn(s));
  }
  assert.equal(s.phase, "done");
  assert.equal(s.battle?.winnerId, "a");
});

test("if both players go silent the duel is cancelled without a winner", () => {
  let s = active(sturdy, sturdy);
  for (let i = 0; i < MAX_MISSED_TURNS; i++) s = unwrap(timeoutTurn(s));
  assert.equal(s.phase, "cancelled");
  assert.equal(s.battle?.winnerId, undefined);
});

test("cancel works until the duel is done", () => {
  assert.equal(cancelDuel(active()).phase, "cancelled");
  let s = unwrap(submitAction(active(), "a", atk));
  s = unwrap(submitAction(s, "b", atk));
  assert.equal(cancelDuel(s).phase, "done");
});

const seatInput = () => ({
  active: { instanceId: "i1", speciesId: "x", ownerId: "someone-else", niveau: 99, currentHp: 1, caughtAt: "2026-01-01" },
  species: {
    id: "x",
    navn: "Xy",
    type: "ild",
    baseStats: { hp: 9999, angreb: -5, forsvar: 10, fart: 10 },
    spriteFront: "a.png",
    spriteBack: "b.png",
    catchRate: 1,
  },
  moves: [
    { id: "m1", navn: "M1", type: "vand", power: 9999, accuracy: 5 },
    { id: "bad", navn: "Bad", type: "ukendt", power: 1, accuracy: 1 },
    { id: "m2", navn: "M2", type: "lyn", power: 30, accuracy: 0.9 },
  ],
});

test("sanitizeSeat clamps stats, forces ownership and full HP, and drops invalid moves", () => {
  const seat = sanitizeSeat(seatInput(), "me")!;
  assert.equal(seat.playerId, "me");
  assert.equal(seat.active.ownerId, "me");
  assert.equal(seat.species.baseStats.hp, 150);
  assert.equal(seat.species.baseStats.angreb, 1);
  assert.equal(seat.active.currentHp, 150);
  assert.equal(seat.active.niveau, 1);
  assert.deepEqual(Object.keys(seat.moves), ["m1", "m2"]);
  assert.equal(seat.moves["m1"]!.power, 150);
  assert.equal(seat.moves["m1"]!.accuracy, 1);
});

test("sanitizeSeat rejects junk", () => {
  assert.equal(sanitizeSeat(null, "me"), undefined);
  assert.equal(sanitizeSeat({}, "me"), undefined);
  assert.equal(sanitizeSeat({ ...seatInput(), moves: [] }, "me"), undefined);
  const badType = seatInput();
  badType.species.type = "flyver";
  assert.equal(sanitizeSeat(badType, "me"), undefined);
  const noStats = seatInput() as { species: { baseStats?: unknown } };
  delete noStats.species.baseStats;
  assert.equal(sanitizeSeat(noStats, "me"), undefined);
});
