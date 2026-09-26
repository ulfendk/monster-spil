import { randomUUID } from "node:crypto";
import {
  beastDue,
  chooseBeastSpot,
  freshBeast,
  nextBeastAt,
  type AreaTerrain,
  type BeastDefinition,
  type BeastState,
  type WorldPosition,
} from "@monster-spil/shared";
import type { GameStore } from "./game-store.js";
import type { ServerArea } from "./areas.js";

/** When no place fits (or the map is crowded) a visit is tried again after this. */
const RETRY_MS = 60_000;

/** What the game's room gives the visits. */
export interface VisitHost {
  store: GameStore;
  areas: ServerArea[];
  beasts: BeastDefinition[];
  terrain(areaId: string): AreaTerrain;
  /** Tiles a new beast must keep clear of on this map: players, the dragon (other beasts are added here). */
  occupied(areaId: string): WorldPosition[];
  /** Someone is fighting this beast (solo or a team that has started): it waits before leaving. */
  busy(beastId: string): boolean;
  /** A beast came up, or left (beaten ones are removed by the room itself): tell everyone. */
  changed(): void;
  /** A beast is leaving: the room ends any team gathering at it. */
  leaving(beast: BeastState): void;
  rand(): number;
}

/**
 * Sand serpents and giant eagles coming and going: each kind turns up on its own schedule
 * (the parent's average gap plus a random spread, counted from when the last one left),
 * stays for the parent's stay time, and leaves — but never while someone fights it.
 * Where it comes up is shared/src/raid/beasts.ts.
 */
export class BeastVisits {
  constructor(private readonly host: VisitHost) {
    const now = new Date();
    for (const def of host.beasts) if (!this.data.nextAt[def.id]) this.schedule(def.id, now);
  }

  private get data() {
    return this.host.store.data.beasts;
  }

  get settings() {
    return this.data.settings;
  }

  /** The beasts on the maps right now. */
  get active(): readonly BeastState[] {
    return this.data.active;
  }

  get(id: string): BeastState | undefined {
    return this.data.active.find((b) => b.id === id);
  }

  definition(beastId: string): BeastDefinition | undefined {
    return this.host.beasts.find((d) => d.id === beastId);
  }

  /** When each kind comes next (for the admin portal); only while visits are on. */
  nextAt(beastId: string): string | undefined {
    return this.data.settings.enabled ? this.data.nextAt[beastId] : undefined;
  }

  /** Stores a beast after a fight changed its HP. */
  update(beast: BeastState): void {
    this.data.active = this.data.active.map((b) => (b.id === beast.id ? beast : b));
    this.host.store.changed();
  }

  private schedule(beastId: string, now: Date, ms?: number): void {
    const at = ms === undefined ? nextBeastAt(now, this.data.settings, () => this.host.rand()) : new Date(now.getTime() + ms);
    this.data.nextAt[beastId] = at.toISOString();
    this.host.store.changed();
  }

  /** Called every few seconds: bring on the kinds that are due, and see the ones whose time is up off. */
  tick(now = new Date()): void {
    for (const beast of [...this.data.active]) {
      if (beastDue(beast, now) && !this.host.busy(beast.id)) this.remove(beast.id, now);
    }
    if (!this.data.settings.enabled) return;
    for (const def of this.host.beasts) {
      if (this.data.active.some((b) => b.beastId === def.id)) continue;
      const due = this.data.nextAt[def.id];
      if (!due) this.schedule(def.id, now);
      else if (Date.parse(due) <= now.getTime() && this.appear(def, now)) this.schedule(def.id, now, RETRY_MS);
    }
  }

  /**
   * Brings one on now: the kind given, or any kind not already out. Returns why it can't (a
   * Danish sentence for the admin portal), or undefined.
   */
  call(beastId: string | undefined, now = new Date()): string | undefined {
    const free = this.host.beasts.filter((d) => !this.data.active.some((b) => b.beastId === d.id));
    const def = beastId ? free.find((d) => d.id === beastId) : free[Math.floor(this.host.rand() * free.length)];
    if (!def) return beastId && this.host.beasts.some((d) => d.id === beastId) ? "den er her allerede" : "ingen at kalde på";
    return this.appear(def, now);
  }

  /** Sends one away now (the admin portal); a fight going on keeps it until it is over. */
  dismiss(id: string, now = new Date()): string | undefined {
    const beast = this.get(id);
    if (!beast) return "den er her ikke";
    if (this.host.busy(id)) return "nogen kæmper mod den lige nu";
    this.remove(id, now);
    return undefined;
  }

  /** It was beaten: gone at once, and its kind comes back on the usual schedule. */
  beaten(id: string, now = new Date()): void {
    const beast = this.get(id);
    if (!beast) return;
    this.data.active = this.data.active.filter((b) => b.id !== id);
    this.schedule(beast.beastId, now);
  }

  /** The parent changed the settings: plan every kind's next visit by them. */
  settingsChanged(now = new Date()): void {
    for (const def of this.host.beasts) if (!this.data.active.some((b) => b.beastId === def.id)) this.schedule(def.id, now);
  }

  private remove(id: string, now: Date): void {
    const beast = this.get(id);
    if (!beast) return;
    this.host.leaving(beast);
    this.data.active = this.data.active.filter((b) => b.id !== id);
    this.schedule(beast.beastId, now);
    this.host.changed();
  }

  /** Finds a place and brings the beast on. Returns why not, or undefined. */
  private appear(def: BeastDefinition, now: Date): string | undefined {
    const areas = this.host.areas.filter((a) => a.base);
    const order = [...areas].sort(() => this.host.rand() - 0.5);
    for (const area of order) {
      const others = this.data.active.filter((b) => b.areaId === area.areaId);
      const spot = chooseBeastSpot(area.base!, this.host.terrain(area.areaId), def.habitat, {
        occupied: [...this.host.occupied(area.areaId), ...others],
        rand: () => this.host.rand(),
      });
      if (!spot) continue;
      const beast = freshBeast(def, randomUUID(), { areaId: area.areaId, ...spot }, now, this.data.settings);
      this.data.active = [...this.data.active, beast];
      delete this.data.nextAt[def.id];
      this.host.store.changed();
      this.host.changed();
      return undefined;
    }
    return def.habitat === "sand" ? "der er ingen sand at komme op af" : "der er ingen skovkant at lande ved";
  }
}
