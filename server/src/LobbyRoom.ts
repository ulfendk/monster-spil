import { randomInt, randomUUID } from "node:crypto";
import { Room, ServerError, type AuthContext, type Client } from "@colyseus/core";
import {
  FAMILY_CODE_REJECTED,
  PROTOCOL_VERSION,
  acceptDuel,
  acceptInvite,
  cancelTrade,
  confirmTrade,
  createDuel,
  createTrade,
  deliveriesFor,
  duelInvolves,
  duelView,
  forfeitDuel,
  involves,
  isAdjacent,
  sanitizeSeat,
  setOffer,
  submitAction,
  timeoutTurn,
} from "@monster-spil/shared";
import { clientAddress, type FamilyGate } from "./family-gate.js";
import type {
  ClientMessages,
  CreatureInstance,
  DuelResult,
  DuelSession,
  LobbyJoinOptions,
  LobbyPlayer,
  ServerMessages,
  TradeDelivery,
  TradeResult,
  TradeSession,
  WorldPosition,
} from "@monster-spil/shared";

interface Online {
  client: Client;
  info: LobbyPlayer;
}

/** How long a duel waits for both players to pick a move before skipping the silent one. */
const TURN_MS = 30_000;

const isText = (v: unknown, max = 40): v is string => typeof v === "string" && v.length > 0 && v.length <= max;
const isCount = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;

/** A tile position from a client: whole numbers in a sane range and a short area id, or nothing. */
function cleanPosition(raw: unknown): WorldPosition | undefined {
  const p = raw as Partial<WorldPosition> | null;
  if (!p || typeof p !== "object") return undefined;
  const whole = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 10_000;
  if (typeof p.areaId !== "string" || p.areaId.length > 40 || !whole(p.x) || !whole(p.y)) return undefined;
  return { areaId: p.areaId, x: p.x, y: p.y };
}

/** Rebuilds an offered creature from known fields only, so junk from a client never gets stored or forwarded. */
function cleanCreature(raw: unknown): CreatureInstance | undefined {
  const c = raw as Partial<CreatureInstance> | null;
  if (!c || typeof c !== "object") return undefined;
  if (!isText(c.instanceId, 80) || !isText(c.speciesId) || !isText(c.ownerId, 80) || !isText(c.caughtAt, 40)) return undefined;
  if (!isCount(c.niveau) || !isCount(c.currentHp)) return undefined;
  return {
    instanceId: c.instanceId,
    speciesId: c.speciesId,
    ownerId: c.ownerId,
    niveau: c.niveau,
    currentHp: c.currentHp,
    caughtAt: c.caughtAt,
  };
}

/**
 * The single family lobby: who is online, plus one-to-one creature trades and
 * duels. A duel is server-authoritative: clients only send a move choice, the
 * server calls the shared `resolveTurn` and pushes the result to both.
 *
 * The server never owns creatures — each device's save is the source of truth.
 * It only coordinates the swap, and holds a finished trade's deliveries until
 * each client acknowledges having applied it (re-sent on reconnect; applying
 * a delivery is idempotent). State is in memory only: a server restart drops
 * open trades and duels, which is fine because nothing has moved until
 * "tradeComplete", and a duel changes nobody's save.
 */
export class LobbyRoom extends Room {
  maxClients = 30;
  autoDispose = false;

  private online = new Map<string, Online>();
  private trades = new Map<string, TradeSession>();
  private pending = new Map<string, TradeDelivery[]>();
  private duels = new Map<string, DuelSession>();
  private duelTimers = new Map<string, { clear(): void }>();
  private gate!: FamilyGate;

  /** Runs before a seat is reserved, so outsiders never become part of the room. */
  onAuth(_client: Client, options: LobbyJoinOptions, context: AuthContext): boolean {
    if (!this.gate.check(clientAddress(context.headers, context.ip), options?.familyCode)) {
      throw new ServerError(FAMILY_CODE_REJECTED, "familiekode");
    }
    return true;
  }

  onCreate(options: { gate: FamilyGate }): void {
    this.gate = options.gate;

    this.onMessage("move", (client, msg: ClientMessages["move"]) => {
      const me = this.playerOf(client);
      const position = cleanPosition(msg);
      if (!me || !position) return;
      Object.assign(me.info, position);
      for (const other of this.online.values()) {
        if (other !== me) this.tell(other.client, "playerMoved", { playerId: me.info.playerId, ...position });
      }
    });

    this.onMessage("away", (client, msg: ClientMessages["away"]) => {
      const me = this.playerOf(client);
      if (!me || typeof msg?.away !== "boolean") return;
      me.info.away = msg.away;
      this.broadcastPlayers();
    });

    this.onMessage("invite", (client, msg: ClientMessages["invite"]) => {
      const me = this.playerOf(client);
      const target = this.online.get(msg?.toPlayerId);
      const refusal = this.inviteRefusal(me, target);
      if (refusal) return this.problem(client, refusal);
      if (!me || !target) return;
      const created = createTrade(randomUUID(), me.info.playerId, target.info.playerId);
      if (!created.ok) return this.problem(client, created.reason);
      this.trades.set(created.session.id, created.session);
      this.pushTrade(created.session);
      this.broadcastPlayers();
    });

    this.onMessage("accept", (client, msg: ClientMessages["accept"]) =>
      this.step(client, msg?.tradeId, (s, playerId) => acceptInvite(s, playerId))
    );

    this.onMessage("offer", (client, msg: ClientMessages["offer"]) => {
      const creature = cleanCreature(msg?.creature);
      if (!creature) return this.problem(client, "invalid creature");
      this.step(client, msg.tradeId, (s, playerId) => setOffer(s, playerId, creature));
    });

    this.onMessage("confirm", (client, msg: ClientMessages["confirm"]) =>
      this.step(client, msg?.tradeId, (s, playerId) => confirmTrade(s, playerId))
    );

    this.onMessage("cancel", (client, msg: ClientMessages["cancel"]) => {
      const session = this.sessionFor(client, msg?.tradeId);
      if (session) this.endTrade(session, "cancelled");
    });

    this.onMessage("duelInvite", (client, msg: ClientMessages["duelInvite"]) => {
      const me = this.playerOf(client);
      const target = this.online.get(msg?.toPlayerId);
      const refusal = this.inviteRefusal(me, target);
      if (refusal) return this.problem(client, refusal);
      if (!me || !target) return;
      const seat = sanitizeSeat(msg.seat, me.info.playerId);
      if (!seat) return this.problem(client, "invalid creature");
      const created = createDuel(randomUUID(), me.info.playerId, target.info.playerId, seat);
      if (!created.ok) return this.problem(client, created.reason);
      this.duels.set(created.session.id, created.session);
      this.pushDuel(created.session);
      this.broadcastPlayers();
    });

    this.onMessage("duelAccept", (client, msg: ClientMessages["duelAccept"]) => {
      const seat = sanitizeSeat(msg?.seat, this.playerOf(client)?.info.playerId ?? "");
      if (!seat) return this.problem(client, "invalid creature");
      this.stepDuel(client, msg.duelId, (s, playerId) => acceptDuel(s, playerId, seat, randomInt(0, 2 ** 31)));
    });

    this.onMessage("duelAction", (client, msg: ClientMessages["duelAction"]) => {
      const action = msg?.action;
      if (!action || (action.kind !== "move" && action.kind !== "flee")) return this.problem(client, "unknown action");
      this.stepDuel(client, msg.duelId, (s, playerId) =>
        submitAction(s, playerId, action.kind === "move" ? { kind: "move", moveId: String(action.moveId) } : { kind: "flee" })
      );
    });

    this.onMessage("duelCancel", (client, msg: ClientMessages["duelCancel"]) => {
      const session = this.duelFor(client, msg?.duelId);
      const me = this.playerOf(client);
      if (session && me) this.settleDuel(forfeitDuel(session, me.info.playerId), "cancelled");
    });

    this.onMessage("ack", (client, msg: ClientMessages["ack"]) => {
      const me = this.playerOf(client);
      if (!me) return;
      const left = (this.pending.get(me.info.playerId) ?? []).filter((d) => d.tradeId !== msg?.tradeId);
      if (left.length) this.pending.set(me.info.playerId, left);
      else this.pending.delete(me.info.playerId);
    });
  }

  onJoin(client: Client, options: LobbyJoinOptions): void {
    if (!isText(options?.playerId, 80) || !isText(options.navn, 30) || !isText(options.avatarId) || !isText(options.farve)) {
      throw new Error("invalid player");
    }
    // The same player joining again (reconnect, second tab) replaces the old connection.
    const previous = this.online.get(options.playerId);
    if (previous) previous.client.leave(4000);

    client.userData = { playerId: options.playerId };
    const info: LobbyPlayer = {
      playerId: options.playerId,
      navn: options.navn,
      avatarId: options.avatarId,
      farve: options.farve,
      busy: false,
      away: false,
      // Without a valid position (an older client) you are nowhere, so never adjacent to anyone.
      ...(cleanPosition(options) ?? { areaId: "", x: 0, y: 0 }),
    };
    this.online.set(info.playerId, { client, info });

    this.tell(client, "hello", { protocolVersion: PROTOCOL_VERSION });
    for (const delivery of this.pending.get(info.playerId) ?? []) this.tell(client, "tradeComplete", delivery);
    this.broadcastPlayers();
  }

  onLeave(client: Client): void {
    const me = this.playerOf(client);
    // A replaced connection also lands here; only tear down if this client is still the current one.
    if (!me || me.client.sessionId !== client.sessionId) return;
    this.online.delete(me.info.playerId);
    for (const session of this.trades.values()) {
      if (involves(session, me.info.playerId)) this.endTrade(session, "left");
    }
    // Leaving mid-duel is a forfeit; the opponent is told they won.
    for (const session of [...this.duels.values()]) {
      if (duelInvolves(session, me.info.playerId)) this.settleDuel(forfeitDuel(session, me.info.playerId), "left");
    }
    this.broadcastPlayers();
  }

  /** Why an invite from `me` to `target` must be refused, or undefined if it is fine. Shared by trades and duels. */
  private inviteRefusal(me: Online | undefined, target: Online | undefined): string | undefined {
    if (!me || !target) return "player not online";
    if (me.info.busy || target.info.busy || me.info.away || target.info.away) return "player is busy";
    if (!isAdjacent(me.info, target.info)) return "too far away";
    return undefined;
  }

  private duelFor(client: Client, duelId: string | undefined): DuelSession | undefined {
    const me = this.playerOf(client);
    const session = duelId ? this.duels.get(duelId) : undefined;
    if (!me || !session || !duelInvolves(session, me.info.playerId)) {
      this.problem(client, "no such duel");
      return undefined;
    }
    return session;
  }

  private stepDuel(client: Client, duelId: string | undefined, apply: (s: DuelSession, playerId: string) => DuelResult): void {
    const session = this.duelFor(client, duelId);
    const me = this.playerOf(client);
    if (!session || !me) return;
    const result = apply(session, me.info.playerId);
    if (!result.ok) return this.problem(client, result.reason);
    this.settleDuel(result.session, "cancelled");
  }

  /** Stores or retires a duel after a transition and tells both players. */
  private settleDuel(session: DuelSession, endReason: ServerMessages["duelEnded"]["reason"]): void {
    if (session.phase === "done" || session.phase === "cancelled") this.clearDuelTimer(session.id);
    if (session.phase === "done") {
      this.pushDuel(session);
      this.duels.delete(session.id);
    } else if (session.phase === "cancelled") {
      this.duels.delete(session.id);
      for (const playerId of [session.inviterId, session.inviteeId]) {
        const target = this.online.get(playerId);
        if (target) this.tell(target.client, "duelEnded", { duelId: session.id, reason: endReason });
      }
    } else {
      this.duels.set(session.id, session);
      this.pushDuel(session);
      // The clock restarts when the duel begins and after each resolved turn — not on the first answer.
      if (session.phase === "active" && Object.keys(session.pending).length === 0) this.armDuelTimer(session.id);
    }
    this.broadcastPlayers();
  }

  private armDuelTimer(duelId: string): void {
    this.clearDuelTimer(duelId);
    this.duelTimers.set(
      duelId,
      this.clock.setTimeout(() => {
        this.duelTimers.delete(duelId);
        const session = this.duels.get(duelId);
        if (!session) return;
        const result = timeoutTurn(session);
        if (result.ok) this.settleDuel(result.session, "cancelled");
      }, TURN_MS)
    );
  }

  private clearDuelTimer(duelId: string): void {
    this.duelTimers.get(duelId)?.clear();
    this.duelTimers.delete(duelId);
  }

  private pushDuel(session: DuelSession): void {
    for (const playerId of [session.inviterId, session.inviteeId]) {
      const target = this.online.get(playerId);
      if (target) this.tell(target.client, "duel", duelView(session));
    }
  }

  private playerOf(client: Client): Online | undefined {
    const playerId = (client.userData as { playerId?: string } | undefined)?.playerId;
    return playerId ? this.online.get(playerId) : undefined;
  }

  private sessionFor(client: Client, tradeId: string | undefined): TradeSession | undefined {
    const me = this.playerOf(client);
    const session = tradeId ? this.trades.get(tradeId) : undefined;
    if (!me || !session || !involves(session, me.info.playerId)) {
      this.problem(client, "no such trade");
      return undefined;
    }
    return session;
  }

  /** Runs one state-machine transition, then pushes the result to both players. */
  private step(client: Client, tradeId: string | undefined, apply: (s: TradeSession, playerId: string) => TradeResult): void {
    const session = this.sessionFor(client, tradeId);
    const me = this.playerOf(client);
    if (!session || !me) return;
    const result = apply(session, me.info.playerId);
    if (!result.ok) return this.problem(client, result.reason);
    if (result.session.phase === "done") return this.finishTrade(result.session);
    this.trades.set(result.session.id, result.session);
    this.pushTrade(result.session);
  }

  private finishTrade(session: TradeSession): void {
    this.trades.delete(session.id);
    // Queue first, then send: a client that drops mid-send still gets it on rejoin.
    const deliveries = deliveriesFor(session);
    const players = [session.inviter.playerId, session.invitee.playerId];
    players.forEach((playerId, i) => {
      const delivery = deliveries[i]!;
      this.pending.set(playerId, [...(this.pending.get(playerId) ?? []), delivery]);
      const target = this.online.get(playerId);
      if (target) this.tell(target.client, "tradeComplete", delivery);
    });
    this.broadcastPlayers();
  }

  private endTrade(session: TradeSession, reason: ServerMessages["tradeEnded"]["reason"]): void {
    this.trades.delete(cancelTrade(session).id);
    for (const playerId of [session.inviter.playerId, session.invitee.playerId]) {
      const target = this.online.get(playerId);
      if (target) this.tell(target.client, "tradeEnded", { tradeId: session.id, reason });
    }
    this.broadcastPlayers();
  }

  private pushTrade(session: TradeSession): void {
    for (const playerId of [session.inviter.playerId, session.invitee.playerId]) {
      const target = this.online.get(playerId);
      if (target) this.tell(target.client, "trade", session);
    }
  }

  private broadcastPlayers(): void {
    const busy = new Set<string>();
    for (const s of this.trades.values()) {
      busy.add(s.inviter.playerId);
      busy.add(s.invitee.playerId);
    }
    for (const s of this.duels.values()) {
      busy.add(s.inviterId);
      busy.add(s.inviteeId);
    }
    const players = [...this.online.values()].map(({ info }) => ({ ...info, busy: busy.has(info.playerId) }));
    for (const entry of this.online.values()) {
      entry.info.busy = busy.has(entry.info.playerId);
      this.tell(entry.client, "players", players);
    }
  }

  private problem(client: Client, reason: string): void {
    this.tell(client, "problem", { reason });
  }

  /** Typed wrapper so message names and payloads can't drift from the shared protocol. */
  private tell<K extends keyof ServerMessages>(client: Client, type: K, payload: ServerMessages[K]): void {
    client.send(type, payload);
  }
}
