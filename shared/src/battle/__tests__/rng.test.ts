import { test } from "node:test";
import assert from "node:assert/strict";
import { createRng } from "../rng.js";

test("the same seed always produces the same sequence", () => {
  const a = createRng(42);
  const b = createRng(42);
  assert.deepEqual([a.next(), a.next(), a.next()], [b.next(), b.next(), b.next()]);
});

test("different seeds produce different first values", () => {
  assert.notEqual(createRng(1).next(), createRng(2).next());
});

test("values stay within [0, 1)", () => {
  const rng = createRng(7);
  for (let i = 0; i < 1000; i++) {
    const v = rng.next();
    assert.ok(v >= 0 && v < 1, `value ${v} out of range`);
  }
});
