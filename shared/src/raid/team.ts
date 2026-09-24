import type { BattleLogEntry, BattleParticipant, BattleState } from "../types/battle.js";
import type { DuelAction } from "../duel/duel-session.js";
import { resolveTurn } from "../battle/engine.js";
import { createRng } from "../battle/rng.js";
import { BOSS_PLAYER_ID, bossParticipant, type BossDefinition, type RaidState } from "./raid.js";

/**
 * Teaming up against the family dragon. One player gathers a team at the lair,
 * others join, the leader starts. Each turn every member picks a move (like a
 * duel); when all have picked, everyone still standing attacks in speed order and
 * the dragon strikes back at one of them. Damage comes off the same shared raid HP
 * and is credited per player, exactly like solo attempts.
 *
 * Pure and plain data, like the duel session: the server stores it and calls these.
 * Every attack is a normal `resolveTurn` between that member and the dragon.
 *
 *   gathering --leader starts--> active --dragon beaten / all out--> done
 *        \________ leader leaves (gathering) _____________________/--> cancelled
 */
export type TeamPhase = "gathering" | "active" | "done" | "cancelled";

export const MAX_TEAM = 6;

/** Consecutive turns a member may stay silent before they are out of the fight. */
export const TEAM_MAX_MISSED = 2;

/** Every member's monster gets this much more HP: +25% per extra player, at most double. */
export function teamHpFactor(size: number): number {
  return Math.min(2, 1 + 0.25 * (Math.max(1, size) - 1));
}

export interface TeamMember {
  playerId: string;
  /** Their monster; once the battle starts, with HP already multiplied by the team factor. */
  seat: BattleParticipant;
  /** "fainted": their monster is out. "left": they fled, went silent or disconnected. */
  status: "in" | "fainted" | "left";
}

export interface TeamSession {
  id: string;
  phase: TeamPhase;
  leaderId: string;
  /** In joining order; the leader first. */
  members: TeamMember[];
  seed: number;
  turn: number;
  log: BattleLogEntry[];
  /** Moves chosen this turn and not yet resolved. Never sent to clients. */
  pending: Record<string, DuelAction>;
  missed: Record<string, number>;
  /** Set when done: "won" = the dragon was beaten, "lost" = nobody left standing. */
  outcome?: "won" | "lost";
}

export type TeamResult = { ok: true; session: TeamSession } | { ok: false; reason: string };

const fail = (reason: string): TeamResult => ({ ok: false, reason });

export function createTeam(id: string, leaderId: string, seat: BattleParticipant): TeamResult {
  if (seat.playerId !== leaderId) return fail("seat belongs to someone else");
  return {
    ok: true,
    session: { id, phase: "gathering", leaderId, members: [{ playerId: leaderId, seat, status: "in" }], seed: 0, turn: 0, log: [], pending: {}, missed: {} },
  };
}

export function teamInvolves(session: TeamSession, playerId: string): boolean {
  return session.members.some((m) => m.playerId === playerId);
}

export function joinTeam(session: TeamSession, playerId: string, seat: BattleParticipant): TeamResult {
  if (session.phase !== "gathering") return fail("team has already started");
  if (teamInvolves(session, playerId)) return fail("already in the team");
  if (seat.playerId !== playerId) return fail("seat belongs to someone else");
  if (session.members.length >= MAX_TEAM) return fail("team is full");
  return { ok: true, session: { ...session, members: [...session.members, { playerId, seat, status: "in" }] } };
}

/** The leader starts the fight: every monster's HP is multiplied by the team factor. `seed` is injected (never Math.random here). */
export function startTeam(session: TeamSession, playerId: string, seed: number): TeamResult {
  if (session.phase !== "gathering") return fail("team has already started");
  if (session.leaderId !== playerId) return fail("only the leader can start");
  const factor = teamHpFactor(session.members.length);
  const members = session.members.map((m) => {
    const hp = Math.round(m.seat.species.baseStats.hp * factor);
    return {
      ...m,
      seat: { ...m.seat, species: { ...m.seat.species, baseStats: { ...m.seat.species.baseStats, hp } }, active: { ...m.seat.active, currentHp: hp } },
    };
  });
  return { ok: true, session: { ...session, phase: "active", seed, members } };
}

/**
 * Someone leaves. While gathering, the leader leaving cancels the team and anyone
 * else just drops out. Mid-fight, the member is out (their damage stays credited);
 * if nobody is left standing the team has lost.
 */
export function leaveTeam(session: TeamSession, playerId: string): TeamSession {
  if (session.phase === "gathering") {
    if (playerId === session.leaderId) return { ...session, phase: "cancelled" };
    return { ...session, members: session.members.filter((m) => m.playerId !== playerId) };
  }
  if (session.phase !== "active") return session;
  const { [playerId]: _dropped, ...pending } = session.pending;
  const members = session.members.map((m) => (m.playerId === playerId && m.status === "in" ? { ...m, status: "left" as const } : m));
  return settle({ ...session, members, pending });
}

export interface TeamTurnResult {
  session: TeamSession;
  raid: RaidState;
  /** True if this very turn beat the dragon. */
  defeatedNow: boolean;
}

/** Records a member's move; when everyone still standing has picked, resolves the turn. */
export function submitTeamAction(session: TeamSession, playerId: string, action: DuelAction, raid: RaidState, boss: BossDefinition, now: Date): ({ ok: true } & TeamTurnResult) | { ok: false; reason: string } {
  if (session.phase !== "active") return { ok: false, reason: "team is not fighting" };
  const member = session.members.find((m) => m.playerId === playerId);
  if (!member || member.status !== "in") return { ok: false, reason: "not in the fight" };
  if (action.kind === "move" && !member.seat.moves[action.moveId]) return { ok: false, reason: "unknown move" };
  if (action.kind !== "move" && action.kind !== "flee") return { ok: false, reason: "unknown action" };
  if (session.pending[playerId]) return { ok: false, reason: "already answered this turn" };
  const next = { ...session, pending: { ...session.pending, [playerId]: action } };
  const everyone = next.members.filter((m) => m.status === "in").every((m) => next.pending[m.playerId]);
  if (!everyone) return { ok: true, session: next, raid, defeatedNow: false };
  return { ok: true, ...resolveTeamTurn(next, raid, boss, now) };
}

/** The turn timer ran out: resolve with whatever was picked; the silent ones skip (and are out after TEAM_MAX_MISSED). */
export function timeoutTeamTurn(session: TeamSession, raid: RaidState, boss: BossDefinition, now: Date): TeamTurnResult {
  if (session.phase !== "active") return { session, raid, defeatedNow: false };
  return resolveTeamTurn(session, raid, boss, now);
}

function resolveTeamTurn(session: TeamSession, raidIn: RaidState, boss: BossDefinition, now: Date): TeamTurnResult {
  let raid = raidIn;
  const turn = session.turn + 1;
  const rng = createRng((session.seed ^ Math.imul(turn, 0x9e3779b1)) >>> 0);
  const log: BattleLogEntry[] = [];
  const missed = { ...session.missed };
  const members = session.members.map((m) => ({ ...m }));
  let defeatedNow = false;

  // Silent members skip this turn; too many silent turns in a row and they are out.
  for (const m of members) {
    if (m.status !== "in") continue;
    missed[m.playerId] = session.pending[m.playerId] ? 0 : (missed[m.playerId] ?? 0) + 1;
    if (missed[m.playerId]! >= TEAM_MAX_MISSED) m.status = "left";
  }

  // Everyone who picked attacks, fastest first (ties: joining order — no rng needed).
  const attackers = members
    .map((m, index) => ({ m, index }))
    .filter(({ m }) => m.status === "in" && session.pending[m.playerId])
    .sort((a, b) => b.m.seat.species.baseStats.fart - a.m.seat.species.baseStats.fart || a.index - b.index)
    .map(({ m }) => m);
  for (const m of attackers) {
    if (raid.hp <= 0) break;
    const action = session.pending[m.playerId]!;
    const fight = oneOnOne(session, turn, m.seat, bossParticipant(boss, raid.hp));
    const r = resolveTurn(fight, [{ playerId: m.playerId, action }], rng);
    log.push(...r.log);
    if (action.kind === "flee") {
      m.status = "left";
      continue;
    }
    const hpAfter = r.participants[1].active.currentHp;
    const damage = raid.hp - hpAfter;
    if (damage > 0) {
      raid = { ...raid, hp: hpAfter, damageBy: { ...raid.damageBy, [m.playerId]: (raid.damageBy[m.playerId] ?? 0) + damage } };
    }
    if (hpAfter <= 0) {
      raid = { ...raid, defeatedAt: now.toISOString(), finalBlowBy: m.playerId };
      defeatedNow = true;
    }
  }

  // The dragon strikes back at one member still standing.
  const standing = members.filter((m) => m.status === "in");
  if (raid.hp > 0 && standing.length > 0) {
    const target = standing[Math.floor(rng.next() * standing.length)]!;
    const dragonMoves = boss.moves.map((mv) => mv.id);
    const moveId = dragonMoves[Math.floor(rng.next() * dragonMoves.length)]!;
    const fight = oneOnOne(session, turn, target.seat, bossParticipant(boss, raid.hp));
    const r = resolveTurn(fight, [{ playerId: BOSS_PLAYER_ID, action: { kind: "move", moveId } }], rng);
    // The engine ends a one-on-one when someone faints; only the entries matter here.
    log.push(...r.log);
    target.seat = { ...target.seat, active: { ...target.seat.active, currentHp: r.participants[0].active.currentHp } };
    if (target.seat.active.currentHp <= 0) target.status = "fainted";
  }

  const next = settle({ ...session, turn, members, missed, pending: {}, log: [...session.log, ...log] }, raid);
  return { session: next, raid, defeatedNow };
}

/** A two-participant battle state for one exchange, numbered so the engine logs the team's turn. */
function oneOnOne(session: TeamSession, turn: number, member: BattleParticipant, dragon: BattleParticipant): BattleState {
  return { seed: session.seed, turn: turn - 1, mode: "boss", participants: [member, dragon], log: [], outcome: "ongoing" };
}

/** Ends the fight when the dragon is down or nobody is standing. */
function settle(session: TeamSession, raid?: RaidState): TeamSession {
  if (session.phase !== "active") return session;
  if (raid && raid.hp <= 0) return { ...session, phase: "done", outcome: "won" };
  if (!session.members.some((m) => m.status === "in")) return { ...session, phase: "done", outcome: "lost" };
  return session;
}

/** One teammate as every client may see them. */
export interface TeamMemberView {
  playerId: string;
  speciesId: string;
  navn: string;
  hp: number;
  maxHp: number;
  status: TeamMember["status"];
}

/**
 * What one player sees: the team, who has picked this turn (never what), and — once
 * fighting — a two-participant BattleState of their own monster against the dragon
 * with the whole team's log, so the normal battle screen can show it.
 */
export interface TeamView {
  id: string;
  phase: TeamPhase;
  leaderId: string;
  members: TeamMemberView[];
  answered: string[];
  outcome?: TeamSession["outcome"];
  hpFactor: number;
  battle?: BattleState;
}

export function teamViewFor(session: TeamSession, viewerId: string, raid: RaidState, boss: BossDefinition): TeamView {
  const me = session.members.find((m) => m.playerId === viewerId);
  const view: TeamView = {
    id: session.id,
    phase: session.phase,
    leaderId: session.leaderId,
    members: session.members.map((m) => ({
      playerId: m.playerId,
      speciesId: m.seat.species.id,
      navn: m.seat.species.navn,
      hp: m.seat.active.currentHp,
      maxHp: m.seat.species.baseStats.hp,
      status: m.status,
    })),
    answered: Object.keys(session.pending),
    hpFactor: teamHpFactor(session.members.length),
    ...(session.outcome ? { outcome: session.outcome } : {}),
  };
  if (me && session.phase !== "gathering") {
    // The battle is the team's: it stays "ongoing" while anyone still fights, even if my
    // own monster has fainted (I watch the rest); `members` shows my own status.
    const outcome = session.phase !== "done" ? "ongoing" : session.outcome === "won" ? "won" : "lost";
    view.battle = {
      seed: session.seed,
      turn: session.turn,
      mode: "boss",
      participants: [me.seat, bossParticipant(boss, raid.hp)],
      log: session.log,
      outcome,
      ...(outcome === "won" ? { winnerId: viewerId } : outcome === "lost" ? { winnerId: BOSS_PLAYER_ID } : {}),
    };
  }
  return view;
}
