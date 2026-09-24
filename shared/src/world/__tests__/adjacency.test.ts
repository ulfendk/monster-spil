import { test } from "node:test";
import assert from "node:assert/strict";
import { isAdjacent } from "../adjacency.js";

const at = (x: number, y: number, areaId = "skov") => ({ areaId, x, y });

test("touching tiles are adjacent, including diagonals and the same tile", () => {
  assert.equal(isAdjacent(at(5, 5), at(6, 5)), true);
  assert.equal(isAdjacent(at(5, 5), at(4, 4)), true);
  assert.equal(isAdjacent(at(5, 5), at(5, 5)), true);
});

test("two tiles apart is not adjacent", () => {
  assert.equal(isAdjacent(at(5, 5), at(7, 5)), false);
  assert.equal(isAdjacent(at(5, 5), at(5, 3)), false);
  assert.equal(isAdjacent(at(5, 5), at(7, 7)), false);
});

test("different areas are never adjacent, and neither is an unknown position", () => {
  assert.equal(isAdjacent(at(5, 5, "skov"), at(5, 5, "hule")), false);
  assert.equal(isAdjacent(at(0, 0, ""), at(0, 0, "")), false);
  assert.equal(isAdjacent(at(0, 0, ""), at(0, 0, "skov")), false);
});
