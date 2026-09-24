import Phaser from "phaser";
import { otherPlayerId } from "@shared";
import type { CreatureInstance, CreatureSpecies, DuelView, TradeSession } from "@shared";
import type { GameContent } from "../content/load-content";
import type { SaveData } from "../save/schema";
import { presence } from "../net/presence";
import { seatFor } from "../battle-participant";
import { t } from "../i18n/da";
import { createButton } from "../ui/Button";

export interface InteractSceneData {
  content: GameContent;
  save: SaveData;
}

const FONT = "sans-serif";
const RED = 0xc62828;
const GREY = 0x555555;

/**
 * The trade and duel-invite screens, shown over the map whenever someone
 * approaches me (or I approach them). It owns no connection: everything it draws
 * comes from `presence` (the current trade / duel invite / just-received creature),
 * and every change there asks for a redraw. When nothing is left to show it closes
 * itself and hands the map back. An accepted duel runs in the Battle scene on top.
 */
export class InteractScene extends Phaser.Scene {
  private sceneData!: InteractSceneData;
  private ui!: Phaser.GameObjects.Container;
  private closing = false;
  private unsubscribe: Array<() => void> = [];

  constructor() {
    super("Interact");
  }

  init(data: InteractSceneData): void {
    // Scene instances are reused between launches, so reset all state here.
    this.sceneData = data;
    this.closing = false;
  }

  create(): void {
    const { width, height } = this.scale;
    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.85).setOrigin(0, 0);
    overlay.setInteractive(); // swallow taps so they don't reach the paused Overworld underneath
    this.ui = this.add.container(0, 0);

    const redraw = () => this.requestDraw();
    const onDuelActive = (view: DuelView) => this.launchDuel(view);
    presence.events.on("interaction", redraw);
    presence.events.on("players", redraw);
    presence.events.on("status", redraw);
    presence.events.on("duelActive", onDuelActive);
    this.unsubscribe = [
      () => presence.events.off("interaction", redraw),
      () => presence.events.off("players", redraw),
      () => presence.events.off("status", redraw),
      () => presence.events.off("duelActive", onDuelActive),
    ];
    // The Battle scene resumes us when a duel is over.
    const onResume = () => this.requestDraw();
    this.events.on("resume", onResume);
    this.events.once("shutdown", () => {
      this.closing = true;
      this.events.off("resume", onResume);
      this.unsubscribe.forEach((off) => off());
    });
    this.requestDraw();
  }

  private get myId(): string {
    return this.sceneData.save.player.id;
  }

  private launchDuel(view: DuelView): void {
    const room = presence.connectedRoom;
    if (!room || this.closing) return;
    this.scene.launch("Battle", {
      save: this.sceneData.save,
      content: this.sceneData.content,
      duel: { room, view, myId: this.myId },
    });
    // Scenes draw in registration order, and Battle is registered before this one.
    this.scene.bringToTop("Battle");
    this.scene.pause();
  }

  /** Leaving with a trade or duel invite still open cancels it, so nobody stays stuck as busy. */
  private leave(): void {
    if (presence.trade) presence.send("cancel", { tradeId: presence.trade.id });
    if (presence.duel) presence.send("duelCancel", { duelId: presence.duel.id });
    presence.trade = null;
    presence.duel = null;
    presence.received = undefined;
    presence.interactNotice = undefined;
    this.close();
  }

  private close(): void {
    if (this.closing) return;
    this.closing = true;
    this.unsubscribe.forEach((off) => off());
    this.scene.stop();
    this.scene.resume("Overworld");
  }

  /** Deferred so a tap handler never destroys the button that is still dispatching it. */
  private requestDraw(): void {
    if (this.closing) return;
    this.time.delayedCall(0, () => {
      if (!this.closing && this.scene.isActive()) this.draw();
    });
  }

  // ---------------------------------------------------------------- drawing

  private draw(): void {
    this.ui.removeAll(true);
    const { width } = this.scale;

    if (presence.status !== "online" && !presence.received) {
      presence.interactNotice = undefined; // nothing to say over a dead connection
      return this.close();
    }

    if (presence.received) {
      this.addButton(width - 90, 50, "X", () => this.leave(), 72, GREY);
      return this.drawReceived(presence.received);
    }
    if (presence.trade) {
      this.addButton(width - 90, 50, "X", () => this.leave(), 72, GREY);
      return this.drawTrade(presence.trade);
    }
    if (presence.duel) {
      this.addButton(width - 90, 50, "X", () => this.leave(), 72, GREY);
      return this.drawDuelInvite(presence.duel);
    }
    if (presence.interactNotice) return this.drawNotice(presence.interactNotice);
    this.close();
  }

  private drawNotice(text: string): void {
    const { width, height } = this.scale;
    this.addText(width / 2, height / 2 - 40, text, 34, "#ffce54");
    this.addButton(width / 2, height / 2 + 60, "OK", () => {
      presence.interactNotice = undefined;
      this.close();
    }, 160);
  }

  private drawDuelInvite(duel: DuelView): void {
    const { width, height } = this.scale;
    const iAmInviter = duel.inviterId === this.myId;
    const otherId = iAmInviter ? duel.inviteeId : duel.inviterId;
    const otherName = presence.players.get(otherId)?.navn ?? "?";
    const cancel = () => this.leave();
    if (iAmInviter) {
      this.addText(width / 2, height / 2 - 60, `${t("duel_waiting")} ${otherName}`, 34);
      this.addText(width / 2, height / 2 + 10, "⚔️", 64);
      this.addButton(width / 2, height / 2 + 110, "✗", cancel, 120, RED);
    } else {
      this.addText(width / 2, height / 2 - 60, `${otherName} ${t("duel_invite_suffix")}`, 34);
      this.addButton(width / 2 - 90, height / 2 + 60, "⚔️", () => presence.send("duelAccept", { duelId: duel.id, seat: seatFor(this.sceneData.save, this.sceneData.content) }), 120, 0x2e7d32);
      this.addButton(width / 2 + 90, height / 2 + 60, "✗", cancel, 120, RED);
    }
  }

  private drawTrade(trade: TradeSession): void {
    const { width, height } = this.scale;
    const iAmInviter = trade.inviter.playerId === this.myId;
    const otherId = otherPlayerId(trade, this.myId);
    const otherName = presence.players.get(otherId)?.navn ?? "?";

    if (trade.phase === "invited") {
      const cx = width / 2;
      if (iAmInviter) {
        this.addText(cx, height / 2 - 60, `${t("trade_waiting")} ${otherName}`, 34);
        this.addText(cx, height / 2 + 10, "⏳", 64);
        this.addButton(cx, height / 2 + 110, "✗", () => this.cancel(trade), 120, RED);
      } else {
        this.addText(cx, height / 2 - 60, `${otherName} ${t("trade_invite_suffix")}`, 34);
        this.addButton(cx - 90, height / 2 + 60, "✓", () => presence.send("accept", { tradeId: trade.id }), 120);
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
          presence.send("offer", { tradeId: trade.id, creature });
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
    const confirm = this.addButton(width / 2 - 90, height - 70, "✓", () => presence.send("confirm", { tradeId: trade.id }), 120, mine.confirmed ? 0x1b5e20 : 0x2e7d32);
    if (!canConfirm || mine.confirmed) confirm.setAlpha(0.35).disableInteractive();
    this.addButton(width / 2 + 90, height - 70, "✗", () => this.cancel(trade), 120, RED);
  }

  private drawReceived(creature: CreatureInstance): void {
    const { width, height } = this.scale;
    const species = this.sceneData.content.speciesById[creature.speciesId];
    this.addText(width / 2, 100, presence.receivedReason === "dragon" ? `🐉 ${t("reward_dragon")}` : t("trade_done"), 48, "#ffce54");
    this.addOfferCircle(width / 2, height / 2, species, false, 90);
    if (species) this.addText(width / 2, height / 2 + 130, species.navn, 30);
    this.addButton(width / 2, height - 90, "OK", () => {
      presence.received = undefined;
      this.requestDraw();
    }, 160);
  }

  private cancel(trade: TradeSession): void {
    presence.send("cancel", { tradeId: trade.id });
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
