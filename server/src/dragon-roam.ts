import {
  chooseLair,
  nextRoamAt,
  type AreaTerrain,
  type BossDefinition,
  type RaidState,
  type WorldPosition,
} from "@monster-spil/shared";
import type { GameStore } from "./game-store.js";
import type { ServerArea } from "./areas.js";

/** How long the dragon is in the air; nobody can fight it meanwhile. */
export const FLIGHT_MS = 5000;
/** When it is busy (a fight, a disaster) the flight is tried again after this. */
const RETRY_MS = 30_000;

/** What the game's room gives the roaming. */
export interface RoamHost {
  store: GameStore;
  areas: ServerArea[];
  terrain(areaId: string): AreaTerrain;
  boss(): BossDefinition;
  /** This week's raid (waking a fresh dragon if a new week has begun). */
  raid(): RaidState;
  /** Where the dragon sits now. */
  lair(): WorldPosition;
  /** Someone is fighting the dragon or gathering a team for it, or a disaster is coming. */
  busy(): boolean;
  /** Where players stand. */
  players(): WorldPosition[];
  /** The dragon has taken off for `to`: store it, tell everyone, clear food from the tile. */
  flew(from: WorldPosition, to: WorldPosition): void;
  rand(): number;
}

/**
 * The dragon flying to a new perch now and then: when (the parent's average gap plus a
 * random spread), where (shared/src/raid/roam.ts) and whether it is a good moment (not
 * during a fight, a gathering team or a disaster, and not while it sleeps).
 */
export class DragonRoam {
  private flyingUntil = 0;

  constructor(private readonly host: RoamHost) {
    if (!host.store.data.roam.nextAt) this.schedule(new Date());
  }

  private get data() {
    return this.host.store.data.roam;
  }

  get settings() {
    return this.data.settings;
  }

  get nextAt(): string | undefined {
    return this.data.settings.enabled ? this.data.nextAt : undefined;
  }

  /** True while the dragon is in the air. */
  isFlying(now = Date.now()): boolean {
    return now < this.flyingUntil;
  }

  schedule(now = new Date()): void {
    this.data.nextAt = nextRoamAt(now, this.data.settings, () => this.host.rand()).toISOString();
    this.host.store.changed();
  }

  /** Called every few seconds. */
  tick(now = new Date()): void {
    if (!this.data.settings.enabled) return;
    if (!this.data.nextAt) return this.schedule(now);
    if (Date.parse(this.data.nextAt) > now.getTime()) return;
    const problem = this.fly(now);
    if (problem === "busy") {
      this.data.nextAt = new Date(now.getTime() + RETRY_MS).toISOString();
      this.host.store.changed();
    } else {
      this.schedule(now);
    }
  }

  /**
   * Takes off for a new perch now. Returns why it can't ("busy": a fight, a team or a
   * disaster is going on; otherwise a Danish sentence for the admin portal), or undefined.
   */
  fly(now = new Date()): string | undefined {
    if (this.isFlying(now.getTime())) return "den flyver allerede";
    const raid = this.host.raid();
    if (raid.hp <= 0) return "dragen sover (til mandag)";
    if (this.host.busy()) return "busy";
    const from = this.host.lair();
    const areas = this.host.areas.filter((a) => a.base);
    // A random map to land on (only one today), then a random perch on it.
    const order = [...areas].sort(() => this.host.rand() - 0.5);
    for (const area of order) {
      const to = chooseLair(area.base!, this.host.terrain(area.areaId), {
        current: from,
        occupied: this.host.players().filter((p) => p.areaId === area.areaId),
        rand: () => this.host.rand(),
      });
      if (!to) continue;
      const target: WorldPosition = { areaId: area.areaId, x: to.x, y: to.y };
      this.flyingUntil = now.getTime() + FLIGHT_MS;
      this.host.flew(from, target);
      return undefined;
    }
    return "der er ingen god plads at lande";
  }

  /** The parent changed the settings: plan the next flight by them. */
  settingsChanged(now = new Date()): void {
    this.schedule(now);
  }
}
