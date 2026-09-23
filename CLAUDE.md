# Monsterjagt

A Pokémon-style creature-collecting game built for a family — two kids (6 and 8)
and their dad — to play on iPad Safari and extend together over months. All
creatures, names and art are original (no Pokémon IP). This is a long-running
hobby project: optimise for easy extension by non-programmers, not feature count.

## Hard constraints (don't break these)

- **iPad Safari only**, landscape, touch-only. No keyboard/mouse assumptions.
- **PWA**: installable via Add to Home Screen, works fully offline for solo play.
- **UI language is Danish**, kept minimal (the 6-year-old reads little) — icons,
  colour and sound carry the core actions. Touch targets are ≥64px.
- **No third-party services.** The only network calls (Milestone 2+) go to our own
  self-hosted family game server. No ads, no tracking, no accounts. (A single
  shared family code gates the server; there are no per-person passwords.)
- **Each device's IndexedDB save is that player's source of truth.**

## Milestone status

Milestone 1 (solo MVP) is done: first-launch setup, starter pick, one area with
tap-to-move, random encounters, turn-based battles, catching, and the Monsterbog
collection screen. Deployed to GitHub Pages for solo/offline play.

Milestone 2 (family server) is built: a Colyseus lobby room, one-to-one creature
trading, a shared family code as the access gate, and a ghcr-published Docker
image. See "Family server (Milestone 2)" below. Not built yet: PvP (Milestone 3).
See "What Milestone 3 needs from `/shared`" for what NOT to break.

## Monorepo layout

```
shared/   Types, content (creatures/moves/areas as JSON), and the battle engine.
          Plain data + pure functions only — no DOM, no network, no Node-only APIs.
client/   Vite + TypeScript + Phaser 3.
server/   Node + TypeScript + Colyseus lobby/trading server (Milestone 2).
```

`shared` is consumed two ways: `client` imports it as TypeScript source directly
(via the `@shared` Vite alias, no build step in dev); `server` imports the
compiled `shared/dist` output, since it runs under plain Node.

## How to run

```
npm install
npm run dev -- --host      # client dev server, reachable over the home LAN
npm run typecheck          # tsc -b across all three packages
npm test                   # builds shared, runs shared/**/*.test.ts via node --test
npm run build              # production build of shared + client -> client/dist
```

`--host` is what lets an iPad on the same WiFi hit `https://<mac-ip>:5173`. Note
Safari requires HTTPS even in dev for service-worker registration and PWA-install
testing — see `docs/self-hosting.md` for HTTPS setup (Nginx Proxy Manager).

## Content format — adding a creature or area needs zero TypeScript changes

Creatures live in `shared/content/creatures/*.json`, one file per species, and are
picked up automatically by the client via `import.meta.glob` (see
`client/src/content/load-content.ts`) — dropping in a new JSON file is enough,
no code change required. This is the invariant to preserve: never make adding
content require touching a `.ts` file.

Creature JSON shape:
```json
{
  "id": "flammepels",
  "navn": "Flammepels",
  "type": "ild",
  "baseStats": { "hp": 38, "angreb": 13, "forsvar": 8, "fart": 12 },
  "moveIds": ["gloedslag", "kloer", "varmeboelge"],
  "spriteFront": "creatures/flammepels_front.png",
  "spriteBack": "creatures/flammepels_back.png",
  "catchRate": 0.45
}
```

Moves are one flat array in `shared/content/moves.json`, referenced by id from any
creature. Types are `ild | vand | graes | lyn | sten` (fire/water/grass/lightning/
stone), a 5-way single-cycle rock-paper-scissors table in
`shared/src/types/type-chart.ts`.

**Naming convention**: `id` fields (creature ids, move ids, the `TypeId` enum
values) are lowercase ASCII slugs — Danish æ/ø/å get transliterated to ae/oe/aa
(e.g. move id `"gloedslag"`). Every `navn`/display field uses correct Danish
orthography (e.g. that move displays as **"Glødslag"**). All content files are
UTF-8.

Areas are Tiled JSON exports (`shared/content/areas/<id>.json`, untouched by hand
after the initial export) plus a hand-written sidecar `<id>.meta.json` for game
logic Tiled can't express (encounter table, collision GIDs, spawn point). Never
put game logic inside the Tiled export itself — re-exporting a map from Tiled
must never clobber it. Milestone 1 ships exactly one area (`startskoven`), wired
up via a small manual registry in `client/src/content/load-areas.ts` rather than
a glob — switch that to glob-based auto-discovery once there are enough areas
that a manual list becomes impractical.

The image script mentioned in the original brief (`npm run add-creature <photo>` —
turns a photo of a kid's drawing into a cropped, background-removed sprite JSON
scaffold) is **not built yet**; the `add-creature` npm script is a documented stub.
Until then, new creatures use the placeholder-sprite pipeline below.

## Placeholder sprites

No real art exists yet. `client/src/gfx/placeholder-sprites.ts` draws a simple
original shape per species (a coloured blob + a type-coded accent icon) at boot
and bakes it into a texture keyed to `spriteFront`/`spriteBack`. Dropping a real
drawing in at that same texture key (i.e. shipping an actual PNG at that path)
needs **no code change** — the whole module is meant to be deleted once real art
exists for every creature.

## Battle engine contract (`shared/src/battle/`)

The engine is pure, deterministic functions over plain-data `BattleState` — this
is what lets the *same* code run client-side for solo wild battles now, and
server-authoritative for PvP in Milestone 3, without a rewrite. Rules to keep:

- **Never call `Math.random()`** inside `shared/battle` — RNG is always injected
  (`Rng` interface, `createRng(seed)` for a real seed). This is what will make
  server-authoritative resolution reproducible/auditable later.
- `BattleState` is plain serializable JSON — no class instances, no functions on
  it. Required for Colyseus state sync later and for saving mid-battle to
  IndexedDB.
- `resolveTurn(state, actions, rng)` takes an **array** of `{playerId, action}`,
  not two positional args — the same signature already covers "one human + a
  locally-computed AI action" (Milestone 1) and "two humans, one action each"
  (Milestone 3 PvP) with no signature change.
- `BattleLogEntry` carries a `kind` discriminant (plus optional `targetPlayerId`
  and `effectiveness`) so the UI picks the right animation/sound/feedback rather
  than parsing prose text.
- `participants[0]` is "the player", `participants[1]` is the opponent — that's
  what the asymmetric `"won" | "lost"` outcome values are relative to. Fine for
  Milestone 1's solo wild encounters; Milestone 3 PvP will need its own
  per-client interpretation of outcome (or a `winnerId` field) since there's no
  privileged side in a real PvP match.

## Save schema (`client/src/save/schema.ts`)

Native `indexedDB` (no `idb` dependency — see dependency policy). `SaveData` has
a `version` field from day one; bump it and write a migration on any breaking
schema change, never silently drop fields. `persist()` is called at explicit
checkpoints (setup complete, starter chosen, catch/battle end, area transition,
completed tap-to-move) — not on every tile step, to avoid IndexedDB thrash.

## Family server (Milestone 2)

`server/` is a Colyseus 0.16 server (pinned to 0.16 because `colyseus.js` — the
client SDK — tops out at 0.16; server and client must stay on the same line).
One room, `lobby` (`server/src/LobbyRoom.ts`), no schema state — plain messages
typed in `shared/src/trade/protocol.ts` (`ClientMessages` / `ServerMessages`).

- **Trading** is a pure state machine in `shared/src/trade/trade-session.ts`
  (invite → accept → each offers one creature → both confirm; changing an offer
  clears confirmations) plus `applyDelivery`, all covered by `node --test`. The
  server never owns creatures: on completion it sends each side a
  `tradeComplete` delivery (give `instanceId`, receive a `CreatureInstance` with
  `ownerId` rewritten), keeps it until the client `ack`s (after persisting), and
  re-sends on rejoin. `applyDelivery` is idempotent, so re-sends are harmless.
  Keep new trade logic pure and in `shared`.
- **Access = family code.** `FAMILY_CODE` env on the server; checked in
  `LobbyRoom.onAuth` via `FamilyGate` (constant-time compare, 5 wrong guesses per
  address per 10 min locks that address out). Rejection is `ServerError` code
  `FAMILY_CODE_REJECTED` (4401). The client asks for the code once (canvas
  screen with a DOM input) and keeps it in `localStorage` — not in the save. No
  accounts; the server does not verify creature contents (family-trust design).
- **Client** (`client/src/scenes/LobbyScene.ts`, `client/src/net/lobby.ts`): the
  🤝 button on the overworld only exists when the build has `VITE_SERVER_URL`
  (unset = solo-only build, so GitHub Pages stays fully offline-capable). The
  lobby connection lives only while the lobby overlay is open. A creature whose
  species the device doesn't know can't be confirmed; the last creature can't be
  traded away (battles use `creatures[0]`).
- **Deployment:** `server/Dockerfile` (build context = repo root) →
  `.github/workflows/publish-server.yml` publishes
  `ghcr.io/ulfendk/monsterjagt-server`; run it in Portainer behind Nginx Proxy
  Manager with **Websockets Support on**. Full steps in `docs/self-hosting.md`.
- **Manual testing without a second device:** two tabs in one Chrome window don't
  work (background tabs get frozen); drive the second player from a
  `colyseus.js` script, or use two real devices/windows.

## What Milestone 3 needs from `/shared` (don't design against this)

- **PvP** (M3) = the server collecting one real human action per connected player
  and calling the exact same `resolveTurn` used for solo battles today. The
  lobby room and `FamilyGate` already exist to hang matchmaking on.

## Dependency policy

Pre-approved: Phaser, Vite, TypeScript, Colyseus (server `@colyseus/core` +
`@colyseus/ws-transport` + `@colyseus/schema`, client `colyseus.js`), the
(not-yet-built) image script, and `vite-plugin-pwa` (added for PWA
manifest/service-worker generation).
**Ask before adding anything else.**

## Testing convention

`node --test` for everything in `shared` (battle engine, content loader) — pure
logic, no browser needed. For client UI work, a manual check at an iPad-sized
viewport (e.g. Safari responsive mode ~1024×768 landscape) before calling a
feature done; there's no automated UI test suite for `client` yet.

## Deployment

The client auto-deploys to GitHub Pages (`https://<user>.github.io/monster-spil/`)
on push to `main` via `.github/workflows/deploy.yml` — solo/offline play only.
`client/vite.config.ts`'s `base` must match the repo name for this to work. The
Colyseus server (Milestone 2+) is deployed separately, self-hosted — GitHub Pages
never serves it.
