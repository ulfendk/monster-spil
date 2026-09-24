import Phaser from "phaser";
import { otherPlayerId } from "@shared";
import type { CreatureInstance, CreatureSpecies, DuelView, TeamView, TradeSession } from "@shared";
import type { GameContent } from "../content/load-content";
import type { SaveData } from "../save/schema";
import { presence } from "../net/presence";
import { seatFor } from "../battle-participant";
import { t } from "../i18n/da";
import { DRAGON_ICON, TEAM_ICON } from "../ui/icons";
import { addCloseButton, createButton } from "../ui/Button";
import { getLayout, onRelayout } from "../ui/layout";
import { C, CSS, FONT } from "../ui/theme";
import { addSeigaiha } from "../gfx/motifs";
import { hasIcons, ic, richText } from "../ui/rich-text";

export interface InteractSceneData {
  content: GameContent;
  save: SaveData;
}

const RED = C.danger;

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
    const onTeamActive = (view: TeamView) => this.launchTeam(view);
    const onTeam = () => redraw();
    presence.events.on("interaction", redraw);
    presence.events.on("players", redraw);
    presence.events.on("status", redraw);
    presence.events.on("duelActive", onDuelActive);
    presence.events.on("teamActive", onTeamActive);
    presence.events.on("team", onTeam);
    this.unsubscribe = [
      () => presence.events.off("interaction", redraw),
      () => presence.events.off("players", redraw),
      () => presence.events.off("status", redraw),
      () => presence.events.off("duelActive", onDuelActive),
      () => presence.events.off("teamActive", onTeamActive),
      () => presence.events.off("team", onTeam),
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

  /** The leader started the team fight: the battle runs on top, and resumes us when it is over. */
  private launchTeam(view: TeamView): void {
    if (this.closing || !view.battle) return;
    this.scene.launch("Battle", {
      save: this.sceneData.save,
      content: this.sceneData.content,
      team: { view, myId: this.myId },
    });
    this.scene.bringToTop("Battle");
    this.scene.pause();
  }

  /** Leaving with a trade or duel invite still open cancels it, so nobody stays stuck as busy. */
  private leave(): void {
    if (presence.trade) presence.send("cancel", { tradeId: presence.trade.id });
    if (presence.duel) presence.send("duelCancel", { duelId: presence.duel.id });
    if (presence.team?.phase === "gathering") {
      presence.send("teamLeave", { teamId: presence.team.id });
      presence.team = undefined;
    }
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
    this.ui.add(this.add.rectangle(0, 0, width, height, C.overlay, 0.9).setOrigin(0, 0).setInteractive());
    this.ui.add(addSeigaiha(this, 0, height * 0.66, width, height * 0.34));
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
    if (presence.team?.phase === "gathering") {
      close();
      return this.drawTeam(presence.team);
    }
    if (presence.interactNotice) return this.drawNotice(presence.interactNotice);
    this.close();
  }

  private drawNotice(text: string): void {
    const { width, height } = this.scale;
    this.addText(width / 2, height / 2 - 40, text, 34, CSS.accent);
    this.addButton(width / 2, height / 2 + 60, "OK", () => {
      presence.interactNotice = undefined;
      this.close();
    }, 160);
  }

  /** Waiting at the lair: who has joined, the HP bonus, and ⚔️ for the leader to start. */
  private drawTeam(team: TeamView): void {
    const layout = getLayout(this);
    const { width, height } = layout;
    const iLead = team.leaderId === this.myId;
    const nameOf = (id: string) => (id === this.myId ? this.sceneData.save.player.navn : presence.players.get(id)?.navn ?? "?");
    const top = layout.safe.top + layout.touch(64) + layout.px(30);
    this.addText(width / 2, top, `${ic(TEAM_ICON)} ${t("team_title")}   ${ic("heart")} ×${team.hpFactor}`, 36);
    const lineH = Math.max(34, layout.px(48));
    team.members.forEach((m, i) => {
      this.addText(width / 2, top + layout.px(70) + i * lineH, `${m.playerId === team.leaderId ? `${ic("star")} ` : ""}${nameOf(m.playerId)}`, 30);
    });
    const buttonsY = height - layout.safe.bottom - 24 - layout.touch(72) / 2;
    if (iLead) {
      this.addButton(width / 2 - 90, buttonsY, ic("sword"), () => presence.send("teamStart", { teamId: team.id }), 120, C.danger);
      this.addButton(width / 2 + 90, buttonsY, "✗", () => this.leave(), 120, RED);
    } else {
      this.addText(width / 2, buttonsY - layout.touch(72), `${t("team_waiting_leader")} ${nameOf(team.leaderId)} ${ic("hourglass")}`, 28, CSS.soft);
      this.addButton(width / 2, buttonsY, "✗", () => this.leave(), 120, RED);
    }
  }

  private drawDuelInvite(duel: DuelView): void {
    const { width, height } = this.scale;
    const iAmInviter = duel.inviterId === this.myId;
    const otherId = iAmInviter ? duel.inviteeId : duel.inviterId;
    const otherName = presence.players.get(otherId)?.navn ?? "?";
    const cancel = () => this.leave();
    if (iAmInviter) {
      this.addText(width / 2, height / 2 - 60, `${t("duel_waiting")} ${otherName}`, 34);
      this.addText(width / 2, height / 2 + 10, ic("sword"), 64);
      this.addButton(width / 2, height / 2 + 110, "✗", cancel, 120, RED);
    } else {
      this.addText(width / 2, height / 2 - 60, `${otherName} ${t("duel_invite_suffix")}`, 34);
      this.addButton(width / 2 - 90, height / 2 + 60, ic("sword"), () => presence.send("duelAccept", { duelId: duel.id, seat: seatFor(this.sceneData.save, this.sceneData.content) }), 120, C.ok);
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
        this.addText(cx, height / 2 + 10, ic("hourglass"), 64);
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
    this.addText(mineArea.x + mineArea.w / 2, mineArea.y + layout.px(20), t("trade_pick"), 28, CSS.soft);
    if (save.creatures.length <= 1) {
      this.addText(mineArea.x + mineArea.w / 2, mineArea.y + mineArea.h / 2, t("trade_last_creature"), 24, CSS.accent, mineArea.w);
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
    this.addText(theirs_.x, theirs_.y - radius - layout.px(28), otherName, 28, CSS.soft);
    const theirSpecies = theirs.offer ? content.speciesById[theirs.offer.speciesId] : undefined;
    this.addOfferCircle(theirs_.x, theirs_.y, theirs.offer ? theirSpecies : undefined, theirs.confirmed, radius);
    if (theirs.offer && !theirSpecies) this.addText(theirs_.x, theirs_.y + radius + layout.px(24), t("trade_unknown_species"), 20, CSS.accent, width * 0.4);

    // Bottom: confirm / cancel.
    const canConfirm = Boolean(mine.offer && theirs.offer && theirSpecies);
    const by = bottom + buttonsH / 2;
    const confirm = this.addButton(width / 2 - 90, by, "✓", () => presence.send("confirm", { tradeId: trade.id }), 120, mine.confirmed ? C.okDone : C.ok);
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
    this.addText(width / 2, layout.safe.top + layout.touch(64) + layout.px(30), presence.receivedReason === "dragon" ? `${ic(DRAGON_ICON)} ${t("reward_dragon")}` : t("trade_done"), 48, CSS.accent);
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

  private addText(x: number, y: number, text: string, size: number, color = CSS.text, wrap?: number): Phaser.GameObjects.GameObject {
    const layout = getLayout(this);
    if (hasIcons(text)) {
      const rich = richText(this, x, y, text, { fontFamily: FONT, fontSize: layout.font(size), color });
      this.ui.add(rich);
      return rich;
    }
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
      this.addText(x, y, "?", 48, CSS.muted);
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
    const bg = this.add.rectangle(x, y, size, size, C.panel).setStrokeStyle(selected ? 6 : 3, selected ? C.accent : C.border, selected ? 1 : 0.5);
    bg.setInteractive({ useHandCursor: true });
    bg.on("pointerup", onTap);
    this.ui.add(bg);
    this.addSprite(x, y, species, size * 0.76);
  }

  private addOfferCircle(x: number, y: number, species: CreatureSpecies | undefined, confirmed: boolean, radius = 80): void {
    const ring = this.add.circle(x, y, radius, C.panel).setStrokeStyle(4, confirmed ? C.ok : C.border, confirmed ? 1 : 0.5);
    this.ui.add(ring);
    this.addSprite(x, y, species, radius * 1.4);
    if (confirmed) this.addText(x + radius * 0.75, y - radius * 0.75, "✓", 40, CSS.ok);
  }
}
