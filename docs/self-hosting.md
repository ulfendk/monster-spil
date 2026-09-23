# Self-hosting (stub — fleshed out in Milestone 2)

This is a placeholder for the Milestone 2+ server deployment guide. Captured
here now so the requirement isn't lost: see [CLAUDE.md](../CLAUDE.md#what-milestone-23-need-from-shared-dont-design-against-this).

## Why HTTPS/WSS is required

Both the PWA (service worker registration, Add to Home Screen) and Safari on
iPadOS require the page to be served over HTTPS — including for the WebSocket
connection the client will use to talk to the family game server in Milestone 2.
Plain HTTP/WS will not work for real devices, only for `localhost` during dev.

## Planned approach

- **Server**: `server/Dockerfile` (currently a stub) will build a real image for
  the Colyseus server, run on the home server.
- **Reverse proxy**: put the server behind one of:
  - **Caddy** — automatic HTTPS via Let's Encrypt, simplest for a server with a
    real domain name pointed at the home network.
  - **Tailscale** — no public domain or port-forwarding needed; devices join a
    private mesh network and get HTTPS via Tailscale's own certs. Better fit if
    the family doesn't want to expose anything to the public internet at all.
- **Client**: still deployed separately to GitHub Pages (see
  [CLAUDE.md](../CLAUDE.md#deployment)) for solo/offline play — the reverse proxy
  above is only for the multiplayer server, not the static client.

## Local dev HTTPS

`npm run dev -- --host` serves plain HTTP, which is enough for Vite's dev
reload but **not** enough to test service-worker registration or PWA install
from another device (like an iPad) on the LAN. Options once that's needed:
`vite-plugin-mkcert` for a locally-trusted dev certificate, or point Caddy at
the dev server.

This file will be replaced with real setup steps once the Milestone 2 server
exists.
