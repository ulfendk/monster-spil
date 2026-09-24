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
  TeamView,
} from "@shared";
import { createBattle, resolveTurn, createRng, outcomeFor, BOSS_PLAYER_ID, closenessFromDamage, closenessFromFoe, passOutUntil } from "@shared";
import { listen, say } from "../net/lobby";
import { presence } from "../net/presence";
import type { RaidBattleUpdate } from "../net/presence";
import { playCreatureSound } from "../audio/creature-sound";
import { makeParticipant } from "../battle-participant";
import type { SaveData } from "../save/schema";
import type { GameContent } from "../content/load-content";
import { passOut, persist } from "../save/game-state";
import { createButton } from "../ui/Button";
import { createHpBar } from "../ui/HpBar";
import type { HpBarHandle } from "../ui/HpBar";
import { TYPE_COLOURS } from "../gfx/placeholder-sprites";
import {
  TEAM_ICON,
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
import { getLayout, onRelayout } from "../ui/layout";
import { ic, richText } from "../ui/rich-text";
import { addIcon, iconKey } from "../gfx/icon-art";
import { addScreenBackdrop } from "../gfx/motifs";
import { C, CSS, FONT } from "../ui/theme";

/** A player-vs-player battle: the server resolves every turn, this scene only shows it and sends move choices. */
export interface DuelSceneData {
  room: Room;
  view: DuelView;
  myId: string;
}

/** An attempt on the family dragon: the server resolves every turn (and the dragon's moves). */
export interface RaidSceneData {
  battle: BattleState;
  myId: string;
}

/** A team fight against the dragon: the server resolves each turn once every member has picked. */
export interface TeamSceneData {
  view: TeamView;
  myId: string;
}

/** Exactly one of: a wild encounter (wildInstance/wildSpecies), a duel, a raid attempt or a team fight. */
export interface BattleSceneData {
  save: SaveData;
  content: GameContent;
  wildInstance?: CreatureInstance;
  wildSpecies?: CreatureSpecies;
  duel?: DuelSceneData;
  raid?: RaidSceneData;
  team?: TeamSceneData;
}

const TITLE_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: FONT,
  fontSize: "24px",
  color: CSS.text,
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
  private logIcon!: Phaser.GameObjects.Image;
  /** Ink, waves and a sun behind the fight (rebuilt on relayout). */
  private backdrop: Phaser.GameObjects.GameObject[] = [];
  /** The message showing now, so a relayout can put it back. */
  private logTextValue = "";
  private logIconValue = "";
  private actionButtons: Phaser.GameObjects.Container[] = [];
  private busy = false;
  /** "player" in wild battles, the real player id in duels. */
  private myId = "player";
  private duel?: DuelSceneData;
  private raid?: RaidSceneData;
  private team?: TeamSceneData;
  /** Teammates' HP, shown as a row of small labels at the top in a team fight. */
  private allies?: Phaser.GameObjects.Container;
  private finished = false;
  /** Set once my monster has fainted and the pass-out wait has been started. */
  private passedOut = false;

  constructor() {
    super("Battle");
  }

  create(data: BattleSceneData): void {
    this.battleData = data;
    this.busy = false;
    this.finished = false;
    this.passedOut = false;
    this.duel = data.duel;
    this.raid = data.raid;
    this.team = data.team;

    if (data.team) {
      this.myId = data.team.myId;
      this.battleState = data.team.view.battle!;
      // This scene runs on top of the paused interaction screen, so it needs its own background.
      this.cameras.main.setBackgroundColor(CSS.ink);
      this.wireTeam();
    } else if (data.raid) {
      this.myId = data.raid.myId;
      this.battleState = data.raid.battle;
      this.wireRaid();
    } else if (data.duel) {
      this.myId = data.duel.myId;
      this.battleState = data.duel.view.battle!;
      // This scene runs on top of the paused lobby, so it needs its own opaque background.
      this.cameras.main.setBackgroundColor(CSS.ink);
      this.wireDuel(data.duel);
    } else {
      this.myId = "player";
      const playerSpecies = data.content.speciesById[data.save.creatures[0].speciesId];
      const player = makeParticipant("player", data.save.creatures[0], playerSpecies, data.content);
      const wild = makeParticipant("wild", data.wildInstance!, data.wildSpecies!, data.content);
      this.battleState = createBattle(Date.now(), player, wild);
    }
    this.logTextValue = "";
    this.logIconValue = "";
    this.buildUi();
    this.renderActions();
    onRelayout(this, () => this.relayout());
    playCreatureSound(this, this.foe().species);
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
      // Losing a duel by fainting (not by running away) means passing out.
      if (outcomeFor(next, this.myId) === "lost" && this.me().active.currentHp <= 0) {
        this.startPassOut(closenessFromFoe(this.foe().active.currentHp, this.foe().species.baseStats.hp));
      }
      this.showOutcomeMessage(outcomeFor(next, this.myId));
      this.clearActionButtons();
      this.time.delayedCall(1400, () => this.endBattle());
    } else {
      this.busy = false;
      this.renderActions();
    }
  }

  private wireTeam(): void {
    const onTeam = (view: TeamView) => this.onTeamUpdate(view);
    const onEnded = () => this.abortDuel(t("raid_won"), OUTCOME_ICONS.won);
    const onStatus = (status: string) => {
      if (status !== "online") this.abortDuel(t("duel_connection_lost"), CONNECTION_LOST_ICON);
    };
    const onProblem = () => {
      if (this.busy && !this.finished) {
        this.busy = false;
        this.renderActions();
      }
    };
    presence.events.on("team", onTeam);
    presence.events.on("teamEnded", onEnded);
    presence.events.on("status", onStatus);
    presence.events.on("problem", onProblem);
    this.events.once("shutdown", () => {
      presence.events.off("team", onTeam);
      presence.events.off("teamEnded", onEnded);
      presence.events.off("status", onStatus);
      presence.events.off("problem", onProblem);
    });
  }

  /** My own member entry in the team. */
  private meInTeam(view = this.team?.view) {
    return view?.members.find((m) => m.playerId === this.myId);
  }

  private onTeamUpdate(view: TeamView): void {
    if (this.finished || !this.team || view.id !== this.team.view.id || !view.battle) return;
    this.team.view = view;
    this.drawAllies();
    const next = view.battle;
    // The server also pushes a view when only someone else has picked; nothing new to show yet.
    if (next.turn === this.battleState.turn && view.phase === "active") return;
    const previousLogLength = this.battleState.log.length;
    this.battleState = next;
    this.updateHpBars();
    this.reactToEntries(next.log.slice(previousLogLength));
    // My monster fainted: my pass-out wait starts now, even if the team fights on.
    if (this.meInTeam(view)?.status === "fainted") this.startPassOut(closenessFromDamage(this.dealtToDragon(), this.me().species.baseStats.hp));

    if (view.phase === "done") {
      this.finished = true;
      this.clearActionButtons();
      const dealt = next.log
        .filter((e) => e.kind === "damage" && e.actorPlayerId === this.myId && e.targetPlayerId === BOSS_PLAYER_ID)
        .reduce((sum, e) => sum + (e.amount ?? 0), 0);
      if (view.outcome === "won") this.say(t("raid_won"), OUTCOME_ICONS.won);
      else this.say(`${t("raid_dealt_prefix")} ${dealt} ${t("raid_dealt_suffix")}`, LOG_ICONS.damage);
      this.time.delayedCall(2600, () => this.endBattle());
      return;
    }
    if (this.meInTeam(view)?.status !== "in") {
      // Out of the fight (fainted or fled): watch the team finish.
      this.clearActionButtons();
      this.busy = true;
      this.time.delayedCall(900, () => {
        if (!this.finished) this.say(t("team_fainted"), OUTCOME_ICONS.lost);
      });
      return;
    }
    this.busy = false;
    this.renderActions();
  }

  /** The other members, with their monster's HP (fainted or out shown by icon). */
  private drawAllies(): void {
    this.allies?.destroy();
    const view = this.team?.view;
    if (!view) return;
    const layout = getLayout(this);
    const others = view.members.filter((m) => m.playerId !== this.myId);
    const nameOf = (id: string) => presence.players.get(id)?.navn ?? "?";
    const line = others
      .map((m) => `${nameOf(m.playerId)} ${m.status === "fainted" ? ic("faint") : m.status === "left" ? ic(FLEE_ICON) : `${ic("heart")} ${m.hp}`}${view.answered.includes(m.playerId) ? " ✓" : ""}`)
      .join("   ");
    this.allies = richText(this, layout.safe.left + 12, layout.safe.top + 8, `${ic(TEAM_ICON)} ${line}`, { fontFamily: FONT, fontSize: layout.font(20), color: CSS.text }, 0, 0).setDepth(5);
  }

  private wireRaid(): void {
    const onUpdate = (update: RaidBattleUpdate) => this.onRaidUpdate(update);
    const onStatus = (status: string) => {
      if (status !== "online") this.abortDuel(t("duel_connection_lost"), CONNECTION_LOST_ICON);
    };
    const onProblem = () => {
      if (this.busy && !this.finished) {
        this.busy = false;
        this.renderActions();
      }
    };
    presence.events.on("raidBattle", onUpdate);
    presence.events.on("status", onStatus);
    presence.events.on("problem", onProblem);
    this.events.once("shutdown", () => {
      presence.events.off("raidBattle", onUpdate);
      presence.events.off("status", onStatus);
      presence.events.off("problem", onProblem);
    });
  }

  private onRaidUpdate(update: RaidBattleUpdate): void {
    if (this.finished) return;
    if (update.over === "defeated") return this.abortDuel(t("raid_won"), OUTCOME_ICONS.won);
    const next = update.battle;
    const previousLogLength = this.battleState.log.length;
    this.battleState = next;
    this.updateHpBars();
    this.reactToEntries(next.log.slice(previousLogLength));
    if (next.outcome === "ongoing") {
      this.busy = false;
      this.renderActions();
      return;
    }
    this.finished = true;
    this.clearActionButtons();
    const dealt = next.log
      .filter((e) => e.kind === "damage" && e.targetPlayerId === BOSS_PLAYER_ID)
      .reduce((sum, e) => sum + (e.amount ?? 0), 0);
    if (next.winnerId === this.myId) this.say(t("raid_won"), OUTCOME_ICONS.won);
    else this.say(`${t("raid_dealt_prefix")} ${dealt} ${t("raid_dealt_suffix")}`, LOG_ICONS.damage);
    if (next.outcome === "lost") this.startPassOut(closenessFromDamage(dealt, this.me().species.baseStats.hp));
    this.time.delayedCall(2200, () => this.endBattle());
  }

  /** My monster fainted: start the pass-out wait (once), longer the less of a fight it was. */
  private startPassOut(closeness: number): void {
    if (this.passedOut) return;
    this.passedOut = true;
    void passOut(closeness);
  }

  /** Damage my monster dealt to the dragon in this fight. */
  private dealtToDragon(): number {
    return this.battleState.log
      .filter((e) => e.kind === "damage" && e.targetPlayerId === BOSS_PLAYER_ID && (e.actorPlayerId ?? this.myId) === this.myId)
      .reduce((sum, e) => sum + (e.amount ?? 0), 0);
  }

  /** Shows a battle message with its icon. */
  private say(text: string, icon: string): void {
    this.logTextValue = text;
    this.logIconValue = icon;
    this.logText.setText(text);
    if (icon) this.logIcon.setTexture(iconKey(icon)).setVisible(true);
    else this.logIcon.setVisible(false);
  }

  private abortDuel(message: string, icon: string): void {
    if (this.finished) return;
    this.finished = true;
    this.clearActionButtons();
    this.say(message, icon);
    this.time.delayedCall(1400, () => this.endBattle());
  }

  /**
   * Places everything for the current screen: portrait phones get the foe at the top,
   * the player below and a grid of buttons at the bottom; landscape keeps the classic
   * diagonal. Called again (after destroying the old objects) when the screen rotates.
   */
  private buildUi(): void {
    const layout = getLayout(this);
    const { width, portrait, safe } = layout;
    const player = this.me();
    const wild = this.foe();
    const arena = this.arena();
    const spriteBase = Math.min(arena.h * (portrait ? 0.26 : 0.34), width * (portrait ? 0.42 : 0.26)) / 128;
    const spriteScale = Phaser.Math.Clamp(spriteBase, 0.55, 1.6);
    const barSize = Phaser.Math.Clamp(Math.min(width * (portrait ? 0.5 : 0.24), 260) / 220, 0.6, 1.1);

    const foe = portrait ? { x: width * 0.66, y: arena.top + arena.h * 0.3 } : { x: width * 0.72, y: arena.top + arena.h * 0.36 };
    const me = portrait ? { x: width * 0.33, y: arena.top + arena.h * 0.8 } : { x: width * 0.28, y: arena.top + arena.h * 0.76 };
    // A rising sun behind the opponent — large and bold for the dragon.
    const boss = Boolean(this.raid || this.team);
    this.backdrop = addScreenBackdrop(this, width, layout.height, {
      sun: { x: foe.x, y: foe.y, r: Math.min(width, layout.height) * (boss ? 0.3 : 0.2) },
    });
    if (boss) (this.backdrop[1] as Phaser.GameObjects.Arc).setAlpha(0.55);
    // The dragon is drawn bigger than any monster.
    const foeScale = spriteScale * (this.raid ? 1.5 : 1);
    this.wildSprite = this.add.image(foe.x, foe.y, this.textureFor(wild.species.spriteFront)).setScale(foeScale);
    this.wildHpBar = createHpBar(this, foe.x, foe.y - 64 * foeScale - layout.px(14), wild.species.navn, barSize);
    this.playerSprite = this.add.image(me.x, me.y, this.textureFor(player.species.spriteBack)).setScale(spriteScale);
    this.playerHpBar = createHpBar(this, me.x, me.y - 64 * spriteScale - layout.px(14), player.species.navn, barSize);

    const logY = portrait ? arena.top + arena.h * 0.55 : arena.top + arena.h * 0.45;
    const iconSize = Math.max(40, layout.px(64));
    this.logIcon = this.add.image(width / 2, logY - iconSize * 0.9, iconKey(this.logIconValue || "star")).setDisplaySize(iconSize * 1.2, iconSize * 1.2).setVisible(Boolean(this.logIconValue));
    this.logText = this.add
      .text(width / 2, logY, this.logTextValue, { ...TITLE_STYLE, fontSize: layout.font(24), wordWrap: { width: width - safe.left - safe.right - 40 } })
      .setOrigin(0.5);

    this.updateHpBars();
    this.drawAllies();
  }

  /** The area above the buttons, inside the safe area. */
  private arena(): { top: number; h: number } {
    const layout = getLayout(this);
    const top = layout.safe.top + layout.px(12) + (this.team ? Math.max(28, layout.px(36)) : 0);
    const grid = this.buttonGrid();
    return { top, h: grid.top - layout.px(12) - top };
  }

  /** How many columns and rows the battle buttons need, and where the grid starts. */
  private buttonGrid() {
    const layout = getLayout(this);
    const count = Object.keys(this.me().moves).length + (this.duel || this.raid || this.team ? 1 : 2);
    const gap = layout.px(14);
    const usable = layout.width - layout.safe.left - layout.safe.right - gap * 2;
    // As many per row as fit at a readable width (a label like "Varmebølge" needs ~110px).
    const cols = Math.max(1, Math.min(count, Math.floor((usable + gap) / (110 + gap))));
    const rows = Math.ceil(count / cols);
    const w = Math.min(220, (usable - gap * (cols - 1)) / cols);
    const h = layout.touch(84);
    const top = layout.height - layout.safe.bottom - gap - rows * h - (rows - 1) * gap;
    return { count, cols, rows, w, h, gap, top };
  }

  /** Rebuilds the screen for a new size, keeping the battle, the message and whether the buttons are showing. */
  private relayout(): void {
    const showingActions = this.actionButtons.length > 0;
    for (const o of [...this.backdrop, this.wildSprite, this.playerSprite, this.logIcon, this.logText, this.wildHpBar.container, this.playerHpBar.container]) o.destroy();
    this.buildUi();
    if (showingActions) this.renderActions();
  }

  private updateHpBars(): void {
    const player = this.me();
    const wild = this.foe();
    this.playerHpBar.setHp(player.active.currentHp, player.species.baseStats.hp);
    this.wildHpBar.setHp(wild.active.currentHp, wild.species.baseStats.hp);
  }

  private renderActions(): void {
    this.clearActionButtons();
    const layout = getLayout(this);
    const player = this.me();
    const grid = this.buttonGrid();
    const canCatch = !this.duel && !this.raid && !this.team; // you can't catch another player's monster, or the dragon
    const actions: Array<{ label: string; icon: string; colour: number; onTap: () => void }> = Object.keys(player.moves).map((moveId) => {
      const move = player.moves[moveId]!;
      return { label: move.navn, icon: TYPE_ICONS[move.type], colour: TYPE_COLOURS[move.type], onTap: () => this.performTurn({ kind: "move", moveId }) };
    });
    actions.push({ label: t("battle_flee"), icon: FLEE_ICON, colour: C.buttonQuiet, onTap: () => this.performTurn({ kind: "flee" }) });
    if (canCatch) actions.push({ label: t("battle_catch"), icon: CATCH_ICON, colour: C.catch, onTap: () => this.performCatch() });

    actions.forEach((action, i) => {
      const row = Math.floor(i / grid.cols);
      const inRow = Math.min(grid.cols, actions.length - row * grid.cols);
      const rowW = inRow * grid.w + (inRow - 1) * grid.gap;
      const col = i - row * grid.cols;
      const x = layout.width / 2 - rowW / 2 + grid.w / 2 + col * (grid.w + grid.gap);
      const y = grid.top + grid.h / 2 + row * (grid.h + grid.gap);
      const button = createButton(this, x, y, action.label, action.onTap, {
        width: grid.w,
        height: grid.h,
        fontSize: layout.font(20),
        backgroundColor: action.colour,
        icon: action.icon,
      });
      this.actionButtons.push(button);
    });
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
    const ball = addIcon(this, this.playerSprite.x, this.playerSprite.y, CATCH_ICON, 34);
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

    if (this.raid) {
      if (playerAction.kind === "catch") return;
      this.clearActionButtons();
      presence.send("raidAction", { action: playerAction });
      return;
    }

    if (this.team) {
      if (playerAction.kind === "catch") return;
      this.clearActionButtons();
      this.say(t("team_waiting_move"), WAITING_ICON);
      presence.send("teamAction", { teamId: this.team.view.id, action: playerAction });
      return;
    }

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
        // In a team fight a hit on a teammate shows in the allies row, not on either sprite.
        if (entry.targetPlayerId === this.myId) this.shakeSprite(this.playerSprite);
        else if (!this.team || entry.targetPlayerId === BOSS_PLAYER_ID) this.shakeSprite(this.wildSprite);
        if (entry.effectiveness === "strong") this.flashFeedback(`${ic(STRONG_ICON)} ${t("battle_effective_strong")}`);
        else if (entry.effectiveness === "weak") this.flashFeedback(`${ic(WEAK_ICON)} ${t("battle_effective_weak")}`);
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
    const layout = getLayout(this);
    const text = richText(this, layout.width / 2, this.logText.y + layout.px(50), label, { fontFamily: FONT, fontSize: layout.font(26), color: CSS.accent }).setAlpha(0);
    this.tweens.add({ targets: text, alpha: 1, duration: 150, yoyo: true, hold: 500, onComplete: () => text.destroy() });
  }

  private showOutcomeMessage(outcome: BattleState["outcome"]): void {
    if (outcome === "won") this.say(t("battle_won"), OUTCOME_ICONS.won);
    else if (outcome === "lost") this.say(t("battle_lost"), OUTCOME_ICONS.lost);
    else if (outcome === "fled") this.say(t("battle_fled"), OUTCOME_ICONS.fled);
    else if (outcome === "caught") this.say(t("battle_caught"), OUTCOME_ICONS.caught);
  }

  private endBattle(): void {
    if (this.team) {
      // A team fight changes nobody's save; the damage lives on the server.
      this.finished = true;
      this.scene.resume("Interact");
      this.scene.stop();
      return;
    }
    if (this.raid) {
      // A raid attempt changes nobody's save; the damage lives on the server.
      this.scene.start("Overworld", { save: this.battleData.save, content: this.battleData.content });
      return;
    }
    if (this.duel) {
      // A duel changes nobody's save. Hand control back to the interaction screen underneath.
      this.finished = true;
      this.scene.resume("Interact");
      this.scene.stop();
      return;
    }

    const player = this.battleState.participants[0];
    if (this.battleState.outcome === "lost") {
      // Fainting in the wild: pass out for a while (the monster is healed meanwhile).
      const wild = this.battleState.participants[1];
      this.battleData.save.passedOutUntil = passOutUntil(new Date(), closenessFromFoe(wild.active.currentHp, wild.species.baseStats.hp), "wild");
    }
    const saved = this.battleData.save.creatures.find((c) => c.instanceId === player.active.instanceId);
    if (saved) {
      // A loss heals the monster (it recovers while the player is passed out), rather
      // than soft-locking the player's only creature at 0 HP.
      saved.currentHp =
        this.battleState.outcome === "lost" ? player.species.baseStats.hp : player.active.currentHp;
    }

    if (this.battleState.outcome === "caught") {
      const wild = this.battleState.participants[1];
      this.battleData.save.creatures.push({ ...wild.active, ownerId: this.battleData.save.player.id });
      const counts = this.battleData.save.caughtCounts;
      counts[wild.species.id] = (counts[wild.species.id] ?? 0) + 1;
      // Counted on the family scoreboard when the server has acknowledged it (now, or once back online).
      this.battleData.save.pendingScore.push({ id: crypto.randomUUID(), kind: "catch", at: new Date().toISOString() });
      if (!this.battleData.save.seenSpeciesIds.includes(wild.species.id)) {
        this.battleData.save.seenSpeciesIds.push(wild.species.id);
      }
    }

    void persist().then(() => presence.flushScore());

    this.scene.start("Overworld", { save: this.battleData.save, content: this.battleData.content });
  }
}

function pickWildMoveId(species: CreatureSpecies): string {
  const ids = species.moveIds;
  return ids[Math.floor(Math.random() * ids.length)] ?? ids[0];
}
