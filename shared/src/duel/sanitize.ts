import type { TypeId } from "../types/creature.js";
import type { BattleParticipant } from "../types/battle.js";
import type { Move } from "../types/move.js";

const TYPES: readonly TypeId[] = ["ild", "vand", "graes", "lyn", "sten"];

const isText = (v: unknown, max = 40): v is string => typeof v === "string" && v.length > 0 && v.length <= max;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, Math.round(v)));

/**
 * Rebuilds a duel seat from known fields only. Clients send their own creature
 * and its species/moves (the server has no content files), so the values are
 * clamped to a sane range: a hand-edited save can't bring an unbeatable monster,
 * and junk never gets stored or forwarded. HP always starts full.
 */
export function sanitizeSeat(raw: unknown, playerId: string): BattleParticipant | undefined {
  const r = raw as { active?: Record<string, unknown>; species?: Record<string, unknown>; moves?: unknown } | null;
  if (!r || typeof r !== "object" || !r.active || !r.species) return undefined;
  const { active: a, species: s } = r;
  const stats = s.baseStats as Record<string, unknown> | undefined;
  if (!isText(a.instanceId, 80) || !isText(a.speciesId) || !isText(a.caughtAt, 40)) return undefined;
  if (!isText(s.id) || !isText(s.navn, 30) || !TYPES.includes(s.type as TypeId) || !stats) return undefined;
  if (![stats.hp, stats.angreb, stats.forsvar, stats.fart].every(isNum)) return undefined;
  if (!isText(s.spriteFront, 120) || !isText(s.spriteBack, 120)) return undefined;

  const rawMoves = Array.isArray(r.moves) ? r.moves : r.moves && typeof r.moves === "object" ? Object.values(r.moves) : [];
  const moves: Record<string, Move> = {};
  for (const m of rawMoves.slice(0, 4) as Record<string, unknown>[]) {
    if (!m || !isText(m.id) || !isText(m.navn, 30) || !TYPES.includes(m.type as TypeId) || !isNum(m.power) || !isNum(m.accuracy)) continue;
    moves[m.id] = { id: m.id, navn: m.navn, type: m.type as TypeId, power: clamp(m.power, 1, 150), accuracy: Math.min(1, Math.max(0, m.accuracy)) };
  }
  if (Object.keys(moves).length === 0) return undefined;

  const baseStats = {
    hp: clamp(stats.hp as number, 1, 150),
    angreb: clamp(stats.angreb as number, 1, 60),
    forsvar: clamp(stats.forsvar as number, 1, 60),
    fart: clamp(stats.fart as number, 1, 60),
  };
  return {
    playerId,
    species: {
      id: s.id,
      navn: s.navn,
      type: s.type as TypeId,
      baseStats,
      moveIds: Object.keys(moves),
      spriteFront: s.spriteFront,
      spriteBack: s.spriteBack,
      catchRate: 0,
    },
    moves,
    active: {
      instanceId: a.instanceId,
      speciesId: a.speciesId,
      ownerId: playerId,
      niveau: 1,
      currentHp: baseStats.hp,
      caughtAt: a.caughtAt,
    },
  };
}
