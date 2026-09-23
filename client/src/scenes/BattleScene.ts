import Phaser from "phaser";
import type {
  CreatureInstance,
  CreatureSpecies,
  Move,
  BattleState,
  BattleParticipant,
  BattleAction,
  BattleLogEntry,
} from "@shared";
import { createBattle, resolveTurn, createRng } from "@shared";
import type { SaveData } from "../save/schema";
import type { GameContent } from "../content/load-content";
import { persist } from "../save/game-state";
import { createButton } from "../ui/Button";
import { createHpBar } from "../ui/HpBar";
import type { HpBarHandle } from "../ui/HpBar";
import { TYPE_COLOURS } from "../gfx/placeholder-sprites";
import { playHitSound, playMissSound, playFaintSound } from "../audio/beep";
import { t } from "../i18n/da";

export interface BattleSceneData {
  save: SaveData;
  content: GameContent;
  wildInstance: CreatureInstance;
  wildSpecies: CreatureSpecies;
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
  private actionButtons: Phaser.GameObjects.Container[] = [];
  private busy = false;

  constructor() {
    super("Battle");
  }

  create(data: BattleSceneData): void {
    this.battleData = data;
    this.busy = false;

    const playerSpecies = data.content.speciesById[data.save.creatures[0].speciesId];
    const playerParticipant: BattleParticipant = {
      playerId: "player",
      active: { ...data.save.creatures[0] },
      species: playerSpecies,
      moves: resolveMoves(playerSpecies, data.content.movesById),
    };
    const wildParticipant: BattleParticipant = {
      playerId: "wild",
      active: { ...data.wildInstance },
      species: data.wildSpecies,
      moves: resolveMoves(data.wildSpecies, data.content.movesById),
    };

    this.battleState = createBattle(Date.now(), playerParticipant, wildParticipant);
    this.buildUi();
  }

  private buildUi(): void {
    const { width, height } = this.scale;
    const [player, wild] = this.battleState.participants;

    this.wildSprite = this.add.image(width * 0.72, height * 0.28, wild.species.spriteFront).setScale(1.4);
    this.wildHpBar = createHpBar(this, width * 0.72, height * 0.1, wild.species.navn);

    this.playerSprite = this.add.image(width * 0.28, height * 0.62, player.species.spriteBack).setScale(1.4);
    this.playerHpBar = createHpBar(this, width * 0.28, height * 0.46, player.species.navn);

    this.logText = this.add.text(width / 2, height * 0.36, "", TITLE_STYLE).setOrigin(0.5);

    this.updateHpBars();
    this.renderActions();
  }

  private updateHpBars(): void {
    const [player, wild] = this.battleState.participants;
    this.playerHpBar.setHp(player.active.currentHp, player.species.baseStats.hp);
    this.wildHpBar.setHp(wild.active.currentHp, wild.species.baseStats.hp);
  }

  private renderActions(): void {
    this.clearActionButtons();
    const { width, height } = this.scale;
    const player = this.battleState.participants[0];
    const moveIds = player.species.moveIds;
    const y = height - 90;
    const buttonCount = moveIds.length + 2; // moves + flee + catch
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
        { width: spacing - 16, height: 64, fontSize: "20px", backgroundColor: TYPE_COLOURS[move.type] }
      );
      this.actionButtons.push(button);
    });

    const fleeButton = createButton(
      this,
      startX + moveIds.length * spacing,
      y,
      t("battle_flee"),
      () => this.performTurn({ kind: "flee" }),
      { width: spacing - 16, height: 64, fontSize: "20px", backgroundColor: 0x555555 }
    );
    this.actionButtons.push(fleeButton);

    const catchButton = createButton(
      this,
      startX + (moveIds.length + 1) * spacing,
      y,
      t("battle_catch"),
      () => this.performCatch(),
      { width: spacing - 16, height: 64, fontSize: "20px", backgroundColor: 0xe63946 }
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
    if (this.busy || this.battleState.outcome !== "ongoing") return;
    this.busy = true;

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
      this.logText.setText(entry.text);

      if (entry.kind === "damage") {
        playHitSound();
        this.shakeSprite(entry.targetPlayerId === "player" ? this.playerSprite : this.wildSprite);
        if (entry.effectiveness === "strong") this.flashFeedback(t("battle_effective_strong"));
        else if (entry.effectiveness === "weak") this.flashFeedback(t("battle_effective_weak"));
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
    if (outcome === "won") this.logText.setText(t("battle_won"));
    else if (outcome === "lost") this.logText.setText(t("battle_lost"));
    else if (outcome === "fled") this.logText.setText(t("battle_fled"));
    else if (outcome === "caught") this.logText.setText(t("battle_caught"));
  }

  private endBattle(): void {
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

function resolveMoves(species: CreatureSpecies, movesById: Record<string, Move>): Record<string, Move> {
  const result: Record<string, Move> = {};
  for (const id of species.moveIds) {
    const move = movesById[id];
    if (move) result[id] = move;
  }
  return result;
}

function pickWildMoveId(species: CreatureSpecies): string {
  const ids = species.moveIds;
  return ids[Math.floor(Math.random() * ids.length)] ?? ids[0];
}
