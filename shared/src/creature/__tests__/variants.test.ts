import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isVariantId, rollVariant, variantById, variantName, type VariantConfig } from "../variants.js";

const config: VariantConfig = JSON.parse(readFileSync(new URL("../../../content/variants.json", import.meta.url), "utf8"));

function seeded(seed: number): () => number {
  let a = seed;
  return () => ((a = (a * 16807) % 2147483647) / 2147483647);
}

test("variants are rare, and each kind turns up about as often as its weight says", () => {
  const rand = seeded(42);
  const counts: Record<string, number> = {};
  let none = 0;
  const n = 200000;
  for (let i = 0; i < n; i++) {
    const v = rollVariant(config, rand);
    if (v) counts[v] = (counts[v] ?? 0) + 1;
    else none++;
  }
  assert.ok(Math.abs(1 - none / n - config.chance) < 0.004, "about `chance` of them are variants");
  const total = config.variants.reduce((s, v) => s + v.weight, 0);
  const variants = n - none;
  for (const v of config.variants) assert.ok(Math.abs((counts[v.id] ?? 0) / variants - v.weight / total) < 0.02, v.id);
});

test("the variants file makes sense", () => {
  assert.ok(config.chance > 0 && config.chance < 0.2, "rare, but not impossible");
  const ids = new Set<string>();
  for (const v of config.variants) {
    assert.ok(isVariantId(v.id), `ASCII slug: ${v.id}`);
    assert.ok(!ids.has(v.id), `unique: ${v.id}`);
    ids.add(v.id);
    assert.ok(v.weight > 0 && v.navn.length > 0);
    if (v.look.size !== undefined) assert.ok(v.look.size >= 0.5 && v.look.size <= 1.6, `${v.id}: a size the screens have room for`);
  }
});

test("names and lookups", () => {
  assert.equal(variantName(config, "Mosmus", "gylden"), "Gylden Mosmus");
  assert.equal(variantName(config, "Mosmus", undefined), "Mosmus");
  assert.equal(variantName(config, "Mosmus", "findes-ikke"), "Mosmus");
  assert.equal(variantById(config, "mini")?.look.size, 0.7);
  assert.ok(!isVariantId("Gylden!") && !isVariantId(3) && !isVariantId(""));
});
