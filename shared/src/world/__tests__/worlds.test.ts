import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import type { AreaMeta } from "../../types/area.js";
import { canEnterWorld, linkAt, linkTarget, worldById, type WorldConfig } from "../worlds.js";

const areas = new URL("../../../content/areas/", import.meta.url);
const metas: AreaMeta[] = readdirSync(areas)
  .filter((f) => f.endsWith(".meta.json"))
  .map((f) => JSON.parse(readFileSync(new URL(f, areas), "utf8")));
const worlds: WorldConfig = JSON.parse(readFileSync(new URL("../worlds.json", areas), "utf8"));
const mapOf = (meta: AreaMeta) => JSON.parse(readFileSync(new URL(meta.tiledMapPath.replace(/^areas\//, ""), areas), "utf8")) as { width: number; height: number; layers: Array<{ name: string; data: number[] }> };

test("every world has a map, and every map is a world", () => {
  for (const m of metas) assert.ok(worldById(worlds, m.id), `${m.id} is in worlds.json`);
  for (const w of worlds.worlds) assert.ok(metas.some((m) => m.id === w.id), `${w.id} has a map`);
  assert.equal(worldById(worlds, "startskoven")?.minLevel, 1, "everyone starts somewhere they may be");
  for (const w of worlds.worlds) assert.ok(w.x >= 0 && w.x <= 1 && w.y >= 0 && w.y <= 1 && w.minLevel >= 1, w.id);
});

test("every way to another world has its other end, of the same kind, leading back", () => {
  for (const m of metas) {
    for (const l of m.links ?? []) {
      const target = linkTarget(l, metas);
      assert.ok(target, `${m.id}/${l.id} leads somewhere`);
      const back = metas.find((o) => o.id === l.to.areaId)!.links!.find((o) => o.id === l.to.link)!;
      assert.equal(back.kind, l.kind, `${m.id}/${l.id}: both ends the same kind`);
      assert.deepEqual(back.to, { areaId: m.id, link: l.id }, `${m.id}/${l.id}: the other end leads back`);
    }
  }
});

test("a link's tile can be walked to from where you arrive, and it's not in tall grass", () => {
  for (const m of metas) {
    const map = mapOf(m);
    const ground = map.layers.find((l) => l.name === m.collisionLayer)!.data;
    const grass = map.layers.find((l) => l.name === m.encounterZoneLayer)!.data;
    const walkable = (x: number, y: number) => x >= 0 && y >= 0 && x < map.width && y < map.height && !m.collisionGids.includes(ground[y * map.width + x]!);
    const seen = new Set<string>([`${m.playerStart.x},${m.playerStart.y}`]);
    const queue = [m.playerStart];
    while (queue.length) {
      const { x, y } = queue.shift()!;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const k = `${x + dx},${y + dy}`;
        if (!seen.has(k) && walkable(x + dx, y + dy)) {
          seen.add(k);
          queue.push({ x: x + dx, y: y + dy });
        }
      }
    }
    for (const l of m.links ?? []) {
      assert.ok(walkable(l.x, l.y), `${m.id}/${l.id} stands on walkable ground`);
      assert.ok(seen.has(`${l.x},${l.y}`), `${m.id}/${l.id} can be reached`);
      assert.ok(!grass[l.y * map.width + l.x], `${m.id}/${l.id} isn't in tall grass`);
      assert.equal(linkAt(m, l.x, l.y)?.id, l.id);
    }
  }
});

test("some worlds open at a level", () => {
  assert.ok(canEnterWorld(worlds, "startskoven", 1));
  const locked = worlds.worlds.find((w) => w.minLevel > 1)!;
  assert.ok(!canEnterWorld(worlds, locked.id, locked.minLevel - 1));
  assert.ok(canEnterWorld(worlds, locked.id, locked.minLevel));
  assert.ok(canEnterWorld(worlds, "findes-ikke", 1), "a world not in the list is open");
});
