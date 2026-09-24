import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { GameRegistry, LEGACY_GAME_ID, normaliseKey } from "./games.js";

const tmp = () => mkdtemp(path.join(os.tmpdir(), "games-"));
const exists = (p: string) => stat(p).then(() => true, () => false);

test("a brand-new server without FAMILY_CODE has no games", async () => {
  const registry = await GameRegistry.open(await tmp());
  assert.deepEqual(registry.list(), []);
});

test("FAMILY_CODE on a fresh server becomes the game Familien", async () => {
  const dir = await tmp();
  const registry = await GameRegistry.open(dir, "  Hemmelig1 ");
  assert.equal(registry.list().length, 1);
  assert.equal(registry.byKey("hemmelig1")?.id, LEGACY_GAME_ID);
  // Reopening reads games.json; FAMILY_CODE no longer matters.
  const again = await GameRegistry.open(dir, "noget-andet");
  assert.equal(again.list().length, 1);
  assert.equal(again.byKey("HEMMELIG1")?.navn, "Familien");
});

test("the old family.json and saves/ move into the first game", async () => {
  const dir = await tmp();
  await writeFile(path.join(dir, "family.json"), JSON.stringify({ version: 1, players: { a: { navn: "Anna", farve: "#f00", lastSeen: "x" } }, events: [], rewards: {} }));
  await mkdir(path.join(dir, "saves"));
  await writeFile(path.join(dir, "saves", "a.json"), JSON.stringify({ savedAt: "2026-01-01", save: { player: { id: "a", navn: "Anna", farve: "#f00", avatarId: "figur1" }, creatures: [] } }));
  const registry = await GameRegistry.open(dir, "familiekode");
  const store = await registry.store(LEGACY_GAME_ID);
  assert.equal(store.data.players["a"]?.navn, "Anna");
  assert.deepEqual(store.data.renames, {}, "fields added later are filled in");
  assert.equal((await registry.backups(LEGACY_GAME_ID).list())[0]?.navn, "Anna");
  assert.equal(await exists(path.join(dir, "family.json")), false);
  assert.equal(await exists(path.join(dir, "saves")), false);
});

test("old data without FAMILY_CODE still becomes a game, with a random key", async () => {
  const dir = await tmp();
  await writeFile(path.join(dir, "family.json"), "{}");
  const original = console.warn;
  console.warn = () => {};
  try {
    const registry = await GameRegistry.open(dir);
    const game = registry.get(LEGACY_GAME_ID);
    assert.ok(game && game.key.length >= 6);
  } finally {
    console.warn = original;
  }
});

test("creating games: names and keys are checked, keys are unique and case-insensitive", async () => {
  const registry = await GameRegistry.open(await tmp());
  const a = await registry.create("Klassen 2.B", "Modig-Ugle-472");
  assert.ok(a.ok);
  assert.match(a.game.id, /^klassen-2-b-[0-9a-f]{6}$/);
  assert.equal(a.game.key, "modig-ugle-472");
  assert.equal((await registry.create("", "abcdefg")).ok, false);
  assert.equal((await registry.create("x".repeat(31), "abcdefg")).ok, false);
  assert.equal((await registry.create("Kort", "abc")).ok, false, "too short a key");
  assert.equal((await registry.create("Andet", "MODIG-UGLE-472")).ok, false, "the same key twice");
  const b = await registry.create("Fætre og kusiner", "glad-ræv-101");
  assert.ok(b.ok);
  assert.match(b.game.id, /^faetre-og-kusiner-/);
  assert.equal(registry.byKey(" GLAD-RÆV-101 ")?.id, b.game.id);
  assert.equal(registry.byKey("glad-ræv-102"), undefined);
  assert.equal(registry.byKey(42), undefined);
});

test("renaming, changing a key and deleting a game", async () => {
  const dir = await tmp();
  const registry = await GameRegistry.open(dir);
  const made = await registry.create("Klassen", "klassen-123");
  assert.ok(made.ok);
  const id = made.game.id;
  assert.ok((await registry.rename(id, "  Klassen   2.B ")).ok);
  assert.equal(registry.get(id)?.navn, "Klassen 2.B");
  const other = await registry.create("Familien", "familie-9");
  assert.ok(other.ok);
  assert.equal((await registry.setKey(id, "familie-9")).ok, false, "a key another game uses");
  assert.ok((await registry.setKey(id, "klassen-123")).ok, "keeping its own key is fine");
  assert.ok((await registry.setKey(id, "ny-nøgle-77")).ok);
  assert.equal(registry.byKey("klassen-123"), undefined);
  assert.equal(registry.byKey("ny-nøgle-77")?.id, id);

  const store = await registry.store(id);
  store.data.players["p"] = { navn: "P", farve: "#000", lastSeen: "x" };
  await store.flush();
  await registry.backups(id).put("p", { player: { id: "p", navn: "P", farve: "#000", avatarId: "figur1" }, creatures: [] });
  assert.equal(await registry.remove(id), true);
  store.changed(); // a late change from a room must not bring the folder back
  await new Promise((r) => setTimeout(r, 600));
  assert.equal(await exists(path.join(dir, "games", id)), false);
  assert.equal(registry.get(id), undefined);
  const saved = JSON.parse(await readFile(path.join(dir, "games.json"), "utf-8"));
  assert.deepEqual(saved.games.map((g: { id: string }) => g.id), [other.game.id]);
});

test("normaliseKey ignores case, spaces around and Unicode form", () => {
  assert.equal(normaliseKey(" Rød-Ræv "), "rød-ræv");
  assert.equal(normaliseKey("rød".normalize("NFD")), normaliseKey("rød"));
  assert.equal(normaliseKey(undefined), undefined);
});
