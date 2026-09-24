import { test } from "node:test";
import assert from "node:assert/strict";
import { createBattle, resolveTurn, outcomeFor } from "../engine.js";
import { createRng } from "../rng.js";
import type { Rng } from "../rng.js";
import { makeSpecies, makeMove, makeParticipant } from "./fixtures.js";

function fixedRng(value: number): Rng {
  return { next: () => value };
}

test("faster participant attacks first and can knock out the slower one before it acts", () => {
  const fast = makeSpecies({ id: "fast", baseStats: { hp: 40, angreb: 10, forsvar: 10, fart: 20 } });
  const slow = makeSpecies({ id: "slow", baseStats: { hp: 40, angreb: 10, forsvar: 10, fart: 5 } });
  const bigMove = makeMove({ power: 300, accuracy: 1 });

  const player = makeParticipant("player", fast, [bigMove]);
  const opponent = makeParticipant("wild", slow, [bigMove]);
  const state = createBattle(1, player, opponent);

  const result = resolveTurn(
    state,
    [
      { playerId: "player", action: { kind: "move", moveId: bigMove.id } },
      { playerId: "wild", action: { kind: "move", moveId: bigMove.id } },
    ],
    createRng(1)
  );

  assert.equal(result.participants[0].active.currentHp, fast.baseStats.hp);
  assert.equal(result.participants[1].active.currentHp, 0);
  assert.equal(result.outcome, "won");
  assert.ok(result.log.some((e) => e.kind === "faint"));
});

test("a 0-accuracy move always misses and deals no damage", () => {
  const species = makeSpecies();
  const move = makeMove({ accuracy: 0 });
  const player = makeParticipant("player", species, [move]);
  const opponent = makeParticipant("wild", species, [move]);
  const state = createBattle(1, player, opponent);

  const result = resolveTurn(
    state,
    [{ playerId: "player", action: { kind: "move", moveId: move.id } }],
    createRng(1)
  );

  assert.equal(result.participants[1].active.currentHp, species.baseStats.hp);
  assert.ok(result.log.some((e) => e.kind === "miss"));
});

test("fleeing ends the battle immediately with outcome 'fled'", () => {
  const species = makeSpecies();
  const move = makeMove();
  const player = makeParticipant("player", species, [move]);
  const opponent = makeParticipant("wild", species, [move]);
  const state = createBattle(1, player, opponent);

  const result = resolveTurn(state, [{ playerId: "player", action: { kind: "flee" } }], createRng(1));

  assert.equal(result.outcome, "fled");
});

test("a catch action with a low rng roll succeeds and ends the battle as 'caught'", () => {
  const species = makeSpecies({ catchRate: 0.9 });
  const move = makeMove();
  const player = makeParticipant("player", species, [move]);
  const opponent = makeParticipant("wild", species, [move], 5);
  const state = createBattle(1, player, opponent);

  const result = resolveTurn(state, [{ playerId: "player", action: { kind: "catch" } }], fixedRng(0.01));

  assert.equal(result.outcome, "caught");
});

test("a catch action with a high rng roll fails and the battle stays ongoing", () => {
  const species = makeSpecies({ catchRate: 0.3 });
  const move = makeMove();
  const player = makeParticipant("player", species, [move]);
  const opponent = makeParticipant("wild", species, [move]);
  const state = createBattle(1, player, opponent);

  const result = resolveTurn(state, [{ playerId: "player", action: { kind: "catch" } }], fixedRng(0.99));

  assert.equal(result.outcome, "ongoing");
});

test("resolveTurn is a no-op once the battle has already ended", () => {
  const species = makeSpecies();
  const move = makeMove();
  const player = makeParticipant("player", species, [move]);
  const opponent = makeParticipant("wild", species, [move]);
  const finished = { ...createBattle(1, player, opponent), outcome: "won" as const };

  const result = resolveTurn(finished, [], createRng(1));

  assert.equal(result, finished);
});

test("a type advantage deals more damage than a neutral matchup, all else equal", () => {
  const attacker = makeSpecies({ id: "atk", type: "ild", baseStats: { hp: 100, angreb: 10, forsvar: 10, fart: 10 } });
  const weakTarget = makeSpecies({
    id: "weak",
    type: "graes",
    baseStats: { hp: 100, angreb: 10, forsvar: 10, fart: 1 },
  });
  const neutralTarget = makeSpecies({
    id: "neutral",
    type: "lyn",
    baseStats: { hp: 100, angreb: 10, forsvar: 10, fart: 1 },
  });
  const move = makeMove({ type: "ild", power: 50, accuracy: 1 });

  const runBattle = (defender: ReturnType<typeof makeSpecies>) => {
    const player = makeParticipant("player", attacker, [move]);
    const opponent = makeParticipant("wild", defender, [move]);
    const state = createBattle(1, player, opponent);
    return resolveTurn(
      state,
      [{ playerId: "player", action: { kind: "move", moveId: move.id } }],
      createRng(1)
    );
  };

  const vsWeak = runBattle(weakTarget);
  const vsNeutral = runBattle(neutralTarget);

  const damageToWeak = weakTarget.baseStats.hp - vsWeak.participants[1].active.currentHp;
  const damageToNeutral = neutralTarget.baseStats.hp - vsNeutral.participants[1].active.currentHp;

  assert.ok(damageToWeak > damageToNeutral, "type-advantaged hit should deal more damage");
});

test("a slower creature never acts after being knocked out, so a double KO cannot happen", () => {
  const fast = makeSpecies({ id: "fast", baseStats: { hp: 10, angreb: 10, forsvar: 10, fart: 20 } });
  const slow = makeSpecies({ id: "slow", baseStats: { hp: 10, angreb: 10, forsvar: 10, fart: 5 } });
  const bigMove = makeMove({ power: 300, accuracy: 1 });
  const state = createBattle(1, makeParticipant("a", fast, [bigMove]), makeParticipant("b", slow, [bigMove]));

  const result = resolveTurn(
    state,
    [
      { playerId: "a", action: { kind: "move", moveId: bigMove.id } },
      { playerId: "b", action: { kind: "move", moveId: bigMove.id } },
    ],
    createRng(1)
  );

  assert.equal(result.participants[0].active.currentHp, 10);
  assert.equal(result.participants[1].active.currentHp, 0);
  assert.equal(result.log.filter((e) => e.kind === "faint").length, 1);
});

test("when both sides flee in the same turn, participants[0] is the one that runs", () => {
  const species = makeSpecies();
  const move = makeMove();
  const state = createBattle(1, makeParticipant("a", species, [move]), makeParticipant("b", species, [move]));

  const result = resolveTurn(
    state,
    [
      { playerId: "b", action: { kind: "flee" } },
      { playerId: "a", action: { kind: "flee" } },
    ],
    createRng(1)
  );

  assert.equal(result.outcome, "fled");
  assert.equal(result.log.filter((e) => e.kind === "flee").length, 1);
  assert.equal(result.log.find((e) => e.kind === "flee")?.targetPlayerId, "a");
});

test("a turn with no actions, unknown players or unknown moves changes nothing but the turn counter", () => {
  const species = makeSpecies();
  const move = makeMove();
  const state = createBattle(1, makeParticipant("a", species, [move]), makeParticipant("b", species, [move]));

  const result = resolveTurn(
    state,
    [
      { playerId: "stranger", action: { kind: "move", moveId: move.id } },
      { playerId: "a", action: { kind: "move", moveId: "no-such-move" } },
    ],
    createRng(1)
  );

  assert.equal(result.turn, 1);
  assert.equal(result.outcome, "ongoing");
  assert.equal(result.participants[0].active.currentHp, species.baseStats.hp);
  assert.equal(result.participants[1].active.currentHp, species.baseStats.hp);
  assert.equal(result.log.length, 0);
});

function duel() {
  const species = makeSpecies();
  const move = makeMove({ power: 300, accuracy: 1 });
  return { move, state: createBattle(1, makeParticipant("a", species, [move]), makeParticipant("b", species, [move]), "pvp") };
}

test("pvp: fleeing is a forfeit and the other player wins, from either seat", () => {
  const { state } = duel();
  const aFlees = resolveTurn(state, [{ playerId: "a", action: { kind: "flee" } }], createRng(1));
  assert.equal(aFlees.winnerId, "b");
  assert.equal(outcomeFor(aFlees, "a"), "lost");
  assert.equal(outcomeFor(aFlees, "b"), "won");

  const bFlees = resolveTurn(state, [{ playerId: "b", action: { kind: "flee" } }], createRng(1));
  assert.equal(bFlees.winnerId, "a");
  assert.equal(outcomeFor(bFlees, "a"), "won");
  assert.equal(outcomeFor(bFlees, "b"), "lost");
});

test("pvp: catch is ignored, so you can't take another player's creature", () => {
  const { state } = duel();
  const result = resolveTurn(state, [{ playerId: "a", action: { kind: "catch" } }], { next: () => 0 });
  assert.equal(result.outcome, "ongoing");
  assert.equal(result.winnerId, undefined);
  assert.ok(!result.log.some((e) => e.kind === "catch-success"));
});

test("pvp: the winner is reported correctly for both players when slot 1 wins", () => {
  const fast = makeSpecies({ id: "fast", baseStats: { hp: 10, angreb: 10, forsvar: 10, fart: 20 } });
  const slow = makeSpecies({ id: "slow", baseStats: { hp: 10, angreb: 10, forsvar: 10, fart: 5 } });
  const move = makeMove({ power: 300, accuracy: 1 });
  const state = createBattle(1, makeParticipant("a", slow, [move]), makeParticipant("b", fast, [move]), "pvp");

  const result = resolveTurn(
    state,
    [
      { playerId: "a", action: { kind: "move", moveId: move.id } },
      { playerId: "b", action: { kind: "move", moveId: move.id } },
    ],
    createRng(1)
  );

  assert.equal(result.winnerId, "b");
  assert.equal(outcomeFor(result, "a"), "lost");
  assert.equal(outcomeFor(result, "b"), "won");
});

test("wild: a win or loss also records winnerId, while fled and caught do not", () => {
  const fast = makeSpecies({ id: "fast", baseStats: { hp: 10, angreb: 10, forsvar: 10, fart: 20 } });
  const slow = makeSpecies({ id: "slow", baseStats: { hp: 10, angreb: 10, forsvar: 10, fart: 5 } });
  const move = makeMove({ power: 300, accuracy: 1 });
  const won = resolveTurn(
    createBattle(1, makeParticipant("player", fast, [move]), makeParticipant("wild", slow, [move])),
    [{ playerId: "player", action: { kind: "move", moveId: move.id } }],
    createRng(1)
  );
  assert.equal(won.winnerId, "player");
  assert.equal(won.mode, "wild");

  const species = makeSpecies();
  const fled = resolveTurn(
    createBattle(1, makeParticipant("player", species, [move]), makeParticipant("wild", species, [move])),
    [{ playerId: "player", action: { kind: "flee" } }],
    createRng(1)
  );
  assert.equal(fled.winnerId, undefined);
  assert.equal(outcomeFor(fled, "player"), "fled");
});

test("battle texts use the Danish possessive: an extra s, or an apostrophe after s/x/z", async () => {
  const { genitive } = await import("../engine.js");
  assert.equal(genitive("Dryppel"), "Dryppels");
  assert.equal(genitive("Flammepels"), "Flammepels'");
  assert.equal(genitive("Max"), "Max'");
});
