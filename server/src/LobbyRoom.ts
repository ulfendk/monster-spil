import { randomUUID } from "node:crypto";
import { Room, ServerError, type AuthContext, type Client } from "@colyseus/core";
import {
  FAMILY_CODE_REJECTED,
  acceptInvite,
  cancelTrade,
  confirmTrade,
  createTrade,
  deliveriesFor,
  involves,
  otherPlayerId,
  setOffer,
} from "@monster-spil/shared";
import { clientAddress, type FamilyGate } from "./family-gate.js";
import type {
  ClientMessages,
  CreatureInstance,
  LobbyJoinOptions,
  LobbyPlayer,
  ServerMessages,
  TradeDelivery,
  TradeResult,
  TradeSession,
} from "@monster-spil/shared";

interface Online {
  client: Client;
  info: LobbyPlayer;
}

const isText = (v: unknown, max = 40): v is string => typeof v === "string" && v.length > 0 && v.length <= max;
const isCount = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;

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
 * The single family lobby: who is online, plus one-to-one creature trades.
 *
 * The server never owns creatures — each device's save is the source of truth.
 * It only coordinates the swap, and holds a finished trade's deliveries until
 * each client acknowledges having applied it (re-sent on reconnect; applying
 * a delivery is idempotent). State is in memory only: a server restart drops
 * open trades, which is fine because nothing has moved until "tradeComplete".
 */
export class LobbyRoom extends Room {
  maxClients = 30;
  autoDispose = false;

  private online = new Map<string, Online>();
  private trades = new Map<string, TradeSession>();
  private pending = new Map<string, TradeDelivery[]>();
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

    this.onMessage("invite", (client, msg: ClientMessages["invite"]) => {
      const me = this.playerOf(client);
      const target = this.online.get(msg?.toPlayerId);
      if (!me || !target) return this.problem(client, "player not online");
      if (me.info.busy || target.info.busy) return this.problem(client, "player is busy");
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
    };
    this.online.set(info.playerId, { client, info });

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
    this.broadcastPlayers();
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
