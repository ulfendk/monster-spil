import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RaidState, RewardDelivery, ScoreEvent, ScorePlayer } from "@monster-spil/shared";

/** Everything the server must remember across restarts. Kept small: one JSON file. */
export interface FamilyData {
  version: 1;
  /** Everyone who has ever joined, so the scoreboard also lists family members who are offline. */
  players: Record<string, ScorePlayer & { lastSeen: string }>;
  /** Scoreboard events; older than the window + a day are pruned on save. */
  events: ScoreEvent[];
  raid?: RaidState;
  /** Rewards not yet acknowledged, per playerId (re-sent on join). */
  rewards: Record<string, RewardDelivery[]>;
}

const FILE = "family.json";
const KEEP_MS = 8 * 24 * 60 * 60 * 1000;
const WRITE_DELAY_MS = 500;

const empty = (): FamilyData => ({ version: 1, players: {}, events: [], rewards: {} });

/**
 * The server's only persistent state, in `<dir>/family.json` (a Docker volume in
 * production). Writes are debounced and atomic (temp file + rename), so a crash
 * mid-write never leaves a half-written file. If the directory can't be written,
 * the server keeps running from memory and logs why.
 */
export class FamilyStore {
  private timer?: ReturnType<typeof setTimeout>;
  private writing = Promise.resolve();

  private constructor(readonly data: FamilyData, private readonly dir: string) {}

  static async open(dir: string): Promise<FamilyStore> {
    try {
      const raw = JSON.parse(await readFile(path.join(dir, FILE), "utf-8")) as Partial<FamilyData>;
      return new FamilyStore({ ...empty(), ...raw, version: 1 }, dir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") console.error(`Could not read ${path.join(dir, FILE)}, starting empty:`, error);
      return new FamilyStore(empty(), dir);
    }
  }

  /** Call after changing `data`; the file is written shortly after. */
  changed(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), WRITE_DELAY_MS);
  }

  async flush(): Promise<void> {
    clearTimeout(this.timer);
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
