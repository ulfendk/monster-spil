import { Client, type Room } from "colyseus.js";
import { LOBBY_ROOM } from "@shared";
import type { ClientMessages, LobbyJoinOptions, ServerMessages } from "@shared";

const serverUrl = import.meta.env.VITE_SERVER_URL;

/** False in builds without a server (e.g. plain GitHub Pages) — the game stays purely solo. */
export const multiplayerEnabled = Boolean(serverUrl);

const CONNECT_TIMEOUT_MS = 8000;
const CODE_KEY = "monsterjagt-familiekode";

/** The family code lives on the device (not in the save), entered once by a parent. */
export function getFamilyCode(): string | undefined {
  try {
    return localStorage.getItem(CODE_KEY) || undefined;
  } catch {
    return undefined;
  }
}

export function setFamilyCode(code: string | undefined): void {
  try {
    if (code) localStorage.setItem(CODE_KEY, code);
    else localStorage.removeItem(CODE_KEY);
  } catch {
    // Storage unavailable (private mode): the code just has to be entered again next time.
  }
}

export async function joinLobby(options: LobbyJoinOptions): Promise<Room> {
  if (!serverUrl) throw new Error("no server configured");
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), CONNECT_TIMEOUT_MS);
  });
  try {
    return await Promise.race([new Client(serverUrl).joinOrCreate(LOBBY_ROOM, options), timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

/** Typed wrappers so message names and payloads stay tied to the shared protocol. */
export function listen<K extends keyof ServerMessages>(room: Room, type: K, handler: (payload: ServerMessages[K]) => void): void {
  room.onMessage(type, handler);
}

export function say<K extends keyof ClientMessages>(room: Room, type: K, payload: ClientMessages[K]): void {
  room.send(type, payload);
}
