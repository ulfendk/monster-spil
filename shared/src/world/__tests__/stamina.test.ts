import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { breathLeft, staminaRecover, staminaStep, type ClimbConfig } from "../stamina.js";

const config: ClimbConfig = { tilesBeforeRest: 4, restSeconds: 5 };

test("climbing uses breath; the last of it makes you rest, fresh afterwards", () => {
  let used = 0;
  const rests: boolean[] = [];
  for (let i = 0; i < 8; i++) {
    const r = staminaStep(used, true, config);
    used = r.used;
    rests.push(r.rest);
  }
  assert.deepEqual(rests, [false, false, false, true, false, false, false, true]);
  assert.equal(used, 0);
});

test("level ground and standing still give breath back", () => {
  assert.deepEqual(staminaStep(3, false, config), { used: 2, rest: false });
  assert.deepEqual(staminaStep(0, false, config), { used: 0, rest: false });
  assert.equal(staminaRecover(4, 5, config), 0, "all of it back in restSeconds");
  assert.equal(staminaRecover(4, 2.5, config), 2);
  assert.equal(breathLeft(1, config), 0.75);
  assert.equal(breathLeft(9, config), 0);
});

test("minigames.json has the climbing numbers", () => {
  const content = JSON.parse(readFileSync(new URL("../../../content/minigames.json", import.meta.url), "utf8"));
  assert.ok(content.climb.tilesBeforeRest >= 2 && content.climb.restSeconds > 0);
});
