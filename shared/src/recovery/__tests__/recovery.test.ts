import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BAG_MAX,
  FOOD_KINDS,
  FOOD_SECONDS,
  closenessFromDamage,
  closenessFromFoe,
  eatFood,
  passOutSeconds,
  passOutUntil,
  pickFoodKind,
  pickFoodSpot,
  secondsLeft,
} from "../recovery.js";

test("a quick knock-out means 60 s, nearly winning 30 s, in between in between", () => {
  assert.equal(passOutSeconds(0), 60);
  assert.equal(passOutSeconds(1), 30);
  assert.equal(passOutSeconds(0.5), 45);
  assert.equal(passOutSeconds(-3), 60);
  assert.equal(passOutSeconds(7), 30);
  assert.equal(passOutSeconds(Number.NaN), 60);
});

test("closeness in a wild battle or duel is how much of the opponent's HP you took", () => {
  assert.equal(closenessFromFoe(40, 40), 0);
  assert.equal(closenessFromFoe(10, 40), 0.75);
  assert.equal(closenessFromFoe(0, 40), 1);
  assert.equal(closenessFromFoe(5, 0), 0);
});

test("against the dragon it is damage dealt compared with your own HP", () => {
  assert.equal(closenessFromDamage(0, 40), 0);
  assert.equal(closenessFromDamage(20, 40), 0.5);
  assert.equal(passOutSeconds(closenessFromDamage(80, 40)), 30);
});

test("the wait counts down, and each piece of food takes 15 s off", () => {
  const now = new Date("2026-09-25T10:00:00Z");
  const until = passOutUntil(now, 0); // 60 s
  assert.equal(secondsLeft(until, now), 60);
  const after1 = eatFood(until, now)!;
  assert.equal(secondsLeft(after1, now), 60 - FOOD_SECONDS);
  assert.equal(secondsLeft(until, new Date(now.getTime() + 59_500)), 1);
  assert.equal(secondsLeft(until, new Date(now.getTime() + 61_000)), 0);
  assert.equal(secondsLeft(undefined, now), 0);
});

test("food can end the wait, but never makes it negative", () => {
  const now = new Date("2026-09-25T10:00:00Z");
  const soon = new Date(now.getTime() + 10_000).toISOString();
  assert.equal(eatFood(soon, now), undefined);
});

test("new food grows on a free spot, never on one that already has food", () => {
  const spots = [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }];
  assert.deepEqual(pickFoodSpot(spots, [{ x: 1, y: 1 }, { x: 3, y: 3 }], () => 0.99), { x: 2, y: 2 });
  assert.equal(pickFoodSpot(spots, spots, () => 0), undefined);
  assert.ok(FOOD_KINDS.includes(pickFoodKind(() => 0.5)));
  assert.equal(BAG_MAX, 5);
});
