import type { SaveData } from "../save/schema";

const serverUrl = import.meta.env.VITE_SERVER_URL;
const TIMEOUT_MS = 8000;

/** One backed-up player, as the restore screen lists them. */
export interface BackupSummary {
  playerId: string;
  navn: string;
  farve: string;
  avatarId: string;
  creatures: number;
  savedAt: string;
}

export type BackupResult<T> = { ok: true; value: T } | { ok: false; reason: "code" | "offline" | "missing" };

/**
 * Restoring a backup onto a new or reinstalled device. Plain HTTP on the family server
 * (the same host as the game connection, http(s) instead of ws(s)), with the family code
 * in a header; see server/src/backup-http.ts.
 */
async function get<T>(path: string, familyCode: string): Promise<BackupResult<T>> {
  if (!serverUrl) return { ok: false, reason: "offline" };
  const base = serverUrl.replace(/^ws/, "http").replace(/\/$/, "");
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${base}${path}`, { headers: { "x-family-code": familyCode }, signal: abort.signal });
    if (res.status === 401) return { ok: false, reason: "code" };
    if (res.status === 404) return { ok: false, reason: "missing" };
    if (!res.ok) return { ok: false, reason: "offline" };
    return { ok: true, value: (await res.json()) as T };
  } catch {
    return { ok: false, reason: "offline" };
  } finally {
    clearTimeout(timer);
  }
}

export function listBackups(familyCode: string): Promise<BackupResult<BackupSummary[]>> {
  return get<BackupSummary[]>("/backups", familyCode);
}

export async function fetchBackup(familyCode: string, playerId: string): Promise<BackupResult<SaveData>> {
  const r = await get<{ save: SaveData }>(`/backups/${encodeURIComponent(playerId)}`, familyCode);
  if (!r.ok) return r;
  const save = r.value.save;
  // Only what the game can actually load: a player and a list of creatures.
  if (!save?.player?.id || !Array.isArray(save.creatures)) return { ok: false, reason: "missing" };
  return { ok: true, value: save };
}
