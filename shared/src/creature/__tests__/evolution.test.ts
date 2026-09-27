import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import type { CreatureInstance, CreatureSpecies } from "../../types/creature.js";
import { bondForNext, bondFromWin, canEvolve, care, evolve, stageCount, stageName, stageOf, stageStats, type NurtureConfig } from "../evolution.js";

const config: NurtureConfig = JSON.parse(readFileSync(new URL("../../../content/nurture.json", import.meta.url), "utf8"));
const dir = new URL("../../../content/creatures/", import.meta.url);
const all: CreatureSpecies[] = readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(new URL(f, dir), "utf8")));
const mosmus = all.find((s) => s.id === "mosmus")!;
const mon = (over: Partial<CreatureInstance> = {}): CreatureInstance => ({ instanceId: "a", speciesId: "mosmus", ownerId: "p", niveau: 1, currentHp: 34, caughtAt: "x", ...over });

test("every species has 1–3 stages, and every stage has a name", () => {
  for (const s of all) {
    assert.ok(stageCount(s) >= 1 && stageCount(s) <= 3, s.id);
    for (let st = 1; st <= stageCount(s); st++) assert.ok(stageName(s, st).length > 0);
    assert.equal(new Set([s.navn, ...(s.evolutions ?? [])]).size, stageCount(s), `${s.id}: its stages have different names`);
  }
  assert.ok(all.filter((s) => stageCount(s) === 3).length >= 10, "plenty of three-stage monsters");
});

test("caring grows the bond; petting and playing a few times a day, feeding any time", () => {
  let m = mon();
  for (let i = 0; i < config.pet.perDay; i++) {
    const r = care(m, "pet", "2026-09-27", config);
    assert.ok(r.ok);
    m = r.instance;
  }
  assert.equal(m.bond, config.pet.bond * config.pet.perDay);
  assert.deepEqual(care(m, "pet", "2026-09-27", config), { ok: false, reason: "tired" }, "enough petting for today");
  assert.ok(care(m, "pet", "2026-09-28", config).ok, "a new day");
  const fed = care(m, "feed", "2026-09-27", config);
  assert.ok(fed.ok && fed.instance.bond === m.bond! + config.feed.bond);
  assert.equal(bondFromWin(mon(), config).bond, config.battleWin.bond);
});

test("with bond enough it evolves: a new name, stronger, full health; not past its last stage", () => {
  assert.equal(bondForNext(mon(), mosmus, config), config.bondToEvolve[0]);
  assert.ok(!canEvolve(mon({ bond: config.bondToEvolve[0]! - 1 }), mosmus, config));
  const two = evolve(mon({ bond: config.bondToEvolve[0] }), mosmus, config);
  assert.equal(stageOf(two, mosmus), 2);
  assert.equal(stageName(mosmus, 2), "Mosrotte");
  const stats = stageStats(mosmus.baseStats, 2, config);
  assert.ok(stats.angreb > mosmus.baseStats.angreb && stats.hp > mosmus.baseStats.hp);
  assert.equal(two.currentHp, stats.hp);
  assert.ok(!canEvolve({ ...two, bond: config.bondToEvolve[0]! + 1 }, mosmus, config), "stage 3 asks for more bond");
  const three = evolve({ ...two, bond: config.bondToEvolve[1] }, mosmus, config);
  assert.equal(stageOf(three, mosmus), 3);
  assert.equal(bondForNext(three, mosmus, config), undefined, "the last stage");
  const flat = all.find((s) => stageCount(s) === 1)!;
  assert.ok(!canEvolve(mon({ speciesId: flat.id, bond: 999 }), flat, config), "one that doesn't evolve");
});
