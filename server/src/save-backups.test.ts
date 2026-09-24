import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { MAX_BACKUP_BYTES, SaveBackups } from "./save-backups.js";

const save = (id: string, navn = "Anna", creatures = 2) => ({
  version: 1,
  player: { id, navn, farve: "#e46876", avatarId: "figur1" },
  creatures: Array.from({ length: creatures }, (_, i) => ({ instanceId: `c${i}` })),
});
const fresh = async () => new SaveBackups(path.join(await mkdtemp(path.join(os.tmpdir(), "backups-")), "saves"));

test("a stored save can be listed and fetched again", async () => {
  const b = await fresh();
  assert.equal(await b.put("a-1", save("a-1"), new Date("2026-09-25T10:00:00Z")), undefined);
  assert.equal(await b.put("b-2", save("b-2", "Bo", 5), new Date("2026-09-25T11:00:00Z")), undefined);
  const list = await b.list();
  assert.deepEqual(list.map((x) => [x.navn, x.creatures]), [["Bo", 5], ["Anna", 2]], "newest first");
  assert.equal((await b.get("a-1"))?.save.player.navn, "Anna");
});

test("a newer backup replaces the older one", async () => {
  const b = await fresh();
  await b.put("a-1", save("a-1", "Anna", 1));
  await b.put("a-1", save("a-1", "Anna", 4));
  assert.equal((await b.list()).length, 1);
  assert.equal((await b.get("a-1"))?.save.creatures?.length, 4);
});

test("you can only back up your own save, with a sane id", async () => {
  const b = await fresh();
  assert.equal(await b.put("a-1", save("someone-else")), "not your save");
  assert.equal(await b.put("../../etc/passwd", save("../../etc/passwd")), "invalid player");
  assert.equal(await b.put("a-1", null), "not your save");
  assert.equal(await b.put("a-1", { player: { id: "a-1" } }), "invalid save");
  assert.equal(await b.get("../family"), undefined);
});

test("oversized saves are refused", async () => {
  const b = await fresh();
  const huge = { ...save("a-1"), junk: "x".repeat(MAX_BACKUP_BYTES) };
  assert.equal(await b.put("a-1", huge), "save too big");
});

test("an empty or missing folder lists nothing, and leaves no temp files behind", async () => {
  const b = await fresh();
  assert.deepEqual(await b.list(), []);
  await b.put("a-1", save("a-1"));
  const dir = (b as unknown as { dir: string }).dir;
  assert.deepEqual(await readdir(dir), ["a-1.json"]);
});
