/**
 * A player's progress: experience (XP) for playing — more for playing well — which adds up
 * to a level with a title, unlocks new looks for their figure and makes their monsters a
 * little stronger; and badges for things they have done. Pure rules over plain data; the
 * device keeps the progress in its save (it's the source of truth) and tells the server
 * the level and badges so everyone can see them. The numbers are content:
 * shared/content/levels.json and shared/content/badges.json.
 */

export interface LevelConfig {
  maxLevel: number;
  /** Level n needs xpPerLevel × n(n−1)/2 XP in all: each level asks a little more than the last. */
  xpPerLevel: number;
  xp: {
    catch: number;
    /** On top of `catch` for a species never caught before. */
    newSpecies: number;
    wildWin: number;
    duelWin: number;
    /** For a duel lost: trying counts too. */
    duelTry: number;
    /** 1 XP per this much damage done to the dragon or a beast. */
    bossDamagePerXp: number;
    dragonWin: number;
    beastWin: number;
    caveVisit: number;
    trade: number;
  };
  /** From this level on, this title (sorted by level). */
  titles: Array<{ level: number; navn: string }>;
  /** Headwear for the figure, from this level on (ids the figure drawing knows). */
  looks: Array<{ level: number; id: string; navn: string }>;
  /** Monsters' attack and defence grow by this much per level above 1, up to monsterBonusMax. */
  monsterBonusPerLevel: number;
  monsterBonusMax: number;
}

/** A badge: earned when a counter reaches `min`. `stat` is one of the counters below, "species" or "level". */
export interface Badge {
  id: string;
  navn: string;
  icon: string;
  stat: string;
  min: number;
}

/** What the save keeps. */
export interface Progress {
  xp: number;
  /** Counters: catch, caveCatch, caveVisit, cave:<kind>, wildWin, duel, duelWin, trade, food, bossDamage, dragonWin, beast:<id>. */
  stats: Record<string, number>;
  /** Badge id → when it was earned (ISO). */
  badges: Record<string, string>;
}

export const emptyProgress = (): Progress => ({ xp: 0, stats: {}, badges: {} });

/** Something that happened in the game, worth XP and counted for badges. */
export type ProgressEvent =
  | { kind: "catch"; newSpecies: boolean; cave?: boolean }
  | { kind: "wildWin" }
  | { kind: "duel"; won: boolean }
  | { kind: "bossDamage"; amount: number }
  | { kind: "bossWin"; boss: "dragon" | { beastId: string } }
  | { kind: "caveVisit"; caveKind: string }
  | { kind: "trade" }
  | { kind: "food" };

/** XP needed in all to reach `level`. */
export function xpForLevel(level: number, config: LevelConfig): number {
  const n = Math.max(1, Math.floor(level));
  return (config.xpPerLevel * n * (n - 1)) / 2;
}

export function levelForXp(xp: number, config: LevelConfig): number {
  let level = 1;
  while (level < config.maxLevel && xp >= xpForLevel(level + 1, config)) level++;
  return level;
}

/** How far into the current level (0–1), for a progress bar; 1 at the top level. */
export function levelProgress(xp: number, config: LevelConfig): number {
  const level = levelForXp(xp, config);
  if (level >= config.maxLevel) return 1;
  const from = xpForLevel(level, config);
  return (xp - from) / (xpForLevel(level + 1, config) - from);
}

export function titleFor(level: number, config: LevelConfig): string {
  let title = config.titles[0]?.navn ?? "";
  for (const t of config.titles) if (level >= t.level) title = t.navn;
  return title;
}

/** The finest headwear unlocked at this level (the figure wears it), if any. */
export function lookFor(level: number, config: LevelConfig): string | undefined {
  let look: string | undefined;
  for (const l of config.looks) if (level >= l.level) look = l.id;
  return look;
}

/** How much stronger (attack and defence) a player's monsters are at this level: 0 = not at all, 0.3 = 30%. */
export function monsterBonus(level: number, config: LevelConfig): number {
  return Math.min(config.monsterBonusMax, Math.max(0, (level - 1) * config.monsterBonusPerLevel));
}

/** Attack and defence with the level bonus, rounded (HP stays, so health bars and saves are unchanged). */
export function boostStats<S extends { angreb: number; forsvar: number }>(stats: S, level: number, config: LevelConfig): S {
  const k = 1 + monsterBonus(level, config);
  return { ...stats, angreb: Math.round(stats.angreb * k), forsvar: Math.round(stats.forsvar * k) };
}

function xpFor(event: ProgressEvent, config: LevelConfig): number {
  const x = config.xp;
  switch (event.kind) {
    case "catch":
      return x.catch + (event.newSpecies ? x.newSpecies : 0);
    case "wildWin":
      return x.wildWin;
    case "duel":
      return event.won ? x.duelWin : x.duelTry;
    case "bossDamage":
      return Math.floor(Math.max(0, event.amount) / Math.max(1, x.bossDamagePerXp));
    case "bossWin":
      return event.boss === "dragon" ? x.dragonWin : x.beastWin;
    case "caveVisit":
      return x.caveVisit;
    case "trade":
      return x.trade;
    case "food":
      return 0;
  }
}

function count(stats: Record<string, number>, key: string, by = 1): void {
  stats[key] = (stats[key] ?? 0) + by;
}

export interface AwardResult {
  progress: Progress;
  gained: number;
  /** Set when this event took the player up a level (or more). */
  levelUp?: { from: number; to: number };
  /** Badges earned by this event. */
  newBadges: Badge[];
}

/**
 * Counts an event: its XP, its counters, a level-up, and any badges it earned. `species` =
 * how many species the player has caught (for the "species" badges).
 */
export function award(progress: Progress, event: ProgressEvent, context: { species: number; now: Date }, config: LevelConfig, badges: readonly Badge[]): AwardResult {
  const stats = { ...progress.stats };
  switch (event.kind) {
    case "catch":
      count(stats, "catch");
      if (event.cave) count(stats, "caveCatch");
      break;
    case "wildWin":
      count(stats, "wildWin");
      break;
    case "duel":
      count(stats, "duel");
      if (event.won) count(stats, "duelWin");
      break;
    case "bossDamage":
      count(stats, "bossDamage", Math.max(0, Math.round(event.amount)));
      break;
    case "bossWin":
      count(stats, event.boss === "dragon" ? "dragonWin" : `beast:${event.boss.beastId}`);
      break;
    case "caveVisit":
      count(stats, "caveVisit");
      count(stats, `cave:${event.caveKind}`);
      break;
    case "trade":
      count(stats, "trade");
      break;
    case "food":
      count(stats, "food");
      break;
  }
  const gained = xpFor(event, config);
  const xp = progress.xp + gained;
  const from = levelForXp(progress.xp, config);
  const to = levelForXp(xp, config);
  const next: Progress = { xp, stats, badges: { ...progress.badges } };
  const newBadges = earnedBadges(next, context.species, config, badges);
  for (const b of newBadges) next.badges[b.id] = context.now.toISOString();
  return { progress: next, gained, ...(to > from ? { levelUp: { from, to } } : {}), newBadges };
}

/** Badges the counters qualify for that aren't earned yet. */
export function earnedBadges(progress: Progress, species: number, config: LevelConfig, badges: readonly Badge[]): Badge[] {
  const level = levelForXp(progress.xp, config);
  const value = (stat: string) => (stat === "level" ? level : stat === "species" ? species : progress.stats[stat] ?? 0);
  return badges.filter((b) => !progress.badges[b.id] && value(b.stat) >= b.min);
}

/**
 * For a save from before progress existed: what it has earned so far, from what it
 * remembers — its catches, species and monsters — so nobody starts again at level 1.
 */
export function progressFromHistory(caughtCounts: Record<string, number>, now: Date, config: LevelConfig, badges: readonly Badge[]): Progress {
  const catches = Object.values(caughtCounts).reduce((sum, n) => sum + Math.max(0, n), 0);
  const species = Object.values(caughtCounts).filter((n) => n > 0).length;
  const progress: Progress = { xp: catches * config.xp.catch + species * config.xp.newSpecies, stats: catches ? { catch: catches } : {}, badges: {} };
  for (const b of earnedBadges(progress, species, config, badges)) progress.badges[b.id] = now.toISOString();
  return progress;
}
