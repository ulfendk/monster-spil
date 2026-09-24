# Self-hosting the family server

The multiplayer server (lobby, trading, duels, the family dragon and the weekly scoreboard) is a small Node/Colyseus container.
Solo play never needs it — the client only connects (and shows the ⚙ button) when
it was built with a server URL. Players on the same server see each other walking
around the shared map and can trade or duel when they stand next to each other.

```
iPad (GitHub Pages client) --wss--> Nginx Proxy Manager --ws--> monsterjagt-server container
```

## Why HTTPS/WSS is required

The PWA (service worker, Add to Home Screen) and Safari on iPadOS need HTTPS,
and a page served over HTTPS can only open `wss://` connections. Nginx Proxy
Manager (NPM) terminates TLS; the container itself speaks plain HTTP/WS.

## 1. The image (GitHub Container Registry)

`.github/workflows/publish-server.yml` builds `server/Dockerfile` (amd64 + arm64)
and pushes `ghcr.io/ulfendk/monsterjagt-server` (tags `latest` and `sha-<commit>`)
on every push to `main` that touches `server/` or `shared/`. You can also run it
by hand from the Actions tab.

Packages are **private** by default. Either:
- make the package public (GitHub → your profile → Packages → monsterjagt-server →
  Package settings → Change visibility) — safe, the image contains no secrets; or
- keep it private and add a registry in Portainer (Registries → Add registry →
  GitHub/Custom, `ghcr.io`, your username, a personal access token with
  `read:packages`).

## 2. The family code

The server refuses every join without the shared **family code**, so outsiders
can't get in even if they find the URL.

- Choose a code (a short passphrase, not something guessable) and set it as
  `FAMILY_CODE` on the container. In production (the Docker image) the server
  **refuses to start** without it and logs `FAMILY_CODE is not set`, so a
  forgotten variable shows up as a crash-looping container instead of an open
  server. Outside production (local dev) it starts open and logs a warning.
- The first time a device taps ⚙ (it shows 🔑 until a code is stored) it asks for
  the code. A parent types it once; it is remembered on that device. If the code
  changes or is wrong, the device asks again. To type a different code on
  purpose, tap the 🔑 button at the bottom-left of the ⚙ screen; the old code
  stays until a new one is entered, so backing out with ✕ changes nothing.
- Wrong guesses are counted per client address: after 5 within 10 minutes that
  address is refused — even with the right code — until the window passes. (If
  you lock yourself out, wait 10 minutes or restart the container.)
- The code is not tied to any person and there are no accounts. Anyone who has
  it can join, so treat it like the Wi-Fi password and change it if it leaks.

This is a family-trust design: the server does not verify creatures (each device
is the source of truth), it only makes sure that only people you gave the code
to can reach it.

## 3. Portainer stack

Stacks → Add stack → paste:

```yaml
services:
  monsterjagt-server:
    image: ghcr.io/ulfendk/monsterjagt-server:latest
    container_name: monsterjagt-server
    restart: unless-stopped
    environment:
      FAMILY_CODE: "<your family code>"
      # Optional: only let browsers from the client's site call the matchmaking endpoint.
      # ALLOWED_ORIGINS: "https://ulfendk.github.io"
    volumes:
      # The weekly scoreboard, the dragon's HP and unclaimed rewards (one small JSON file).
      - monsterjagt-data:/data
    networks:
      - proxy

volumes:
  monsterjagt-data:

networks:
  proxy:
    external: true
    name: npm_default # the Docker network your Nginx Proxy Manager container is on
```

**The `/data` volume** holds `family.json`: the last week's scoreboard events,
everyone who has joined (so offline family members stay on the board), this week's
dragon and any baby-dragon rewards not yet delivered. Without the volume the
server still runs, but all of that resets whenever the container is recreated
(e.g. on every *Pull and redeploy*). Back it up if you like — it is plain JSON.

Find the network name with `docker network ls` (or in Portainer → Networks). To
update later: Portainer → the stack → *Pull and redeploy*.

Building locally instead: `server/docker-compose.yml` does the same with
`build:`; run `FAMILY_CODE=… docker compose up -d --build` in `server/`.

`ALLOWED_ORIGINS` (comma-separated) is only a browser-side courtesy — non-browser
clients ignore CORS. The family code is what actually keeps people out.

## 4. Nginx Proxy Manager

Add a **Proxy Host**:

| Field | Value |
| --- | --- |
| Domain Names | e.g. `monster.example.com` |
| Scheme / Forward Host / Port | `http` / `monsterjagt-server` / `2567` |
| **Websockets Support** | **on** (required — without it the lobby never connects) |
| SSL tab | Request a Let's Encrypt certificate, Force SSL, HTTP/2 |

If lobby connections drop while idle, add to the host's *Advanced* tab:

```
proxy_read_timeout 3600s;
proxy_send_timeout 3600s;
```

Certificates: with a public domain the normal HTTP challenge works. If the name
only resolves inside your LAN, use the DNS challenge instead.

Health check (used by the container's `HEALTHCHECK`): `GET /health` → `ok`.

## 5. Pointing the client at the server

The client reads the server address at **build time** from `VITE_SERVER_URL`.

- **GitHub Pages:** repo Settings → Secrets and variables → Actions → *Variables* →
  add `VITE_SERVER_URL` = `wss://monster.example.com`. The deploy workflow passes
  it to the build. Without the variable the build is solo-only (no ⚙ button, no connection).
- **Local dev:** `VITE_SERVER_URL=ws://localhost:2567 npm run dev`, and start the
  server with `npm run build:server && FAMILY_CODE=test npm start -w server`
  (or `npm run dev -w server`).

## Local dev HTTPS

`npm run dev -- --host` serves plain HTTP, which is enough for Vite's dev reload
but **not** for testing service-worker registration or PWA install from another
device (like an iPad) on the LAN. Options: `vite-plugin-mkcert` for a locally
trusted dev certificate, or put the dev server behind NPM too.

## Limits to know about

- Open trades live in server memory; a restart cancels them (nothing has moved
  until a trade completes).
- A finished trade is held until each device acknowledges it, and re-sent when a
  device rejoins, so a dropped connection mid-trade can't lose or duplicate a
  monster.
- Devices must run compatible content: a monster whose species one device
  doesn't know can't be traded to it (the ✓ stays disabled). Update both devices.
- Duels (⚔️) are server-authoritative but live only in server memory: a restart
  ends any duel in progress, and nobody's save changes either way (HP is full at
  the start, nothing is won or lost).
- A player who disconnects mid-duel forfeits. A player who doesn't pick a move
  within 30 seconds is skipped for that turn; two skipped turns in a row is a
  forfeit. Behind a proxy, keep the read/send timeouts generous (see above), or
  an idle connection is dropped and counts as leaving.
- The server sends its protocol version when a device joins. An updated app
  talking to an **older server image** shows "Serveren skal opdateres for at
  kæmpe" and hides ⚔️, but trading keeps working. Fix: pull the latest
  `monsterjagt-server` image in Portainer and redeploy.
- Both devices should run the same content version. The server takes each
  player's creature, species and moves from their device (it has no content
  files) and clamps the numbers, so it cannot check them against the real
  content; this fits the family-trust design.
- **Upgrade order matters for protocol changes:** deploy the new server image
  first, then the client. A device on an older client keeps working for solo
  play, but its lobby-style invites are refused (it doesn't send positions); the
  app reloads itself when it opens or returns to the foreground with an update
  ready, so it catches up on its own.
- Positions are held in server memory only: a restart empties the map until
  clients reconnect (they do so automatically, retrying every 3–30 seconds).
- **The family dragon** wakes every Monday at 00:00 Danish time with full HP. Each
  attempt is fought on the server; damage comes off one shared HP pool. After an
  attempt a player rests 60 seconds. When the family beats it, everyone who hurt
  it that week gets a Drageunge (delivered on their next connect if offline). Its
  stats, HP, rest time and lair are in `shared/content/raid/kaempedragen.json`;
  another JSON file there adds a second boss, and the bosses take turns weekly.
  Players can also **team up**: one gathers a team at the lair, others join, and
  every monster gets +25% HP per extra player (at most double). Needs this server
  version or newer (protocol v5); older servers just don't offer 👥⚔️.
- **The scoreboard** (🏆) shows the last 7 days: catches (1 point, reported by the
  device — offline catches count once it reconnects), duels won (2), dragon
  victories (5, +3 for the final blow).
