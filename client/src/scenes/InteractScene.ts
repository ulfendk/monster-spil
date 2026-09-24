import Phaser from "phaser";
import { otherPlayerId } from "@shared";
import type { CreatureInstance, CreatureSpecies, DuelView, TradeSession } from "@shared";
import type { GameContent } from "../content/load-content";
import type { SaveData } from "../save/schema";
import { presence } from "../net/presence";
import { seatFor } from "../battle-participant";
import { t } from "../i18n/da";
import { addCloseButton, createButton } from "../ui/Button";
import { getLayout, onRelayout } from "../ui/layout";

export interface InteractSceneData {
  content: GameContent;
  save: SaveData;
}

const FONT = "sans-serif";
const RED = 0xc62828;

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
    onRelayout(this, () => this.requestDraw());
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
    const { width, height } = this.scale;
    // Redrawn with the rest, so it covers the whole screen after a rotation; also swallows taps meant for the map.
    this.ui.add(this.add.rectangle(0, 0, width, height, 0x000000, 0.85).setOrigin(0, 0).setInteractive());
    const close = () => this.ui.add(addCloseButton(this, () => this.leave()).button);

    if (presence.status !== "online" && !presence.received) {
      presence.interactNotice = undefined; // nothing to say over a dead connection
      return this.close();
    }

    if (presence.received) {
      close();
      return this.drawReceived(presence.received);
    }
    if (presence.trade) {
      close();
      return this.drawTrade(presence.trade);
    }
    if (presence.duel) {
      close();
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
    const layout = getLayout(this);
    const { width, height, safe, portrait } = layout;
    const mine = iAmInviter ? trade.inviter : trade.invitee;
    const theirs = iAmInviter ? trade.invitee : trade.inviter;
    const { save, content } = this.sceneData;
    const buttonsH = layout.touch(72);
    const bottom = height - safe.bottom - 16 - buttonsH; // top of the ✓ / ✗ row
    const top = safe.top + layout.touch(64) + 20; // below the close button

    // My creatures to pick from: the left half, or the top part on a tall screen.
    const mineArea = portrait
      ? { x: safe.left + 12, y: top, w: width - safe.left - safe.right - 24, h: (bottom - top) * 0.58 }
      : { x: safe.left + 12, y: safe.top + 16, w: width * 0.55 - safe.left - 24, h: bottom - safe.top - 32 };
    this.addText(mineArea.x + mineArea.w / 2, mineArea.y + layout.px(20), t("trade_pick"), 28, "#cccccc");
    if (save.creatures.length <= 1) {
      this.addText(mineArea.x + mineArea.w / 2, mineArea.y + mineArea.h / 2, t("trade_last_creature"), 24, "#ffce54", mineArea.w);
    } else {
      const gridTop = mineArea.y + layout.px(56);
      const cell = Math.min(130, this.fitCell(save.creatures.length, mineArea.w, mineArea.y + mineArea.h - gridTop));
      const columns = Math.max(1, Math.floor(mineArea.w / cell));
      const rowW = Math.min(columns, save.creatures.length) * cell;
      save.creatures.forEach((creature, i) => {
        const x = mineArea.x + (mineArea.w - rowW) / 2 + cell / 2 + (i % columns) * cell;
        const y = gridTop + cell / 2 + Math.floor(i / columns) * cell;
        const selected = mine.offer?.instanceId === creature.instanceId;
        this.addCreatureTile(x, y, content.speciesById[creature.speciesId], selected, () => {
          presence.send("offer", { tradeId: trade.id, creature });
        }, cell - 12);
      });
    }

    // What the other player offers: the right side, or below my creatures.
    const theirs_ = portrait
      ? { x: width / 2, y: mineArea.y + mineArea.h + (bottom - mineArea.y - mineArea.h) / 2 }
      : { x: width * 0.78, y: top + layout.px(30) + (bottom - top - layout.px(30)) / 2 };
    const radius = Math.min(80, (portrait ? bottom - mineArea.y - mineArea.h : bottom - top) * 0.3);
    this.addText(theirs_.x, theirs_.y - radius - layout.px(28), otherName, 28, "#cccccc");
    const theirSpecies = theirs.offer ? content.speciesById[theirs.offer.speciesId] : undefined;
    this.addOfferCircle(theirs_.x, theirs_.y, theirs.offer ? theirSpecies : undefined, theirs.confirmed, radius);
    if (theirs.offer && !theirSpecies) this.addText(theirs_.x, theirs_.y + radius + layout.px(24), t("trade_unknown_species"), 20, "#ffce54", width * 0.4);

    // Bottom: confirm / cancel.
    const canConfirm = Boolean(mine.offer && theirs.offer && theirSpecies);
    const by = bottom + buttonsH / 2;
    const confirm = this.addButton(width / 2 - 90, by, "✓", () => presence.send("confirm", { tradeId: trade.id }), 120, mine.confirmed ? 0x1b5e20 : 0x2e7d32);
    if (!canConfirm || mine.confirmed) confirm.setAlpha(0.35).disableInteractive();
    this.addButton(width / 2 + 90, by, "✗", () => this.cancel(trade), 120, RED);
  }

  /** The biggest square cell so `count` tiles fit in a w × h area. */
  private fitCell(count: number, w: number, h: number): number {
    let best = 0;
    for (let cols = 1; cols <= count; cols++) best = Math.max(best, Math.min(w / cols, h / Math.ceil(count / cols)));
    return best;
  }

  private drawReceived(creature: CreatureInstance): void {
    const { width, height } = this.scale;
    const species = this.sceneData.content.speciesById[creature.speciesId];
    const layout = getLayout(this);
    this.addText(width / 2, layout.safe.top + layout.touch(64) + layout.px(30), presence.receivedReason === "dragon" ? `🐉 ${t("reward_dragon")}` : t("trade_done"), 48, "#ffce54");
    this.addOfferCircle(width / 2, height / 2, species, false, 90);
    if (species) this.addText(width / 2, height / 2 + 130, species.navn, 30);
    this.addButton(width / 2, height - layout.safe.bottom - 24 - layout.touch(72) / 2, "OK", () => {
      presence.received = undefined;
      this.requestDraw();
    }, 160);
  }

  private cancel(trade: TradeSession): void {
    presence.send("cancel", { tradeId: trade.id });
  }

  // ---------------------------------------------------------------- helpers

  private addText(x: number, y: number, text: string, size: number, color = "#ffffff", wrap?: number): Phaser.GameObjects.Text {
    const layout = getLayout(this);
    const label = this.add
      .text(x, y, text, { fontFamily: FONT, fontSize: layout.font(size), color, align: "center", wordWrap: { width: wrap ?? layout.width - 40 } })
      .setOrigin(0.5);
    this.ui.add(label);
    return label;
  }

  private addButton(x: number, y: number, label: string, onTap: () => void, width: number, color?: number): Phaser.GameObjects.Container {
    const layout = getLayout(this);
    const button = createButton(this, x, y, label, onTap, { width, height: layout.touch(72), fontSize: layout.font(36), backgroundColor: color });
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
    onTap: () => void,
    size = 118
  ): void {
    const bg = this.add.rectangle(x, y, size, size, 0x2b2f52).setStrokeStyle(selected ? 6 : 3, selected ? 0xffce54 : 0xffffff, selected ? 1 : 0.5);
    bg.setInteractive({ useHandCursor: true });
    bg.on("pointerup", onTap);
    this.ui.add(bg);
    this.addSprite(x, y, species, size * 0.76);
  }

  private addOfferCircle(x: number, y: number, species: CreatureSpecies | undefined, confirmed: boolean, radius = 80): void {
    const ring = this.add.circle(x, y, radius, 0x2b2f52).setStrokeStyle(4, confirmed ? 0x66bb6a : 0xffffff, confirmed ? 1 : 0.5);
    this.ui.add(ring);
    this.addSprite(x, y, species, radius * 1.4);
    if (confirmed) this.addText(x + radius * 0.75, y - radius * 0.75, "✓", 40, "#66bb6a");
  }
}
