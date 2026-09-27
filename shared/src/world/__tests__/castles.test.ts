import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import type { AreaMeta } from "../../types/area.js";
import { hasKey, questSpots, questState, type CastleConfig } from "../castles.js";

const content = new URL("../../../content/", import.meta.url);
const config: CastleConfig = JSON.parse(readFileSync(new URL("castles.json", content), "utf8"));
const open = Array.from({ length: 2000 }, (_, i) => ({ x: i % 50, y: Math.floor(i / 50) }));

test("a castle's quest things lie spread out, always in the same places; all found = the key", () => {
  const castle = config.castles[0]!;
  const spots = questSpots(castle, open);
  assert.deepEqual(questSpots(castle, open), spots, "the same places every time");
  assert.equal(spots.length, castle.quest.reduce((n, q) => n + q.count, 0));
  for (const a of spots) for (const b of spots) if (a !== b) assert.ok(Math.abs(a.x - b.x) + Math.abs(a.y - b.y) >= 6, "spread out");
  assert.ok(!hasKey(castle, spots, []));
  const most = spots.slice(0, -1).map((s) => s.key);
  assert.ok(!hasKey(castle, spots, most), "one still missing");
  assert.deepEqual(questState(castle, spots, most).map((q) => q.found).reduce((a, b) => a + b, 0), spots.length - 1);
  assert.ok(hasKey(castle, spots, spots.map((s) => s.key)));
});

test("every world has a castle in its sidecar, with known monsters and items", () => {
  const areas = new URL("areas/", content);
  const metas: AreaMeta[] = readdirSync(areas).filter((f) => f.endsWith(".meta.json")).map((f) => JSON.parse(readFileSync(new URL(f, areas), "utf8")));
  const items = JSON.parse(readFileSync(new URL("items.json", content), "utf8")) as { items: Array<{ id: string }> };
  for (const castle of config.castles) {
    const meta = metas.find((m) => m.id === castle.worldId);
    assert.ok(meta?.castle, `${castle.worldId} has a castle spot`);
    assert.equal(castle.guardians.length, 3);
    for (const g of castle.guardians) assert.ok(existsSync(new URL(`creatures/${g.speciesId}.json`, content)), g.speciesId);
    for (const id of Object.keys(castle.rewards.items)) assert.ok(items.items.some((i) => i.id === id), id);
  }
});
