import type { CreatureInstance } from "../types/creature.js";

/**
 * Pure state machine for one trade between two players. Plain serializable
 * data in, new plain data out — same style as the battle engine, so the
 * server room and the tests drive exactly the same logic.
 *
 *   invited --accept--> picking --both confirm--> done
 *        \________________ cancel (any time) ______/--> cancelled
 */
export type TradePhase = "invited" | "picking" | "done" | "cancelled";

export interface TradeSide {
  playerId: string;
  /** A full snapshot, so the other player can see what is on offer. */
  offer?: CreatureInstance;
  confirmed: boolean;
}

export interface TradeSession {
  id: string;
  phase: TradePhase;
  inviter: TradeSide;
  invitee: TradeSide;
}

export type TradeResult = { ok: true; session: TradeSession } | { ok: false; reason: string };

/** What one player must do to their own save once a trade is done. */
export interface TradeDelivery {
  tradeId: string;
  /** instanceId to remove from this player's creatures[]. */
  give: string;
  /** The creature this player now owns (ownerId already rewritten). */
  receive: CreatureInstance;
}

const fail = (reason: string): TradeResult => ({ ok: false, reason });

export function createTrade(id: string, inviterId: string, inviteeId: string): TradeResult {
  if (inviterId === inviteeId) return fail("cannot trade with yourself");
  return {
    ok: true,
    session: {
      id,
      phase: "invited",
      inviter: { playerId: inviterId, confirmed: false },
      invitee: { playerId: inviteeId, confirmed: false },
    },
  };
}

export function involves(session: TradeSession, playerId: string): boolean {
  return session.inviter.playerId === playerId || session.invitee.playerId === playerId;
}

export function otherPlayerId(session: TradeSession, playerId: string): string {
  return session.inviter.playerId === playerId ? session.invitee.playerId : session.inviter.playerId;
}

function sideOf(session: TradeSession, playerId: string): "inviter" | "invitee" | undefined {
  if (session.inviter.playerId === playerId) return "inviter";
  if (session.invitee.playerId === playerId) return "invitee";
  return undefined;
}

export function acceptInvite(session: TradeSession, playerId: string): TradeResult {
  if (session.phase !== "invited") return fail("trade is not waiting for an answer");
  if (session.invitee.playerId !== playerId) return fail("only the invited player can accept");
  return { ok: true, session: { ...session, phase: "picking" } };
}

/** Choosing (or changing) an offer always clears both confirmations, so nobody confirms a swap they haven't seen. */
export function setOffer(session: TradeSession, playerId: string, creature: CreatureInstance): TradeResult {
  if (session.phase !== "picking") return fail("trade is not in the picking phase");
  const side = sideOf(session, playerId);
  if (!side) return fail("not part of this trade");
  if (creature.ownerId !== playerId) return fail("can only offer your own creature");
  return {
    ok: true,
    session: {
      ...session,
      inviter: { ...session.inviter, confirmed: false, ...(side === "inviter" ? { offer: creature } : {}) },
      invitee: { ...session.invitee, confirmed: false, ...(side === "invitee" ? { offer: creature } : {}) },
    },
  };
}

export function confirmTrade(session: TradeSession, playerId: string): TradeResult {
  if (session.phase !== "picking") return fail("trade is not in the picking phase");
  const side = sideOf(session, playerId);
  if (!side) return fail("not part of this trade");
  if (!session.inviter.offer || !session.invitee.offer) return fail("both players must offer a creature first");
  const next: TradeSession = { ...session, [side]: { ...session[side], confirmed: true } };
  const done = next.inviter.confirmed && next.invitee.confirmed;
  return { ok: true, session: done ? { ...next, phase: "done" } : next };
}

export function cancelTrade(session: TradeSession): TradeSession {
  return session.phase === "done" ? session : { ...session, phase: "cancelled" };
}

/** Only valid for a "done" session: the two save-file edits, one per player. */
export function deliveriesFor(session: TradeSession): TradeDelivery[] {
  const a = session.inviter;
  const b = session.invitee;
  if (session.phase !== "done" || !a.offer || !b.offer) return [];
  return [
    { tradeId: session.id, give: a.offer.instanceId, receive: { ...b.offer, ownerId: a.playerId } },
    { tradeId: session.id, give: b.offer.instanceId, receive: { ...a.offer, ownerId: b.playerId } },
  ];
}
