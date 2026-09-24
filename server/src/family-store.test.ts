import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FamilyStore } from "./family-store.js";

test("a fresh directory starts empty, and flushed data survives reopening", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "store-"));
  const store = await FamilyStore.open(dir);
  assert.equal(store.data.events.length, 0);
  store.data.players["a"] = { navn: "Anna", farve: "#f00", lastSeen: new Date().toISOString() };
  store.data.events.push({ id: "1", playerId: "a", kind: "catch", at: new Date().toISOString() });
  await store.flush();
  const again = await FamilyStore.open(dir);
  assert.equal(again.data.players["a"]?.navn, "Anna");
  assert.equal(again.data.events.length, 1);
});

test("events older than eight days are pruned when saving", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "store-"));
  const store = await FamilyStore.open(dir);
  store.data.events.push({ id: "old", playerId: "a", kind: "catch", at: new Date(Date.now() - 9 * 86_400_000).toISOString() });
  store.data.events.push({ id: "new", playerId: "a", kind: "catch", at: new Date().toISOString() });
  await store.flush();
  const saved = JSON.parse(await readFile(path.join(dir, "family.json"), "utf-8"));
  assert.deepEqual(saved.events.map((e: { id: string }) => e.id), ["new"]);
});

test("a corrupt file is not fatal: the server starts empty", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "store-"));
  await writeFile(path.join(dir, "family.json"), "{not json");
  const store = await FamilyStore.open(dir);
  assert.equal(store.data.events.length, 0);
});

test("an unwritable directory is logged, not thrown", async () => {
  // A "directory" inside a regular file can never be created (ENOTDIR).
  const file = path.join(await mkdtemp(path.join(os.tmpdir(), "store-")), "a-file");
  await writeFile(file, "");
  const store = await FamilyStore.open(path.join(file, "data"));
  store.data.events.push({ id: "x", playerId: "a", kind: "catch", at: new Date().toISOString() });
  const original = console.error;
  let logged = false;
  console.error = () => (logged = true);
  try {
    await store.flush();
  } finally {
    console.error = original;
  }
  assert.equal(logged, true);
});
