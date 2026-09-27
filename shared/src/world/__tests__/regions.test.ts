import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import type { AreaMeta } from "../../types/area.js";
import { encounterTableAt, livesAt, livesInArea, regionAt } from "../regions.js";
import { SCENE_DECOR, SCENE_PARTICLES, sceneAt, type SceneConfig } from "../scenes.js";

const content = new URL("../../../content/", import.meta.url);
const meta: AreaMeta = JSON.parse(readFileSync(new URL("areas/startskoven.meta.json", content), "utf8"));
const map = JSON.parse(readFileSync(new URL("areas/startskoven.json", content), "utf8")) as { width: number; height: number; layers: Array<{ name: string; data: number[] }> };
const speciesIds = new Set(readdirSync(new URL("creatures/", content)).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")));

const small: Pick<AreaMeta, "regions" | "encounterTable"> = {
  encounterTable: [{ speciesId: "a", weight: 1 }],
  regions: [
    { id: "one", navn: "Et", rects: [{ x: 0, y: 0, w: 10, h: 10 }], encounterTable: [{ speciesId: "b", weight: 1 }] },
    { id: "two", navn: "To", rects: [{ x: 5, y: 5, w: 10, h: 10 }, { x: 30, y: 0, w: 2, h: 2 }], encounterTable: [{ speciesId: "c", weight: 1 }, { speciesId: "d", weight: 0 }] },
  ],
};

test("the first region a tile lies in decides; outside every region the area's own table", () => {
  assert.equal(regionAt(small, 0, 0)?.id, "one");
  assert.equal(regionAt(small, 9, 9)?.id, "one", "overlap: the first wins");
  assert.equal(regionAt(small, 10, 10)?.id, "two");
  assert.equal(regionAt(small, 31, 1)?.id, "two", "a region can have several rectangles");
  assert.equal(regionAt(small, 32, 1), undefined, "rectangles end before x + w");
  assert.deepEqual(encounterTableAt(small, 50, 50), small.encounterTable);
  assert.deepEqual(encounterTableAt({ encounterTable: small.encounterTable }, 0, 0), small.encounterTable, "no regions at all");
});

test("where a monster lives", () => {
  assert.ok(livesInArea(small, "a") && livesInArea(small, "c"));
  assert.ok(!livesInArea(small, "d"), "weight 0 = doesn't live here");
  assert.ok(livesAt(small, "b", 1, 1) && !livesAt(small, "b", 50, 50));
  assert.ok(livesAt(small, "a", 50, 50) && !livesAt(small, "a", 1, 1));
});

test("Startskoven: every region has tall grass and only known monsters", () => {
  const grass = map.layers.find((l) => l.name === meta.encounterZoneLayer)!.data;
  const tiles = new Map<string, number>();
  grass.forEach((gid, i) => {
    if (!gid) return;
    const id = regionAt(meta, i % map.width, Math.floor(i / map.width))?.id ?? "";
    tiles.set(id, (tiles.get(id) ?? 0) + 1);
  });
  for (const region of [...(meta.regions ?? []), { id: "", encounterTable: meta.encounterTable }]) {
    assert.ok((tiles.get(region.id) ?? 0) >= 20, `${region.id || "the rest"} has too little tall grass`);
    for (const e of region.encounterTable) assert.ok(speciesIds.has(e.speciesId), `${region.id}: unknown ${e.speciesId}`);
    for (const b of "rects" in region ? region.rects : []) assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= map.width && b.y + b.h <= map.height, `${region.id} is off the map`);
  }
});

test("battles take place in the scene of the region, else the map's, else the default", () => {
  const scenes: SceneConfig = JSON.parse(readFileSync(new URL("scenes.json", content), "utf8"));
  const map = { ...small, regions: [{ ...small.regions![0]!, scene: "skov" }, small.regions![1]!], scene: "strand" };
  assert.equal(sceneAt(map, 1, 1, scenes).id, "skov");
  assert.equal(sceneAt(map, 12, 12, scenes).id, "strand", "a region without a scene: the map's");
  assert.equal(sceneAt({}, 0, 0, scenes).id, scenes.default);
  assert.equal(sceneAt({ scene: "findes-ikke" }, 0, 0, scenes).id, scenes.default, "an unknown scene: the default");
});

test("the scenes file only uses scenery the game can draw", () => {
  const scenes: SceneConfig = JSON.parse(readFileSync(new URL("scenes.json", content), "utf8"));
  assert.ok(scenes.kinds.some((k) => k.id === scenes.default));
  for (const k of scenes.kinds) {
    assert.ok(/^[a-z0-9-]+$/.test(k.id), k.id);
    for (const d of k.look.decor) assert.ok(SCENE_DECOR.includes(d), `${k.id}: ${d}`);
    assert.ok(!k.look.particles || SCENE_PARTICLES.includes(k.look.particles), `${k.id}: ${k.look.particles}`);
  }
  for (const r of meta.regions ?? []) if (r.scene) assert.ok(scenes.kinds.some((k) => k.id === r.scene), `${r.id}: unknown scene ${r.scene}`);
});
