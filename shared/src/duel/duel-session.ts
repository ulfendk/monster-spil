import type { BattleAction, BattleParticipant, BattleState } from "../types/battle.js";
import { createBattle, resolveTurn } from "../battle/engine.js";
import { createRng } from "../battle/rng.js";

/**
 * Pure state machine for one player-vs-player duel, in the same style as the
 * trade session: plain serializable data in, new plain data out, so the server
 * room and the tests drive exactly the same logic. The battle itself is the
 * normal `resolveTurn`; this only collects one action per player and decides
 * when a turn is ready.
 *
 *   invited --accept--> active --KO / forfeit--> done
 *        \____________ cancel (any time) _______/--> cancelled
 */
export type DuelPhase = "invited" | "active" | "done" | "cancelled";

/** A duel move choice. No "catch" — you can't catch another player's creature. */
export type DuelAction = { kind: "move"; moveId: string } | { kind: "flee" };

/** Turns in a row a player may fail to answer before they forfeit. */
export const MAX_MISSED_TURNS = 2;

export interface DuelSession {
  id: string;
  phase: DuelPhase;
  inviterId: string;
  inviteeId: string;
  /** Snapshots taken when each side joined, so a duel never depends on a later save edit. */
  inviterSeat: BattleParticipant;
  inviteeSeat?: BattleParticipant;
  battle?: BattleState;
  /** Actions chosen this turn and not yet resolved. Never sent to clients — see `duelView`. */
  pending: Record<string, DuelAction>;
  /** Consecutive turns each player has failed to answer in time. */
  missed: Record<string, number>;
}

/** What a client may see: the battle plus who has already answered this turn — never what they chose. */
export interface DuelView {
  id: string;
  phase: DuelPhase;
  inviterId: string;
  inviteeId: string;
  battle?: BattleState;
  answered: string[];
}

export type DuelResult = { ok: true; session: DuelSession } | { ok: false; reason: string };

const fail = (reason: string): DuelResult => ({ ok: false, reason });

export function createDuel(id: string, inviterId: string, inviteeId: string, seat: BattleParticipant): DuelResult {
  if (inviterId === inviteeId) return fail("cannot duel yourself");
  if (seat.playerId !== inviterId) return fail("seat belongs to someone else");
  return {
    ok: true,
    session: { id, phase: "invited", inviterId, inviteeId, inviterSeat: seat, pending: {}, missed: {} },
  };
}

export function duelInvolves(session: DuelSession, playerId: string): boolean {
  return session.inviterId === playerId || session.inviteeId === playerId;
}

export function duelOpponentOf(session: DuelSession, playerId: string): string {
  return session.inviterId === playerId ? session.inviteeId : session.inviterId;
}

/** `seed` is injected (never Math.random here) so the server can log it and a duel is replayable. */
export function acceptDuel(session: DuelSession, playerId: string, seat: BattleParticipant, seed: number): DuelResult {
  if (session.phase !== "invited") return fail("duel is not waiting for an answer");
  if (session.inviteeId !== playerId) return fail("only the invited player can accept");
  if (seat.playerId !== playerId) return fail("seat belongs to someone else");
  return {
    ok: true,
    session: {
      ...session,
      phase: "active",
      inviteeSeat: seat,
      battle: createBattle(seed, session.inviterSeat, seat, "pvp"),
    },
  };
}

/** Records a choice; when both players have answered, resolves the turn. */
export function submitAction(session: DuelSession, playerId: string, action: DuelAction): DuelResult {
  if (session.phase !== "active" || !session.battle) return fail("duel is not active");
  if (!duelInvolves(session, playerId)) return fail("not part of this duel");
  const me = session.battle.participants.find((p) => p.playerId === playerId);
  if (!me) return fail("not part of this duel");
  if (action.kind === "move" && !me.moves[action.moveId]) return fail("unknown move");
  if (action.kind !== "move" && action.kind !== "flee") return fail("unknown action");
  if (session.pending[playerId]) return fail("already answered this turn");

  const next: DuelSession = { ...session, pending: { ...session.pending, [playerId]: action } };
  const both = next.pending[session.inviterId] && next.pending[session.inviteeId];
  return { ok: true, session: both ? resolvePending(next) : next };
}

/** The turn timer ran out: resolve with whatever was chosen, and count the silent player's miss. */
export function timeoutTurn(session: DuelSession): DuelResult {
  if (session.phase !== "active" || !session.battle) return fail("duel is not active");
  return { ok: true, session: resolvePending(session) };
}

/** A player left or gave up: resolves immediately in the opponent's favour. */
export function forfeitDuel(session: DuelSession, playerId: string): DuelSession {
  if (session.phase === "invited") return { ...session, phase: "cancelled" };
  if (session.phase !== "active" || !session.battle) return session;
  return finishTurn(session, { [playerId]: { kind: "flee" } });
}

export function cancelDuel(session: DuelSession): DuelSession {
  return session.phase === "done" ? session : { ...session, phase: "cancelled" };
}

export function duelView(session: DuelSession): DuelView {
  return {
    id: session.id,
    phase: session.phase,
    inviterId: session.inviterId,
    inviteeId: session.inviteeId,
    ...(session.battle ? { battle: session.battle } : {}),
    answered: Object.keys(session.pending),
  };
}

function resolvePending(session: DuelSession): DuelSession {
  const missed = { ...session.missed };
  for (const id of [session.inviterId, session.inviteeId]) {
    missed[id] = session.pending[id] ? 0 : (missed[id] ?? 0) + 1;
  }
  const idle = [session.inviterId, session.inviteeId].filter((id) => (missed[id] ?? 0) >= MAX_MISSED_TURNS);

  if (idle.length === 2) return { ...session, phase: "cancelled", pending: {}, missed };
  if (idle.length === 1) return finishTurn({ ...session, missed }, { [idle[0]!]: { kind: "flee" } });
  return finishTurn({ ...session, missed }, session.pending);
}

function finishTurn(session: DuelSession, chosen: Record<string, DuelAction>): DuelSession {
  const battle = session.battle!;
  // A fresh rng per turn, derived from the seed and turn number, keeps the session plain data.
  const rng = createRng((battle.seed ^ Math.imul(battle.turn + 1, 0x9e3779b1)) >>> 0);
  const next = resolveTurn(
    battle,
    Object.entries(chosen).map(([playerId, action]) => ({ playerId, action: action as BattleAction })),
    rng
  );
  return { ...session, battle: next, phase: next.outcome === "ongoing" ? "active" : "done", pending: {} };
}
