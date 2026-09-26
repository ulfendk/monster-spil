import { Client, type Room } from "colyseus.js";
import { LOBBY_ROOM } from "@shared";
import type { ClientMessages, LobbyJoinOptions, ServerMessages } from "@shared";

import { serverUrl } from "./server-url";

/** False in builds without a server (e.g. plain GitHub Pages) — the game stays purely solo. */
export const multiplayerEnabled = Boolean(serverUrl);

const CONNECT_TIMEOUT_MS = 8000;

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
export function listen<K extends keyof ServerMessages>(room: Room, type: K, handler: (payload: ServerMessages[K]) => void): () => void {
  return room.onMessage(type, handler);
}

export function say<K extends keyof ClientMessages>(room: Room, type: K, payload: ClientMessages[K]): void {
  room.send(type, payload);
}
