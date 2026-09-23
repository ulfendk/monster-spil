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
  self-hosted family game server. No ads, no tracking, no accounts/passwords.
- **Each device's IndexedDB save is that player's source of truth.**

## Milestone status

Milestone 1 (solo MVP) is done: first-launch setup, starter pick, one area with
tap-to-move, random encounters, turn-based battles, catching, and the Monsterbog
collection screen. Deployed to GitHub Pages for solo/offline play.

Not built yet: the server (Milestone 2 — lobby, trading) and PvP (Milestone 3).
See "What Milestone 2/3 need from `/shared`" below for what NOT to break.

## Monorepo layout

```
shared/   Types, content (creatures/moves/areas as JSON), and the battle engine.
          Plain data + pure functions only — no DOM, no network, no Node-only APIs.
client/   Vite + TypeScript + Phaser 3. The only thing built for Milestone 1.
server/   Node + TypeScript + Colyseus. Currently a stub; real work starts in M2.
```

`shared` is consumed two ways: `client` imports it as TypeScript source directly
(via the `@shared` Vite alias, no build step in dev); `server` will import the
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
testing — see `docs/self-hosting.md` for HTTPS setup (Caddy or Tailscale).

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

## What Milestone 2/3 need from `/shared` (don't design against this)

- **Trading** (M2) = moving a `CreatureInstance` between two players' `creatures[]`
  arrays by `instanceId`. That's already the unit of ownership (`ownerId` field),
  so this should be additive, not a rewrite.
- **PvP** (M3) = the server collecting one real human action per connected player
  and calling the exact same `resolveTurn` used for solo battles today.
- **Server Docker image**: `server/Dockerfile` is currently a stub. Milestone 2
  work should make it a real image, deployable behind an HTTPS/WSS reverse proxy
  (Caddy or Tailscale — see `docs/self-hosting.md`), since PWA + Safari require
  HTTPS/WSS even for the self-hosted multiplayer server.

## Dependency policy

Pre-approved: Phaser, Vite, TypeScript, Colyseus, the (not-yet-built) image
script, and `vite-plugin-pwa` (added for PWA manifest/service-worker generation).
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
