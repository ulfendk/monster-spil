import {
  blocks,
  inside,
  setTile,
  staysConnected,
  tileKey,
  tileNow,
  walkableNow,
  type AreaTerrain,
  type BaseArea,
  type TileState,
} from "./terrain.js";

/**
 * Natural disasters: what each one does to the map, and when the next one comes.
 * Pure functions with an injected random source; the server decides when, warns,
 * strikes and stores the result (see terrain.ts for how changes heal).
 */
export type DisasterKind = "meteor" | "earthquake" | "flood" | "hurricane" | "dragonfire" | "ufo";
export const DISASTER_KINDS: DisasterKind[] = ["meteor", "earthquake", "flood", "hurricane", "dragonfire", "ufo"];

/** One disaster's numbers, from shared/content/disasters.json (tunable without code). */
export interface DisasterConfig {
  navn: string;
  /** How often it is picked compared with the others (the UFO is very rare). */
  weight: number;
  /** Seconds of warning before it strikes — time to run. */
  warnSeconds: number;
  /** Size of the struck area in tiles. */
  radius: number;
  /** Hours until soft changes heal (burnt grass, floodwater, fallen trees, fissures). */
  healHours: number;
  /** The rare monster it leaves behind. */
  speciesId: string;
  /** Hours the rare monster stays around. */
  zoneHours: number;
  /** Chance per step to meet it on the struck tiles (0 = a single monster instead, like the UFO's). */
  zoneRate: number;
  /** Extra food it scatters (the hurricane blows fruit off the trees). */
  extraFood?: number;
}
export type DisasterConfigs = Record<DisasterKind, DisasterConfig>;

/** Set by a parent in the admin portal. */
export interface DisasterSettings {
  enabled: boolean;
  /** Average minutes between disasters. */
  meanMinutes: number;
  /** 0 = exactly every meanMinutes, 1 = anywhere from 0 to twice that. */
  randomness: number;
  kinds: Record<DisasterKind, boolean>;
}

export const DEFAULT_DISASTER_SETTINGS: DisasterSettings = {
  enabled: true,
  meanMinutes: 240,
  randomness: 0.5,
  kinds: { meteor: true, earthquake: true, flood: true, hurricane: true, dragonfire: true, ufo: true },
};
export const MIN_DISASTER_GAP_MINUTES = 2;
export const MAX_DISASTER_GAP_MINUTES = 7 * 24 * 60;

/** Settings from the admin portal, checked field by field (anything odd keeps the old value). */
export function cleanDisasterSettings(raw: unknown, old: DisasterSettings): DisasterSettings {
  const r = (raw ?? {}) as Partial<DisasterSettings>;
  const num = (v: unknown, min: number, max: number, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
  const kinds = { ...old.kinds };
  for (const k of DISASTER_KINDS) if (typeof r.kinds?.[k] === "boolean") kinds[k] = r.kinds[k];
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : old.enabled,
    meanMinutes: Math.round(num(r.meanMinutes, MIN_DISASTER_GAP_MINUTES, MAX_DISASTER_GAP_MINUTES, old.meanMinutes)),
    randomness: num(r.randomness, 0, 1, old.randomness),
    kinds,
  };
}

/** When the next disaster comes: the average gap, spread by the randomness either way. */
export function nextDisasterAt(now: Date, settings: DisasterSettings, rand: () => number): Date {
  const spread = 1 + settings.randomness * (2 * rand() - 1);
  const minutes = Math.max(MIN_DISASTER_GAP_MINUTES, settings.meanMinutes * spread);
  return new Date(now.getTime() + minutes * 60_000);
}

/** Picks a disaster among the switched-on ones that can happen here, by weight. */
export function pickDisasterKind(settings: DisasterSettings, configs: DisasterConfigs, possible: DisasterKind[], rand: () => number): DisasterKind | undefined {
  const options = possible.filter((k) => settings.kinds[k] && configs[k] && configs[k].weight > 0);
  const total = options.reduce((sum, k) => sum + configs[k].weight, 0);
  let roll = rand() * total;
  for (const k of options) {
    roll -= configs[k].weight;
    if (roll < 0) return k;
  }
  return options[options.length - 1];
}

export interface TileChange {
  key: string;
  state: TileState;
  /** Soft changes heal after the disaster's healHours. */
  soft: boolean;
}

/** Everything one disaster will do, worked out at the warning so the danger shown is exactly what strikes. */
export interface DisasterPlan {
  id: string;
  kind: DisasterKind;
  areaId: string;
  center: { x: number; y: number };
  /** Tiles where players pass out if they are still there when it strikes. */
  danger: string[];
  changes: TileChange[];
  /** Tiles where its rare monster lives for a while. */
  zoneTiles: string[];
  /** Where a single monster waits (the UFO's alien). */
  spawn?: { x: number; y: number };
  /** Extra food to scatter. */
  food: Array<{ x: number; y: number }>;
}

export interface PlanOptions {
  id: string;
  /** Where it strikes; picked at random (away from the start) when not given. */
  target?: { x: number; y: number };
  /** The dragon's lair, for dragon fire. */
  lair?: { x: number; y: number };
  /** Tiles that must stay walkable (where players stand right now). */
  keepWalkable?: Array<{ x: number; y: number }>;
}

/** Which disasters this area can have (dragon fire needs a dragon). */
export function possibleKinds(base: BaseArea, lair: { x: number; y: number } | undefined): DisasterKind[] {
  const hasWater = base.ground.includes(base.tiles.water);
  return DISASTER_KINDS.filter((k) => (k === "dragonfire" ? Boolean(lair) : k === "flood" ? hasWater : true));
}

/** Plans one disaster. Never blocks a protected tile, and never cuts part of the map off. */
export function planDisaster(kind: DisasterKind, base: BaseArea, terrain: AreaTerrain, config: DisasterConfig, rand: () => number, opts: PlanOptions): DisasterPlan {
  const T = base.tiles;
  const now = (x: number, y: number) => tileNow(base, terrain, x, y);
  const wanted = new Map<string, TileChange>();
  const zone = new Set<string>();
  const danger = new Set<string>();
  const want = (x: number, y: number, state: TileState, soft: boolean) => {
    if (inside(base, x, y)) wanted.set(tileKey(x, y), { key: tileKey(x, y), state, soft });
  };
  const r = config.radius;
  let center = opts.target ?? randomTarget(base, terrain, rand);
  let spawn: { x: number; y: number } | undefined;
  const food: Array<{ x: number; y: number }> = [];

  if (kind === "meteor" || kind === "ufo") {
    for (const { x, y, d } of disc(base, center, kind === "ufo" ? 1.5 : r)) {
      const s = now(x, y);
      danger.add(tileKey(x, y));
      if (s.ground === T.water) continue;
      if (d <= 1.5) {
        // The crater stays; a mountain it hits is smashed to rubble.
        want(x, y, { ground: s.ground === T.mountain ? T.rubble : T.crater, grass: 0 }, false);
        if (kind === "meteor") zone.add(tileKey(x, y));
      } else if (s.ground !== T.mountain && s.ground !== T.crater && s.ground !== T.wreck) {
        want(x, y, { ground: T.burnt, grass: 0 }, true);
      }
    }
    for (const { x, y } of disc(base, center, r + 1)) danger.add(tileKey(x, y));
    if (kind === "ufo") {
      want(center.x, center.y, { ground: T.wreck, grass: 0 }, false);
      spawn = [[1, 0], [0, 1], [-1, 0], [0, -1]].map(([dx, dy]) => ({ x: center.x + dx!, y: center.y + dy! })).find((p) => inside(base, p.x, p.y) && now(p.x, p.y).ground !== T.water);
    }
  } else if (kind === "earthquake") {
    const angle = rand() * Math.PI;
    const length = 10 + Math.floor(rand() * 7);
    const dir = { x: Math.cos(angle), y: Math.sin(angle) };
    const line = new Map<string, { x: number; y: number }>();
    for (let t = -length / 2; t <= length / 2; t += 0.5) {
      const p = { x: Math.round(center.x + dir.x * t), y: Math.round(center.y + dir.y * t) };
      if (inside(base, p.x, p.y)) line.set(tileKey(p.x, p.y), p);
    }
    for (const p of line.values()) {
      const s = now(p.x, p.y);
      if (s.ground === T.water) continue;
      // A fissure opens (and closes again); through a mountain it leaves a new pass.
      if (s.ground === T.mountain) want(p.x, p.y, { ground: T.rubble, grass: 0 }, false);
      else want(p.x, p.y, { ground: T.crack, grass: 0 }, true);
      for (const side of [-1, 1]) {
        const q = { x: Math.round(p.x - dir.y * side), y: Math.round(p.y + dir.x * side) };
        if (!inside(base, q.x, q.y) || line.has(tileKey(q.x, q.y)) || rand() > 0.35) continue;
        const sq = now(q.x, q.y);
        if (sq.ground === T.water || sq.ground === T.wreck) continue;
        want(q.x, q.y, { ground: T.rubble, grass: 0 }, false);
        zone.add(tileKey(q.x, q.y));
      }
      for (const { x, y } of disc(base, p, r)) danger.add(tileKey(x, y));
    }
    // The ground heaves up a new hill just past one end of the fissure.
    const end = { x: Math.round(center.x + dir.x * (length / 2 + 2)), y: Math.round(center.y + dir.y * (length / 2 + 2)) };
    for (const { x, y } of disc(base, end, 1.3)) {
      if (now(x, y).ground === T.water) continue;
      want(x, y, { ground: T.mountain, grass: 0 }, false);
      danger.add(tileKey(x, y));
    }
  } else if (kind === "flood") {
    center = opts.target ?? randomWater(base, terrain, rand) ?? center;
    // The pond the water comes from, then everything within reach of its shore.
    const pond = floodFill(base, center, (x, y) => now(x, y).ground === T.water);
    const reach = r + Math.floor(rand() * 2);
    let frontier = [...pond].map((k) => ({ k, d: 0 }));
    const seen = new Set(pond);
    while (frontier.length) {
      const next: typeof frontier = [];
      for (const { k, d } of frontier) {
        if (d >= reach) continue;
        const [px, py] = k.split(",").map(Number) as [number, number];
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const x = px + dx;
          const y = py + dy;
          const nk = tileKey(x, y);
          if (!inside(base, x, y) || seen.has(nk)) continue;
          seen.add(nk);
          const s = now(x, y);
          if (s.ground === T.tree || s.ground === T.mountain || s.ground === T.wreck || s.ground === T.water) continue;
          want(x, y, { ground: T.flood, grass: 0 }, true);
          zone.add(nk);
          danger.add(nk);
          next.push({ k: nk, d: d + 1 });
        }
      }
      frontier = next;
    }
  } else if (kind === "hurricane") {
    // A band of wind across part of the map: trees fall or are torn away, grass is flattened.
    const angle = rand() * Math.PI * 2;
    const length = 16 + Math.floor(rand() * 9);
    const from = { x: center.x - Math.cos(angle) * (length / 2), y: center.y - Math.sin(angle) * (length / 2) };
    const band = new Map<string, { x: number; y: number }>();
    for (let t = 0; t <= length; t += 0.5) {
      const p = { x: from.x + Math.cos(angle) * t, y: from.y + Math.sin(angle) * t };
      for (const { x, y } of disc(base, { x: Math.round(p.x), y: Math.round(p.y) }, r)) band.set(tileKey(x, y), { x, y });
    }
    for (const [k, { x, y }] of band) {
      danger.add(k);
      const s = now(x, y);
      if (s.ground === T.tree) {
        const roll = rand();
        if (roll < 0.5) want(x, y, { ground: T.log, grass: 0 }, true);
        else if (roll < 0.75) want(x, y, { ground: T.ground, grass: 0 }, false);
      } else if (s.grass) {
        want(x, y, { ground: s.ground, grass: 0 }, true);
        zone.add(k);
      } else if (!blocks(base, s)) {
        zone.add(k);
      }
    }
    const open = [...band.values()].filter(({ x, y }) => !blocks(base, now(x, y)) && !wanted.get(tileKey(x, y))?.state.ground);
    for (let i = 0; i < (config.extraFood ?? 0) && open.length; i++) food.push(open.splice(Math.floor(rand() * open.length), 1)[0]!);
  } else if (kind === "dragonfire") {
    center = opts.lair ?? center;
    const side = rand() * Math.PI * 2;
    for (const { x, y, d } of disc(base, center, r)) {
      if (d === 0) continue;
      const a = Math.atan2(y - center.y, x - center.x);
      const off = Math.abs(Math.atan2(Math.sin(a - side), Math.cos(a - side)));
      if (off > (Math.PI * 7) / 18) continue; // a 140° fan breathed to one side
      const k = tileKey(x, y);
      danger.add(k);
      const s = now(x, y);
      if (s.ground === T.water || s.ground === T.path || s.ground === T.mountain || s.ground === T.wreck) continue;
      want(x, y, { ground: T.burnt, grass: 0 }, true);
      zone.add(k);
    }
  }

  // Changes that would block: never on protected tiles, never cutting the map in two.
  const walkableAlt: Record<number, number> = { [T.mountain]: T.rubble, [T.crack]: T.rubble, [T.log]: T.ground, [T.wreck]: T.crater };
  const fixed = new Set(base.fixed.flatMap((f) => around(base, f, 1)).map((p) => tileKey(p.x, p.y)));
  const protectedTiles = new Set([
    ...around(base, base.start, 2).map((p) => tileKey(p.x, p.y)),
    ...(opts.keepWalkable ?? []).map((p) => tileKey(p.x, p.y)),
  ]);
  for (const f of fixed) wanted.delete(f);
  // The map's outer edge is its wall: never changed.
  for (const k of [...wanted.keys()]) {
    const { x, y } = keyXY(k);
    if (x === 0 || y === 0 || x === base.width - 1 || y === base.height - 1) wanted.delete(k);
  }
  const opened = (x: number, y: number) => {
    const w = wanted.get(tileKey(x, y));
    return w ? !blocks(base, w.state) : walkableNow(base, terrain, x, y);
  };
  // What `opened` says for every tile, worked out once: checking that a map stays connected
  // asks about every tile, once per blocking change, so lookups must be cheap on a big map.
  const openGrid = new Uint8Array(base.width * base.height);
  for (let y = 0; y < base.height; y++) for (let x = 0; x < base.width; x++) if (opened(x, y)) openGrid[y * base.width + x] = 1;
  const openFast = (x: number, y: number) => openGrid[y * base.width + x] === 1;
  const blocked = new Set<string>();
  for (const change of wanted.values()) {
    if (!blocks(base, change.state)) continue;
    const { x, y } = keyXY(change.key);
    if (!opened(x, y) && !walkableNow(base, terrain, x, y)) {
      // Already blocked (e.g. a tree becoming a fallen log): no new barrier.
      blocked.add(change.key);
      continue;
    }
    const tryBlocked = new Set([...blocked, change.key]);
    if (!protectedTiles.has(change.key) && staysConnected(base, openFast, tryBlocked)) {
      blocked.add(change.key);
    } else {
      change.state = { ground: walkableAlt[change.state.ground] ?? T.ground, grass: 0 };
      openGrid[y * base.width + x] = blocks(base, change.state) ? 0 : 1;
    }
  }
  // A tile opened up where nobody can get to (a tree torn out deep inside a grove) stays as it was.
  const reached = reachable(base, (x, y) => opened(x, y));
  for (const [k, change] of wanted) {
    if (!blocks(base, change.state) && !reached.has(k) && !walkableNow(base, terrain, keyXY(k).x, keyXY(k).y)) wanted.delete(k);
  }
  if (spawn && blocks(base, wanted.get(tileKey(spawn.x, spawn.y))?.state ?? now(spawn.x, spawn.y))) spawn = undefined;

  const changes = [...wanted.values()];
  const walkableAfter = (k: string) => {
    const { x, y } = keyXY(k);
    return opened(x, y);
  };
  return {
    id: opts.id,
    kind,
    areaId: base.id,
    center,
    danger: [...danger].filter((k) => !fixed.has(k)),
    changes,
    zoneTiles: [...zone].filter(walkableAfter),
    ...(spawn ? { spawn } : {}),
    food: food.filter((p) => walkableAfter(tileKey(p.x, p.y))),
  };
}

/** Makes the planned changes (mutates `terrain`), and leaves the rare monster behind. */
export function applyDisaster(base: BaseArea, terrain: AreaTerrain, plan: DisasterPlan, config: DisasterConfig, now: Date): void {
  const heal = new Date(now.getTime() + config.healHours * 3_600_000).toISOString();
  for (const c of plan.changes) setTile(base, terrain, c.key, c.state, c.soft && config.healHours > 0 ? heal : undefined);
  const until = new Date(now.getTime() + config.zoneHours * 3_600_000).toISOString();
  if (plan.zoneTiles.length && config.zoneRate > 0 && config.zoneHours > 0) {
    // Newest first, so it wins where zones overlap.
    terrain.zones.unshift({ id: plan.id, kind: plan.kind, speciesId: config.speciesId, rate: config.zoneRate, tiles: plan.zoneTiles, until });
  }
  if (plan.spawn) terrain.spawns.push({ id: plan.id, kind: plan.kind, speciesId: config.speciesId, x: plan.spawn.x, y: plan.spawn.y, until });
}

// ------------------------------------------------------------ geometry

const keyXY = (k: string) => {
  const [x, y] = k.split(",").map(Number) as [number, number];
  return { x, y };
};

function disc(base: BaseArea, c: { x: number; y: number }, r: number): Array<{ x: number; y: number; d: number }> {
  const out: Array<{ x: number; y: number; d: number }> = [];
  const R = Math.ceil(r);
  for (let y = c.y - R; y <= c.y + R; y++)
    for (let x = c.x - R; x <= c.x + R; x++) {
      const d = Math.hypot(x - c.x, y - c.y);
      if (d <= r && inside(base, x, y)) out.push({ x, y, d });
    }
  return out;
}

/** Every tile reachable from the start. */
function reachable(base: BaseArea, open: (x: number, y: number) => boolean): Set<string> {
  return floodFill(base, base.start, (x, y) => open(x, y));
}

function around(base: BaseArea, c: { x: number; y: number }, r: number): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (let y = c.y - r; y <= c.y + r; y++) for (let x = c.x - r; x <= c.x + r; x++) if (inside(base, x, y)) out.push({ x, y });
  return out;
}

function floodFill(base: BaseArea, from: { x: number; y: number }, ok: (x: number, y: number) => boolean): Set<string> {
  const seen = new Set<string>();
  if (!inside(base, from.x, from.y) || !ok(from.x, from.y)) return seen;
  const queue = [from];
  seen.add(tileKey(from.x, from.y));
  while (queue.length) {
    const { x, y } = queue.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const n = { x: x + dx, y: y + dy };
      const k = tileKey(n.x, n.y);
      if (!seen.has(k) && inside(base, n.x, n.y) && ok(n.x, n.y)) {
        seen.add(k);
        queue.push(n);
      }
    }
  }
  return seen;
}

/** A random walkable spot, not right by the start (where new players appear). */
function randomTarget(base: BaseArea, terrain: AreaTerrain, rand: () => number): { x: number; y: number } {
  for (let i = 0; i < 200; i++) {
    const x = 2 + Math.floor(rand() * (base.width - 4));
    const y = 2 + Math.floor(rand() * (base.height - 4));
    if (Math.hypot(x - base.start.x, y - base.start.y) > 7 && walkableNow(base, terrain, x, y)) return { x, y };
  }
  return { x: Math.min(base.width - 3, base.start.x + 10), y: base.start.y };
}

function randomWater(base: BaseArea, terrain: AreaTerrain, rand: () => number): { x: number; y: number } | undefined {
  const water: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < base.height; y++) for (let x = 0; x < base.width; x++) if (tileNow(base, terrain, x, y).ground === base.tiles.water) water.push({ x, y });
  return water.length ? water[Math.floor(rand() * water.length)] : undefined;
}
