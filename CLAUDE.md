# Monsterjagt

A Pokémon-style creature-collecting game built for a family — two kids (6 and 8)
and their dad — to play on iPad and iPhone Safari and extend together over months. All
creatures, names and art are original (no Pokémon IP). This is a long-running
hobby project: optimise for easy extension by non-programmers, not feature count.

## Hard constraints (don't break these)

- **iPad and iPhone Safari**, portrait and landscape, touch-only. No keyboard/mouse
  assumptions. Every screen must work from a ~390×844 phone to a 1024×1366 iPad in
  both orientations, and re-lay itself out when the device is rotated (see "Screen
  layout").
- **PWA**: installable via Add to Home Screen, works fully offline for solo play.
- **UI language is Danish**, kept minimal (the 6-year-old reads little) — icons,
  colour and sound carry the core actions. Touch targets are ≥64px.
- **No third-party services.** The only network calls (Milestone 2+) go to our own
  self-hosted family game server. No ads, no tracking, no accounts. (Each game on
  the server has one shared spilnøgle; there are no per-person passwords.)
- **Each device's IndexedDB save is that player's source of truth.**

## Milestone status

Milestone 1 (solo MVP) is done: first-launch setup, starter pick, one area with
tap-to-move, random encounters, turn-based battles, catching, and the Monsterbog
collection screen. Deployed to GitHub Pages for solo/offline play.

Milestone 2 (family server) is built: a Colyseus lobby room, one-to-one creature
trading, a shared family code as the access gate, and a ghcr-published Docker
image. See "Family server (Milestone 2)" below.

Milestone 3 (PvP duels) is built and tested against a local server with scripted
clients, but **not yet on real iPads**. See "PvP duels (Milestone 3)" below.

Since then: a shared 160×120 world where players see each other, a weekly family
dragon raid, visiting sand serpents and giant eagles, caves with a 3D ball-throwing
minigame, player levels and badges, a weekly scoreboard, an overview map, save backups,
a parent's admin portal and several games per server, monsters that evolve, and a castle with a picture quest in every world (sections below). Ideas not yet scheduled live
in `docs/backlog.md`.

## Monorepo layout

```
shared/   Types, content (creatures/moves/areas as JSON), and the battle engine.
          Plain data + pure functions only — no DOM, no network, no Node-only APIs.
client/   Vite + TypeScript + Phaser 3.
server/   Node + TypeScript + Colyseus server: lobby, trading, duels, dragon raid, scoreboard.
```

`shared` is consumed two ways: `client` imports it as TypeScript source directly
(via the `@shared` Vite alias, no build step in dev); `server` imports the
compiled `shared/dist` output, since it runs under plain Node.

## How to run

```
npm install
npm run dev -- --host      # client dev server, reachable over the home LAN
npm run typecheck          # tsc -b across all three packages
npm test                   # builds shared + server, runs their *.test.ts via node --test
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
  "sound": "creatures/flammepels.wav",
  "catchRate": 0.45
}
```

`sound` is optional (wav, mp3 or m4a — the formats iPad Safari plays); without it
the game plays a short type-pitched blip. **Pictures and sounds are drop-in:** put
the files in `shared/content/creatures/` and name them in the JSON with the same
relative path. `client/src/content/load-assets.ts` globs them at build time and
`PreloadScene` loads whichever exist, so no TypeScript changes are needed. Every monster
has a voice of its own: a few hand-made cries in `scripts/generate-creature-sounds.mjs` (the
first monsters, the dragon's baby, the disasters' monsters), the rest from
`scripts/generate-monster-voices.mjs` (`scripts/lib/voice.mjs`) — a short call of
"syllables" whose pitch comes from the monster's size (big ones rumble, small ones squeak),
its pace from speed, its mood from attack against defence (fierce ones growl), its texture
from its type (fire crackles, water bloops and bubbles, grass breathes and trills, lightning
buzzes and zaps, stone rumbles) and its tune and vowels from its id. Replace a file to give
a monster a recorded voice.

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
logic Tiled can't express (encounter table, collision GIDs, spawn point). A big map has
**regions**: `regions` in the sidecar lists parts of the map (rectangles of tiles) with
their own encounter tables — Startskoven has Hjertelandet, Storsøen, Sandklitterne,
Højfjeldet, Dybskoven and Nordengene; tall grass in none of them uses the area's own
`encounterTable` (the meadows in the middle and south). The first region a tile lies in wins (`shared/src/world/regions.ts`, tested); the
monster book's hint points to the nearest tall grass where the monster lives. A test checks
every region has tall grass and only known monsters, and another that every monster can be
found somewhere (wild, caves, digging, disasters, or as a reward or starter). Never
put game logic inside the Tiled export itself — re-exporting a map from Tiled
must never clobber it. Every area (world) in `shared/content/areas/` is found by
`client/src/content/load-areas.ts` with `import.meta.glob` (and read by the server at
runtime): adding a world is adding its map, tileset and sidecar — see "Worlds".

**No more drawing import.** The photo-to-monster pipeline (`add-creature`) is gone; the one
monster made that way, Flammeskæl (`ildflagrer`), is now a 3D model made by hand after the
drawing (`client/src/cave/handmade/flammeskael.ts`; the original photo is kept in
`docs/drawings/`). A PNG dropped in at a species' `spriteFront` path still shows (scenes size
it with `spriteFit`, `client/src/gfx/creature-sprite.ts`), but new monsters are meant to be
game-drawn models.

## Monsters in 3D

- **In the 3D scenes (battles, catching, caves) and on the 3D map, a monster the game draws
  itself is a 3D model** (`client/src/cave/monster-model.ts`, `buildMonsterModel`), made
  after its placeholder picture: the body shaped by its stats, a lighter belly, feet, a
  kawaii face (eyes with a glint, cheeks, a smile, a fang for strong attackers), its type's
  head feature (flame crest, wave scales, leaves and a bud, zigzag horns, a rocky cap), a
  tail, little arms and toed feet, and (by species, from its id) pointed, round or no ears;
  the body is fuller at the bottom; dragons get wings and horns, serpents coils and a hood,
  eagles spread wings. An ink outline (the back faces of a slightly bigger copy) keeps the
  woodblock look. Built in the picture's 128-px box, so it takes exactly the place a picture
  sprite of the same size would.
- **Monsters light themselves** (`monsterMaterial`): whatever the scene's lights, a key light
  from the upper left in front, a soft-edged two-tone shadow side, edges darkening towards the
  silhouette, shaded undersides and a sky rim — worked out in perceived brightness, so even a
  bright red body reads as round. `setMonsterEnvironment(colour, strength)` tints it for the
  place (a cave: dimmer and tinted by its glow); `ThrowStage`, the garden and the map reset it
  to daylight, and a stage's `destroy` does too.
- **Handmade models:** `HANDMADE` in `monster-model.ts` maps a species id to its own builder
  (`client/src/cave/handmade/`); it returns its face switch, a `seat` (where a rider sits) and
  an optional `tick(seconds)` for movements of its own (Flammeskæl's wings beat and flames
  flicker), which the stages, the garden and the map call every frame.
- `placeholderSpec(key)` (`gfx/placeholder-sprites.ts`) knows which textures were drawn by the
  game; only those become models (a dropped-in PNG stays a picture). Rare variants recolour
  a model's parts (`variantColour`).
- **In the stages** (`ThrowStage`): `LivingMonster.sprite` is the sprite or the model's root
  and `model` the model; `setFace` (a blink closes the eyes, a cry opens the mouth),
  `setTint`, `setOpacity` and `setTilt` work on either. Models turn to face the camera — my
  monster in a battle faces the wild one (`lookAt`), so you see its back and tail. On the map
  (`Map3D`) the dragon, visiting beasts and waiting monsters stand as models turned to the
  camera.
- **The 2D screens show the models too** (the monster book, a monster's page, the starter
  pick, trades, rewards, the cave summary): after start-up `bakeMonsterPictures`
  (`client/src/cave/model-snapshots.ts`) renders each drawn monster from its model — front,
  back, eyes shut, mouth open — and paints it into the placeholder's own canvas texture (same
  key, same size), a few milliseconds per frame in the background; a picture already on
  screen turns 3D where it stands, and nothing waits for it. Rare variants' recoloured
  pictures are made again afterwards (`picturesChanged`). Dropped-in PNGs are left alone.
- **Every battle is in the 3D meadow** — wild ones, duels, the dragon and beasts (drawn 1.5×)
  and team fights. `BattleScene.showTurn` plays any turn one entry at a time (the server's
  turns in duels, raids and teams, the device's own in the wild); in a team fight a teammate
  isn't on the stage, so their blow lands on the boss (`BattleStage.struck`). A duel or team
  fight opens over the meeting screen and the map: its canvas goes right under Phaser's, and
  the scenes underneath are hidden while it runs.

## Placeholder sprites

No real art exists yet. `client/src/gfx/placeholder-sprites.ts` draws a simple
original shape per species (a coloured blob + a type-coded accent icon) at boot
and bakes it into a texture keyed to `spriteFront`/`spriteBack`, but only when no
real picture was loaded for that key. Dropping a PNG into `shared/content/creatures/`
at the path named in the JSON needs **no code change** (see "Content format") — the
whole module is meant to be deleted once real art exists for every creature.

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
  what the asymmetric `"won" | "lost"` values of `outcome` are relative to. For
  anything that isn't slot-relative (PvP) read `winnerId` or call
  `outcomeFor(state, playerId)`. `BattleState.mode` is `"wild"` (catching allowed)
  or `"pvp"` (`catch` is ignored, `flee` is a forfeit that gives the other side
  the win). Turns resolve one side after the other, so a double KO can't happen.

## Save schema (`client/src/save/schema.ts`)

Native `indexedDB` (no `idb` dependency — see dependency policy). `caughtCounts`
(times each species was caught in the wild) sits beside `creatures[]` (what is owned
now) so the monster book can show both; older saves get it filled in on load
(`normalise` in `game-state.ts`) rather than through a version bump. `SaveData` has
a `version` field from day one; bump it and write a migration on any breaking
schema change, never silently drop fields. `persist()` is called at explicit
checkpoints (setup complete, starter chosen, catch/battle end, area transition,
the player stopping after a walk) — not on every tile step, to avoid IndexedDB thrash.

## Family server (Milestone 2)

`server/` is a Colyseus 0.16 server (pinned to 0.16 because `colyseus.js` — the
client SDK — tops out at 0.16; server and client must stay on the same line).
One room type, `lobby` (`server/src/LobbyRoom.ts`) — one room per game, see "Several
games" — with no schema state: plain messages typed in
`shared/src/trade/protocol.ts` (`ClientMessages` / `ServerMessages`).

- **Trading** is a pure state machine in `shared/src/trade/trade-session.ts`
  (invite → accept → each offers one creature → both confirm; changing an offer
  clears confirmations) plus `applyDelivery`, all covered by `node --test`. The
  server never owns creatures: on completion it sends each side a
  `tradeComplete` delivery (give `instanceId`, receive a `CreatureInstance` with
  `ownerId` rewritten), keeps it until the client `ack`s (after persisting), and
  re-sends on rejoin. `applyDelivery` is idempotent, so re-sends are harmless.
  Keep new trade logic pure and in `shared`.
- **Access = the game's spilnøgle** (see "Several games"). Checked in
  `LobbyRoom.onAuth` through one shared `KeyGate` (`server/src/key-gate.ts`:
  constant-time compare, 5 wrong guesses per address per 10 min lock that address
  out — across all games). Rejection is `ServerError` code `GAME_KEY_REJECTED`
  (4401). No accounts; the server does not verify creature contents (family-trust
  design).
- **Client** (`client/src/net/presence.ts`, `client/src/net/lobby.ts`): multiplayer
  only exists when the build has `VITE_SERVER_URL` (unset = solo-only build, so
  GitHub Pages stays fully offline-capable). See "Shared world" below for how
  the connection is used. A creature whose species the device doesn't know can't
  be confirmed; the last creature can't be traded away (battles use `creatures[0]`).
- **Deployment:** `server/Dockerfile` (build context = repo root) →
  `.github/workflows/publish-server.yml` publishes
  `ghcr.io/ulfendk/monsterjagt-server`; run it in Portainer behind Nginx Proxy
  Manager with **Websockets Support on**. Full steps in `docs/self-hosting.md`.
- **Manual testing without a second device:** two tabs in one Chrome window don't
  work (background tabs get frozen); drive the second player from a
  `colyseus.js` script, or use two real devices/windows.

## PvP duels (Milestone 3)

- **Same lobby room, no new room.** Tapping a player next to you on the map offers
  🤝 trade or ⚔️ duel (see "Shared world"). Messages `duelInvite/duelAccept/duelAction/duelCancel` (client) and
  `duel/duelEnded/hello` (server) are typed in `shared/src/trade/protocol.ts`.
- **The state machine is pure and lives in `shared/src/duel/duel-session.ts`**
  (invite → accept → both answer → `resolveTurn` → repeat). The server
  (`LobbyRoom`) only owns timers and connections: 30 s per turn, two silent
  turns in a row or a disconnect = forfeit. Each turn's RNG is derived from
  `battle.seed` and the turn number, so a session stays plain data and is
  replayable. `duelView()` is what clients get — it never contains the
  opponent's pending choice.
- **The server has no content files**, so each client sends its first creature
  plus species and moves as a "seat"; `sanitizeSeat` (`shared/src/duel/sanitize.ts`)
  rebuilds it from known fields, clamps the numbers and starts HP full. Duels
  never change anyone's save.
- **Client:** `InteractScene` launches `BattleScene` on top (and must call
  `scene.bringToTop("Battle")`: scenes draw in registration order) with
  `data.duel`; `BattleScene` then registers its own listeners on the room, sends
  `duelAction`, and resumes `InteractScene` when it ends. Wild battles are
  unchanged.
- **Version handshake:** the server sends `hello { protocolVersion }` on join
  (`PROTOCOL_VERSION` in the protocol file; bump it on incompatible changes). A
  client that gets no `hello` within 3 s assumes an older server, shows a Danish
  "server needs updating" note and hides ⚔️ — trading still works.

## Rare variants

- **Now and then a wild monster is a rare variant** — golden, dark, snow-white, colourful,
  giant or tiny (`shared/content/variants.json`: `chance` that one is a variant at all, then
  each kind by weight, and its `look`: `hue`/`hueTo`, `saturation`/`minSaturation`,
  `lighten`, `darken`, `tint` (a palette name), `size`, `sparkle`). Only the look changes; it
  fights like any other. Pure rules (tested) in `shared/src/creature/variants.ts`
  (`rollVariant`, `variantName` → "Gylden Mosmus").
- **The caught monster keeps it**: `CreatureInstance.variant` (optional; the server's
  `cleanCreature` and the duel `sanitizeSeat` let a slug through), so it's saved, traded and
  shown in duels. Rolled in `OverworldScene.startWildBattle` (wild, dug up, the UFO's alien)
  and per cave monster from the visit's seed (`CaveScene`; caves show colours, not sizes).
- **Pictures:** `pictureKey(scene, key, variant)` (`client/src/gfx/variants.ts`) bakes the
  variant's picture from the monster's own (a drawing or a placeholder) on first use — the
  ink outlines stay ink — and its face frames the same way; `variantScale`, `variantSparkles`
  for size and twinkling (`StageMonster.scale`/`sparkly` in the 3D scenes). Battles (2D and
  3D), catching, caves, trades, the monster book (a sparkle on the ring) and the monster's
  page (a row of the rare ones I have) all show them.
- Catching one: extra XP (`xp.variant`) and the counter `variant` (badges Sjældent fund,
  Sjældenhedsjæger).

## Potions and other items

- **Things to find on the map and use in battles** (`shared/content/items.json`): Styrkedrik
  (moves 1.5× as strong for 3 moves), Sigtefjer (moves never miss for 3 moves), Lykkekløver
  (one double-strong move), Helbredsdrik (heals half the HP). About one per `tilesPerItem`
  open tiles lies on each map, in spots that change every day (Danish midnight) — the same for
  everyone that day — and each is picked up once per day per device by walking onto it
  (`SaveData.items`, `itemsTaken`); at most `maxCarried` of a kind. All on the device: no
  server, works offline. Pure rules (tested) in `shared/src/world/items.ts`.
- **In a wild battle** a bag button ("Ting") opens the items I carry; using one takes the turn.
  The engine's `{kind: "item", navn, effect}` action (tested) heals at once or sets
  `BattleParticipant.boost` ({power, accuracy, moves}), which works on the next moves and wears
  off. Duels, the dragon and team fights have no items (their turns are the server's, and it
  only accepts moves and fleeing). A monster using one glows golden in 3D (`BattleStage.powerUp`).
- On the 3D map items are models like the food (flasks, a feather, a clover). Picking one up
  gives a little XP and counts for the badge Skattefinder.

## Evolution, bond and the monster garden

- **Monsters evolve through 1–3 stages.** A species names its later stages in its JSON
  (`"evolutions": ["Mosrotte", "Moskonge"]`; none = it doesn't evolve). The stage lives on the
  monster (`CreatureInstance.stage`, 1 by default); each stage above the first adds
  `statBonusPerStage` to all stats and fights under the stage's name (`makeParticipant`). In 3D
  a later stage is richer in colour with a bigger crest and a chest mark, and at stage 3 a
  mantle and a golden crown (`MonsterModelSpec.stage`). Trades and duels keep the stage.
- **Bond** (`CreatureInstance.bond`) grows from care in the garden — petting and playing (a few
  times a day each, `care`), feeding (a piece of food from the bag) — and from wild battles won
  with it. With `bondToEvolve[stage-1]` it can evolve. Numbers in `shared/content/nurture.json`,
  rules tested in `shared/src/creature/evolution.ts`.
- **The monster garden** (`GardenScene` over `cave/garden-stage.ts`, from the garden button on
  the left of the map): my monsters wander a sunny 3D garden (eight at a time, pages for more).
  Tap one to bring it forward: its stage's name, stars for the stage, hearts towards the next,
  and Klap / Fodr / Leg / Udvikl (when ready: it spins in a burst of light into its next stage)
  / Kæmper (makes it the monster that fights first). Evolving gives XP, the badge Monsterven
  and, at 10, a trophy.

## Castles and their picture quests

- **One castle per world** (`shared/content/castles.json`: name, quest, three guardians
  `{speciesId, stage}`, rewards `{eggs, items, xp}`); where it stands is `castle {x, y}` in
  the world's `.meta.json`, written by `scripts/place-castles.mjs` (open ground with open
  ground all round, reachable, off roads, away from the start and the links). The tile is
  blocked; the map draws the `castle` icon, which the 3D map shows as a castle model
  (`food-models.ts`, in `STILL_MODELS` so it doesn't bob or turn).
- **The key is a quest told in pictures:** find e.g. three lanterns and two bells
  (`lantern`, `bell`, `fan`, `shell` and `crystal` icons, with 3D models) lying about that
  world. `questSpots` (pure, tested, `shared/src/world/castles.ts`) seeds them from the world
  id over the map *as first drawn* (`baseOpen`, taken before disasters are applied), so they
  never move; a spot a disaster blocked is shown on the nearest free tile. The chip over the
  castle shows each thing with ● found / ○ still missing, then 🔑 ✓; they're on the overview
  map too (`MinimapDot.icon`). Progress is `SaveData.castles[worldId] = {found, beaten, done}`.
- **Inside** (`CastleScene`, entered with the key from the castle's popup): three gates, a
  sword on the next one. A guardian is a wild battle at its stage (`BattleSceneData.castle`,
  scene `borg`, no catching; potions allowed). Winning goes back to the gates (`beaten`+1,
  event `guardian`); a beaten guardian stays beaten; fainting means passing out on the map.
  All three beaten opens the chest: eggs (as many as the nest holds), items (past the usual
  bag limit), XP (event `castle`), and the last guardian's kind joins you in rare colours.
  Badges `borgvogter`, `borgherre`; trophy `trofae-borge` (all four castles).

## Riding monsters (protocol v15)

- **Some monsters can be ridden:** `"ride"` in the species JSON names how it moves
  (`shared/src/creature/riding.ts`: `waddle` — also what `true` means — `stomp` for the bears
  and trolls, `bound` for the deer, goat and stone buck, `slither` for the serpent's baby,
  `glide` for the lava snail, `fly` for the dragon's and eagle's babies, Svanefjer and
  Flammeskæl). In the garden such a monster gets a **Rid** button (**Stå af** to get off) that
  makes it `SaveData.mount` and sets `riding`; a saddle button then appears on the left of the
  map (under the garden) to hop on and off. Each gait has its pace, `RIDE_STEP_TIME` (a snail
  1.35× a walking step, flying 0.85×). A test checks every `ride` is a known gait.
- **Looks that go with it** (species JSON, drawn by `monster-model.ts`): `"wings": "bat" |
  "feather"` (dragons and eagles have theirs anyway) and `"shell": true` (a spiral shell on
  the back; the rider sits on it).
- **In 3D** (`Map3D`, the avatar hint's `mount: {key, gait, variant, stage}`): the monster's
  model (built with `pose: "ride"` — a serpent then stretches out long: a hooded head, banded
  segments, a flicking tongue) stands under the figure (`MOUNT_SCALE`), and
  `world3d/mount-gaits.ts` (`RideAnimator`) moves it through its **rig** (`MountRig` on the
  model: pivots for body, feet, arms, tail, wings, a snake's spine and head). Paced by
  distance, not time, so feet never skate: waddling and stomping step foot to foot with sway,
  arm swing and tail wag (stomps squash on landing and raise dust); bounds crouch, spring nose
  up with feet tucked and land nose down in dust; a snake's S-curve runs from head to tail,
  the head steady and looking along it; a snail stretches and pulls, leaving a fading shiny
  trail; fliers rise with strong wing beats (a gust ring at take-off and landing), lean in,
  bank into turns and glide down to land, wings folding and fluttering at rest. The rider sits
  on the body (or the snake's second segment), so they move with it; a ridden monster turns
  more slowly and casts a bigger shadow that shrinks as it flies up. A handmade model's own
  wing flapping stands aside while a gait drives its wings (`userData.driven`).
- **Everyone sees it:** the profile (`profileOf` → `ridingOn(save)`) carries `mount
  {speciesId, variant?, stage?}`; the server cleans it (`cleanMount`: slugs, stage 2–3),
  keeps it on `LobbyPlayer.mount` and drops it when a profile comes without one (got off).
  Getting on or off calls `profileChanged()` (`progress/record.ts`). A monster traded away
  can't be ridden (`ridingOn` checks it's still mine).

## Trophies and monster eggs

- **Trophies** are the big moments: badges with a `trophy` model in `badges.json` (the week's
  dragon, 40 species, all worlds, 10 duel wins, 5 hatched eggs, level 20, 10 rare variants).
  They're earned, celebrated and sent to the server like any badge, but kept off the badge
  wall: the profile's 🏆 button opens `TrophyScene` — gold 3D models on shelves
  (`cave/trophy-models.ts`, rendered from all round into textures; tap one to spin it), dark
  shapes for those still to win. Anyone's trophy room opens from their profile.
- **Monster eggs** (`shared/content/eggs.json`, rules tested in `shared/src/creature/eggs.ts`):
  found when digging (a dig reward `egg`) and one a day on every map (`eggSpot`, beside the
  items), kept in a nest of `nestSize` (`SaveData.eggs`), and hatched by walking —
  `stepsToHatch` steps (`OverworldScene.warmEggs`). The colour tells the type; the monster
  inside (from the type's pool, maybe a rare variant — likelier than in the wild) is decided
  when it's found and shown when it hatches (`HatchScene`: wobble, cracks, a flash, the
  monster pops out and cries). The profile's 🥚 button opens `NestScene` (the eggs, cracked
  as far as they've come, steps left). A hatched monster counts like a catch, plus `hatch`
  XP and the badge Æggepasser. The dragon's and beasts' rewards are still babies.

## Monster book

`MonsterbogScene` shows every species: caught ones with 🔴 times caught and 🎒 owned
now, seen-only ones as a silhouette, unknown ones as "?". Unknown monsters that live
in the current area's encounter table also show "👣 steps + arrow" to the nearest
encounter-zone tile (pure logic in `shared/src/world/hint.ts`); starters, which live
nowhere in the wild, get no hint. Tapping a known monster opens `MonsterInfoScene`
(stats, moves, counters, and its cry — `playCreatureSound`), launched over the book.
There the monster is alive (`bringToLife` in `client/src/gfx/monster-life.ts`, reusable
for any monster picture): it breathes from its feet, sways as it looks about, blinks,
now and then hops or wiggles, and cries with its mouth open when the page opens and when
it (or 🔊) is tapped. Blinking and the open mouth use the cave's face frames, so a real
picture (a kid's drawing) breathes and moves but doesn't blink.

## Shared world

- **One big map, seen by everyone.** `startskoven` is 160×120 tiles, generated by
  `scripts/generate-startskoven.mjs` (deterministic; once someone edits the map in
  Tiled, stop running the script and treat the Tiled file as the source of truth).
  The first 64×48 world (the "heartland") sits unchanged in the north-west corner —
  same seed, same coordinates, gates cut through its old east and south border — so
  saved positions, the dragon's perch and stored disaster changes stayed valid. The
  new lands (own seed) add Storsøen with an island and a river, Højfjeldet, the deep
  forest Dybskoven and meadows; sand (tile 14: the dunes Sandklitterne in the north-east
  and Storsøen's beaches) is painted last with its own seed, so it never shifts the rest. Anything that loops over every tile on the server
  (connectivity checks, food spots) must stay cheap: 19,200 tiles, often once per
  disaster tile.
  The overworld camera follows the player; HUD buttons and popups are top-level
  objects with `setScrollFactor(0)` — never nest interactive children in a
  scroll-factor-0 container, taps hit-test wrongly while the camera is scrolled.
- **`client/src/net/presence.ts` owns the server connection for the whole session**
  (connects to the current game when its key is stored, reconnects quietly, works
  offline). It holds the other players and their positions, the current
  trade/duel invite, and applies finished trades to the save wherever the player
  is. Scenes listen to `presence.events`; nothing there draws.
- **Protocol v3:** clients send `move {areaId,x,y}` as each step of a walk starts
  and `away {away}` (true during a wild battle); the server broadcasts
  `players` (full list) and `playerMoved` (delta). Positions are sanitized to
  whole numbers. `PROTOCOL_VERSION` is announced in `hello`; a v3 client with an
  older server shows "Serveren skal opdateres" in ⚙ and no other players.
- **Meeting rule:** trade and duel invites are refused by the *server* unless both
  players are within one tile (`isAdjacent` in `shared/src/world/adjacency.ts`,
  diagonals count), same area, and neither is busy or away. Tapping a player next
  to you shows the 🤝/⚔️ popup; tapping one further away walks you next to them
  first. Incoming invites open `InteractScene` over the map; ⚙ (`SettingsScene`)
  shows the game, the connection, the 🔑 spilnøgle entry and the button to switch games.
- **Testing without a second device:** `scripts/e2e-lobby.mjs` drives scripted
  players against a running server. For real rendering, two headless Chromium
  instances with separate profiles (remote debugging) give genuinely separate
  saves; the Claude-in-Chrome window is often `hidden` and never renders frames.

## Worlds

- **Four worlds, each its own map:** Startskoven (160×120) and, beyond it, Kirsebærøen (an
  island in bloom), Snedalen (a snowy valley) and Ildbjerget (ash, lava and a volcano), 64×48
  each. They're joined by **row boats, tunnels and a bridge**: `links` in each map's sidecar
  (`{id, kind: boat|tunnel|bridge, x, y, to: {areaId, link}}`), one at each end. Step onto a
  dock (tunnel mouth, bridge) — or tap it — and a popup offers the trip; a short journey
  (the screen goes dark while the boat rows across) and the overworld restarts in the other
  world, standing at the other end, with "Velkommen til …".
- **Level locks:** `shared/content/worlds.json` lists the worlds (name, icon, place on the
  world map, `minLevel`: Kirsebærøen 3, Snedalen 5, Ildbjerget 8). Too early, the dock's label
  and popup show the star and the level. Pure rules (tested) in `shared/src/world/worlds.ts`
  (`linkAt`, `linkTarget`, `canEnterWorld`); tests check every link has a matching way back
  and can be walked to without tall grass, and every world is listed.
- **Made by a script:** `scripts/generate-worlds.mjs` (seeded) writes each new world's Tiled
  map, its tileset (the same 16 tiles in the world's colours: `scripts/lib/tileset.mjs`,
  shared with the Startskoven script, takes a palette) and its sidecar, and finds spots on
  Startskoven for its dock, tunnel mouth and bridge (writing only its sidecar's `links`). A
  world's sidecar also has its `scene` (where battles there take place), its encounter
  table and `look3d` (the 3D map's trees — pine, sakura, snowPine, deadPine — peaks — snow,
  volcano — and sky/mist colours). Some monsters live only in a new world (the monster book
  shows that world's icon).
- **The world map** (`WorldMapScene`, from the globe button on the open overview map):
  worlds as islands joined by dashed trails with a boat/tunnel/bridge on each, "?" for those
  not visited yet (with the level they open at), my figure where I am and dots for the
  family by world.
- **Exploring counts:** travel events give XP (`xp.travel`, and `xp.newWorld` for a first
  visit) and counters `travel`, `boat`/`tunnel`/`bridge`, `world:<id>` and `worlds` (worlds
  discovered), with badges for them.
- **Server:** every map is loaded (food grows in every world; disasters strike in any).
  The weekly dragon stays on its own map (everyone can reach it). Beasts and caves turn up
  in a world where someone is (a player, or the dragon's map), so they're met.
- Each world's map and tileset are cached under their own keys (`area-map-<id>`,
  `area-tileset-<id>`, the minimap `minimap-<id>`).

## Family dragon and scoreboard (protocol v4)

- **Pure rules in `shared/src/raid/raid.ts`** (week id in Danish time, shared-HP
  turns, final blow, contributors) and `shared/src/score/scoreboard.ts` (rolling
  7-day rows, `SCORE_POINTS`). The server only stores and calls them.
- **Boss content** is `shared/content/raid/<id>.json` (stats, its own moves, HP,
  lair position, reward species, rest seconds). The server reads these at runtime
  (`server/src/bosses.ts`; the Dockerfile copies the folder), one boss per week in
  rotation. The client globs the same files for sprites, cries and the map marker.
  The reward species (`drageunge`) is an ordinary creature file, never in any
  encounter table; the monster book shows 🐉 for it instead of a distance hint.
- **Persistence:** `server/src/game-store.ts` keeps each game's
  `DATA_DIR/games/<gameId>/game.json` (`/data` in Docker — mount a volume): known
  players, score events (pruned after 8 days), the raid, rewards until the device
  sends `rewardAck`, and pending renames. Writes are debounced and atomic; an
  unwritable directory is logged, not fatal.
- **Catches are reported by the device**: a wild catch is queued in
  `SaveData.pendingScore` (so offline catches count later) and sent as
  `scoreReport`; the server dedupes by event id and acks every well-formed id.
- **Client:** `presence` holds `raid` and applies `reward`s like trade deliveries.
  The dragon sits on its lair tile (blocked for walking) in `OverworldScene`;
  tapping it walks you next to it and offers ⚔️. `BattleScene` has a third mode,
  `raid`, driven by `presence` messages. 🏆 opens `ScoreboardScene`.
- **Testing:** `scripts/e2e-raid.mjs` (needs a server with a fresh `DATA_DIR`,
  since it beats the dragon) covers the whole raid, rewards, scores and a won duel.

### A roaming dragon (protocol v10)

- **The dragon flies to new perches now and then.** `RaidState.lair` is where it sits
  now (absent = the boss's home lair from its JSON; a new week's dragon wakes at home).
  `RaidView.lair` tells clients; older servers have no `lair`, so clients fall back to the
  boss's home lair. Everything that used `boss.lair` (walking blocked, meeting rule,
  dragon fire, food) now uses the current perch.
- **Pure rules** (tested) in `shared/src/raid/roam.ts`: `RoamSettings` (on/off, average
  minutes 5 min–1 week, randomness), `nextRoamAt`, and `chooseLair`: plain open ground (no
  path, tall grass, water or trees; disaster changes count), at least 7 free neighbours (room
  for a team), away from the start and a good way from the old perch (a preference,
  relaxed if nothing fits), never on a player or a waiting monster, and never one that
  would cut the map in two.
- **Server:** `server/src/dragon-roam.ts` (`DragonRoam`, one per game's room) keeps
  the schedule in the game store (`roam`) and flies when due — but not while it sleeps,
  while anyone fights it or a team gathers, or a disaster is on its way (then it
  retries after 30 s). `LobbyRoom.dragonFlew` stores the perch, clears food from the
  tile, sends `dragonFlight {from,to,ms}` then the new raid view, and for 5 s
  (`FLIGHT_MS`) `dragonRefusal` says "dragon flying". The admin portal's dragon
  actions: `roam` (settings) and `fly` (now); "reset HP" keeps the perch.
  `scripts/e2e-roam.mjs` covers it.
- **Client:** `OverworldScene.onDragonFlight` animates take-off, an arc with a growing
  shadow and a landing shake; `syncDragon` places it without animation if the device
  didn't see it fly, and a player who is under where it lands is moved to the nearest
  free tile (`ensureFreeTile`).

### Visiting beasts: sand serpents and giant eagles (protocol v11)

- **Fought exactly like the dragon** — alone or as a team, shared HP, everyone who hurt
  one gets a baby of its kind (`slangeunge`, `oerneunge`: ordinary creature files, in no
  encounter table) — but they **come and go**: each kind turns up about every hour (the
  parent's average ± randomness, counted from when the last one left), stays 15 minutes,
  and leaves; never while someone fights it, while a team that is only *gathering* is
  sent home (`teamEnded` reason `"gone"`). A beaten one is gone at once. 250 HP.
- **Content:** `shared/content/beasts/<id>.json` — a boss (stats, own moves, reward
  species, rest seconds) plus `habitat`: `"sand"` (rises from sand tiles) or `"forest"`
  (lands on open ground with ≥3 trees around it). Adding a kind is adding a file; the
  server reads the folder at runtime (the Dockerfile copies it), the client globs it.
- **Pure rules** (tested) in `shared/src/raid/beasts.ts`: settings, `nextBeastAt`,
  `habitatTile`, `chooseBeastSpot` (its habitat, room for a small team, away from the
  start, never on or next to players/the dragon/other beasts, never cutting the map),
  `freshBeast`, `beastView`. `raid.ts` and `team.ts` work on any `FightBoss`/`FightState`,
  so solo attempts and teams are the same code for the dragon and the beasts.
- **Server:** `server/src/beast-visits.ts` (`BeastVisits`, one per game's room; state in
  the game store's `beasts`). `LobbyRoom` keys fights by target: `raidBattles` hold a
  `targetId`, `teams` is one team per boss (`"dragon"` or the beast's id). The dragon's
  messages are unchanged; beasts add `targetId` to `raidStart`/`teamCreate` and to
  `raidBattle`/`TeamView`, and the server sends `beasts` (all of them) on join and on
  every change. Score: kind `"beast"`, 3 points (+2 final blow), counted in the
  scoreboard's big-beast column. Admin portal: on/off, how often, how long they stay,
  randomness, call one now, send one away.
- **Client:** `client/src/gfx/beast-layer.ts` draws them (a serpent rises out of the sand
  in a spray of grains and sinks back; an eagle swoops down with a growing shadow and flies
  off), blocks their tile, and gives the overworld the beast under a tap; the popup is the
  dragon's (⚔️, 👥⚔️ or ✓ to join). Placeholder looks: `serpent` and `eagle` in
  `placeholder-sprites.ts`, icons `serpent`/`eagle` (`BEAST_ICONS` by habitat) on the
  overview map, in the monster book (for the babies) and on the reward screen.
  `scripts/e2e-beasts.mjs` covers it end to end.
- **Testing in Chrome:** the Claude-in-Chrome window renders no animation frames; step the
  game by hand (`__game.step(t, 16)` in a loop) to play tweens through.

### Caves: a 3D minigame (protocol v12)

- **Caves come and go** in the mountains (online games only): about every hour one
  opens in a mountain face you can walk up to and stays 20 minutes (the parent's
  settings in the admin portal: on/off, how often, how long, randomness, open now, close).
  The mouth stays a mountain tile, so walking and connectivity never change. Each player
  can go in **once per opening**.
- **Inside**, the device runs the minigame: monsters peek out from behind boulders (at
  most two at a time), sometimes scamper to another boulder, and you shoot balls at them
  with **crosshairs and a trigger** (see "Crosshairs and trigger" below). A hit rolls `caveCatchChance`
  (catchRate, better near the middle); a catch goes into the save exactly like a wild
  catch (caughtCounts, pendingScore → scoreboard). 10 balls, 5 monsters per visit.
- **Kinds of caves:** each opening is one kind, picked by weight when it opens (stored as
  `CaveState.kind`; older caves without one count as the first kind): Krystalgrotten,
  Isgrotten, Lavagrotten, Svampegrotten, Vandgrotten. A kind has its own residents and its
  own `look` — wall/floor/fog/glow colours as Kanagawa palette *names*, a `decor`
  (crystals, icicles, lava, mushrooms, pool) and `particles` (none, snow, embers, spores,
  drips); the mouth on the map glows in its first glow colour. Boulders are laid out from
  the visit's seed (`caveRocks`: 4–6, spread out, one close by, all within the reachable
  `ROCK_AREA`). The admin portal can open a particular kind.
- **Content:** `shared/content/caves.json` (balls, monsters per visit, the kinds); the
  cave-only species (`glimtorm`, `dryppesten`, `hulepadde`, `istap`, `gloedklump`,
  `svampling`) are ordinary creature files in no encounter table; the monster book shows a
  cave icon for them. A new kind can reuse the decor and particle shapes with no code
  change. The server reads caves.json at runtime (the Dockerfile copies it).
- **Little animations:** monsters breathe, look about while peeking, blink, sometimes cry
  out (mouth open, their sound plays) as they pop up, and jump when a ball lands near
  them. Blinking and crying need face frames, which `placeholder-sprites.ts` bakes
  (`faceFrameKey(front, "blink" | "talk")`) only for monsters it draws itself — a real
  picture doesn't say where its eyes and mouth are, so it breathes and moves but doesn't blink.
- **Pure rules** (tested): `shared/src/cave/caves.ts` (settings, schedule, `caveMouthTile`,
  `chooseCaveSpot`, `planCaveVisit`) and `shared/src/cave/throw.ts` (`aimToThrow`,
  `ballAt`, `landingTime`, hit precision, catch chance — a test checks every place a
  monster can peek out can be hit by aiming at it).
- **Server:** `server/src/cave-openings.ts` (`CaveOpenings`, one open cave at a time;
  state in the game store's `caves`). `caveEnter {caveId}` (must stand next to it) →
  `caveVisit {caveId, kind, seed, speciesIds, balls}`; `caves` goes to everyone on join and
  every change; problems `cave closed` / `cave visited`.
- **Client:** `client/src/gfx/cave-layer.ts` draws the mouth (rocks tumble out as it
  opens, it shrinks shut when it closes); `CaveScene` is the Phaser side (HUD, the crosshairs,
  catching, saving) over `client/src/cave/cave-stage.ts`, the **three.js** scene (rock
  dome, stalactites, glowing crystals, boulders, sprites made from the monsters' own
  textures, a temari ball). three.js is loaded with a dynamic import only when entering
  a cave (its own chunk, still precached for offline). It renders into a canvas *under*
  Phaser's: the Phaser game is `transparent: true` (the page behind is the same ink), and
  `index.html` layers `#game > canvas.cave-stage` below Phaser's canvas.
  `scripts/e2e-caves.mjs` covers the server side.
- **Testing in Chrome:** step the 3D scene by hand like the game (`__cave.stage.tick(dt)`,
  yielding between frames so the catch animation's awaits run); `__cave.aimAndFire(x, y)`
  throws.

### Wild battles and catching in 3D

- **A wild battle happens in a sunny meadow** (`client/src/cave/battle-stage.ts`, on
  `meadow-stage.ts`: sky, a red rising sun, hills, pines, susuki in a breeze): the wild
  monster stands in the grass, mine (its back picture) close in front. `BattleScene` loads
  three.js when a battle opens and draws only its HUD on top: health bars on ink cards
  in the free corners (the wild one's top left, mine bottom right), the message on an ink
  card above the buttons. `BattleStage.resize(w, h, band)` picks the narrowest camera view
  that fits both monsters in the strip above the message and centres them there, with the
  monsters standing closer together on tall screens — so every screen shape works. Without
  WebGL or the 3D chunk it's 2D (the 2D pictures wait while it loads, then show if it failed).
- **A turn plays out one thing at a time** (`presentTurn3d`): each move's missile flies by
  its type (fire: a fireball trailing embers, water: a string of droplets, grass: whirling
  leaves, lightning: a bolt from the sky, stone: lobbed rocks); weak stone moves (power ≤ 30:
  a claw, a bite, a tail, a headbutt — `BattleScene.isCloseMove`) dash in instead. The health
  bar drops on impact, the one hit flashes red and shakes (a strong hit shakes the camera),
  a miss flies past and the target jumps aside, one who faints sinks into the grass. The
  engine's `damage`/`miss` log entries carry `moveId` for this.
- **Catching happens in the same meadow**: `CatchScene` gets the battle's stage
  (`CatchSceneData.stage`), my monster steps aside, the wild one starts shifting about and the
  crosshairs come up; you get **one** ball. A miss uses the turn ("Bolden ramte ikke!", log
  kind `catch-miss`); a hit lets the engine roll the catch, and the ball glows or bursts
  open accordingly. Not caught: the next ball is simply ready — keep throwing, or go back with
  the "Tilbage" button in the corner (there all along). Each failed throw counts as a battle
  turn right away (`CatchSceneData.again`; a catch turn has no counter-attack), so going back
  uses no further turn (`done()` without a throw). Without a 3D battle, `CatchScene` opens its own `MeadowStage`.
- **Scenes:** a wild battle (and its catching) takes place in a scene that fits where you
  stand — the meadow, Dybskoven's forest glade, Storsøen's shore, Højfjeldet's mountains,
  Sandklitterne's dunes, and snow, volcano and cherry-blossom scenes for other worlds.
  `shared/content/scenes.json` holds each look: sky/fog/ground/hills/sun colours by palette
  name, `light` and `lightTint`, fog distances, `decor` (pines, susuki, water, reeds, rocks,
  peaks, dunes, bamboo, sakura, snowPines, lava, mushrooms, ferns) and `particles` (snow,
  petals, embers, leaves). A map region (or a whole map) names its `scene` in the area's
  `.meta.json`; `sceneAt` (`shared/src/world/scenes.ts`, tested) picks it and
  `OverworldScene.startWildBattle` passes it on (`BattleSceneData.scene`). The shapes are
  drawn by `client/src/cave/scenery.ts`, always clear of where the monsters stand and of the
  view of them; a new scene can mix them freely with no code change.
- **The engine decides** (`shared/src/battle/engine.ts`): the catch action carries
  `throw?: {hit:false} | {hit:true, precision}`; a hit's chance is the old one ×
  `catchBonus(precision)` (0.8 at the edge, 1.2 dead centre, exactly 1 at 0.5 — so a catch
  without a throw is unchanged). Every catch — here and in the caves — is also ×`CATCH_EASE` (1.3,
  `shared/src/battle/catch.ts`): one number to make catching easier or harder for everyone. `BattleScene.performCatch` works the turn out when the
  ball hits (`wildTurn`) so the animation knows the result, and shows it (`presentTurn`)
  when the battle wakes. Without WebGL the old 2D throw is used.
- **The 3D code is shared:** `client/src/cave/throw-stage.ts` (`ThrowStage`: renderer,
  camera and its framing (`resize` with an optional band, `project` to place the HUD over
  the scene), aiming and the temari ball, its flight and hit test, the catch
  animation, living monsters — breathing, blinking, crying, startled jumps — and the tick
  loop); `CaveStage`, `MeadowStage` and `BattleStage` add their scenery and say where
  monsters are and how they move. `destroy()` also gives the WebGL context back (iPad Safari
  allows only a few).
- **Testing in headless Chromium:** in dev builds `window.__battle` is the battle scene
  (`performTurn({kind:"move", moveId})`, `performCatch()`) and `window.__catch` the catch
  scene (`aimAndFire(x, y)`).

### Crosshairs and trigger

- **Caves and catching throw with crosshairs and a trigger**: put a finger on the screen and
  the crosshairs sit a little above it (so the finger never hides what you aim at), follow it
  and stay where it lifts; the big round trigger (bottom right) throws. The ball flies in an
  arc to exactly the point under the crosshairs — a monster there, else the ground — and
  white dots in the scene show the arc while you aim. Something standing still is hit by
  aiming well; something moving has moved on by the time the ball arrives, so timing counts.
- **Pure rule** (tested): `aimToThrow(target)` in `shared/src/cave/throw.ts` (the flight takes
  0.5–1.2 s, longer further away); tests check it lands on the target and that every place a
  cave or meadow monster shows itself can be hit. `client/src/ui/aim-input.ts` (`AimInput`)
  draws the crosshairs and the trigger for any scene; `ThrowStage.aimAt`/`throwAt` find the
  point under them (a raycast) and throw. On a tall screen the camera looks down from higher
  up and further forward, scaled by how tall the screen is (`ThrowStage.resize`), and the
  picture moves until the ball in the hand sits near the bottom — on a phone and an iPad
  standing up alike; the meadow uses a narrower view than the caves (`sideView`).

### Minigames: working the land (protocol v14)

- **Tap a tree, water or a mountain next to you** (further away: you walk over first) for a
  big button that starts its game: **chopping** (`ChopGame`: tap while the swinging marker is
  in the green, three good chops fell it), **swimming** (`SwimGame`: tap as the ring meets the
  circle; misses tire you) and **climbing** (`ClimbGame`: tap the glowing handholds before
  your strength runs out). A **shovel button** (bottom right) shows only where you can dig
  (plain ground or sand, no tall grass): **digging** (`DigGame`: tap fast). All in
  `client/src/scenes/minigames/`, sharing `Minigame` (backdrop, hint below the ✕ row, ✕ to
  give up, a result, back to the paused map); played by tapping only, restarting on rotation.
- **What they do:** a felled tree leaves a walkable **stump** (tile 15) that grows back into a
  tree after `cut.regrowHours`; a **hole** (tile 16) fills in after `dig.healHours` and turns
  up food (into the bag), a gem (XP), a monster (a wild battle — `dig.monsters`, or
  `dig.sandMonsters` when dug in sand; Gravling, Rodnisse and the dune monsters live there) or
  nothing (`dig.rewards` by weight); swimming and climbing carry you straight across to the
  first walkable tile beyond (at most `swim.maxTiles` / `climb.maxTiles`). All numbers in
  `shared/content/minigames.json`. Each earns XP and counts for a badge (Skovhugger,
  Svømmer, Bjergbestiger, Skattejæger).
- **Pure rules** (tested) in `shared/src/world/work.ts`: `canCut`, `canDig`, `applyCut`,
  `applyDig`, `crossTarget`, `pickDigReward`. Healing (`healTerrain`) never grows anything
  blocking under a player (`occupied`), and never where it would cut the map in two.
- **Shared map:** online, cuts and holes go to the server (`work {kind, x, y}` →
  `workDone`, refused unless you stand next to the tree / on the ground; `WorldEvents.work`),
  so everyone sees them and they heal like disaster changes; offline or in a solo game they
  change only this device's map until it's drawn again (`WorldLayer.setLocalTile`).
  `scripts/e2e-work.mjs` covers the server side.

### Teaming up (protocol v5)

- **Pure rules in `shared/src/raid/team.ts`** (tested): one team at a time gathers
  at the lair (`RaidView.gathering` tells everyone), members join, the leader
  starts. Every monster's HP × `teamHpFactor(size)` (+25% per extra player, max 2).
  Each turn every member still standing picks a move; then all attack in speed
  order and the dragon strikes one random member — each exchange is a normal
  `resolveTurn` between that member and the dragon. Damage is credited per player
  in the shared raid, exactly like solo attempts (same rewards, same final blow).
  Silent for 2 turns (30 s each) or disconnected = out; the leader leaving while
  gathering cancels the team. `teamViewFor` gives each member their own monster vs
  the dragon plus the team list; it never reveals others' picks.
- **Server:** `LobbyRoom` holds `team` and its turn timer; members are busy and rest
  afterwards like solo attackers. **Client:** the dragon popup offers ⚔️ (alone) and
  👥⚔️ (gather; not plain 👥, which is the connection button), or ✓ to join a
  gathering team. `InteractScene` shows the waiting screen; `BattleScene` has a
  `team` mode with an allies row. `scripts/e2e-team.mjs` covers it end to end.

## Player levels and badges (protocol v13)

- **XP for playing, more for playing well** (`shared/content/levels.json`): catches (+ a
  bonus for a new species; cave catches count), wild wins, duels (a win is worth much more
  than trying), damage to the dragon and beasts, beating one, cave visits, trades. Level n
  needs `xpPerLevel × n(n−1)/2` XP (max level 30). Titles at set levels (Nybegynder →
  Legende); headwear for the figure (`looks`: hachimaki, kasa, kabuto, krone — drawn in
  `avatar-sprites.ts`, baked per figure) everyone sees on the map, the scoreboard and the
  profile; and **stronger monsters**: attack and defence +2% per level, up to +30%
  (`boostStats`, applied to my monster in every battle via `mySpecies`/`seatFor` in
  `client/src/battle-participant.ts`; HP is untouched so health bars and saves stay right).
- **Badges** (`shared/content/badges.json`): `{id, navn, icon, stat, min}` — earned when a
  counter reaches `min`. Counters: catch, caveCatch, caveVisit, cave:<kind>, wildWin, duel,
  duelWin, trade, food, bossDamage, dragonWin, beast:<id>, variant, travel, boat, tunnel,
  bridge, worlds, world:<id>, plus "species" and "level". A test checks the file only uses
  those.
- **Pure rules** (tested) in `shared/src/player/progress.ts`: `award(progress, event)` →
  XP, counters, level-up and new badges; `levelForXp`, `titleFor`, `lookFor`,
  `monsterBonus`, `progressFromHistory` (a save from before levels gets credit for its
  catches, filled in on load by `normalise` — nobody starts over).
- **The save** keeps `progress {xp, stats, badges}` (the device is the source of truth).
  `client/src/progress/record.ts` `recordProgress(event)` is called where things happen
  (BattleScene, CaveScene, presence for rewards and trades, the map for food); level-ups
  and badges queue up and the map shows them as a banner (`celebrateNext`).
- **Server:** the device sends `level`/`badges` when joining and `profile` when they
  change; `LobbyPlayer.level/badges` and the scoreboard rows (`ScorePlayer.level`) carry
  them (cleaned: level 1–100, badge ids as slugs). `scripts/e2e-levels.mjs` covers it.
- **Client:** a ★ level button at the top left of the map opens `ProfileScene` (figure
  with headwear, level, title, XP bar, next unlock, monster bonus, the badge wall; portrait
  stacks, landscape puts the player on the left). Other players show a level tag on the map;
  tapping one offers a medal button that opens their profile.

## Passing out and food (protocol v6)

- **Pure rules in `shared/src/recovery/recovery.ts`** (tested): when a monster
  faints the player passes out — `passOutSeconds(closeness, kind)`: 30–60 s after a
  duel, 10–30 s after a lost wild battle (closeness = how much of the opponent's HP
  they took), and always 60 s after fainting against the dragon. Each piece of food
  eaten takes `FOOD_SECONDS` (15) off; the bag holds `BAG_MAX` (5).
- **Only fainting counts**, not fleeing: a lost wild battle, a duel lost by fainting,
  and fainting against the dragon (solo or in a team — the server then skips its
  60 s rest for that player; fleeing still rests). The wait is `SaveData.passedOutUntil`
  (saved, so closing the app doesn't skip it); `OverworldScene` shows 😵 + countdown
  + one button per food, blocks moving and meeting, and marks the player away.
- **Food is shared on the server**: `server/src/areas.ts` reads the maps (the
  Dockerfile copies `shared/content/areas`) to find open ground and paths; one piece
  per 123 open tiles (`OPEN_TILES_PER_FOOD`, ~92 on Startskoven), one regrows 3 min
  after being picked. Stepping onto food sends `foodTake` (only if the bag has room); the server checks the player stands there, and the
  first one gets it (`foodTaken` → `SaveData.bag`). Solo/offline play has no food.
  `scripts/e2e-food.mjs` covers it.

## Save backups (protocol v7)

- **The device's save stays the source of truth**, but a copy lives on the game
  server so a reinstalled or new device can get its player back. `persist()` notifies
  `onPersist` listeners; `presence` backs up 5 s after the last save (and once after
  connecting) over **plain HTTP**: `PUT /backups/<playerId>` with the spilnøgle, streamed,
  up to 16 MB (`MAX_BACKUP_BYTES`; about 100,000 monsters). A save must never travel as a
  websocket message: those stay small (the server allows 1 MB, only so devices not yet
  updated can still use the old `backup` message, which is the fallback for an older
  server). The transport's default limit of 4 KB once closed the connection (1009) of
  everyone with a few dozen monsters at every backup. The server (`server/src/save-backups.ts`)
  keeps one file per player in `DATA_DIR/games/<gameId>/saves/<playerId>.json` (atomic writes; ids
  must match `[A-Za-z0-9-]`; a save only goes under its own player's id).
  `scripts/e2e-bigsave.mjs` checks saves up to ~12 MB.
- **The game's service worker** answers every page navigation with the game (offline too),
  except the server's own paths (`navigateFallbackDenylist` in `client/vite.config.ts`:
  `/admin`, `/backups`, `/transfer`, `/game`, `/health`, `/matchmake`) — without that, a
  browser that had opened the game got the game instead of the admin portal.
- **Restore** happens before the device has a player, so it is plain HTTP on the same
  server (`server/src/backup-http.ts`): `GET /backups` and `GET /backups/<id>`, with
  the spilnøgle in `X-Game-Key` (older clients: `X-Family-Code`) choosing the game,
  counted by the same `KeyGate`, CORS for the Pages origin. In the client: the first
  setup screen of an online game offers ✨ new / 🔄 fetch; `RestoreScene` lists that
  game's players (figure, name, monster count; it asks for the key only if the stored
  one is refused), and `adoptSave` makes the chosen save this game's save on the device. ⚙ shows when the
  device was last backed up. `scripts/e2e-backup.mjs` covers the server side.
- **Player figures** are six animal faces (fox, frog, panda, calico cat, moon rabbit,
  bear) drawn in code in `client/src/gfx/avatar-sprites.ts`, shown on the player's
  circle on the map, in setup, on the scoreboard and in the restore list. Saved as
  `figur1`–`figur6` (`client/src/ui/avatars.ts`).

## Admin portal

- **`/admin` on the game server**, off unless `ADMIN_PASSWORD` is set (never a
  spilnøgle; the server warns if it matches one). `server/src/admin.ts` handles it;
  the page is one self-contained HTML string in `server/src/admin-page.ts` (Danish,
  Kanagawa colours, no external files; player names only ever via `textContent`).
- **Auth:** POST `/admin/login` checks the password through its own `KeyGate`
  (same lockout rules, separate counter, so a child mistyping a key can't lock the
  parent out) and sets a 12-hour `HttpOnly; SameSite=Strict` session cookie
  (`Secure` behind https). State-changing calls also need an `x-admin: 1` header.
  Strict CSP, `no-store`.
- **Games:** list (name, key, players, online), create (name + key; the page can
  suggest a key like `modig-ugle-472`), rename, change the key, delete. Per game
  (`/admin/api/games/<gameId>/…`): list players (store + backups + online + points),
  rename a player, download one/all backups, delete a player (store entry, score
  events, rewards, renames, backup file), dragon reset / set HP (0 = asleep, never
  rewards), clear score events. Changes reach connected players through the game's
  room (`LobbyRoom.byGame`): `adminChanged`, `adminRenamedGame`,
  `adminRenamedPlayer`, and `adminKickAll` (new key or deleted game: everyone is sent
  away with 4401, so their device asks for the key). `scripts/e2e-admin.mjs` and
  `scripts/e2e-games.mjs` cover it.

## Several games (protocol v8)

- **One server, several games** — e.g. the family and a school class. Each game is
  its own world: players, scoreboard, dragon, food, backups. `server/src/games.ts`
  (`GameRegistry`, tested) keeps the list in `DATA_DIR/games.json` (id, name,
  spilnøgle, created) and each game's data in `DATA_DIR/games/<gameId>/`. Keys are
  compared normalised (NFC, trimmed, lower case), are 6–40 characters and unique per
  server. Games are created by a parent in the admin portal.
- **Migration:** a server from before games (`DATA_DIR/family.json` + `saves/`)
  turns its family into the game "Familien" (id `familien`) with `FAMILY_CODE` as its
  key on first start. After that `FAMILY_CODE` is ignored. In production the server
  refuses to start if there are no games and no `ADMIN_PASSWORD` (nobody could join).
- **Rooms:** `gameServer.define("lobby", …).filterBy(["gameId"])` — a client joins
  with `{gameId, gameKey}` (plus `familyCode` = the same key, for an older server).
  `onCreate` refuses unknown games and a second room for the same game; `onAuth`
  only lets in that game's key. Server-side deps come from the define options, which
  Colyseus lets win over client options. The server sends `game {gameId, navn}` on
  join and on rename, and `renamed {navn}` when a parent renamed the player (kept in
  the store's `renames` until the device joins with the new name).
- **Plain HTTP before joining:** `GET /game` with `X-Game-Key` → `{gameId, navn}`
  (adding a game on a device). A v7 server has no `/game`; the client then tries
  `/backups` and, if the key opens it, treats it as the one game `familien`.
- **Client:** separate progress per game. `client/src/save/games.ts` keeps the
  device's game list in IndexedDB (record `games`: id, name, online, key,
  lastPlayedAt) and one save per game (`save:<gameId>`); `game-state.ts` persists to
  the current game. The old single save (record `player`) and the localStorage
  family code become the game "Familien" on first start (solo builds: one game alone,
  `solo`). `GamesScene` is the game list (shown at start when there are 0 or 2+
  games, and from the ⚙ button): a card per game with your figure, ＋ to add one
  with a spilnøgle (there is no "play alone" option in builds with a server; a
  solo-only build has its one game `solo`), 🗑 to take a game off the device (asks first). Switching games reloads the app (`reloadToGameList`), so
  nothing from the old game lingers.

## Natural disasters (protocol v9)

- **Six kinds** — meteor, earthquake, flood, hurricane, dragon fire and (very rare) a
  UFO crash. Their numbers (name, weight, warning seconds, size, heal hours, the rare
  species they leave, how long and how often it turns up, extra food) are content:
  `shared/content/disasters.json`, read by the server at runtime (the Dockerfile copies
  it) and by the client. The shapes are code.
- **Pure rules** (tested): `shared/src/world/terrain.ts` — the map is the base Tiled map
  plus per-tile overrides; *soft* changes (burnt ground, floodwater, fallen trees,
  fissures) carry `until` and heal back to what was under them (`after`); *hard* ones
  (craters, raised hills, rubble passes, the UFO wreck) stay. `staysConnected` is used so
  a change or a heal never cuts part of the map off; the start, lairs, the map border and
  tiles where players stand are never blocked. `shared/src/world/disasters.ts` —
  `planDisaster` (worked out at the warning, so the red danger tiles are exactly what
  strikes), `applyDisaster`, schedule (`nextDisasterAt`: the average gap ± randomness,
  never under 2 min) and `pickDisasterKind` by weight.
- **Tiles**: the tileset has 13 tiles (`scripts/generate-startskoven.mjs` draws them):
  6 mountain (the base map now has a ridge with a pass and a small massif), 7 burnt,
  8 crater, 9 floodwater (walkable), 10 fallen tree, 11 fissure, 12 rubble, 13 wreck. The
  area's `.meta.json` names them in `terrain` (an area without it has no disasters) and
  lists the blocking ones in `collisionGids`.
- **Server:** `server/src/world-events.ts` (`WorldEvents`, one per game's room) keeps the
  schedule, warns (`disaster` phase `warning`), strikes after `warnSeconds` (phase
  `strike`, with `struck` = players standing in the danger area who aren't busy/away;
  they pass out for 40 s, kind `"disaster"`), stores the terrain in the game store's
  `world`, heals every 5 s tick, and sends `terrain` on join and after every change
  (with the last day's disasters as news). Every game's room is opened at server start,
  so disasters happen while nobody plays. Rare monsters live in zones (`EventZone`,
  their own encounter rate); the UFO leaves one `WorldSpawn` (the alien, `rumling`) that
  the first player next to it claims (`spawnClaim` → `spawnBattle`, `spawnDone`).
  Hurricanes scatter extra food that doesn't regrow. Disasters happen only in online
  games; solo builds keep the fixed map.
- **Client:** `presence` holds `terrain` (cached on the device per game as
  `terrain:<gameId>`, so the map stays changed offline) and the current warning.
  `client/src/gfx/world-layer.ts` puts the changed tiles into the tilemap (collisions
  follow), draws zone sparkles and the alien, the red danger tiles with the icon and
  a countdown, and the strike effect. `OverworldScene` moves you off a tile that became
  blocked, uses zones for encounters, shows "Løb væk!" / news toasts, and the minimap is
  rebaked after changes. The monster book shows the disaster's icon for its species.
- **Admin portal:** per game, on/off, average gap (15 min – 1 week), randomness,
  which kinds, trigger now (kind optional), heal soft changes, reset the map, history.
  `scripts/e2e-disasters.mjs` covers it end to end.

## The map in 3D

- **The overworld is shown in 3D** (`client/src/world3d/`, three.js, loaded when the map
  opens — the same chunk as the caves'): the map seen from the south and above at an angle,
  following the player. `OverworldScene` keeps running the 2D map underneath unchanged —
  tiles, collisions, walking, tweens — and without WebGL (or offline before the chunk was
  cached) that 2D map simply shows.
- **`map-stage.ts` (`MapStage`)** draws the terrain as one natural landscape over the tile
  grid (the grid, walking and collisions are unchanged): a heightfield with a vertex every half
  tile — gentle hills everywhere, real mountains with ridged crests where the mountain tiles
  are (snow up high; on a volcano, a glow), beds where the water is under a rippling
  see-through water surface with foam along the shores (`look3d.water: "lava"` makes it glow:
  Ildbjerget). Colours are the average colours of the world's own tiles (read from its
  tileset, so snow, ash and cherry worlds follow), blended across ragged, noisy edges instead
  of tile borders, with a painted texture in the shader. Tall grass is golden meadow with
  swaying susuki; trees, stumps, fallen logs, boulders and rubble, and the UFO wreck are
  instanced low-poly models; craters, holes and fissures are dips. Chunks of 16×16 tiles; a
  changed tile rebuilds the land around it. `heightAt(x, z)` gives the land's height: the
  bridge stands everything on it, and taps hit the land itself.
- **`map-3d.ts` (`Map3D`) is the bridge**: every frame, just before Phaser draws, it looks at
  the scene's map objects (scroll factor 1). Pictures and circles (players, monsters, the
  dragon, food, icons) become upright sprites standing on their spot (hidden from Phaser's
  camera), the bigger ones with a soft shadow; ellipses and rectangles lie flat on the ground;
  everything else (names, health labels, the cave mouth) stays Phaser's, moved to where its
  spot is on screen and scaled with distance for that frame only, then put back — so game
  code and tweens never notice. The few objects that need it say how they stand with
  `setMapHint(object, {flat, lift, dy})` (`client/src/gfx/map-hints.ts`): a label drawn above
  its owner gives `dy` (back to the owner's spot) and `lift` (tiles above the ground).
  New map objects need nothing: a picture stands, a rectangle lies. A drawing that spans many
  tiles can't be moved as one piece — use one object per tile (the disaster warning does).
- **In the air:** something flying (the dragon, a swooping eagle) is drawn higher up the
  screen on the 2D map; `setAirborne(object, heightPx)` says how much of that is height, and
  the 3D map puts it back over its spot on the ground and raises it instead (its shadow stays
  on the ground). **Alive:** water tiles slide gently back and forth (a `flow` attribute on the
  ground, within each tile's atlas padding) and the susuki sway in a breeze (vertex shader).
  Names and health labels always draw on top of trees, on purpose: you can see where a
  friend is even behind a forest.
- **Camera mode:** the camera button (bottom left, 3D only) switches dragging from walking to
  turning the view round the player (sideways) and tilting it (up and down); two fingers
  pinch to zoom; taps still work. A green ✓ ends it, and dragging walks again — in the
  direction the camera faces (`stepFromDrag` turns the drag by `Map3D.yaw`). ↻ swings back to
  the usual view. The view is remembered on the device (`localStorage`, `MapStage.view`).
- **Players and food in 3D:** each player stands on a disc of their colour as their animal
  figure (`world3d/avatar-model.ts`: fox, frog, panda, calico cat, moon rabbit, bear — chibi,
  toon-shaded, ink-outlined), wearing their level's headwear and their three newest badges as
  medals on the chest, leaning back a little towards the camera so the face shows. The face
  image carries `setMapHint(face, { avatar: () => ({id, look, badges}) })`, read every frame,
  so a new hat or badge shows at once. Walking, a figure waddles (`AvatarModel.walk`: feet
  step, arms swing, a bob and a rock) and faces the way it goes; standing, it turns back to
  the camera. Food on the map is modelled too
  (`world3d/food-models.ts`: apple, strawberry, banana, carrot, grapes), turning and bobbing.
- **Monsters peeking out of the grass** (3D only): now and then (at most two at a time) a
  monster that lives here gives itself away in tall grass a few steps from me — its model
  sunk into the grass with just its ears, crest or horns out, rustling, popping up now and
  then to look about (a kid's drawing: two blinking eyes). It's real: stepping onto that tile
  meets exactly that monster (`OverworldScene.updatePeeks`/`peekerAt`; drawn by
  `world3d/peeks.ts`, `Map3D.peeks`). They leave after a while or when I go far away.
- **Taps** go through `Map3D.tileAt`: a player, monster or the dragon under the finger first
  (their sprites), else the ground under it. Dragging to walk is unchanged (the camera never
  turns, so up on the screen is north). Phaser's camera shake shakes the 3D camera too.
- **Testing in headless Chromium:** `window.__map3d` in dev builds; start `Overworld`
  directly with a save (see the battle testing notes) and take screenshots.

## Overview map

`client/src/gfx/minimap.ts`: the area baked into a one-texel-per-tile texture
(nearest filtering), opened as an overlay from the 🗺️ button, with dots for me
(white ring), other players (dark ring), 🐉 at the lair and the camera frame. Tap
anywhere (or ✗) to close. Which tile ids are trees, water or paths comes from `minimap` in the area's
`.meta.json` sidecar (without it, blocking tiles are drawn as trees).

## Danish texts

All UI text is in `client/src/i18n/da.ts`; battle messages are written by the
engine (`shared/src/battle/engine.ts`, which also has the `genitive` helper for
names ending in s/x/z: "Flammepels' Glødslag"). Write "gjorde N i skade", not "gav
N skade"; Danish compounds without hyphens ("biplyd", "monsterfil"); only the first
word of a name capitalised. Keep sentences short: the youngest player reads little.

## Moving on the map

Drag-to-steer, like an invisible joystick (`OverworldScene`): touch anywhere, drag
past an 18px dead zone, and the player keeps stepping in that direction — 8 ways —
until the finger lifts; a ring and knob show under the finger. The pure step rules
are in `shared/src/world/steps.ts`: `dragDirection` (45° sectors), `chooseStep`
(no squeezing diagonally past a corner; a blocked diagonal slides along the free
axis the finger leans towards) and `DIAGONAL_TIME_FACTOR` (√2: a diagonal step
covers √2 tiles at the same speed, so it takes longer). A short tap without a drag
is still a tap: on another player or the dragon it offers 🤝/⚔️ (walking over with
BFS pathfinding if needed); on the ground it does nothing.

**Forests can be walked through, slowly.** Trees are no longer in the areas' `collisionGids`;
the sidecar's `slow: [{gids: [tree], speed: 0.5}]` says a step onto one takes twice as long
(`groundSpeed` in `shared/src/world/steps.ts`; riding multiplies in). The map's **outermost
row is always its wall** (`isMapEdge`, used by the client's `isWalkable` and the shared
`walkableNow`, so the server's connectivity checks agree), which keeps the tree border round
Startskoven and Snedalen shut. Tapping somewhere walks the quickest way (`findPath`: forest
costs double, so it goes round a wood when that's quicker). Food, the dragon's perches and
the beasts still keep to open ground (the server's food spots skip `slow` tiles). The world
generators still treat trees as blocking while they make a map (so every part is reachable
on foot) and write the sidecar this way. In 3D, pines near anyone lean away and shrink a
little as they pass (`MapStage.pushTrees`, fed every frame by `Map3D` with the players'
spots); pines between a player and the camera give way from further off, duck lower and lean
sideways, so the player always shows in a forest.

## Look and feel (Kanagawa)

- **All colours and the font live in `client/src/ui/theme.ts`** — the Kanagawa
  palette as in the Omarchy "kanagawa" theme (sumi-ink backgrounds, fuji-white text,
  muted red/sand/sage/wave-blue), named by purpose (`C.button`, `C.danger`,
  `CSS.accent`, …). Never write a hex colour in a scene; add a role to the theme.
  Type colours (`TYPE_COLOURS`) and player colours (`PLAYER_COLOURS`) come from it too.
- **Font:** Hiragino Maru Gothic (rounded, Japanese; ships with iPadOS/iOS, so
  nothing is downloaded), falling back to other rounded fonts, then sans-serif.
- **Motifs, drawn in code** (`client/src/gfx/motifs.ts`, no image files): seigaiha
  wave scales fading in along the bottom of full screens, a rising sun behind titles
  and opponents (bold red for the dragon), and a hanko seal (狩, "hunt") on the boot
  screen — decoration only; all text stays Danish. Buttons are rounded cards with a
  thin warm-white edge and an ink shadow they sink into when pressed.
- **Map tiles** come from `scripts/generate-startskoven.mjs` in the same palette:
  Japanese pines, indigo water with Great-Wave foam curls, sand paths, meadow tufts,
  and susuki (pampas grass with feathery plumes) for the tall-grass encounter zones.
- **Placeholder monsters** (`client/src/gfx/placeholder-sprites.ts`) are little
  yokai in woodblock style: bold ink outlines, body proportions from the stats
  (defence = wider, HP = taller, strong attack = a fang), a kawaii face, a per-species
  shade, and a type feature (flame crest, wave-scale crest, leaves, Raijin horns,
  rocky cap); dragons get wings and horns.
- **No emoji in the UI: every icon is drawn in code** (`client/src/gfx/icon-art.ts`,
  ~50 icons baked at boot into `icon-<name>` textures, woodblock style; Japanese
  objects where they fit: temari ball for catching, shoji door, furoshiki bag,
  crossed katanas). `client/src/ui/icons.ts` names what each meaning uses
  (`TYPE_ICONS`, `LOG_ICONS`, `STAT_ICONS`, …). Show one with `addIcon`, as a
  button `icon`, as a whole button label `"[[name]]"`, or inline in text with
  `ic("name")` rendered by `richText`/`richChip` (`client/src/ui/rich-text.ts`) —
  never put an emoji or a raw icon name in a plain Text. Food and hint arrows are
  still emoji *values* in saves/messages; `foodIcon`/`arrowAngle` map them to icons.
  The plain symbols ✓ ✗ ✕ stay text.
- **App icon** (`client/public/icons/icon-{192,512}.png`) is drawn by
  `scripts/generate-icons.mjs`: a red rising sun, a friendly monster peeking over a
  seigaiha sea, on sumi ink — full-bleed squares (iOS rounds the corners). Both
  generator scripts share the dependency-free PNG writer in `scripts/lib/png.mjs`.

## Screen layout (iPad and iPhone, both orientations)

- **`client/src/ui/layout.ts`** is the one place for screen geometry: `getLayout(scene)`
  gives the size, `portrait`, `compact` (phone), the iPhone **safe area** (notch,
  status bar, home indicator — read from `env(safe-area-inset-*)`), and a size factor
  `s` with helpers `px()`, `font()` (never below 16px) and `touch()` (never below
  64px). Sizes in scenes are written for the ~1024×768 iPad and passed through these.
- **Rotation:** `onRelayout(scene, fn)` calls `fn` after a resize — except while a
  text field has focus (on iPhone the keyboard opening is a resize; rebuilding the
  field would steal its focus and close the keyboard); `restartOnResize`
  restarts screens that are pure drawings of their data (monster book, info page,
  starter pick). Stateful screens re-lay out in place: the battle rebuilds its
  sprites/bars/buttons from the live battle state; the map rebuilds its HUD.
- **Arrangements:** portrait phones stack what landscape shows side by side (battle:
  foe above, player below, a grid of buttons; monster info; trade screen). Grids pick
  their column count to fit (`wrapGrid`); the monster book keeps its entries a readable size
  and scrolls like a phone's list (it glides on after a flick and slows down, stretches past
  either end and springs back; a touch stops a glide; a drag is never a tap on a monster).
- **Taps only count when pressed and lifted on the same thing** (`whenTapped` in
  `client/src/ui/Button.ts`; `createButton` uses it). A finger that went down elsewhere — on
  the map while walking when a battle opens under it — does nothing when lifted over a
  button. Never listen for "pointerup" on a game object on its own.
- **Overlays** get their close button from `addCloseButton` (top-right, clear of the
  notch). The map HUD is a right-aligned row: 🗺️ (overview map overlay) 🏆 ⚙ 📖.
- **Testing:** in dev builds `window.__game` exposes the Phaser game, so a headless
  browser can open any scene at any size (390×844, 844×390, 768×1024, 1024×768) and
  resize it mid-scene to simulate a rotation.

## Dependency policy

Pre-approved: Phaser, Vite, TypeScript, Colyseus (server `@colyseus/core` +
`@colyseus/ws-transport` + `@colyseus/schema`, client `colyseus.js`), `vite-plugin-pwa`
(added for PWA manifest/service-worker generation), and `three` (+ `@types/three`) for the cave minigame, loaded only inside a cave.
**Ask before adding anything else.**

## Testing convention

`node --test` for everything in `shared` (battle engine, content loader) — pure
logic, no browser needed. For client UI work, a check at phone and iPad sizes in both
orientations (e.g. Safari responsive mode 390×844, 844×390, 1024×768, 768×1024)
before calling a feature done; there's no automated UI test suite for `client` yet.

## Deployment

- **The Docker image is the whole game** (`server/Dockerfile`): it builds the client with
  `VITE_BASE=/` and `VITE_SERVER_URL=/` ("/" = talk to the server this page came from,
  `client/src/net/server-url.ts`) and the server serves `client/dist` itself
  (`server/src/static-files.ts`: GET/HEAD only, never outside the folder, `/assets/`
  cached for good, the page / service worker / manifest never cached, app routes fall
  back to `index.html`). Published by `.github/workflows/publish-server.yml` on changes to
  server, shared or client. See `docs/self-hosting.md`.
- **GitHub Pages** (`https://<user>.github.io/monster-spil/`, `.github/workflows/deploy.yml`)
  still builds on every push (`VITE_BASE` defaults to `/monster-spil/`, the repo's name).
  It was the game's first home; with the repo variable `VITE_MOVED_TO` set it becomes
  only the way to the new address.
- **Moving devices:** the old app (`MovedScene`) posts each online game's save to
  `POST /transfer` (spilnøgle; it becomes the backup) for a one-time code (15 min, once,
  in memory); it opens `<new address>#flyt=<codes>`; the new app redeems them at start
  (`GET /transfer/<code>` → game, key, player; `client/src/save/move.ts`), adds the games
  and restores the saves, and the map says welcome. The codes stay in the #fragment,
  never sent to a server, and are removed from the address at once.
  `scripts/e2e-move.mjs` covers it against a running image.
