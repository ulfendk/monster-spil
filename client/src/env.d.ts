/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** wss:// URL of the family game server; "/" = the server this page came from. Unset = solo-only build. */
  readonly VITE_SERVER_URL?: string;
  /** Set on the old GitHub Pages build once the game lives at a new address: it then only shows "the game has moved". */
  readonly VITE_MOVED_TO?: string;
}
