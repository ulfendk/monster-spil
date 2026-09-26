import Phaser from "phaser";
import type { Room } from "colyseus.js";
import { BAG_MAX, GAME_KEY_REJECTED, PLAYER_ELSEWHERE, applyDelivery } from "@shared";
import type {
  AreaTerrain,
  DisasterMessage,
  DisasterNews,
  ClientMessages,
  CreatureInstance,
  DuelView,
  LobbyPlayer,
  BattleState,
  BeastView,
  CaveView,
  ServerMessages,
  RaidView,
  RewardDelivery,
  ScoreRow,
  TeamView,
  FoodItem,
  TradeDelivery,
  TradeSession,
  WorldPosition,
} from "@shared";
import { getState, onPersist, passOut, persist } from "../save/game-state";
import { readRecord, writeRecords } from "../save/db";
import { joinLobby, listen, multiplayerEnabled, say } from "./lobby";
import { currentGame, updateGame } from "../save/games";
import { t } from "../i18n/da";
import { loadContent } from "../content/load-content";
import { putBackup } from "./backup";
import { profileOf } from "../content/load-progress";
import { recordProgress, setProfileListener } from "../progress/record";
import { beastForBaby } from "../content/load-beasts";

export type PresenceStatus = "off" | "connecting" | "needCode" | "online" | "offline";

/**
 * Events emitted (see `presence.events`): "status", "players", "moved" (playerId), "interaction",
 * "duelActive" (DuelView), "problem" (reason), "raid" (RaidView), "raidBattle" (payload), "scores" (ScoreRow[]),
 * "team" (TeamView), "teamActive" (TeamView, once per fight), "teamEnded" (reason), "food", "foodTaken" (kind),
 * "renamed" (navn), "terrain" (areaId), "disaster" (DisasterMessage), "spawnBattle" ({spawnId, speciesId}),
 * "struck" (a disaster caught me: I'm passed out now), "dragonFlight" ({from, to, ms}), "beasts" (BeastView[]),
 * "caves" (CaveView[]), "caveVisit" (CaveVisit: I'm in, start the minigame).
 */
const HELLO_TIMEOUT_MS = 3000;
/** Saves come in bursts (a battle's end, a trade); back up once things settle. */
const BACKUP_DELAY_MS = 5000;
const RETRY_MIN_MS = 3000;
const RETRY_MAX_MS = 30000;

/**
 * The one connection to the current game on the server, alive for the whole play session (not
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
  receivedReason: "trade" | "dragon" | "beast" = "trade";
  /** The family dragon, once the server has told us about it (protocol v4+). */
  raid?: RaidView;
  /** Caves open in the mountains right now (protocol v12+). */
  caves: CaveView[] = [];
  /** The sand serpents and giant eagles on the maps right now (protocol v11+). */
  beasts: BeastView[] = [];
  /** When I may attack the dragon again (ms since epoch). */
  restUntil = 0;
  /** Food lying on the maps (protocol v6+); empty offline. */
  food: FoodItem[] = [];
  /** When the family server last confirmed a backup of my save (protocol v7+). */
  lastBackupAt?: string;
  private backupTimer?: ReturnType<typeof setTimeout>;
  /** My team at the dragon (gathering or fighting), if I'm in one (protocol v5+). */
  team?: TeamView;
  /** The team whose start we already announced, so per-turn updates don't re-announce it. */
  private startedTeamId?: string;
  /** One-shot message for the settings screen, e.g. a wrong spilnøgle. */
  notice?: string;
  /** One-shot message for the interaction screen, e.g. "the trade was cancelled" by the other player. */
  interactNotice?: string;
  /** How each area looks after natural disasters (protocol v9+); kept on the device for offline play. */
  terrain = new Map<string, AreaTerrain>();
  /** Disasters of the last day, per area, for the "this happened while you were away" note. */
  recent = new Map<string, DisasterNews[]>();
  /** A disaster that is being warned about right now. */
  disaster?: DisasterMessage;
  private terrainGameId?: string;
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

  /** True when the server sends visiting beasts (protocol v11+). */
  get beastsSupported(): boolean {
    return typeof this.serverVersion === "number" && this.serverVersion >= 11;
  }

  /** True when the server keeps backups of saves (protocol v7+). */
  get backupSupported(): boolean {
    return typeof this.serverVersion === "number" && this.serverVersion >= 7;
  }

  /**
   * Sends a copy of the save to the family server soon (debounced), if connected. Over
   * plain HTTP (a save can be big, and a websocket message has to stay small); a server
   * without that route gets it the old way, as a websocket message.
   */
  scheduleBackup(delay = BACKUP_DELAY_MS): void {
    clearTimeout(this.backupTimer);
    this.backupTimer = setTimeout(() => void this.backup(), delay);
  }

  private async backup(): Promise<void> {
    const save = getState();
    const key = currentGame()?.key;
    if (!save || !key || !this.backupSupported) return;
    const result = await putBackup(key, save);
    if (result.ok) {
      this.lastBackupAt = result.value;
      this.events.emit("backup");
    } else if (result.reason !== "code") {
      // An older server (no such route, or CORS refusing the method): the old way. Offline,
      // this sends nothing, and the next save or connection tries again.
      this.send("backup", { save });
    }
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

  /** Call once the game has a save; safe to call again on every Overworld start. A game played alone never connects. */
  start(position: WorldPosition): void {
    setProfileListener(this.sendProfile);
    document.removeEventListener("visibilitychange", this.onVisible);
    document.addEventListener("visibilitychange", this.onVisible);
    this.position = position;
    if (!multiplayerEnabled || !currentGame()?.online) return;
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

  /** My level or badges changed: everyone should see (servers from v13 on). */
  private sendProfile = (): void => {
    const save = getState();
    if (save && typeof this.serverVersion === "number" && this.serverVersion >= 13) this.send("profile", profileOf(save));
  };

  /** Called by the settings screen after a new spilnøgle has been stored. */
  reconnect(): void {
    this.dropRoom();
    this.notice = undefined;
    this.elsewhere = false;
    void this.connect();
  }

  /** Thrown out because this player was opened somewhere else; waiting to be used here again. */
  private elsewhere = false;

  /** Coming back to the front after being replaced elsewhere: this is the one being played now, so take the connection back. */
  private onVisible = (): void => {
    if (document.visibilityState !== "visible" || !this.elsewhere) return;
    this.elsewhere = false;
    this.notice = undefined;
    void this.connect();
  };

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
    const game = currentGame();
    if (!game?.online) return;
    if (!game.key) return this.setStatus("needCode");
    this.connecting = true;
    this.setStatus("connecting");
    try {
      const room = await joinLobby({
        playerId: save.player.id,
        navn: save.player.navn,
        avatarId: save.player.avatarId,
        farve: save.player.farve,
        gameId: game.id,
        gameKey: game.key,
        familyCode: game.key, // for a server from before games
        ...this.position,
        ...profileOf(save),
      });
      this.room = room;
      this.retryMs = RETRY_MIN_MS;
      this.wire(room, save.player.id);
      this.setStatus("online");
      if (this.away) this.send("away", { away: true });
    } catch (error) {
      if ((error as { code?: number }).code === GAME_KEY_REJECTED) {
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
      this.scheduleBackup(1000); // back up once right after connecting
    });
    listen(room, "game", ({ gameId, navn }) => {
      if (gameId === currentGame()?.id && navn) void updateGame(gameId, { navn });
    });
    listen(room, "renamed", ({ navn }) => void this.rename(navn));
    listen(room, "terrain", ({ areaId, terrain, recent }) => {
      this.terrain.set(areaId, terrain);
      this.recent.set(areaId, recent);
      void this.cacheTerrain();
      this.events.emit("terrain", areaId);
    });
    listen(room, "disaster", (message) => {
      this.disaster = message.phase === "warning" ? message : undefined;
      if (message.phase === "strike" && message.struck?.includes(myId)) void this.struck();
      this.events.emit("disaster", message);
    });
    listen(room, "spawnBattle", (payload) => this.events.emit("spawnBattle", payload));
    listen(room, "dragonFlight", (flight) => this.events.emit("dragonFlight", flight));
    listen(room, "raid", (view) => {
      this.raid = view;
      this.events.emit("raid", view);
    });
    listen(room, "caves", (caves) => {
      this.caves = caves;
      this.events.emit("caves", caves);
    });
    listen(room, "caveVisit", (visit) => this.events.emit("caveVisit", visit));
    listen(room, "beasts", (views) => {
      this.beasts = views;
      this.events.emit("beasts", views);
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
    listen(room, "food", (items) => {
      this.food = items;
      this.events.emit("food");
    });
    listen(room, "foodTaken", ({ kind }) => void this.putInBag(kind));
    listen(room, "backupAck", (ack) => {
      if ("savedAt" in ack) {
        this.lastBackupAt = ack.savedAt;
        this.events.emit("backup");
      } else console.warn("Backup refused:", ack.error);
    });
    listen(room, "teamEnded", ({ reason }) => {
      const wasGathering = this.team?.phase === "gathering";
      this.team = undefined;
      if (wasGathering && reason === "cancelled") this.interactNotice = t("team_cancelled");
      if (wasGathering && reason === "gone") this.interactNotice = t("beast_gone");
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

    room.onLeave((code) => {
      if (this.room !== room) return; // we dropped it ourselves
      this.room = undefined;
      this.players.clear();
      this.trade = null;
      this.duel = null;
      this.serverVersion = undefined;
      this.raid = undefined;
      this.team = undefined;
      this.beasts = [];
      this.events.emit("beasts", []);
      this.caves = [];
      this.events.emit("caves", []);
      this.food = [];
      this.events.emit("food");
      this.events.emit("players");
      this.events.emit("raid", undefined);
      if (this.disaster) {
        this.disaster = undefined;
        this.events.emit("disaster", undefined);
      }
      // The same player was opened somewhere else (another tab, the old address, a second
      // iPad): that one has the connection now. Don't take it back by ourselves — the two
      // would throw each other out forever — but reconnect when this one is used again.
      if (code === PLAYER_ELSEWHERE) {
        this.notice = t("lobby_elsewhere");
        this.elsewhere = true;
        this.setStatus("offline");
        return;
      }
      // A parent changed the key or deleted the game: ask for the (new) key instead of retrying.
      if (code === GAME_KEY_REJECTED) {
        this.notice = t("game_key_changed");
        this.setStatus("needCode");
        return;
      }
      this.setStatus("offline");
      this.scheduleRetry();
    });
  }

  /** Applies a finished trade to the save, persists it, and only then tells the server it's safe to forget. */
  private async receive(delivery: TradeDelivery): Promise<void> {
    const save = getState();
    if (!save) return;
    const already = save.creatures.some((c) => c.instanceId === delivery.receive.instanceId);
    save.creatures = applyDelivery(save.creatures, delivery);
    if (!already) recordProgress({ kind: "trade" }, true);
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

  /** A disaster caught me: I pass out, like after fainting (the wait is saved). */
  private async struck(): Promise<void> {
    await passOut(0, "disaster");
    this.events.emit("struck");
  }

  /**
   * The last known look of the current game's maps, from the device (so a changed map
   * stays changed while offline). Call when entering a game, before the map is drawn.
   */
  async loadTerrain(gameId: string): Promise<void> {
    this.terrainGameId = gameId;
    this.terrain.clear();
    this.recent.clear();
    try {
      const cached = await readRecord<{ areas: Record<string, AreaTerrain> }>(`terrain:${gameId}`);
      for (const [areaId, terrain] of Object.entries(cached?.areas ?? {})) this.terrain.set(areaId, terrain);
    } catch (error) {
      console.warn("Kunne ikke læse kortet", error);
    }
  }

  private async cacheTerrain(): Promise<void> {
    if (!this.terrainGameId) return;
    try {
      await writeRecords({ [`terrain:${this.terrainGameId}`]: { areas: Object.fromEntries(this.terrain) } });
    } catch (error) {
      console.warn("Kunne ikke gemme kortet", error);
    }
  }

  /** A parent gave me a new name in the admin portal. */
  private async rename(navn: string): Promise<void> {
    const save = getState();
    if (!save || !navn || save.player.navn === navn) return;
    save.player.navn = navn.slice(0, 30);
    await persist();
    this.events.emit("renamed", navn);
  }

  private async putInBag(kind: FoodItem["kind"]): Promise<void> {
    const save = getState();
    if (!save || save.bag.length >= BAG_MAX) return;
    save.bag.push(kind);
    await persist();
    this.events.emit("foodTaken", kind);
  }

  private async scoreAcked(ids: string[]): Promise<void> {
    const save = getState();
    if (!save) return;
    const done = new Set(ids);
    save.pendingScore = save.pendingScore.filter((e) => !done.has(e.id));
    await persist();
    this.flushScore(); // more than 100 waiting: send the next batch
  }

  /** A baby for helping beat the dragon or a visiting beast: add it (once), persist, then let the server forget it. */
  private async receiveReward(reward: RewardDelivery): Promise<void> {
    const save = getState();
    if (!save) return;
    const species = loadContent().speciesById[reward.creature.speciesId];
    if (!save.creatures.some((c) => c.instanceId === reward.creature.instanceId)) {
      save.creatures.push({ ...reward.creature, currentHp: species?.baseStats.hp ?? reward.creature.currentHp });
      const beast = reward.reason === "beast" ? beastForBaby(reward.creature.speciesId) : undefined;
      recordProgress({ kind: "bossWin", boss: beast ? { beastId: beast.id } : "dragon" }, true);
    }
    if (!save.seenSpeciesIds.includes(reward.creature.speciesId)) save.seenSpeciesIds.push(reward.creature.speciesId);
    try {
      await persist();
      this.send("rewardAck", { rewardId: reward.rewardId });
    } catch (error) {
      console.error("Kunne ikke gemme belønningen", error);
    }
    this.received = reward.creature;
    this.receivedReason = reward.reason === "beast" ? "beast" : "dragon";
    this.events.emit("interaction");
  }
}

export type RaidBattleUpdate = ServerMessages["raidBattle"];
export type { BeastView, RaidView, ScoreRow, TeamView };

export const presence = new Presence();
// Every save is backed up to the game server a few seconds later (when connected).
onPersist(() => presence.scheduleBackup());
