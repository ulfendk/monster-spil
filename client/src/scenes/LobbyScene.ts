import Phaser from "phaser";
import type { Room } from "colyseus.js";
import { FAMILY_CODE_REJECTED, PROTOCOL_VERSION, applyDelivery, otherPlayerId } from "@shared";
import type { CreatureInstance, CreatureSpecies, DuelView, LobbyPlayer, TradeDelivery, TradeSession } from "@shared";
import type { GameContent } from "../content/load-content";
import type { SaveData } from "../save/schema";
import { persist } from "../save/game-state";
import { getFamilyCode, joinLobby, listen, say, setFamilyCode } from "../net/lobby";
import { makeParticipant } from "../battle-participant";
import { t } from "../i18n/da";
import { createButton } from "../ui/Button";

export interface LobbySceneData {
  content: GameContent;
  save: SaveData;
}

type Status = "connecting" | "needCode" | "online" | "offline";

/** How long after joining we wait for the server's "hello" before deciding it predates duels. */
const HELLO_TIMEOUT_MS = 3000;

const FONT = "sans-serif";
const RED = 0xc62828;
const GREY = 0x555555;

/**
 * The family lobby, trade screen and duel invites in one overlay: who is online,
 * tap someone to trade (🤝) or duel (⚔️). The scene only ever draws from its
 * state (status / players / trade / duel / received) — every server message or
 * tap updates that state and asks for a redraw. An accepted duel runs in the
 * Battle scene on top of this one, which keeps the room connection.
 */
export class LobbyScene extends Phaser.Scene {
  private sceneData!: LobbySceneData;
  private room?: Room;
  private status: Status = "connecting";
  private players: LobbyPlayer[] = [];
  private trade: TradeSession | null = null;
  /** A duel invite we sent or received (before it starts); once active it moves to the Battle scene. */
  private duel: DuelView | null = null;
  private battleRunning = false;
  /** The player whose tile was tapped, while choosing trade or duel. */
  private picked: LobbyPlayer | null = null;
  /** Undefined until the server says hello; "old" if it never does (a server without duels). */
  private serverVersion?: number | "old";
  /** One-shot message shown on the lobby view (e.g. "trade cancelled"). */
  private notice?: string;
  /** Set right after a completed trade, to show what arrived. */
  private received?: CreatureInstance;
  private ui!: Phaser.GameObjects.Container;
  private closing = false;
  private codeInput?: Phaser.GameObjects.DOMElement;

  constructor() {
    super("Lobby");
  }

  init(data: LobbySceneData): void {
    // Scene instances are reused between launches, so reset all state here.
    this.sceneData = data;
    this.room = undefined;
    this.status = "connecting";
    this.players = [];
    this.trade = null;
    this.duel = null;
    this.battleRunning = false;
    this.picked = null;
    this.serverVersion = undefined;
    this.notice = undefined;
    this.received = undefined;
    this.closing = false;
  }

  create(): void {
    const { width, height } = this.scale;
    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.85).setOrigin(0, 0);
    overlay.setInteractive(); // swallow taps so they don't reach the paused Overworld underneath
    this.ui = this.add.container(0, 0);
    this.events.once("shutdown", () => {
      this.closing = true;
      void this.room?.leave();
    });
    // The Battle scene resumes us when a duel is over.
    this.events.on("resume", () => {
      this.battleRunning = false;
      this.duel = null;
      this.requestDraw();
    });
    void this.connect();
  }

  private get me(): SaveData["player"] {
    return this.sceneData.save.player;
  }

  private async connect(): Promise<void> {
    const familyCode = getFamilyCode();
    if (!familyCode) {
      this.status = "needCode";
      this.requestDraw();
      return;
    }
    this.status = "connecting";
    this.requestDraw();
    try {
      const room = await joinLobby({
        playerId: this.me.id,
        navn: this.me.navn,
        avatarId: this.me.avatarId,
        farve: this.me.farve,
        familyCode,
      });
      if (this.closing) {
        void room.leave();
        return;
      }
      this.room = room;
      this.wire(room);
      this.notice = undefined;
      this.status = "online";
    } catch (error) {
      if ((error as { code?: number }).code === FAMILY_CODE_REJECTED) {
        setFamilyCode(undefined);
        this.notice = t("lobby_code_wrong");
        this.status = "needCode";
      } else {
        this.status = "offline";
      }
    }
    this.requestDraw();
  }

  private wire(room: Room): void {
    listen(room, "players", (players) => {
      this.players = players.filter((p) => p.playerId !== this.me.id);
      this.requestDraw();
    });
    listen(room, "trade", (session) => {
      this.trade = session;
      this.notice = undefined;
      this.requestDraw();
    });
    listen(room, "tradeEnded", () => {
      this.trade = null;
      this.notice = t("trade_cancelled");
      this.requestDraw();
    });
    listen(room, "tradeComplete", (delivery) => void this.receive(delivery));
    listen(room, "hello", ({ protocolVersion }) => {
      this.serverVersion = protocolVersion;
      this.requestDraw();
    });
    // An old server never says hello, so silence means it can trade but not duel.
    this.time.delayedCall(HELLO_TIMEOUT_MS, () => {
      if (this.serverVersion === undefined) {
        this.serverVersion = "old";
        this.requestDraw();
      }
    });
    listen(room, "duel", (view) => this.onDuel(view));
    listen(room, "duelEnded", () => {
      if (this.battleRunning) return; // the Battle scene shows this one
      this.duel = null;
      this.notice = t("duel_cancelled");
      this.requestDraw();
    });
    listen(room, "problem", ({ reason }) => console.warn("Lobby:", reason));
    room.onLeave(() => {
      if (this.closing || this.room !== room) return;
      this.room = undefined;
      this.trade = null;
      this.duel = null;
      this.players = [];
      this.status = "offline";
      this.requestDraw();
    });
  }

  private get canDuel(): boolean {
    return typeof this.serverVersion === "number" && this.serverVersion >= 2 && PROTOCOL_VERSION >= 2;
  }

  private onDuel(view: DuelView): void {
    if (this.battleRunning) return; // the Battle scene listens for its own updates
    this.notice = undefined;
    if (view.phase === "active" && view.battle && this.room) {
      this.battleRunning = true;
      this.duel = null;
      this.scene.launch("Battle", {
        save: this.sceneData.save,
        content: this.sceneData.content,
        duel: { room: this.room, view, myId: this.me.id },
      });
      this.scene.pause();
      return;
    }
    this.duel = view.phase === "invited" ? view : null;
    this.requestDraw();
  }

  /** My own first creature as a battle seat, including its species and moves (the server has no content files). */
  private mySeat() {
    const { save, content } = this.sceneData;
    const creature = save.creatures[0]!;
    return makeParticipant(this.me.id, creature, content.speciesById[creature.speciesId]!, content);
  }

  /** Applies a finished trade to the save, persists it, and only then tells the server it's safe to forget. */
  private async receive(delivery: TradeDelivery): Promise<void> {
    const { save } = this.sceneData;
    save.creatures = applyDelivery(save.creatures, delivery);
    if (!save.seenSpeciesIds.includes(delivery.receive.speciesId)) {
      save.seenSpeciesIds.push(delivery.receive.speciesId);
    }
    try {
      await persist();
      if (this.room) say(this.room, "ack", { tradeId: delivery.tradeId });
    } catch (error) {
      // Not acked, so the server re-sends after the next lobby visit; applying again is harmless.
      console.error("Kunne ikke gemme byttet", error);
    }
    this.trade = null;
    this.received = delivery.receive;
    this.requestDraw();
  }

  /** Lets a parent type a different family code; the old one stays stored until a new one is entered. */
  private changeCode(): void {
    const room = this.room;
    this.room = undefined;
    void room?.leave();
    this.trade = null;
    this.duel = null;
    this.players = [];
    this.notice = undefined;
    this.status = "needCode";
    this.requestDraw();
  }

  private close(): void {
    this.closing = true;
    void this.room?.leave();
    this.scene.stop();
    this.scene.resume("Overworld");
  }

  /** Deferred so a tap handler never destroys the button that is still dispatching it. */
  private requestDraw(): void {
    if (this.closing) return;
    this.time.delayedCall(0, () => {
      if (!this.closing) this.draw();
    });
  }

  // ---------------------------------------------------------------- drawing

  private draw(): void {
    this.codeInput?.destroy();
    this.codeInput = undefined;
    this.ui.removeAll(true);
    const { width } = this.scale;

    this.addButton(width - 90, 50, "X", () => this.close(), 72, GREY);

    if (this.status === "connecting") return this.drawBig("⏳");
    if (this.status === "needCode") return this.drawCodeEntry();
    if (this.status === "offline") return this.drawOffline();
    if (this.received) return this.drawReceived(this.received);
    if (this.trade) return this.drawTrade(this.trade);
    if (this.duel) return this.drawDuelInvite(this.duel);
    if (this.picked) return this.drawChoice(this.picked);
    this.drawLobby();
  }

  private drawBig(symbol: string): void {
    const { width, height } = this.scale;
    this.addText(width / 2, height / 2, symbol, 96);
  }

  private drawCodeEntry(): void {
    const { width, height } = this.scale;
    this.addText(width / 2, height * 0.25, "🔑", 80);
    this.addText(width / 2, height * 0.25 + 70, this.notice ?? t("lobby_code_title"), 30, this.notice ? "#ffce54" : "#cccccc");
    this.codeInput = this.add.dom(
      width / 2,
      height * 0.5,
      "input",
      "font-size:32px;width:360px;padding:16px;border-radius:16px;border:none;text-align:center;"
    );
    const el = this.codeInput.node as HTMLInputElement;
    el.type = "password";
    el.autocomplete = "off";
    el.autocapitalize = "off";
    el.setAttribute("autocorrect", "off");
    this.addButton(width / 2, height * 0.5 + 110, "✓", () => {
      const code = el.value.trim();
      if (!code) return;
      setFamilyCode(code);
      this.notice = undefined;
      void this.connect();
    }, 120);
  }

  private drawOffline(): void {
    const { width, height } = this.scale;
    this.addText(width / 2, height / 2 - 70, "📵", 96);
    this.addText(width / 2, height / 2 + 20, t("lobby_offline"), 30, "#cccccc");
    this.addButton(width / 2, height / 2 + 110, "🔄", () => void this.connect(), 120);
    this.addButton(90, this.scale.height - 50, "🔑", () => this.changeCode(), 72, GREY);
  }

  private drawLobby(): void {
    const { width } = this.scale;
    this.addText(width / 2, 50, "🤝", 56);
    this.addButton(90, this.scale.height - 50, "🔑", () => this.changeCode(), 72, GREY);
    if (this.notice) this.addText(width / 2, 110, this.notice, 24, "#ffce54");
    else if (this.serverVersion === "old") this.addText(width / 2, 110, t("lobby_server_old"), 24, "#ffce54");

    if (this.players.length === 0) {
      this.addText(width / 2, 300, t("lobby_alone"), 30, "#cccccc");
      return;
    }

    const cellW = 210;
    const cellH = 170;
    const columns = Math.max(1, Math.min(4, Math.floor((width - 80) / cellW)));
    const startX = width / 2 - ((Math.min(columns, this.players.length) - 1) * cellW) / 2;
    this.players.forEach((player, i) => {
      const x = startX + (i % columns) * cellW;
      const y = 230 + Math.floor(i / columns) * cellH;
      this.addPlayerTile(x, y, player);
    });
  }

  private addPlayerTile(x: number, y: number, player: LobbyPlayer): void {
    const colour = Phaser.Display.Color.HexStringToColor(player.farve).color;
    const bg = this.add.rectangle(0, 0, 190, 150, 0x2b2f52).setStrokeStyle(3, 0xffffff, player.busy ? 0.3 : 1);
    const dot = this.add.circle(0, -25, 40, colour).setAlpha(player.busy ? 0.4 : 1);
    const name = this.add
      .text(0, 50, player.navn, { fontFamily: FONT, fontSize: "24px", color: player.busy ? "#777777" : "#ffffff" })
      .setOrigin(0.5);
    const tile = this.add.container(x, y, [bg, dot, name]).setSize(190, 150);
    if (!player.busy) {
      tile.setInteractive({ useHandCursor: true });
      tile.on("pointerup", () => {
        // Without duel support on the server there is only one thing to invite to.
        if (this.serverVersion === "old" || !this.canDuel) return this.room && say(this.room, "invite", { toPlayerId: player.playerId });
        this.picked = player;
        this.requestDraw();
      });
    }
    this.ui.add(tile);
  }

  /** After tapping a player: 🤝 to trade or ⚔️ to duel. */
  private drawChoice(player: LobbyPlayer): void {
    const { width, height } = this.scale;
    this.addText(width / 2, height / 2 - 130, player.navn, 40);
    this.addButton(width / 2 - 110, height / 2, "🤝", () => {
      this.picked = null;
      if (this.room) say(this.room, "invite", { toPlayerId: player.playerId });
    }, 180);
    this.addButton(width / 2 + 110, height / 2, "⚔️", () => {
      this.picked = null;
      if (this.room) say(this.room, "duelInvite", { toPlayerId: player.playerId, seat: this.mySeat() });
    }, 180, 0xc62828);
    this.addButton(width / 2, height / 2 + 120, "✗", () => {
      this.picked = null;
      this.requestDraw();
    }, 120, GREY);
  }

  private drawDuelInvite(duel: DuelView): void {
    const { width, height } = this.scale;
    const iAmInviter = duel.inviterId === this.me.id;
    const otherId = iAmInviter ? duel.inviteeId : duel.inviterId;
    const otherName = this.players.find((p) => p.playerId === otherId)?.navn ?? "?";
    const cancel = () => this.room && say(this.room, "duelCancel", { duelId: duel.id });
    if (iAmInviter) {
      this.addText(width / 2, height / 2 - 60, `${t("duel_waiting")} ${otherName}`, 34);
      this.addText(width / 2, height / 2 + 10, "⚔️", 64);
      this.addButton(width / 2, height / 2 + 110, "✗", cancel, 120, RED);
    } else {
      this.addText(width / 2, height / 2 - 60, `${otherName} ${t("duel_invite_suffix")}`, 34);
      this.addButton(width / 2 - 90, height / 2 + 60, "⚔️", () => this.room && say(this.room, "duelAccept", { duelId: duel.id, seat: this.mySeat() }), 120, 0x2e7d32);
      this.addButton(width / 2 + 90, height / 2 + 60, "✗", cancel, 120, RED);
    }
  }

  private drawTrade(trade: TradeSession): void {
    const { width, height } = this.scale;
    const iAmInviter = trade.inviter.playerId === this.me.id;
    const otherId = otherPlayerId(trade, this.me.id);
    const otherName = this.players.find((p) => p.playerId === otherId)?.navn ?? "?";

    if (trade.phase === "invited") {
      const cx = width / 2;
      if (iAmInviter) {
        this.addText(cx, height / 2 - 60, `${t("trade_waiting")} ${otherName}`, 34);
        this.addText(cx, height / 2 + 10, "⏳", 64);
        this.addButton(cx, height / 2 + 110, "✗", () => this.cancel(trade), 120, RED);
      } else {
        this.addText(cx, height / 2 - 60, `${otherName} ${t("trade_invite_suffix")}`, 34);
        this.addButton(cx - 90, height / 2 + 60, "✓", () => this.room && say(this.room, "accept", { tradeId: trade.id }), 120);
        this.addButton(cx + 90, height / 2 + 60, "✗", () => this.cancel(trade), 120, RED);
      }
      return;
    }

    this.drawPicking(trade, iAmInviter, otherName);
  }

  private drawPicking(trade: TradeSession, iAmInviter: boolean, otherName: string): void {
    const { width, height } = this.scale;
    const mine = iAmInviter ? trade.inviter : trade.invitee;
    const theirs = iAmInviter ? trade.invitee : trade.inviter;
    const { save, content } = this.sceneData;

    // Left: my creatures to pick from.
    this.addText(width * 0.27, 40, t("trade_pick"), 28, "#cccccc");
    if (save.creatures.length <= 1) {
      this.addText(width * 0.27, 200, t("trade_last_creature"), 24, "#ffce54");
    } else {
      const cell = 130;
      const columns = Math.max(1, Math.floor((width * 0.5 - 40) / cell));
      save.creatures.forEach((creature, i) => {
        const x = 60 + cell / 2 + (i % columns) * cell;
        const y = 140 + Math.floor(i / columns) * cell;
        const selected = mine.offer?.instanceId === creature.instanceId;
        this.addCreatureTile(x, y, content.speciesById[creature.speciesId], selected, () => {
          if (this.room) say(this.room, "offer", { tradeId: trade.id, creature });
        });
      });
    }

    // Right: what the other player offers.
    const rightX = width * 0.78;
    this.addText(rightX, 40, otherName, 28, "#cccccc");
    const theirSpecies = theirs.offer ? content.speciesById[theirs.offer.speciesId] : undefined;
    this.addOfferCircle(rightX, 190, theirs.offer ? theirSpecies : undefined, theirs.confirmed);
    if (theirs.offer && !theirSpecies) this.addText(rightX, 300, t("trade_unknown_species"), 20, "#ffce54");

    // Bottom: confirm / cancel.
    const canConfirm = Boolean(mine.offer && theirs.offer && theirSpecies);
    const confirm = this.addButton(width / 2 - 90, height - 70, "✓", () => this.room && say(this.room, "confirm", { tradeId: trade.id }), 120, mine.confirmed ? 0x1b5e20 : 0x2e7d32);
    if (!canConfirm || mine.confirmed) confirm.setAlpha(0.35).disableInteractive();
    this.addButton(width / 2 + 90, height - 70, "✗", () => this.cancel(trade), 120, RED);
  }

  private drawReceived(creature: CreatureInstance): void {
    const { width, height } = this.scale;
    const species = this.sceneData.content.speciesById[creature.speciesId];
    this.addText(width / 2, 100, t("trade_done"), 48, "#ffce54");
    this.addOfferCircle(width / 2, height / 2, species, false, 90);
    if (species) this.addText(width / 2, height / 2 + 130, species.navn, 30);
    this.addButton(width / 2, height - 90, "OK", () => {
      this.received = undefined;
      this.requestDraw();
    }, 160);
  }

  private cancel(trade: TradeSession): void {
    if (this.room) say(this.room, "cancel", { tradeId: trade.id });
  }

  // ---------------------------------------------------------------- helpers

  private addText(x: number, y: number, text: string, size: number, color = "#ffffff"): Phaser.GameObjects.Text {
    const label = this.add.text(x, y, text, { fontFamily: FONT, fontSize: `${size}px`, color }).setOrigin(0.5);
    this.ui.add(label);
    return label;
  }

  private addButton(x: number, y: number, label: string, onTap: () => void, width: number, color?: number): Phaser.GameObjects.Container {
    const button = createButton(this, x, y, label, onTap, { width, height: 72, fontSize: "36px", backgroundColor: color });
    this.ui.add(button);
    return button;
  }

  /** A creature sprite scaled to fit `maxSize`, or a "?" when the species isn't known to this device. */
  private addSprite(x: number, y: number, species: CreatureSpecies | undefined, maxSize: number): void {
    if (species && this.textures.exists(species.spriteFront)) {
      const image = this.add.image(x, y, species.spriteFront);
      image.setScale(Math.min(1, maxSize / Math.max(image.width, image.height)));
      this.ui.add(image);
    } else {
      this.addText(x, y, "?", 48, "#777777");
    }
  }

  private addCreatureTile(
    x: number,
    y: number,
    species: CreatureSpecies | undefined,
    selected: boolean,
    onTap: () => void
  ): void {
    const bg = this.add.rectangle(x, y, 118, 118, 0x2b2f52).setStrokeStyle(selected ? 6 : 3, selected ? 0xffce54 : 0xffffff, selected ? 1 : 0.5);
    bg.setInteractive({ useHandCursor: true });
    bg.on("pointerup", onTap);
    this.ui.add(bg);
    this.addSprite(x, y, species, 90);
  }

  private addOfferCircle(x: number, y: number, species: CreatureSpecies | undefined, confirmed: boolean, radius = 80): void {
    const ring = this.add.circle(x, y, radius, 0x2b2f52).setStrokeStyle(4, confirmed ? 0x66bb6a : 0xffffff, confirmed ? 1 : 0.5);
    this.ui.add(ring);
    this.addSprite(x, y, species, radius * 1.4);
    if (confirmed) this.addText(x + radius * 0.75, y - radius * 0.75, "✓", 40, "#66bb6a");
  }
}
