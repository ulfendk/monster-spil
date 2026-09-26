/**
 * Where the game server is. `VITE_SERVER_URL` at build time: unset = a solo-only build;
 * "/" = the server this page came from (the Docker image serves the game and the server
 * at one address); anything else = that address (e.g. wss://… for a GitHub Pages build).
 */
const configured = import.meta.env.VITE_SERVER_URL?.trim();

export const serverUrl: string | undefined = !configured
  ? undefined
  : configured === "/"
    ? `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`
    : configured;

/** The same server for plain HTTP (backups, adding a game, moving). */
export const serverHttp: string | undefined = serverUrl?.replace(/^ws/, "http").replace(/\/$/, "");
