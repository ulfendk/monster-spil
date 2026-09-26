import type { CreatureSpecies, StatBlock, TypeId } from "../types/creature.js";
import type { Move } from "../types/move.js";
import type { BattleParticipant, BattleState } from "../types/battle.js";
import type { WorldPosition } from "../world/adjacency.js";
import { createBattle, resolveTurn } from "../battle/engine.js";
import { createRng } from "../battle/rng.js";

/**
 * The family dragon: one boss whose HP is shared by everyone on the server. Each
 * player fights it in their own battle; whatever damage they deal comes off the
 * shared HP. Pure functions over plain data — the server stores the state and
 * calls these, the same way it drives duels.
 */

/**
 * What a fight needs to know about a boss: the weekly dragon and the visiting beasts
 * (sand serpents, giant eagles — see beasts.ts) alike.
 */
export interface FightBoss {
  id: string;
  navn: string;
  type: TypeId;
  maxHp: number;
  baseStats: StatBlock;
  moves: Move[];
  spriteFront: string;
  spriteBack: string;
  sound?: string;
  /** The species every player who hurt it receives when it is beaten. */
  rewardSpeciesId: string;
  /** Seconds a player must wait between attempts. */
  restSeconds: number;
}

/** A boss as written in shared/content/raid/<id>.json. */
export interface BossDefinition extends FightBoss {
  /** Where the boss sits on the map when its week starts; players must stand next to it to fight. It may fly off later (see roam.ts). */
  lair: WorldPosition;
}

/** A boss's shared HP and who hurt it: everyone fights their own battle, and all damage comes off this. */
export interface FightState {
  hp: number;
  maxHp: number;
  /** Total damage per playerId. */
  damageBy: Record<string, number>;
  defeatedAt?: string;
  finalBlowBy?: string;
}

export interface RaidState extends FightState {
  bossId: string;
  /** Monday (Danish time, YYYY-MM-DD) of the week this dragon belongs to; a new week wakes a fresh one. */
  weekId: string;
  /** Where the dragon sits now, once it has flown off from its home lair (a new week's dragon starts at home). */
  lair?: WorldPosition;
}

/** What every client may see about the dragon. */
export interface RaidView {
  bossId: string;
  weekId: string;
  hp: number;
  maxHp: number;
  defeated: boolean;
  /** How many players have hurt it this week. */
  contributors: number;
  /** Where it sits right now (protocol v10; without it, at the boss's home lair). */
  lair?: WorldPosition;
  /** A team gathering at the lair that others can join (protocol v5; set by the server). */
  gathering?: { teamId: string; leaderId: string; size: number };
}

/** The boss always fights under this id. */
export const BOSS_PLAYER_ID = "dragon";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** The Monday (in `timeZone`, default Danish time) of the week `date` falls in, as YYYY-MM-DD. */
export function weekIdFor(date: Date, timeZone = "Europe/Copenhagen"): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  const back = WEEKDAYS.indexOf(parts.weekday!);
  const monday = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) - back));
  return monday.toISOString().slice(0, 10);
}

export function freshRaid(boss: BossDefinition, weekId: string): RaidState {
  return { bossId: boss.id, weekId, hp: boss.maxHp, maxHp: boss.maxHp, damageBy: {} };
}

/** The raid for the week `now` is in: the stored one if it still belongs to it, otherwise a newly woken dragon. */
export function currentRaid(stored: RaidState | undefined, boss: BossDefinition, now: Date): RaidState {
  const weekId = weekIdFor(now);
  if (stored && stored.bossId === boss.id && stored.weekId === weekId) return stored;
  return freshRaid(boss, weekId);
}

export function raidView(raid: RaidState): RaidView {
  return {
    bossId: raid.bossId,
    weekId: raid.weekId,
    hp: raid.hp,
    maxHp: raid.maxHp,
    defeated: raid.hp <= 0,
    contributors: Object.values(raid.damageBy).filter((d) => d > 0).length,
  };
}

export function bossSpecies(boss: FightBoss): CreatureSpecies {
  return {
    id: boss.id,
    navn: boss.navn,
    type: boss.type,
    baseStats: { ...boss.baseStats, hp: boss.maxHp },
    moveIds: boss.moves.map((m) => m.id),
    spriteFront: boss.spriteFront,
    spriteBack: boss.spriteBack,
    ...(boss.sound ? { sound: boss.sound } : {}),
    catchRate: 0,
  };
}

export function bossParticipant(boss: FightBoss, hp: number): BattleParticipant {
  return {
    playerId: BOSS_PLAYER_ID,
    species: bossSpecies(boss),
    moves: Object.fromEntries(boss.moves.map((m) => [m.id, m])),
    active: { instanceId: boss.id, speciesId: boss.id, ownerId: BOSS_PLAYER_ID, niveau: 1, currentHp: hp, caughtAt: "" },
  };
}

/** A new attempt: the player's seat against the boss at its current shared HP. */
export function startAttempt(raid: FightState, boss: FightBoss, seat: BattleParticipant, seed: number): BattleState {
  return createBattle(seed, seat, bossParticipant(boss, raid.hp), "boss");
}

export interface RaidTurnResult<S extends FightState = RaidState> {
  raid: S;
  battle: BattleState;
  /** HP this turn took off the dragon. */
  damage: number;
  /** True if this very turn beat the dragon. */
  defeatedNow: boolean;
}

/**
 * One turn of one player's attempt. The dragon's HP in the battle is first set to
 * the shared HP (others may have hurt it meanwhile); the dragon picks its move
 * with the same derived rng, so a turn is reproducible from seed + turn number.
 */
export function raidTurn<S extends FightState>(
  raid: S,
  battle: BattleState,
  playerId: string,
  action: { kind: "move"; moveId: string } | { kind: "flee" },
  now: Date
): RaidTurnResult<S> {
  if (raid.hp <= 0 || battle.outcome !== "ongoing") return { raid, battle, damage: 0, defeatedNow: false };
  const [me, dragon] = battle.participants;
  const synced: BattleState = {
    ...battle,
    participants: [me, { ...dragon, active: { ...dragon.active, currentHp: raid.hp } }],
  };
  const rng = createRng((battle.seed ^ Math.imul(battle.turn + 1, 0x9e3779b1)) >>> 0);
  const moveIds = Object.keys(dragon.moves);
  const dragonMove = moveIds[Math.floor(rng.next() * moveIds.length)]!;
  const next = resolveTurn(
    synced,
    [
      { playerId, action },
      { playerId: BOSS_PLAYER_ID, action: { kind: "move", moveId: dragonMove } },
    ],
    rng
  );
  const hpAfter = next.participants[1].active.currentHp;
  const damage = raid.hp - hpAfter;
  const defeatedNow = hpAfter <= 0;
  return {
    battle: next,
    damage,
    defeatedNow,
    raid: {
      ...raid,
      hp: hpAfter,
      damageBy: damage > 0 ? { ...raid.damageBy, [playerId]: (raid.damageBy[playerId] ?? 0) + damage } : raid.damageBy,
      ...(defeatedNow ? { defeatedAt: now.toISOString(), finalBlowBy: playerId } : {}),
    },
  };
}

/** Everyone who hurt the boss (and so shares the victory). */
export function contributors(raid: FightState): string[] {
  return Object.entries(raid.damageBy)
    .filter(([, damage]) => damage > 0)
    .map(([playerId]) => playerId);
}
