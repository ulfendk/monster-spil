import type { SaveData } from "../save/schema";
import { LEGACY_GAME_ID } from "../save/games";

import { serverHttp } from "./server-url";
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
  if (!serverHttp) return { ok: false, reason: "offline" };
  const base = serverHttp;
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

/**
 * Moving the game to a new address: sends this game's save (it becomes the player's
 * backup) and gets a one-time code the new address redeems. See server/src/backup-http.ts.
 */
export async function sendMove(key: string, save: SaveData): Promise<BackupResult<string>> {
  if (!serverHttp) return { ok: false, reason: "offline" };
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${serverHttp}/transfer`, {
      method: "POST",
      headers: { "x-game-key": key, "content-type": "application/json" },
      body: JSON.stringify({ save }),
      signal: abort.signal,
    });
    if (res.status === 401) return { ok: false, reason: "code" };
    if (!res.ok) return { ok: false, reason: "offline" };
    const { code } = (await res.json()) as { code?: unknown };
    return typeof code === "string" ? { ok: true, value: code } : { ok: false, reason: "offline" };
  } catch {
    return { ok: false, reason: "offline" };
  } finally {
    clearTimeout(timer);
  }
}

/** The game, key and player a moving code stands for (once). */
export async function redeemMove(code: string): Promise<BackupResult<{ gameId: string; navn: string; key: string; playerId: string }>> {
  if (!serverHttp) return { ok: false, reason: "offline" };
  try {
    const res = await fetch(`${serverHttp}/transfer/${encodeURIComponent(code)}`);
    if (res.status === 404) return { ok: false, reason: "missing" };
    if (!res.ok) return { ok: false, reason: "offline" };
    const v = (await res.json()) as { gameId?: unknown; navn?: unknown; key?: unknown; playerId?: unknown };
    if (typeof v.gameId !== "string" || typeof v.navn !== "string" || typeof v.key !== "string" || typeof v.playerId !== "string") return { ok: false, reason: "missing" };
    return { ok: true, value: { gameId: v.gameId, navn: v.navn, key: v.key, playerId: v.playerId } };
  } catch {
    return { ok: false, reason: "offline" };
  }
}

/**
 * Backs up this device's save (it's the source of truth; the copy lets a new device get
 * the player back). Plain HTTP, so any size of save goes: a websocket message has to stay
 * small. "missing" = the server has no such route (older than this): send it the old way.
 */
export async function putBackup(key: string, save: SaveData): Promise<BackupResult<string>> {
  if (!serverHttp) return { ok: false, reason: "offline" };
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 30_000);
  try {
    const res = await fetch(`${serverHttp}/backups/${encodeURIComponent(save.player.id)}`, {
      method: "PUT",
      headers: { "x-game-key": key, "content-type": "application/json" },
      body: JSON.stringify({ save }),
      signal: abort.signal,
    });
    if (res.status === 401) return { ok: false, reason: "code" };
    if (res.status === 404 || res.status === 405) return { ok: false, reason: "missing" };
    if (!res.ok) return { ok: false, reason: "offline" };
    const { savedAt } = (await res.json()) as { savedAt?: unknown };
    return typeof savedAt === "string" ? { ok: true, value: savedAt } : { ok: false, reason: "offline" };
  } catch {
    return { ok: false, reason: "offline" };
  } finally {
    clearTimeout(timer);
  }
}
