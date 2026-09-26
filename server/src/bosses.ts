import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { HABITATS, type BeastDefinition, type BossDefinition } from "@monster-spil/shared";

/**
 * Loads every boss from shared/content/raid/*.json (next to the shared package, so
 * it works both from the repo and in the Docker image). Adding a boss is adding a
 * JSON file; one boss is active per week, taking turns in file-name order.
 */
export async function loadBosses(): Promise<BossDefinition[]> {
  const dir = fileURLToPath(new URL("../content/raid/", import.meta.resolve("@monster-spil/shared")));
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  const bosses = await Promise.all(files.map(async (f) => JSON.parse(await readFile(dir + f, "utf-8")) as BossDefinition));
  if (bosses.length === 0) throw new Error(`No boss found in ${dir}`);
  return bosses;
}

/** The boss for a given week (weekId = its Monday, YYYY-MM-DD), rotating through the list. */
export function bossForWeek(bosses: BossDefinition[], weekId: string): BossDefinition {
  const weeks = Math.floor(Date.parse(`${weekId}T00:00:00Z`) / (7 * 86_400_000));
  return bosses[((weeks % bosses.length) + bosses.length) % bosses.length]!;
}

/**
 * Loads every visiting beast from shared/content/beasts/*.json (sand serpents, giant
 * eagles, …). Adding a kind is adding a JSON file; each kind comes and goes on its own
 * schedule. A file with an unknown habitat is skipped with a warning.
 */
export async function loadBeasts(): Promise<BeastDefinition[]> {
  const dir = fileURLToPath(new URL("../content/beasts/", import.meta.resolve("@monster-spil/shared")));
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  } catch {
    return [];
  }
  const beasts = await Promise.all(files.map(async (f) => JSON.parse(await readFile(dir + f, "utf-8")) as BeastDefinition));
  return beasts.filter((b) => {
    if (HABITATS.includes(b.habitat)) return true;
    console.warn(`Beast ${b.id}: unknown habitat "${String(b.habitat)}", skipped`);
    return false;
  });
}
