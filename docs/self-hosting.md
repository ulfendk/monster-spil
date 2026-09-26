# Self-hosting the family server

One small Node/Colyseus container is the **whole game**: it serves the game itself
(the PWA the iPads install) and runs everything multiplayer — the lobby, trading,
duels, the dragon, beasts, caves, disasters and the weekly scoreboard — at the same
address. One image, one deploy: the game and its server are always the same version.

```
iPad --https + wss--> Nginx Proxy Manager --http + ws--> monsterjagt-server container
```

The game used to be served from GitHub Pages, talking to this server from there. See
"6. Moving from GitHub Pages" for taking the family's devices along.

## Why HTTPS/WSS is required

The PWA (service worker, Add to Home Screen) and Safari on iPadOS need HTTPS,
and a page served over HTTPS can only open `wss://` connections. Nginx Proxy
Manager (NPM) terminates TLS; the container itself speaks plain HTTP/WS.

## 1. The image (GitHub Container Registry)

`.github/workflows/publish-server.yml` builds `server/Dockerfile` (amd64 + arm64)
and pushes `ghcr.io/ulfendk/monsterjagt-server` (tags `latest` and `sha-<commit>`)
on every push to `main` that touches `server/`, `shared/` or `client/` (the image builds
the game too, with `VITE_BASE=/` and `VITE_SERVER_URL=/` = "the server this page came
from", and serves it from `client/dist`; set `CLIENT_DIR` to serve another build). You can also run it
by hand from the Actions tab.

Packages are **private** by default. Either:
- make the package public (GitHub → your profile → Packages → monsterjagt-server →
  Package settings → Change visibility) — safe, the image contains no secrets; or
- keep it private and add a registry in Portainer (Registries → Add registry →
  GitHub/Custom, `ghcr.io`, your username, a personal access token with
  `read:packages`).

## 2. Games and spilnøgler

One server can host **several games** — say, the family and a school class. Each
game is its own world with its own players, monsters, scoreboard, dragon and
backups; nothing crosses between games. A child can play several games on one
iPad/iPhone and picks one when the app starts.

Every game has a **spilnøgle** (game key). The server refuses anyone without the
right key, so outsiders can't get in even if they find the URL.

- **Games are made in the admin portal** (`ADMIN_PASSWORD`, see below): *Nyt spil*,
  a name and a key. *Lav en nøgle* suggests one that's easy to type on an iPad, like
  `modig-ugle-472`. Hand the key to the people who should play that game (a friend's
  parents, say).
- **On the device:** the game list → ＋ → type the key. The key is remembered on
  that device.
- Keys ignore upper/lower case and spaces around them, are 6–40 characters, and
  must be different for each game.
- **Changing a key** (admin portal) sends everyone playing that game right now back
  to the key screen; they type the new key. Other games aren't touched.
- Wrong guesses are counted per client address, across all games: after 5 within 10
  minutes that address is refused — even with a right key — until the window
  passes. (If you lock yourself out, wait 10 minutes or restart the container.)
- A key is not tied to any person and there are no accounts. Anyone who has it can
  join that game, so treat it like the Wi-Fi password and change it if it leaks.

**Upgrading from a server with one family:** set nothing new. On its first start
the new server turns `family.json` and `saves/` into the game **"Familien"** with
your old `FAMILY_CODE` as its key, and devices that played before land in that
game with the code they already have. After that `FAMILY_CODE` is no longer used
(keys live in `/data/games.json` and are changed in the admin portal) — you can
remove it once you have `ADMIN_PASSWORD` set. A brand-new server needs
`ADMIN_PASSWORD` (or `FAMILY_CODE`, which then creates "Familien"); in production
it **refuses to start** with neither, since nobody could ever join.

This is a family-trust design: the server does not verify creatures (each device
is the source of truth), it only makes sure that only people you gave a key to can
reach a game.

## 3. Portainer stack

Stacks → Add stack → paste:

```yaml
services:
  monsterjagt-server:
    image: ghcr.io/ulfendk/monsterjagt-server:latest
    container_name: monsterjagt-server
    restart: unless-stopped
    environment:
      # The parent's admin portal at https://<your server>/admin, where games and their
      # spilnøgler are made. Use a password the kids don't know (never a spilnøgle).
      ADMIN_PASSWORD: "<a password only the parents know>"
      # Only for upgrading an old one-family server: its family code becomes the key of
      # the game "Familien" on first start (ignored after that; you can then remove it).
      # FAMILY_CODE: "<your old family code>"
      # Optional: only let browsers from the client's site call the matchmaking endpoint.
      # ALLOWED_ORIGINS: "https://ulfendk.github.io"
    volumes:
      # The games and, per game, its scoreboard, dragon, rewards and save backups (plain JSON).
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

**The `/data` volume** holds `games.json` (every game: name, key) and a folder per
game in `games/<id>/`: `saves/` — a backup copy of every player's save, so a
reinstalled or new iPad/iPhone can get its player back (add the game with its key →
🔄 "Hent min spiller" → pick the player) — and `game.json`: the last week's
scoreboard events, everyone who has joined (so offline players stay on the board),
this week's dragon, baby-dragon rewards not yet delivered and names changed in the
admin portal that a device hasn't picked up yet. Without the volume the
server still runs, but all of that resets whenever the container is recreated
(e.g. on every *Pull and redeploy*). Back it up if you like — it is plain JSON.

Find the network name with `docker network ls` (or in Portainer → Networks). To
update later: Portainer → the stack → *Pull and redeploy*.

Building locally instead: `server/docker-compose.yml` does the same with
`build:`; run `ADMIN_PASSWORD=… docker compose up -d --build` in `server/`.

`ALLOWED_ORIGINS` (comma-separated) is only a browser-side courtesy — non-browser
clients ignore CORS. The spilnøgler are what actually keep people out.

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

The game is served by the server itself, so it simply talks to the address it came from
— open `https://monster.example.com` on the iPad and Add to Home Screen. Nothing to set.

Other builds read the server address at **build time** from `VITE_SERVER_URL`:

- **GitHub Pages** (the old home of the game; still built on every push): repo Settings →
  Secrets and variables → Actions → *Variables* → `VITE_SERVER_URL` = `wss://monster.example.com`.
  Without the variable the build is solo-only (no ⚙ button, no connection).
- **Local dev:** `VITE_SERVER_URL=ws://localhost:2567 npm run dev`, and start the
  server with `npm run build:server && FAMILY_CODE=test ADMIN_PASSWORD=admin npm start -w server`
  (FAMILY_CODE makes a first game, "Familien", with the key `test`)
  (or `npm run dev -w server`).

## 6. Moving from GitHub Pages

Each device keeps its saves in the browser, per address, so at the new address an iPad
starts empty. The old Pages app can take everyone along in one tap:

1. Deploy the new image and check that `https://monster.example.com` opens the game.
2. In the repo: Settings → Secrets and variables → Actions → *Variables* → add
   `VITE_MOVED_TO` = `https://monster.example.com/`, then run the *Deploy to GitHub
   Pages* workflow (Actions tab → Run workflow).
3. On each iPad, open the old app (it updates itself on the next start or two). It now
   only says **"Spillet er flyttet!"** with the new address and a big **Flyt med**
   button. Tapping it sends each game's save to the server (it becomes that player's
   backup), gets a one-time code per game (valid 15 minutes, once), and opens the new
   address with the codes; the new app adds the games with their spilnøgler and restores
   the players — same player, same monsters, same place on the map.
4. At the new address: Share → Add to Home Screen, and delete the old icon.

If a device is offline when the button is tapped, nothing is lost: it says so and can
try again. A device that can't use the button can still get its player back the old
way: add the game with its spilnøgle at the new address and tap 🔄.

`scripts/e2e-move.mjs` checks the codes and the serving against a running image.

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
- **Food** (🍎🍓🍌🥕🍇) grows on the map and is shared: whoever steps on it first
  gets it, and it grows back after 3 minutes. It is kept in server memory only (a
  restart just grows a fresh crop). Players eat it to recover faster after their
  monster faints. Needs this server version or newer (protocol v6).
- **The scoreboard** (🏆) shows the last 7 days: catches (1 point, reported by the
  device — offline catches count once it reconnects), duels won (2), dragon
  victories (5, +3 for the final blow).
- **Never remove the app from the Home Screen without a backup.** Removing a Home
  Screen app deletes its saved game. Check ⚙ on that device first: it shows
  "💾 Gemt på serveren" with the time of the last backup. With a backup, removing
  and re-adding the app (e.g. to get a new icon) is safe: restore via 🔄 on the first
  setup screen. Updates never need a reinstall — the app updates itself.
- If a restored player is still being played on the old device too, both devices
  back up to the same player and the most recent save wins. Restore onto a device
  that replaces the old one, not alongside it.
- **Admin portal** (`https://<your server>/admin`, only when `ADMIN_PASSWORD` is
  set): make games and see their keys; rename a game, change its key or delete it
  (its players, points, dragon and backups on the server — the game stays on the
  devices). Per game: see every player (figure, last seen, backup, points, online),
  rename a player (their device takes the new name the next time it is online),
  download a player's backup or all of them, delete a player (their points, backup
  and unclaimed rewards on the server — the game on their device is untouched), wake
  the dragon with full HP / set its HP / put it to sleep (no rewards), and clear
  the week's points. Logging in gives a 12-hour session; wrong passwords are
  counted separately from the game keys (5 per 10 minutes per address).
- **The roaming dragon** (admin portal → *Dragen*, per game): it flies to a new place on
  the map now and then (default every 6 hours on average, with some randomness; a
  new week's dragon wakes in its own cave). Change the pace, stop the flying, or send it
  flying now. It never takes off while someone is fighting it or a disaster is on its
  way, and it can't be fought until it has landed. Resetting its HP leaves it where it is.
- **Natural disasters** (admin portal → *Naturkatastrofer*, per game): meteors,
  earthquakes, floods, hurricanes, dragon fire and a very rare UFO change the map over
  time. Choose how often on average (from every 15 minutes to once a week) and how
  random, which kinds may happen, start one now, stop them, heal the soft damage at once,
  or reset the map. They happen even while nobody plays; the next time a child opens
  the game the map has changed (and a note says what happened). It goes through the
  same Nginx Proxy Manager host as the game — nothing else to set up.
