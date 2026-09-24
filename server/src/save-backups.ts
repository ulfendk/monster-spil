import { mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/** What the restore list shows for each backed-up player. */
export interface BackupSummary {
  playerId: string;
  navn: string;
  farve: string;
  avatarId: string;
  creatures: number;
  savedAt: string;
}

/** Player ids are UUIDs made by the devices; anything else is refused (they become file names). */
const ID = /^[A-Za-z0-9-]{1,80}$/;
/** Far more than any real save; stops a runaway device filling the disk. */
export const MAX_BACKUP_BYTES = 256 * 1024;

interface StoredBackup {
  savedAt: string;
  save: { player: { id: string; navn: string; farve: string; avatarId: string }; creatures?: unknown[] };
}

/**
 * A copy of each player's save, one file per player in `<dataDir>/saves/`, so a
 * reinstalled or new device can get its monsters back. The device's own save stays
 * the source of truth — this copy is only read when setting up a device. Writes are
 * atomic (temp file + rename). The server does not interpret the save beyond the
 * player fields it lists (family trust, like trades).
 */
export class SaveBackups {
  constructor(private readonly dir: string) {}

  static validId(playerId: unknown): playerId is string {
    return typeof playerId === "string" && ID.test(playerId);
  }

  /** Checks a save sent by `playerId` and stores it. Returns an error reason, or undefined when stored. */
  async put(playerId: string, save: unknown, now = new Date()): Promise<string | undefined> {
    if (!SaveBackups.validId(playerId)) return "invalid player";
    const s = save as StoredBackup["save"] | null;
    const p = s?.player;
    if (!s || typeof s !== "object" || !p || p.id !== playerId) return "not your save";
    if (typeof p.navn !== "string" || typeof p.farve !== "string" || typeof p.avatarId !== "string") return "invalid save";
    const json = JSON.stringify({ savedAt: now.toISOString(), save: s } satisfies StoredBackup);
    if (Buffer.byteLength(json) > MAX_BACKUP_BYTES) return "save too big";
    await mkdir(this.dir, { recursive: true });
    const file = path.join(this.dir, `${playerId}.json`);
    await writeFile(`${file}.tmp`, json);
    await rename(`${file}.tmp`, file);
    return undefined;
  }

  /** Deletes a player's backup; true if there was one. */
  async remove(playerId: string): Promise<boolean> {
    if (!SaveBackups.validId(playerId)) return false;
    try {
      await unlink(path.join(this.dir, `${playerId}.json`));
      return true;
    } catch {
      return false;
    }
  }

  async get(playerId: string): Promise<StoredBackup | undefined> {
    if (!SaveBackups.validId(playerId)) return undefined;
    try {
      return JSON.parse(await readFile(path.join(this.dir, `${playerId}.json`), "utf-8")) as StoredBackup;
    } catch {
      return undefined;
    }
  }

  /** Every backed-up player, most recently saved first. */
  async list(): Promise<BackupSummary[]> {
    let files: string[];
    try {
      files = (await readdir(this.dir)).filter((f) => f.endsWith(".json"));
    } catch {
      return [];
    }
    const out: BackupSummary[] = [];
    for (const f of files) {
      const b = await this.get(f.slice(0, -5));
      if (!b) continue;
      const p = b.save.player;
      out.push({ playerId: p.id, navn: p.navn, farve: p.farve, avatarId: p.avatarId, creatures: b.save.creatures?.length ?? 0, savedAt: b.savedAt });
    }
    return out.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  }
}
