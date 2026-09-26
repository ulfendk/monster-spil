import { randomInt, randomUUID } from "node:crypto";
import {
  caveDue,
  caveKind,
  pickCaveKind,
  chooseCaveSpot,
  freshCave,
  nextCaveAt,
  planCaveVisit,
  type AreaTerrain,
  type CaveConfig,
  type CaveState,
  type CaveVisit,
  type WorldPosition,
} from "@monster-spil/shared";
import type { GameStore } from "./game-store.js";
import type { ServerArea } from "./areas.js";

/** When no mountain face fits, the next try comes after this. */
const RETRY_MS = 60_000;

/** What the game's room gives the caves. */
export interface CaveHost {
  store: GameStore;
  areas: ServerArea[];
  config: CaveConfig;
  terrain(areaId: string): AreaTerrain;
  /** Tiles a new cave must keep clear of on this map: players, the dragon, beasts. */
  occupied(areaId: string): WorldPosition[];
  /** A cave opened, closed or someone went in: tell everyone. */
  changed(): void;
  rand(): number;
}

/**
 * Caves opening in the mountains now and then (the parent's average gap plus a random
 * spread) and closing after the open time. One at a time. Each player may go in once per
 * opening; what's inside is planned here, the minigame itself runs on the device.
 * Where one opens is shared/src/cave/caves.ts.
 */
export class CaveOpenings {
  constructor(private readonly host: CaveHost) {
    if (!this.data.nextAt) this.schedule(new Date());
  }

  private get data() {
    return this.host.store.data.caves;
  }

  get settings() {
    return this.data.settings;
  }

  get active(): readonly CaveState[] {
    return this.data.active;
  }

  get nextAt(): string | undefined {
    return this.data.settings.enabled && this.data.active.length === 0 ? this.data.nextAt : undefined;
  }

  get(id: string): CaveState | undefined {
    return this.data.active.find((c) => c.id === id);
  }

  private schedule(now: Date, ms?: number): void {
    const at = ms === undefined ? nextCaveAt(now, this.data.settings, () => this.host.rand()) : new Date(now.getTime() + ms);
    this.data.nextAt = at.toISOString();
    this.host.store.changed();
  }

  /** Called every few seconds: close the cave whose time is up, open the next when due. */
  tick(now = new Date()): void {
    for (const cave of [...this.data.active]) if (caveDue(cave, now)) this.close(cave.id, now);
    if (!this.data.settings.enabled || this.data.active.length > 0) return;
    if (!this.data.nextAt) return this.schedule(now);
    if (Date.parse(this.data.nextAt) <= now.getTime() && this.open(now)) this.schedule(now, RETRY_MS);
  }

  /** Opens one now: a random kind, or the kind asked for (the admin portal). Returns why not (Danish, for the portal), or undefined. */
  open(now = new Date(), kindId?: string): string | undefined {
    if (this.data.active.length > 0) return "der er allerede en åben grotte";
    const kind = kindId ? this.host.config.kinds.find((k) => k.id === kindId) : pickCaveKind(this.host.config, () => this.host.rand());
    if (!kind) return kindId ? "den slags grotte findes ikke" : "caves.json har ingen slags grotter";
    const order = this.host.areas.filter((a) => a.base).sort(() => this.host.rand() - 0.5);
    for (const area of order) {
      const spot = chooseCaveSpot(area.base!, this.host.terrain(area.areaId), { occupied: this.host.occupied(area.areaId), rand: () => this.host.rand() });
      if (!spot) continue;
      this.data.active = [freshCave(randomUUID(), kind.id, { areaId: area.areaId, ...spot }, now, this.data.settings)];
      this.data.nextAt = undefined;
      this.host.store.changed();
      this.host.changed();
      return undefined;
    }
    return "der er ingen bjergside, hvor en grotte kan åbne";
  }

  /** Closes one now (its time is up, or a parent closed it). The next is planned from now. */
  close(id: string, now = new Date()): string | undefined {
    if (!this.get(id)) return "den grotte er ikke åben";
    this.data.active = this.data.active.filter((c) => c.id !== id);
    this.schedule(now);
    this.host.changed();
    return undefined;
  }

  /** A player goes in: their visit, or why not ("cave closed", "cave visited"). Adjacency is checked by the room. */
  enter(caveId: string, playerId: string): CaveVisit | string {
    const cave = this.get(caveId);
    if (!cave) return "cave closed";
    if (cave.visitedBy.includes(playerId)) return "cave visited";
    cave.visitedBy.push(playerId);
    this.host.store.changed();
    this.host.changed();
    const kind = caveKind(this.host.config, cave.kind);
    if (!kind) return "cave closed";
    return planCaveVisit(this.host.config, kind, cave.id, randomInt(0, 2 ** 31), () => this.host.rand());
  }

  /** The parent changed the settings: plan the next opening by them. */
  settingsChanged(now = new Date()): void {
    if (this.data.active.length === 0) this.schedule(now);
  }
}
