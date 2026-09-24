import type { SaveData } from "../save/schema";
import { LEGACY_GAME_ID } from "../save/games";

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
 * Adding a game and restoring a backup onto a new or reinstalled device. Plain HTTP on
 * the game server (the same host as the game connection, http(s) instead of ws(s)), with
 * the spilnøgle in a header; see server/src/backup-http.ts.
 */
async function get<T>(path: string, key: string): Promise<BackupResult<T>> {
  if (!serverUrl) return { ok: false, reason: "offline" };
  const base = serverUrl.replace(/^ws/, "http").replace(/\/$/, "");
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${base}${path}`, {
      // The key under both names: a server from before games (v7) only knows the old one.
      headers: { "x-game-key": key, "x-family-code": key },
      signal: abort.signal,
    });
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

/** Which game a spilnøgle belongs to. */
export async function lookupGame(key: string): Promise<BackupResult<{ gameId: string; navn: string }>> {
  const r = await get<{ gameId: string; navn: string }>("/game", key);
  if (r.ok && (typeof r.value?.gameId !== "string" || typeof r.value.navn !== "string")) return { ok: false, reason: "offline" };
  if (r.ok || r.reason !== "missing") return r;
  // A server from before games has no /game: its one game is the family's, if the key opens its backups.
  const old = await get<unknown>("/backups", key);
  return old.ok ? { ok: true, value: { gameId: LEGACY_GAME_ID, navn: "Familien" } } : old;
}

export function listBackups(key: string): Promise<BackupResult<BackupSummary[]>> {
  return get<BackupSummary[]>("/backups", key);
}

export async function fetchBackup(key: string, playerId: string): Promise<BackupResult<SaveData>> {
  const r = await get<{ save: SaveData }>(`/backups/${encodeURIComponent(playerId)}`, key);
  if (!r.ok) return r;
  const save = r.value.save;
  // Only what the game can actually load: a player and a list of creatures.
  if (!save?.player?.id || !Array.isArray(save.creatures)) return { ok: false, reason: "missing" };
  return { ok: true, value: save };
}
