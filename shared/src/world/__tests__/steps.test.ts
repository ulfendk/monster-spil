import { test } from "node:test";
import assert from "node:assert/strict";
import { DIAGONAL_TIME_FACTOR, chooseStep, dragDirection } from "../steps.js";

test("a short drag inside the dead zone is not a direction", () => {
  assert.equal(dragDirection(5, 5, 20), undefined);
});

test("drags map to 8 directions, with y growing downwards", () => {
  assert.deepEqual(dragDirection(100, 0, 20), { dx: 1, dy: 0 });
  assert.deepEqual(dragDirection(0, 100, 20), { dx: 0, dy: 1 });
  assert.deepEqual(dragDirection(-100, 0, 20), { dx: -1, dy: 0 });
  assert.deepEqual(dragDirection(0, -100, 20), { dx: 0, dy: -1 });
  assert.deepEqual(dragDirection(70, 70, 20), { dx: 1, dy: 1 });
  assert.deepEqual(dragDirection(-70, -70, 20), { dx: -1, dy: -1 });
  // 20° off straight right is still right; 30° is diagonal.
  assert.deepEqual(dragDirection(100, 36, 20), { dx: 1, dy: 0 });
  assert.deepEqual(dragDirection(100, 58, 20), { dx: 1, dy: 1 });
});

test("a diagonal step takes √2 times as long as a straight one", () => {
  assert.ok(Math.abs(DIAGONAL_TIME_FACTOR - 1.41421356) < 1e-6);
});

// Walls marked as "x,y" strings.
const world = (...walls: string[]) => (x: number, y: number) => !walls.includes(`${x},${y}`);
const from = { x: 5, y: 5 };

test("straight steps go ahead only if the tile is free", () => {
  assert.deepEqual(chooseStep(from, { dx: 1, dy: 0 }, 100, 0, world()), { dx: 1, dy: 0 });
  assert.equal(chooseStep(from, { dx: 1, dy: 0 }, 100, 0, world("6,5")), undefined);
});

test("a free diagonal is taken", () => {
  assert.deepEqual(chooseStep(from, { dx: 1, dy: 1 }, 70, 70, world()), { dx: 1, dy: 1 });
});

test("no squeezing past a corner: slide along the free side instead", () => {
  // A tree right of me blocks the corner: go down.
  assert.deepEqual(chooseStep(from, { dx: 1, dy: 1 }, 80, 60, world("6,5")), { dx: 0, dy: 1 });
  // A tree below me: go right.
  assert.deepEqual(chooseStep(from, { dx: 1, dy: 1 }, 60, 80, world("5,6")), { dx: 1, dy: 0 });
});

test("a blocked diagonal target slides along the axis the finger leans towards", () => {
  assert.deepEqual(chooseStep(from, { dx: 1, dy: 1 }, 80, 60, world("6,6")), { dx: 1, dy: 0 });
  assert.deepEqual(chooseStep(from, { dx: 1, dy: 1 }, 60, 80, world("6,6")), { dx: 0, dy: 1 });
});

test("boxed in: no step", () => {
  assert.equal(chooseStep(from, { dx: 1, dy: 1 }, 70, 70, world("6,5", "5,6", "6,6")), undefined);
});
