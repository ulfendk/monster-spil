import Phaser from "phaser";
import type { Room } from "colyseus.js";
import { FAMILY_CODE_REJECTED, applyDelivery } from "@shared";
import type {
  ClientMessages,
  CreatureInstance,
  DuelView,
  LobbyPlayer,
  BattleState,
  RaidView,
  RewardDelivery,
  ScoreRow,
  TeamView,
  TradeDelivery,
  TradeSession,
  WorldPosition,
} from "@shared";
import { getState, persist } from "../save/game-state";
import { getFamilyCode, joinLobby, listen, multiplayerEnabled, say } from "./lobby";
import { t } from "../i18n/da";
import { loadContent } from "../content/load-content";

export type PresenceStatus = "off" | "connecting" | "needCode" | "online" | "offline";

/**
 * Events emitted (see `presence.events`): "status", "players", "moved" (playerId), "interaction",
 * "duelActive" (DuelView), "problem" (reason), "raid" (RaidView), "raidBattle" (payload), "scores" (ScoreRow[]),
 * "team" (TeamView), "teamActive" (TeamView, once per fight), "teamEnded" (reason).
 */
const HELLO_TIMEOUT_MS = 3000;
const RETRY_MIN_MS = 3000;
const RETRY_MAX_MS = 30000;

/**
 * The one connection to the family server, alive for the whole play session (not
 * just while a menu is open). It keeps the list of other players and where they
 * stand, the current trade/duel invite, and applies finished trades to the save
 * wherever the player happens to be. Scenes only read its state and listen to
 * `events`; nothing here draws anything. Without a server (solo build) or without
 * a connection it simply stays quiet, so solo play is unaffected.
 */
class Presence {
  readonly events = new Phaser.Events.EventEmitter();
  status: PresenceStatus = "off";
  /** Everyone else who is online, by playerId. */
  players = new Map<string, LobbyPlayer>();
  trade: TradeSession | null = null;
  /** A duel invite that hasn't started yet; once active it belongs to the Battle scene. */
  duel: DuelView | null = null;
  /** Set right after a completed trade or a dragon reward, until the interaction screen has shown it. */
  received?: CreatureInstance;
  receivedReason: "trade" | "dragon" = "trade";
  /** The family dragon, once the server has told us about it (protocol v4+). */
  raid?: RaidView;
  /** When I may attack the dragon again (ms since epoch). */
  restUntil = 0;
  /** My team at the dragon (gathering or fighting), if I'm in one (protocol v5+). */
  team?: TeamView;
  /** The team whose start we already announced, so per-turn updates don't re-announce it. */
  private startedTeamId?: string;
  /** One-shot message for the settings screen, e.g. a wrong family code. */
  notice?: string;
  /** One-shot message for the interaction screen, e.g. "the trade was cancelled" by the other player. */
  interactNotice?: string;
  /** Undefined until the server says hello; "old" if it never does. */
  serverVersion?: number | "old";

  private room?: Room;
  private started = false;
  private position: WorldPosition = { areaId: "", x: 0, y: 0 };
  private away = false;
  private retryMs = RETRY_MIN_MS;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private connecting = false;
  /** The duel whose start we already announced, so per-turn updates don't re-announce it. */
  private startedDuelId?: string;

  /** True when the server knows about positions (protocol v3+), so the map can show other players. */
  get worldSupported(): boolean {
    return typeof this.serverVersion === "number" && this.serverVersion >= 3;
  }

  /** True when the server runs the dragon raid and the scoreboard (protocol v4+). */
  get raidSupported(): boolean {
    return typeof this.serverVersion === "number" && this.serverVersion >= 4;
  }

  /** True when the server lets players team up against the dragon (protocol v5+). */
  get teamSupported(): boolean {
    return typeof this.serverVersion === "number" && this.serverVersion >= 5;
  }

  /** Sends catches the scoreboard hasn't counted yet (they wait in the save while offline). */
  flushScore(): void {
    const pending = getState()?.pendingScore ?? [];
    if (pending.length && this.raidSupported) this.send("scoreReport", { events: pending.slice(0, 100) });
  }

  /** My own player id (from the save), for highlighting myself in lists. */
  get myId(): string | undefined {
    return getState()?.player.id;
  }

  get connectedRoom(): Room | undefined {
    return this.status === "online" ? this.room : undefined;
  }

  /** Call once the game has a save; safe to call again on every Overworld start. */
  start(position: WorldPosition): void {
    this.position = position;
    if (!multiplayerEnabled) return;
    if (this.started) return;
    this.started = true;
    void this.connect();
  }

  /** Where I stand, sent to the server as each step of a walk begins. */
  moveTo(position: WorldPosition): void {
    this.position = position;
    this.send("move", position);
  }

  /** While away (e.g. in a wild battle) nobody can invite me. Re-sent after a reconnect. */
  setAway(away: boolean): void {
    this.away = away;
    this.send("away", { away });
  }

  send<K extends keyof ClientMessages>(type: K, payload: ClientMessages[K]): void {
    if (this.status === "online" && this.room) say(this.room, type, payload);
  }

  /** Called by the settings screen after a new family code has been stored. */
  reconnect(): void {
    this.dropRoom();
    this.notice = undefined;
    void this.connect();
  }

  private setStatus(status: PresenceStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.events.emit("status", status);
  }

  private dropRoom(): void {
    clearTimeout(this.retryTimer);
    const room = this.room;
    this.room = undefined;
    void room?.leave();
    this.players.clear();
    this.trade = null;
    this.duel = null;
    this.serverVersion = undefined;
    this.events.emit("players");
  }

  private async connect(): Promise<void> {
    const save = getState();
    if (!save || this.connecting) return;
    const familyCode = getFamilyCode();
    if (!familyCode) return this.setStatus("needCode");
    this.connecting = true;
    this.setStatus("connecting");
    try {
      const room = await joinLobby({
        playerId: save.player.id,
        navn: save.player.navn,
        avatarId: save.player.avatarId,
        farve: save.player.farve,
        familyCode,
        ...this.position,
      });
      this.room = room;
      this.retryMs = RETRY_MIN_MS;
      this.wire(room, save.player.id);
      this.setStatus("online");
      if (this.away) this.send("away", { away: true });
    } catch (error) {
      if ((error as { code?: number }).code === FAMILY_CODE_REJECTED) {
        this.notice = t("lobby_code_wrong");
        this.setStatus("needCode");
      } else {
        this.setStatus("offline");
        this.scheduleRetry();
      }
    } finally {
      this.connecting = false;
    }
  }

  private scheduleRetry(): void {
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => void this.connect(), this.retryMs);
    this.retryMs = Math.min(RETRY_MAX_MS, this.retryMs * 2);
  }

  private wire(room: Room, myId: string): void {
    listen(room, "hello", ({ protocolVersion }) => {
      this.serverVersion = protocolVersion;
      this.events.emit("players");
      this.flushScore();
    });
    listen(room, "raid", (view) => {
      this.raid = view;
      this.events.emit("raid", view);
    });
    listen(room, "raidBattle", (payload) => {
      if (payload.restUntil) this.restUntil = Date.parse(payload.restUntil);
      this.events.emit("raidBattle", payload);
    });
    listen(room, "scores", ({ rows }) => this.events.emit("scores", rows));
    listen(room, "team", (view) => {
      this.team = view;
      if (view.phase === "active" && this.startedTeamId !== view.id) {
        this.startedTeamId = view.id;
        this.events.emit("teamActive", view);
      }
      this.events.emit("team", view);
      if (view.phase === "gathering") this.events.emit("interaction");
    });
    listen(room, "teamEnded", ({ reason }) => {
      const wasGathering = this.team?.phase === "gathering";
      this.team = undefined;
      if (wasGathering && reason === "cancelled") this.interactNotice = t("team_cancelled");
      this.events.emit("teamEnded", reason);
      this.events.emit("interaction");
    });
    listen(room, "scoreReportAck", ({ ids }) => void this.scoreAcked(ids));
    listen(room, "reward", (reward) => void this.receiveReward(reward));
    // An old server never says hello, so silence means it predates the shared map.
    setTimeout(() => {
      if (this.room === room && this.serverVersion === undefined) {
        this.serverVersion = "old";
        this.events.emit("players");
      }
    }, HELLO_TIMEOUT_MS);

    listen(room, "players", (list) => {
      this.players = new Map(list.filter((p) => p.playerId !== myId).map((p) => [p.playerId, p]));
      this.events.emit("players");
    });
    listen(room, "playerMoved", ({ playerId, ...position }) => {
      const player = this.players.get(playerId);
      if (!player) return;
      Object.assign(player, position);
      this.events.emit("moved", playerId);
    });

    listen(room, "trade", (session) => {
      this.trade = session;
      this.events.emit("interaction");
    });
    listen(room, "tradeEnded", () => {
      // If I cancelled it myself the screen is already gone; only tell the other player.
      if (this.trade) this.interactNotice = t("trade_cancelled");
      this.trade = null;
      this.events.emit("interaction");
    });
    listen(room, "tradeComplete", (delivery) => void this.receive(delivery));

    listen(room, "duel", (view) => {
      if (view.phase === "invited") {
        this.duel = view;
        this.events.emit("interaction");
      } else if (view.phase === "active") {
        this.duel = null;
        if (this.startedDuelId !== view.id) {
          this.startedDuelId = view.id;
          this.events.emit("duelActive", view);
        }
      } else {
        this.duel = null;
        this.startedDuelId = undefined;
        this.events.emit("interaction");
      }
    });
    listen(room, "duelEnded", () => {
      if (this.duel) this.interactNotice = t("duel_cancelled");
      this.duel = null;
      this.startedDuelId = undefined;
      this.events.emit("interaction");
    });
    listen(room, "problem", ({ reason }) => this.events.emit("problem", reason));

    room.onLeave(() => {
      if (this.room !== room) return; // we dropped it ourselves
      this.room = undefined;
      this.players.clear();
      this.trade = null;
      this.duel = null;
      this.serverVersion = undefined;
      this.raid = undefined;
      this.team = undefined;
      this.events.emit("players");
      this.events.emit("raid", undefined);
      this.setStatus("offline");
      this.scheduleRetry();
    });
  }

  /** Applies a finished trade to the save, persists it, and only then tells the server it's safe to forget. */
  private async receive(delivery: TradeDelivery): Promise<void> {
    const save = getState();
    if (!save) return;
    save.creatures = applyDelivery(save.creatures, delivery);
    if (!save.seenSpeciesIds.includes(delivery.receive.speciesId)) {
      save.seenSpeciesIds.push(delivery.receive.speciesId);
    }
    try {
      await persist();
      this.send("ack", { tradeId: delivery.tradeId });
    } catch (error) {
      // Not acked, so the server re-sends after the next connect; applying again is harmless.
      console.error("Kunne ikke gemme byttet", error);
    }
    this.trade = null;
    this.received = delivery.receive;
    this.receivedReason = "trade";
    this.events.emit("interaction");
  }

  private async scoreAcked(ids: string[]): Promise<void> {
    const save = getState();
    if (!save) return;
    const done = new Set(ids);
    save.pendingScore = save.pendingScore.filter((e) => !done.has(e.id));
    await persist();
    this.flushScore(); // more than 100 waiting: send the next batch
  }

  /** A baby dragon for helping beat the dragon: add it (once), persist, then let the server forget it. */
  private async receiveReward(reward: RewardDelivery): Promise<void> {
    const save = getState();
    if (!save) return;
    const species = loadContent().speciesById[reward.creature.speciesId];
    if (!save.creatures.some((c) => c.instanceId === reward.creature.instanceId)) {
      save.creatures.push({ ...reward.creature, currentHp: species?.baseStats.hp ?? reward.creature.currentHp });
    }
    if (!save.seenSpeciesIds.includes(reward.creature.speciesId)) save.seenSpeciesIds.push(reward.creature.speciesId);
    try {
      await persist();
      this.send("rewardAck", { rewardId: reward.rewardId });
    } catch (error) {
      console.error("Kunne ikke gemme belønningen", error);
    }
    this.received = reward.creature;
    this.receivedReason = "dragon";
    this.events.emit("interaction");
  }
}

export type RaidBattleUpdate = { battle: BattleState; over?: "defeated"; restUntil?: string };
export type { RaidView, ScoreRow, TeamView };

export const presence = new Presence();
