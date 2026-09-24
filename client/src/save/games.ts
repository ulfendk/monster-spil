import { readRecord, writeRecords } from "./db";
import type { SaveData } from "./schema";

/**
 * The games this device plays. Each game is its own world with its own save — its own
 * player, monsters and bag — so a child can play with the family in one game and with
 * classmates in another. An online game lives on the family server and is joined with
 * its spilnøgle; a game "alone" never connects.
 */
export interface GameEntry {
  id: string;
  navn: string;
  online: boolean;
  /** The spilnøgle (online games), entered once by a parent. */
  key?: string;
  lastPlayedAt?: string;
}

interface GamesRecord {
  games: GameEntry[];
}

const GAMES = "games";
/** Where the one save lived before there were games. */
const LEGACY_SAVE = "player";
const LEGACY_CODE = "monsterjagt-familiekode";
/** The id the family's game has on the server too (see server/src/games.ts). */
export const LEGACY_GAME_ID = "familien";

export const saveKey = (gameId: string): string => `save:${gameId}`;

let games: GameEntry[] = [];
let current: GameEntry | undefined;

/**
 * Reads the game list. The first time, a save from before there were games becomes a
 * game of its own: "Familien" (with the old family code) in builds with a server, or a
 * game alone in solo builds. `multiplayer` = this build has a server.
 */
export async function loadGames(multiplayer: boolean): Promise<GameEntry[]> {
  const stored = await readRecord<GamesRecord>(GAMES);
  games = stored?.games ?? [];
  if (!stored) {
    const legacy = await readRecord<SaveData>(LEGACY_SAVE);
    if (legacy) {
      const entry: GameEntry = multiplayer
        ? { id: LEGACY_GAME_ID, navn: "Familien", online: true, key: legacyCode() }
        : { id: "solo", navn: "Monsterjagt", online: false };
      games = [entry];
      // Moved in one transaction, so a crash can't lose the save or leave it twice.
      await writeRecords({ [GAMES]: { games }, [saveKey(entry.id)]: legacy }, [LEGACY_SAVE]);
      forgetLegacyCode();
    }
  }
  return listGames();
}

/** Most recently played first. */
export function listGames(): GameEntry[] {
  return [...games].sort((a, b) => (b.lastPlayedAt ?? "").localeCompare(a.lastPlayedAt ?? ""));
}

export function currentGame(): GameEntry | undefined {
  return current;
}

export function getGame(id: string): GameEntry | undefined {
  return games.find((g) => g.id === id);
}

/** Makes `id` the game being played and returns its save (undefined: not set up yet). */
export async function enterGame(id: string): Promise<SaveData | undefined> {
  const game = getGame(id);
  if (!game) throw new Error(`unknown game ${id}`);
  current = game;
  game.lastPlayedAt = new Date().toISOString();
  await writeGames();
  return readRecord<SaveData>(saveKey(id));
}

/** Adds a game (or, for an online game already on the device, updates its name and key). */
export async function addGame(entry: GameEntry): Promise<GameEntry> {
  const existing = getGame(entry.id);
  if (existing) Object.assign(existing, { navn: entry.navn, key: entry.key ?? existing.key });
  else games.push(entry);
  await writeGames();
  return existing ?? entry;
}

export async function updateGame(id: string, patch: Partial<Pick<GameEntry, "navn" | "key">>): Promise<void> {
  const game = getGame(id);
  if (!game) return;
  Object.assign(game, patch);
  await writeGames();
}

/** Takes the game off this device, save and all (a backup on the server stays). */
export async function removeGame(id: string): Promise<void> {
  games = games.filter((g) => g.id !== id);
  if (current?.id === id) current = undefined;
  await writeRecords({ [GAMES]: { games } }, [saveKey(id), `terrain:${id}`]);
}

/** Every game's save, for showing who you are in each game. */
export async function savesByGame(): Promise<Map<string, SaveData>> {
  const out = new Map<string, SaveData>();
  for (const g of games) {
    const save = await readRecord<SaveData>(saveKey(g.id));
    if (save) out.set(g.id, save);
  }
  return out;
}

function writeGames(): Promise<void> {
  return writeRecords({ [GAMES]: { games } });
}

function legacyCode(): string | undefined {
  try {
    return localStorage.getItem(LEGACY_CODE) || undefined;
  } catch {
    return undefined;
  }
}

function forgetLegacyCode(): void {
  try {
    localStorage.removeItem(LEGACY_CODE);
  } catch {
    // Storage unavailable: nothing to forget.
  }
}
