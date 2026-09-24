import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { GAME_FILE, GameStore } from "./game-store.js";
import { SaveBackups } from "./save-backups.js";
import { sameSecret } from "./key-gate.js";

/** One game on the server: its own players, scoreboard, dragon and backups. */
export interface GameInfo {
  id: string;
  navn: string;
  /** The spilnøgle, stored normalised (see normaliseKey). Shown to the parent so it can be handed out. */
  key: string;
  createdAt: string;
}

interface RegistryFile {
  version: 1;
  games: GameInfo[];
}

export type GameChange = { ok: true; game: GameInfo } | { ok: false; error: string };

/** The id the pre-games single family got, on the server and on devices alike. */
export const LEGACY_GAME_ID = "familien";
export const KEY_MIN = 6;
export const KEY_MAX = 40;
const NAME_MAX = 30;
const ID = /^[a-z0-9-]{1,40}$/;
const FILE = "games.json";

/** Keys are typed on iPads by parents and kids: ignore case, surrounding spaces and Unicode form. */
export function normaliseKey(raw: unknown): string | undefined {
  return typeof raw === "string" ? raw.normalize("NFC").trim().toLowerCase() : undefined;
}

/**
 * All games on this server, in `<dataDir>/games.json`, with each game's data in its own
 * folder: `<dataDir>/games/<id>/game.json` (scores, dragon, rewards) and
 * `<dataDir>/games/<id>/saves/` (backups). Before there were games the server had one
 * family: `<dataDir>/family.json` + `<dataDir>/saves/`. On first start that becomes the
 * game "Familien" (id "familien") with FAMILY_CODE as its key, so nothing is lost.
 */
export class GameRegistry {
  private stores = new Map<string, Promise<GameStore>>();

  private constructor(private readonly dataDir: string, private readonly games: GameInfo[]) {}

  static async open(dataDir: string, legacyKey?: string): Promise<GameRegistry> {
    try {
      const raw = JSON.parse(await readFile(path.join(dataDir, FILE), "utf-8")) as Partial<RegistryFile>;
      return new GameRegistry(dataDir, Array.isArray(raw.games) ? raw.games : []);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error(`Could not read ${path.join(dataDir, FILE)}: ${String(error)}`);
    }
    const registry = new GameRegistry(dataDir, []);
    await registry.migrateLegacy(normaliseKey(legacyKey));
    return registry;
  }

  /** The old single-family layout (or just FAMILY_CODE on a fresh server) becomes the first game. */
  private async migrateLegacy(key: string | undefined): Promise<void> {
    const exists = async (p: string) => stat(p).then(() => true, () => false);
    const oldFile = path.join(this.dataDir, "family.json");
    const oldSaves = path.join(this.dataDir, "saves");
    const hasData = (await exists(oldFile)) || (await exists(oldSaves));
    if (!key && !hasData) return; // a brand-new server: games are made in the admin portal
    const gameKey = key && key.length > 0 ? key : newKey();
    if (!key) console.warn(`FAMILY_CODE is not set, so the old family's game got a new spilnøgle: "${gameKey}" (change it at /admin).`);
    const dir = this.gameDir(LEGACY_GAME_ID);
    await mkdir(dir, { recursive: true });
    if (await exists(oldFile)) await rename(oldFile, path.join(dir, GAME_FILE));
    if (await exists(oldSaves)) await rename(oldSaves, path.join(dir, "saves"));
    this.games.push({ id: LEGACY_GAME_ID, navn: "Familien", key: gameKey, createdAt: new Date().toISOString() });
    await this.write();
    console.log(`Moved the family's data into the game "Familien" (${dir}).`);
  }

  list(): GameInfo[] {
    return [...this.games];
  }

  get(id: unknown): GameInfo | undefined {
    return typeof id === "string" ? this.games.find((g) => g.id === id) : undefined;
  }

  /** The game whose key this is. Compares against every game in constant time. */
  byKey(given: unknown): GameInfo | undefined {
    const key = normaliseKey(given);
    if (!key) return undefined;
    let found: GameInfo | undefined;
    for (const game of this.games) if (sameSecret(key, game.key)) found = game;
    return found;
  }

  async create(navn: unknown, key: unknown): Promise<GameChange> {
    const cleanName = cleanNavn(navn);
    if (!cleanName) return { ok: false, error: "skriv et navn" };
    const k = this.checkKey(key);
    if ("error" in k) return { ok: false, error: k.error };
    let id: string;
    do id = `${slug(cleanName)}-${randomBytes(3).toString("hex")}`;
    while (this.get(id));
    const game: GameInfo = { id, navn: cleanName, key: k.key, createdAt: new Date().toISOString() };
    this.games.push(game);
    await this.write();
    return { ok: true, game };
  }

  async rename(id: string, navn: unknown): Promise<GameChange> {
    const game = this.get(id);
    const cleanName = cleanNavn(navn);
    if (!game) return { ok: false, error: "intet spil" };
    if (!cleanName) return { ok: false, error: "skriv et navn" };
    game.navn = cleanName;
    await this.write();
    return { ok: true, game };
  }

  async setKey(id: string, key: unknown): Promise<GameChange> {
    const game = this.get(id);
    if (!game) return { ok: false, error: "intet spil" };
    const k = this.checkKey(key, id);
    if ("error" in k) return { ok: false, error: k.error };
    game.key = k.key;
    await this.write();
    return { ok: true, game };
  }

  /** Forgets the game and deletes its folder (scores, dragon, backups). */
  async remove(id: string): Promise<boolean> {
    const i = this.games.findIndex((g) => g.id === id);
    if (i < 0 || !ID.test(id)) return false;
    this.games.splice(i, 1);
    await this.write();
    const store = await this.stores.get(id);
    store?.close();
    this.stores.delete(id);
    await rm(this.gameDir(id), { recursive: true, force: true });
    return true;
  }

  /** The game's scores/dragon/rewards (opened once, then shared by the room and the admin portal). */
  store(id: string): Promise<GameStore> {
    let store = this.stores.get(id);
    if (!store) {
      store = GameStore.open(this.gameDir(id));
      this.stores.set(id, store);
    }
    return store;
  }

  backups(id: string): SaveBackups {
    return new SaveBackups(path.join(this.gameDir(id), "saves"));
  }

  /** Writes every open game's pending changes (on shutdown). */
  async flush(): Promise<void> {
    await Promise.all([...this.stores.values()].map(async (s) => (await s).flush()));
  }

  private gameDir(id: string): string {
    if (!ID.test(id)) throw new Error(`invalid game id ${id}`);
    return path.join(this.dataDir, "games", id);
  }

  private checkKey(raw: unknown, exceptId?: string): { key: string } | { error: string } {
    const key = normaliseKey(raw);
    if (!key || key.length < KEY_MIN) return { error: `spilnøglen skal have mindst ${KEY_MIN} tegn` };
    if (key.length > KEY_MAX) return { error: `spilnøglen må højst have ${KEY_MAX} tegn` };
    if (this.games.some((g) => g.id !== exceptId && g.key === key)) return { error: "et andet spil bruger allerede den spilnøgle" };
    return { key };
  }

  private async write(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    const file = path.join(this.dataDir, FILE);
    await writeFile(`${file}.tmp`, JSON.stringify({ version: 1, games: this.games } satisfies RegistryFile, null, 2));
    await rename(`${file}.tmp`, file);
  }
}

function cleanNavn(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const navn = raw.normalize("NFC").trim().replace(/\s+/g, " ");
  return navn.length > 0 && navn.length <= NAME_MAX ? navn : undefined;
}

/** A readable id part from the game's name ("Klassen 2.B" → "klassen-2-b"). */
function slug(navn: string): string {
  const ascii = navn.toLowerCase().replace(/æ/g, "ae").replace(/ø/g, "oe").replace(/å/g, "aa");
  return ascii.normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "spil";
}

/** A random key, only used when an old server had data but no FAMILY_CODE. */
function newKey(): string {
  return randomBytes(6).toString("base64url").toLowerCase();
}
