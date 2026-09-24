import { test } from "node:test";
import assert from "node:assert/strict";
import { arrowFor, nearestSpot, paintedTiles } from "../hint.js";

test("arrows point the right way on a map where y grows downwards", () => {
  assert.equal(arrowFor(5, 0), "➡️");
  assert.equal(arrowFor(-5, 0), "⬅️");
  assert.equal(arrowFor(0, 5), "⬇️");
  assert.equal(arrowFor(0, -5), "⬆️");
  assert.equal(arrowFor(3, 3), "↘️");
  assert.equal(arrowFor(-3, 3), "↙️");
  assert.equal(arrowFor(-3, -3), "↖️");
  assert.equal(arrowFor(3, -3), "↗️");
  assert.equal(arrowFor(0, 0), "📍");
});

test("nearestSpot picks the closest tile by steps and reports the direction", () => {
  const hint = nearestSpot({ x: 10, y: 10 }, [{ x: 20, y: 10 }, { x: 10, y: 13 }, { x: 0, y: 0 }]);
  assert.deepEqual(hint, { distance: 3, dx: 0, dy: 3, arrow: "⬇️" });
});

test("standing on a spot is distance 0, and no spots means no hint", () => {
  assert.equal(nearestSpot({ x: 4, y: 4 }, [{ x: 4, y: 4 }])?.distance, 0);
  assert.equal(nearestSpot({ x: 4, y: 4 }, []), undefined);
});

test("paintedTiles lists the non-zero cells of a flat layer", () => {
  // 3 wide: row 0 = [0,3,0], row 1 = [3,3,0]
  assert.deepEqual(paintedTiles([0, 3, 0, 3, 3, 0], 3), [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }]);
});
