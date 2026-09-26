import { fetchBackup, redeemMove, sendMove } from "../net/backup";
import { readRecord, writeRecords } from "./db";
import { addGame, listGames, saveKey } from "./games";
import type { SaveData } from "./schema";

/**
 * Moving the game to a new address (e.g. from GitHub Pages to the family server itself).
 * A device's saves live in the browser, per address, so they can't simply follow: the old
 * app sends each online game's save to the server and gets a one-time code for it, then
 * opens the new address with the codes in the #fragment (never sent to any server); the
 * new app redeems them, adds the games with their spilnøgler and restores the players.
 */

/** The new address, on an old build that should only point there (VITE_MOVED_TO). */
export const movedTo: string | undefined = import.meta.env.VITE_MOVED_TO?.trim() || undefined;

const HASH = "#flyt=";
/** Set when players arrived in this start-up: the map says welcome once. */
let arrivedNote = false;

/** True once after a move brought players in (the map shows a welcome). */
export function takeArrivalNote(): boolean {
  const was = arrivedNote;
  arrivedNote = false;
  return was;
}

/** Old app: one code per online game on this device. Undefined if any failed (offline, say): try again. */
export async function prepareMove(): Promise<string[] | undefined> {
  const codes: string[] = [];
  for (const game of listGames()) {
    if (!game.online || !game.key) continue;
    const save = await readRecord<SaveData>(saveKey(game.id));
    if (!save) continue; // never set up here: nothing to bring
    const sent = await sendMove(game.key, save);
    if (!sent.ok) return undefined;
    codes.push(sent.value);
  }
  return codes;
}

/** Where the old app sends the device: the new address, with the codes. */
export function moveUrl(codes: string[]): string {
  const base = movedTo!.replace(/#.*$/, "");
  return codes.length ? `${base}${HASH}${codes.map(encodeURIComponent).join(",")}` : base;
}

/**
 * New app, at start: brings in the games from a move, if the address came with codes.
 * Returns how many players arrived. The codes are taken off the address either way, so a
 * reload doesn't try them again.
 */
export async function arriveFromMove(): Promise<number> {
  if (!location.hash.startsWith(HASH)) return 0;
  const codes = location.hash.slice(HASH.length).split(",").map(decodeURIComponent).filter(Boolean);
  history.replaceState(null, "", location.pathname + location.search);
  let arrived = 0;
  for (const code of codes) {
    const move = await redeemMove(code);
    if (!move.ok) continue;
    const backup = await fetchBackup(move.value.key, move.value.playerId);
    if (!backup.ok) continue;
    await addGame({ id: move.value.gameId, navn: move.value.navn, online: true, key: move.value.key, lastPlayedAt: new Date().toISOString() });
    await writeRecords({ [saveKey(move.value.gameId)]: backup.value });
    arrived++;
  }
  arrivedNote = arrived > 0;
  return arrived;
}
