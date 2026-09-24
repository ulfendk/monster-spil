import Phaser from "phaser";
import type { Room } from "colyseus.js";
import type {
  CreatureInstance,
  CreatureSpecies,
  BattleState,
  BattleParticipant,
  BattleAction,
  BattleLogEntry,
  DuelView,
} from "@shared";
import { createBattle, resolveTurn, createRng, outcomeFor } from "@shared";
import { listen, say } from "../net/lobby";
import { makeParticipant } from "../battle-participant";
import type { SaveData } from "../save/schema";
import type { GameContent } from "../content/load-content";
import { persist } from "../save/game-state";
import { createButton } from "../ui/Button";
import { createHpBar } from "../ui/HpBar";
import type { HpBarHandle } from "../ui/HpBar";
import { TYPE_COLOURS } from "../gfx/placeholder-sprites";
import {
  TYPE_ICONS,
  FLEE_ICON,
  CATCH_ICON,
  LOG_ICONS,
  OUTCOME_ICONS,
  WAITING_ICON,
  OPPONENT_LEFT_ICON,
  CONNECTION_LOST_ICON,
  CANCELLED_ICON,
  STRONG_ICON,
  WEAK_ICON,
} from "../ui/icons";
import { playHitSound, playMissSound, playFaintSound } from "../audio/beep";
import { t } from "../i18n/da";

/** A player-vs-player battle: the server resolves every turn, this scene only shows it and sends move choices. */
export interface DuelSceneData {
  room: Room;
  view: DuelView;
  myId: string;
}

/** Either a wild encounter (wildInstance/wildSpecies) or a duel (duel), never both. */
export interface BattleSceneData {
  save: SaveData;
  content: GameContent;
  wildInstance?: CreatureInstance;
  wildSpecies?: CreatureSpecies;
  duel?: DuelSceneData;
}

const TITLE_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: "sans-serif",
  fontSize: "24px",
  color: "#ffffff",
  align: "center",
  wordWrap: { width: 900 },
};

export class BattleScene extends Phaser.Scene {
  private battleData!: BattleSceneData;
  private battleState!: BattleState;
  private rng = createRng(Date.now());
  private playerSprite!: Phaser.GameObjects.Image;
  private wildSprite!: Phaser.GameObjects.Image;
  private playerHpBar!: HpBarHandle;
  private wildHpBar!: HpBarHandle;
  private logText!: Phaser.GameObjects.Text;
  /** A big emoji above the message, so the battle can be followed without reading. */
  private logIcon!: Phaser.GameObjects.Text;
  private actionButtons: Phaser.GameObjects.Container[] = [];
  private busy = false;
  /** "player" in wild battles, the real player id in duels. */
  private myId = "player";
  private duel?: DuelSceneData;
  private finished = false;

  constructor() {
    super("Battle");
  }

  create(data: BattleSceneData): void {
    this.battleData = data;
    this.busy = false;
    this.finished = false;
    this.duel = data.duel;

    if (data.duel) {
      this.myId = data.duel.myId;
      this.battleState = data.duel.view.battle!;
      // This scene runs on top of the paused lobby, so it needs its own opaque background.
      this.cameras.main.setBackgroundColor("#1b1f3b");
      this.wireDuel(data.duel);
    } else {
      this.myId = "player";
      const playerSpecies = data.content.speciesById[data.save.creatures[0].speciesId];
      const player = makeParticipant("player", data.save.creatures[0], playerSpecies, data.content);
      const wild = makeParticipant("wild", data.wildInstance!, data.wildSpecies!, data.content);
      this.battleState = createBattle(Date.now(), player, wild);
    }
    this.buildUi();
  }

  private me(): BattleParticipant {
    return this.battleState.participants.find((p) => p.playerId === this.myId)!;
  }

  private foe(): BattleParticipant {
    return this.battleState.participants.find((p) => p.playerId !== this.myId)!;
  }

  /** A species this device has no picture for (different content version) shows Phaser's placeholder box. */
  private textureFor(key: string): string {
    return this.textures.exists(key) ? key : "__MISSING";
  }

  private wireDuel(duel: DuelSceneData): void {
    const stops = [
      listen(duel.room, "duel", (view) => this.onDuelUpdate(view)),
      listen(duel.room, "duelEnded", ({ reason }) =>
        reason === "left"
          ? this.abortDuel(t("duel_opponent_left"), OPPONENT_LEFT_ICON)
          : this.abortDuel(t("duel_cancelled"), CANCELLED_ICON)
      ),
      // A rejected action must not leave us stuck on "waiting".
      listen(duel.room, "problem", () => {
        if (this.busy && !this.finished) {
          this.busy = false;
          this.renderActions();
        }
      }),
    ];
    duel.room.onLeave(() => this.abortDuel(t("duel_connection_lost"), CONNECTION_LOST_ICON));
    this.events.once("shutdown", () => stops.forEach((stop) => stop()));
  }

  private onDuelUpdate(view: DuelView): void {
    if (this.finished || view.id !== this.duel?.view.id || !view.battle) return;
    const next = view.battle;
    // The server also pushes a view when only the opponent has answered; nothing new to show yet.
    if (next.turn === this.battleState.turn && next.outcome === "ongoing") return;

    const previousLogLength = this.battleState.log.length;
    this.battleState = next;
    this.busy = true;
    this.updateHpBars();
    this.reactToEntries(next.log.slice(previousLogLength));

    if (next.outcome !== "ongoing") {
      this.finished = true;
      this.showOutcomeMessage(outcomeFor(next, this.myId));
      this.clearActionButtons();
      this.time.delayedCall(1400, () => this.endBattle());
    } else {
      this.busy = false;
      this.renderActions();
    }
  }

  /** Shows a battle message with its icon. */
  private say(text: string, icon: string): void {
    this.logText.setText(text);
    this.logIcon.setText(icon);
  }

  private abortDuel(message: string, icon: string): void {
    if (this.finished) return;
    this.finished = true;
    this.clearActionButtons();
    this.say(message, icon);
    this.time.delayedCall(1400, () => this.endBattle());
  }

  private buildUi(): void {
    const { width, height } = this.scale;
    const player = this.me();
    const wild = this.foe();

    this.wildSprite = this.add.image(width * 0.72, height * 0.28, this.textureFor(wild.species.spriteFront)).setScale(1.4);
    this.wildHpBar = createHpBar(this, width * 0.72, height * 0.1, wild.species.navn);

    this.playerSprite = this.add.image(width * 0.28, height * 0.62, this.textureFor(player.species.spriteBack)).setScale(1.4);
    this.playerHpBar = createHpBar(this, width * 0.28, height * 0.46, player.species.navn);

    this.logIcon = this.add.text(width / 2, height * 0.36 - 56, "", { fontFamily: "sans-serif", fontSize: "64px" }).setOrigin(0.5);
    this.logText = this.add.text(width / 2, height * 0.36 + 10, "", TITLE_STYLE).setOrigin(0.5);

    this.updateHpBars();
    this.renderActions();
  }

  private updateHpBars(): void {
    const player = this.me();
    const wild = this.foe();
    this.playerHpBar.setHp(player.active.currentHp, player.species.baseStats.hp);
    this.wildHpBar.setHp(wild.active.currentHp, wild.species.baseStats.hp);
  }

  private renderActions(): void {
    this.clearActionButtons();
    const { width, height } = this.scale;
    const player = this.me();
    const moveIds = Object.keys(player.moves);
    const y = height - 90;
    const canCatch = !this.duel; // you can't catch another player's monster
    const buttonCount = moveIds.length + (canCatch ? 2 : 1); // moves + flee (+ catch)
    const spacing = Math.min(220, (width - 80) / buttonCount);
    const startX = width / 2 - (spacing * (buttonCount - 1)) / 2;

    moveIds.forEach((moveId, i) => {
      const move = player.moves[moveId];
      if (!move) return;
      const button = createButton(
        this,
        startX + i * spacing,
        y,
        move.navn,
        () => this.performTurn({ kind: "move", moveId }),
        { width: spacing - 16, height: 84, fontSize: "20px", backgroundColor: TYPE_COLOURS[move.type], icon: TYPE_ICONS[move.type] }
      );
      this.actionButtons.push(button);
    });

    const fleeButton = createButton(
      this,
      startX + moveIds.length * spacing,
      y,
      t("battle_flee"),
      () => this.performTurn({ kind: "flee" }),
      { width: spacing - 16, height: 84, fontSize: "20px", backgroundColor: 0x555555, icon: FLEE_ICON }
    );
    this.actionButtons.push(fleeButton);
    if (!canCatch) return;

    const catchButton = createButton(
      this,
      startX + (moveIds.length + 1) * spacing,
      y,
      t("battle_catch"),
      () => this.performCatch(),
      { width: spacing - 16, height: 84, fontSize: "20px", backgroundColor: 0xe63946, icon: CATCH_ICON }
    );
    this.actionButtons.push(catchButton);
  }

  private clearActionButtons(): void {
    for (const button of this.actionButtons) button.destroy();
    this.actionButtons = [];
  }

  private performCatch(): void {
    if (this.busy || this.battleState.outcome !== "ongoing") return;
    this.busy = true;
    this.clearActionButtons();
    this.playBallThrowAnimation(() => {
      this.busy = false;
      this.performTurn({ kind: "catch" });
    });
  }

  private playBallThrowAnimation(onComplete: () => void): void {
    const ball = this.add.circle(this.playerSprite.x, this.playerSprite.y, 14, 0xe63946).setStrokeStyle(3, 0xffffff);
    this.tweens.add({
      targets: ball,
      x: this.wildSprite.x,
      y: this.wildSprite.y,
      duration: 450,
      ease: "Quad.easeOut",
      onComplete: () => {
        this.tweens.add({
          targets: ball,
          scale: 0,
          duration: 200,
          onComplete: () => {
            ball.destroy();
            onComplete();
          },
        });
      },
    });
  }

  private performTurn(playerAction: BattleAction): void {
    if (this.busy || this.finished || this.battleState.outcome !== "ongoing") return;
    this.busy = true;

    if (this.duel) {
      if (playerAction.kind === "catch") return;
      this.clearActionButtons();
      this.say(t("duel_waiting_move"), WAITING_ICON);
      say(this.duel.room, "duelAction", { duelId: this.duel.view.id, action: playerAction });
      return;
    }

    const wild = this.battleState.participants[1];
    const wildMoveId = pickWildMoveId(wild.species);
    const previousLogLength = this.battleState.log.length;

    const nextState = resolveTurn(
      this.battleState,
      [
        { playerId: "player", action: playerAction },
        { playerId: "wild", action: { kind: "move", moveId: wildMoveId } },
      ],
      this.rng
    );

    const newEntries = nextState.log.slice(previousLogLength);
    this.battleState = nextState;
    this.updateHpBars();
    this.reactToEntries(newEntries);

    if (nextState.outcome !== "ongoing") {
      this.showOutcomeMessage(nextState.outcome);
      this.clearActionButtons();
      this.time.delayedCall(1400, () => this.endBattle());
    } else {
      this.busy = false;
      this.renderActions();
    }
  }

  private reactToEntries(entries: BattleLogEntry[]): void {
    for (const entry of entries) {
      this.say(entry.text, LOG_ICONS[entry.kind]);

      if (entry.kind === "damage") {
        playHitSound();
        this.shakeSprite(entry.targetPlayerId === this.myId ? this.playerSprite : this.wildSprite);
        if (entry.effectiveness === "strong") this.flashFeedback(`${STRONG_ICON} ${t("battle_effective_strong")}`);
        else if (entry.effectiveness === "weak") this.flashFeedback(`${WEAK_ICON} ${t("battle_effective_weak")}`);
      } else if (entry.kind === "miss") {
        playMissSound();
      } else if (entry.kind === "faint") {
        playFaintSound();
      }
    }
  }

  private shakeSprite(sprite: Phaser.GameObjects.Image): void {
    const originalX = sprite.x;
    this.tweens.add({
      targets: sprite,
      x: originalX + 12,
      duration: 50,
      yoyo: true,
      repeat: 3,
      onComplete: () => sprite.setX(originalX),
    });
  }

  private flashFeedback(label: string): void {
    const { width, height } = this.scale;
    const text = this.add
      .text(width / 2, height * 0.5, label, { fontFamily: "sans-serif", fontSize: "26px", color: "#ffce54" })
      .setOrigin(0.5)
      .setAlpha(0);
    this.tweens.add({ targets: text, alpha: 1, duration: 150, yoyo: true, hold: 500, onComplete: () => text.destroy() });
  }

  private showOutcomeMessage(outcome: BattleState["outcome"]): void {
    if (outcome === "won") this.say(t("battle_won"), OUTCOME_ICONS.won);
    else if (outcome === "lost") this.say(t("battle_lost"), OUTCOME_ICONS.lost);
    else if (outcome === "fled") this.say(t("battle_fled"), OUTCOME_ICONS.fled);
    else if (outcome === "caught") this.say(t("battle_caught"), OUTCOME_ICONS.caught);
  }

  private endBattle(): void {
    if (this.duel) {
      // A duel changes nobody's save. Hand control back to the interaction screen underneath.
      this.finished = true;
      this.scene.resume("Interact");
      this.scene.stop();
      return;
    }

    const player = this.battleState.participants[0];
    const saved = this.battleData.save.creatures.find((c) => c.instanceId === player.active.instanceId);
    if (saved) {
      // No healing items exist yet in Milestone 1, so a loss auto-heals rather
      // than permanently soft-locking the player's only creature at 0 HP.
      saved.currentHp =
        this.battleState.outcome === "lost" ? player.species.baseStats.hp : player.active.currentHp;
    }

    if (this.battleState.outcome === "caught") {
      const wild = this.battleState.participants[1];
      this.battleData.save.creatures.push({ ...wild.active, ownerId: this.battleData.save.player.id });
      if (!this.battleData.save.seenSpeciesIds.includes(wild.species.id)) {
        this.battleData.save.seenSpeciesIds.push(wild.species.id);
      }
    }

    void persist();

    this.scene.start("Overworld", { save: this.battleData.save, content: this.battleData.content });
  }
}

function pickWildMoveId(species: CreatureSpecies): string {
  const ids = species.moveIds;
  return ids[Math.floor(Math.random() * ids.length)] ?? ids[0];
}
