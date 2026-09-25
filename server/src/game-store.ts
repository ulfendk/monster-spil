import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_DISASTER_SETTINGS, DEFAULT_ROAM_SETTINGS } from "@monster-spil/shared";
import type { AreaTerrain, DisasterKind, DisasterSettings, RaidState, RewardDelivery, RoamSettings, ScoreEvent, ScorePlayer } from "@monster-spil/shared";

/** A disaster that struck, for the admin portal and the "while you were away" note. */
export interface DisasterRecord {
  id: string;
  kind: DisasterKind;
  areaId: string;
  x: number;
  y: number;
  at: string;
  /** How many players it caught. */
  struck: number;
}

/** Natural disasters in this game: the parent's settings, when the next one comes, and how each map looks now. */
export interface WorldData {
  settings: DisasterSettings;
  nextAt?: string;
  areas: Record<string, AreaTerrain>;
  /** The latest disasters, newest first (at most HISTORY_MAX). */
  history: DisasterRecord[];
}
export const HISTORY_MAX = 20;

/** The dragon's flying about: the parent's settings and when it next takes off. */
export interface RoamData {
  settings: RoamSettings;
  nextAt?: string;
}

/** Everything the server must remember about one game across restarts. Kept small: one JSON file. */
export interface GameData {
  version: 1;
  /** Everyone who has ever joined, so the scoreboard also lists players who are offline. */
  players: Record<string, ScorePlayer & { lastSeen: string }>;
  /** Scoreboard events; older than the window + a day are pruned on save. */
  events: ScoreEvent[];
  raid?: RaidState;
  /** Rewards not yet acknowledged, per playerId (re-sent on join). */
  rewards: Record<string, RewardDelivery[]>;
  /** Names a parent set in the admin portal, per playerId, until that device has taken the new name. */
  renames: Record<string, string>;
  world: WorldData;
  roam: RoamData;
}

export const GAME_FILE = "game.json";
const FILE = GAME_FILE;
const KEEP_MS = 8 * 24 * 60 * 60 * 1000;
const WRITE_DELAY_MS = 500;

const emptyWorld = (): WorldData => ({ settings: { ...DEFAULT_DISASTER_SETTINGS, kinds: { ...DEFAULT_DISASTER_SETTINGS.kinds } }, areas: {}, history: [] });
const emptyRoam = (): RoamData => ({ settings: { ...DEFAULT_ROAM_SETTINGS } });
const empty = (): GameData => ({ version: 1, players: {}, events: [], rewards: {}, renames: {}, world: emptyWorld(), roam: emptyRoam() });

/**
 * One game's persistent state, in `<dir>/game.json` (under a Docker volume in
 * production; see GameRegistry for the layout). Writes are debounced and atomic (temp file + rename), so a crash
 * mid-write never leaves a half-written file. If the directory can't be written,
 * the server keeps running from memory and logs why.
 */
export class GameStore {
  private timer?: ReturnType<typeof setTimeout>;
  private writing = Promise.resolve();
  private closed = false;

  private constructor(readonly data: GameData, private readonly dir: string) {}

  static async open(dir: string): Promise<GameStore> {
    try {
      const raw = JSON.parse(await readFile(path.join(dir, FILE), "utf-8")) as Partial<GameData>;
      return new GameStore({ ...empty(), ...raw, version: 1, world: { ...emptyWorld(), ...raw.world }, roam: { ...emptyRoam(), ...raw.roam } }, dir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") console.error(`Could not read ${path.join(dir, FILE)}, starting empty:`, error);
      return new GameStore(empty(), dir);
    }
  }

  /** Call after changing `data`; the file is written shortly after. */
  changed(): void {
    if (this.closed) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), WRITE_DELAY_MS);
  }

  /** The game was deleted: never write again (the folder is being removed). */
  close(): void {
    this.closed = true;
    clearTimeout(this.timer);
  }

  async flush(): Promise<void> {
    clearTimeout(this.timer);
    if (this.closed) return this.writing;
    const cutoff = Date.now() - KEEP_MS;
    this.data.events = this.data.events.filter((e) => Date.parse(e.at) > cutoff);
    const json = JSON.stringify(this.data);
    this.writing = this.writing.then(async () => {
      try {
        await mkdir(this.dir, { recursive: true });
        const tmp = path.join(this.dir, `${FILE}.tmp`);
        await writeFile(tmp, json);
        await rename(tmp, path.join(this.dir, FILE));
      } catch (error) {
        console.error(`Could not save ${path.join(this.dir, FILE)} (scores/dragon only kept in memory):`, error);
      }
    });
    return this.writing;
  }
}
