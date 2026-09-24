import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RaidState, RewardDelivery, ScoreEvent, ScorePlayer } from "@monster-spil/shared";

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
}

export const GAME_FILE = "game.json";
const FILE = GAME_FILE;
const KEEP_MS = 8 * 24 * 60 * 60 * 1000;
const WRITE_DELAY_MS = 500;

const empty = (): GameData => ({ version: 1, players: {}, events: [], rewards: {}, renames: {} });

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
      return new GameStore({ ...empty(), ...raw, version: 1 }, dir);
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
