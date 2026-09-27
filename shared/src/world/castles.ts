/**
 * A castle in every world, locked. Its key comes from a quest told only in pictures: find the
 * things it shows (three lanterns and two bells, say) hidden about that world's map. With the
 * key, three guardians wait inside — strong, evolved monsters — and beating them all opens the
 * treasure: eggs, potions, XP. The castles are content (shared/content/castles.json; where each
 * stands is in its world's .meta.json). Pure rules; the device keeps its progress.
 */

export interface CastleDef {
  worldId: string;
  navn: string;
  /** What to find: a drawn icon and how many (told in pictures, for children who can't read yet). */
  quest: Array<{ icon: string; count: number }>;
  guardians: Array<{ speciesId: string; stage: number }>;
  rewards: { eggs: number; items: Record<string, number>; xp: number };
}

export interface CastleConfig {
  castles: CastleDef[];
}

/** One player's progress at a castle. */
export interface CastleProgress {
  /** The quest things picked up (their keys). */
  found: string[];
  /** How many guardians are beaten. */
  beaten: number;
  /** The treasure has been taken. */
  done?: boolean;
}

export interface QuestSpot {
  key: string;
  icon: string;
  x: number;
  y: number;
}

function seeded(text: string): () => number {
  let a = 2166136261;
  for (const ch of text) a = Math.imul(a ^ ch.codePointAt(0)!, 16777619) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Where a castle's quest things lie on its world's map: spread out over the open tiles `open`
 * (always the same places, so they can be looked for), at least a few steps from each other.
 */
export function questSpots(castle: CastleDef, open: ReadonlyArray<{ x: number; y: number }>): QuestSpot[] {
  const rand = seeded(`${castle.worldId}:quest`);
  const spots: QuestSpot[] = [];
  const want = castle.quest.flatMap((q) => Array.from({ length: q.count }, () => q.icon));
  for (let i = 0, tries = 0; i < want.length && tries < 2000 && open.length > 0; tries++) {
    const tile = open[Math.floor(rand() * open.length)]!;
    // Spread out: not within 6 tiles of another (relaxed if the map is small).
    const minGap = tries < 1000 ? 6 : 1;
    if (spots.some((s) => Math.abs(s.x - tile.x) + Math.abs(s.y - tile.y) < minGap)) continue;
    spots.push({ key: `${castle.worldId}:q${i}`, icon: want[i]!, x: tile.x, y: tile.y });
    i++;
  }
  return spots;
}

/** How many of each quest thing are found: [{icon, count, found}]. */
export function questState(castle: CastleDef, spots: readonly QuestSpot[], found: readonly string[]): Array<{ icon: string; count: number; found: number }> {
  return castle.quest.map((q) => ({ icon: q.icon, count: q.count, found: spots.filter((s) => s.icon === q.icon && found.includes(s.key)).length }));
}

/** The key: every quest thing found. */
export function hasKey(castle: CastleDef, spots: readonly QuestSpot[], found: readonly string[]): boolean {
  return questState(castle, spots, found).every((q) => q.found >= q.count);
}
