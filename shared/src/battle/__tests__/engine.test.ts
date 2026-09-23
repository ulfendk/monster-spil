import { test } from "node:test";
import assert from "node:assert/strict";
import { createBattle, resolveTurn } from "../engine.js";
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
