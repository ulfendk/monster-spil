import Phaser from "phaser";
import { spriteFit } from "../gfx/creature-sprite";
import type { Room } from "colyseus.js";
import type {
  PassOutKind,
  CreatureInstance,
  CreatureSpecies,
  BattleState,
  BattleParticipant,
  BattleAction,
  BattleLogEntry,
  DuelView,
  TeamView,
  Move,
  TypeId,
} from "@shared";
import { createBattle, resolveTurn, createRng, outcomeFor, BOSS_PLAYER_ID, closenessFromFoe, passOutUntil } from "@shared";
import { listen, say } from "../net/lobby";
import { presence } from "../net/presence";
import type { RaidBattleUpdate } from "../net/presence";
import { beastsById } from "../content/load-beasts";
import { playCreatureSound } from "../audio/creature-sound";
import { makeParticipant, mySpecies } from "../battle-participant";
import type { CatchSceneData } from "./CatchScene";
import type { BattleStage, Impact, Side } from "../cave/battle-stage";
import { faceFrameKey } from "../gfx/placeholder-sprites";
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
import { ic, richChip, richText } from "../ui/rich-text";
import { addIcon, iconKey } from "../gfx/icon-art";
import { addScreenBackdrop } from "../gfx/motifs";
import { C, CSS, FONT } from "../ui/theme";
import { recordProgress } from "../progress/record";

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
  /** The wild monster is a single one waiting on the map (the UFO's alien): tell the server how it went. */
  spawnId?: string;
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
  /** Wild battles in 3D: the meadow under this scene (cave/battle-stage.ts), once three.js has loaded. */
  private stage?: BattleStage;
  private stageCanvas?: HTMLCanvasElement;
  /** Loading the meadow: the 2D pictures wait for it (or for it to fail). */
  private stageLoading = false;
  /** The ink card behind the message in 3D, and where effectiveness feedback shows. */
  private logCard?: Phaser.GameObjects.Graphics;
  private feedbackY = 0;
  /** False once the scene has shut down (a late-loading meadow is then thrown away). */
  private alive = false;

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
    this.stage = undefined;
    this.alive = true;
    // A wild battle is shown in 3D in the meadow, if the device can (tried below).
    this.stageLoading = !data.duel && !data.raid && !data.team;
    this.events.once("shutdown", () => this.teardownStage());

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
      const player = makeParticipant("player", data.save.creatures[0], mySpecies(data.save, playerSpecies), data.content);
      const wild = makeParticipant("wild", data.wildInstance!, data.wildSpecies!, data.content);
      this.battleState = createBattle(Date.now(), player, wild);
    }
    // A wild monster says hello (in a duel or a raid the first message comes from the server).
    this.logTextValue = this.stageLoading ? `${this.foe().species.navn} ${t("battle_appears")}` : "";
    this.logIconValue = this.stageLoading ? "paw" : "";
    this.buildUi();
    this.renderActions();
    onRelayout(this, () => this.relayout());
    playCreatureSound(this, this.foe().species);
    if (this.stageLoading) this.load3d();
  }

  // ------------------------------------------------------------ the 3D meadow (wild battles)

  /** Loads three.js and puts the meadow under this scene; without WebGL (or offline before it was cached) the battle stays 2D. */
  private load3d(): void {
    void import("../cave/battle-stage")
      .then(({ BattleStage }) => {
        if (!this.alive) return;
        const picture = (key: string) => (this.textures.exists(key) ? (this.textures.get(key).getSourceImage() as HTMLImageElement | HTMLCanvasElement) : undefined);
        const foe = this.foe().species;
        const mine = this.me().species;
        const foeImage = picture(foe.spriteFront);
        const mineImage = picture(mine.spriteBack);
        if (!foeImage || !mineImage) throw new Error("no pictures for the 3D battle");
        const canvas = document.createElement("canvas");
        canvas.className = "cave-stage";
        document.getElementById("game")!.prepend(canvas);
        try {
          this.stage = new BattleStage(
            canvas,
            { speciesId: foe.id, image: foeImage, blink: picture(faceFrameKey(foe.spriteFront, "blink")), talk: picture(faceFrameKey(foe.spriteFront, "talk")) },
            { speciesId: mine.id, image: mineImage },
            Math.floor(this.rng.next() * 2 ** 31)
          );
        } catch (error) {
          canvas.remove();
          throw error;
        }
        this.stageCanvas = canvas;
        this.stage.onCry = (id) => playCreatureSound(this, id === foe.id ? foe : mine);
        if (import.meta.env.DEV) (window as unknown as { __battle?: BattleScene }).__battle = this;
      })
      .catch((error: unknown) => console.warn("3D battle unavailable:", error))
      .finally(() => {
        if (!this.alive) return;
        this.stageLoading = false;
        this.relayout();
      });
  }

  private teardownStage(): void {
    this.alive = false;
    this.stage?.destroy();
    this.stage = undefined;
    this.stageCanvas?.remove();
    this.stageCanvas = undefined;
  }

  /** The 3D meadow covers the game's area exactly, under the Phaser canvas; in the battle it's framed for `band`. */
  private fitStage(band?: Parameters<BattleStage["resize"]>[2]): void {
    const host = document.getElementById("game");
    if (this.stage && host) this.stage.resize(host.clientWidth, host.clientHeight, band);
  }

  /** Close-up moves (a claw, a bite, a tail, a headbutt: weak stone moves) dash in; the rest fly over. */
  private static isCloseMove(move: Move): boolean {
    return move.type === "sten" && move.power <= 30;
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
      recordProgress({ kind: "duel", won: outcomeFor(next, this.myId) === "won" });
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
    const onEnded = (reason: string) => (reason === "gone" ? this.abortDuel(t("beast_gone"), FLEE_ICON) : this.abortDuel(this.bossWonText(), OUTCOME_ICONS.won));
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
    if (this.meInTeam(view)?.status === "fainted") this.startPassOut(0, "dragon");

    if (view.phase === "done") {
      this.finished = true;
      this.clearActionButtons();
      const dealt = next.log
        .filter((e) => e.kind === "damage" && e.actorPlayerId === this.myId && e.targetPlayerId === BOSS_PLAYER_ID)
        .reduce((sum, e) => sum + (e.amount ?? 0), 0);
      if (dealt > 0) recordProgress({ kind: "bossDamage", amount: dealt });
      if (view.outcome === "won") this.say(this.bossWonText(), OUTCOME_ICONS.won);
      else this.say(this.bossDealtText(dealt), LOG_ICONS.damage);
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
    if (update.over === "defeated") return this.abortDuel(this.bossWonText(), OUTCOME_ICONS.won);
    if (update.over === "gone") return this.abortDuel(t("beast_gone"), FLEE_ICON);
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
    if (dealt > 0) recordProgress({ kind: "bossDamage", amount: dealt });
    if (next.winnerId === this.myId) this.say(this.bossWonText(), OUTCOME_ICONS.won);
    else this.say(this.bossDealtText(dealt), LOG_ICONS.damage);
    if (next.outcome === "lost") this.startPassOut(0, "dragon");
    this.time.delayedCall(2200, () => this.endBattle());
  }

  /** The boss's name when it is a visiting beast: then the texts name it instead of "the dragon". */
  private beastName(): string | undefined {
    const id = this.battleState.participants[1]?.species.id;
    return id ? beastsById[id]?.navn : undefined;
  }

  private bossWonText(): string {
    const navn = this.beastName();
    return navn ? `${navn} ${t("beast_won_suffix")}` : t("raid_won");
  }

  private bossDealtText(dealt: number): string {
    return `${t("raid_dealt_prefix")} ${dealt} ${this.beastName() ? t("beast_dealt_suffix") : t("raid_dealt_suffix")}`;
  }

  /** My monster fainted: start the pass-out wait (once) — in a duel longer the less of a fight it was, against the dragon always 60 s. */
  private startPassOut(closeness: number, kind: PassOutKind = "fight"): void {
    if (this.passedOut) return;
    this.passedOut = true;
    void passOut(closeness, kind);
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
    if (this.stage) return this.buildUi3d();
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
    // While the 3D meadow loads, the monsters wait (so they don't flash up in 2D first).
    const pictures = !this.stageLoading;
    // The dragon is drawn bigger than any monster.
    const foeScale = spriteScale * (this.raid ? 1.5 : 1);
    this.wildSprite = this.add.image(foe.x, foe.y, this.textureFor(wild.species.spriteFront)).setScale(foeScale * spriteFit(this, this.textureFor(wild.species.spriteFront))).setVisible(pictures);
    this.wildHpBar = createHpBar(this, foe.x, foe.y - 64 * foeScale - layout.px(14), wild.species.navn, barSize);
    this.playerSprite = this.add.image(me.x, me.y, this.textureFor(player.species.spriteBack)).setScale(spriteScale * spriteFit(this, this.textureFor(player.species.spriteBack))).setVisible(pictures);
    this.playerHpBar = createHpBar(this, me.x, me.y - 64 * spriteScale - layout.px(14), player.species.navn, barSize);

    const logY = portrait ? arena.top + arena.h * 0.55 : arena.top + arena.h * 0.45;
    const iconSize = Math.max(40, layout.px(64));
    this.logIcon = this.add.image(width / 2, logY - iconSize * 0.9, iconKey(this.logIconValue || "star")).setDisplaySize(iconSize * 1.2, iconSize * 1.2).setVisible(Boolean(this.logIconValue));
    this.logText = this.add
      .text(width / 2, logY, this.logTextValue, { ...TITLE_STYLE, fontSize: layout.font(24), wordWrap: { width: width - safe.left - safe.right - 40 } })
      .setOrigin(0.5);
    this.feedbackY = logY + layout.px(50);

    this.updateHpBars();
    this.drawAllies();
  }

  /**
   * The 3D version (wild battles): the meadow fills the screen under this scene, framed so
   * both monsters fit between the top and the message; the message is an ink card just above
   * the buttons, and the health bars sit on ink cards in the free corners — the wild
   * monster's at the top left, mine at the bottom right (the monsters stand on the diagonal).
   */
  private buildUi3d(): void {
    const layout = getLayout(this);
    const { width, portrait, safe } = layout;
    const arena = this.arena();
    const grid = this.buttonGrid();
    const gap = layout.px(12);
    const barSize = Phaser.Math.Clamp(Math.min(width * (portrait ? 0.5 : 0.3), 260) / 220, 0.6, 1.1);
    const barW = 220 * barSize + 20 * barSize;
    const barH = Math.round(36 * barSize) + Math.max(14, Math.round(24 * barSize)) + Math.round(10 * barSize);
    const iconSize = Math.max(36, layout.px(52));
    const fontPx = parseInt(layout.font(22), 10);
    const logW = Math.min(width - safe.left - safe.right - 24, 900);
    // Room for three lines on a narrow phone, two elsewhere.
    const logH = Math.round(Math.max(iconSize + 16, fontPx * 1.3 * (width < 600 ? 3 : 2) + 16));
    const logY = grid.top - gap - logH / 2;
    const band = { top: arena.top + barH + gap / 2, bottom: logY - logH / 2 - barH - gap };
    // The corners' bars may overlap the picture's band a little where the monsters aren't.
    const overlap = Math.min(barH, Math.max(0, 260 - (band.bottom - band.top)) / 2);
    band.top -= overlap;
    band.bottom += overlap;
    this.fitStage({ ...band, margin: safe.left + 12 });
    this.backdrop = [];

    // The 2D pictures stay (the fallback ball throw uses their places), but hidden.
    this.wildSprite = this.add.image(0, 0, this.textureFor(this.foe().species.spriteFront)).setVisible(false);
    this.playerSprite = this.add.image(0, 0, this.textureFor(this.me().species.spriteBack)).setVisible(false);
    const barBottom = barH - Math.round(36 * barSize) - Math.round(10 * barSize) / 2 - Math.max(14, Math.round(24 * barSize)) / 2;
    this.wildHpBar = createHpBar(this, safe.left + 12 + barW / 2, arena.top + barH - barBottom, this.foe().species.navn, barSize, true);
    this.playerHpBar = createHpBar(this, width - safe.right - 12 - barW / 2, logY - logH / 2 - gap / 2 - barBottom, this.me().species.navn, barSize, true);

    this.logCard = this.add.graphics();
    this.logCard.fillStyle(C.overlay, 0.85).fillRoundedRect(width / 2 - logW / 2, logY - logH / 2, logW, logH, Math.min(18, logH / 2));
    this.logIcon = this.add
      .image(width / 2 - logW / 2 + 12 + iconSize / 2, logY, iconKey(this.logIconValue || "star"))
      .setDisplaySize(iconSize, iconSize)
      .setVisible(Boolean(this.logIconValue));
    this.logText = this.add
      .text(width / 2 - logW / 2 + iconSize + 28, logY, this.logTextValue, { ...TITLE_STYLE, fontSize: layout.font(22), align: "left", wordWrap: { width: logW - iconSize - 44 } })
      .setOrigin(0, 0.5);
    this.feedbackY = band.top + (band.bottom - band.top) * 0.45;
    this.updateHpBars();
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
    this.logCard?.destroy();
    this.logCard = undefined;
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

  /**
   * Catching: the 3D meadow opens over the battle (in a 3D battle it's the same meadow: my
   * monster steps aside) and you shoot the ball at the monster with the slingshot. When the
   * ball hits, the turn is worked out at once (so the ball knows whether to glow or burst
   * open); it's shown here when the battle comes back. Without 3D (no WebGL), the ball is
   * thrown the old way.
   */
  private performCatch(): void {
    if (this.busy || this.battleState.outcome !== "ongoing") return;
    this.busy = true;
    this.clearActionButtons();
    const wild = this.battleState.participants[1];
    let worked: BattleState | undefined;
    const data: CatchSceneData = {
      species: wild.species,
      seed: Math.floor(this.rng.next() * 2 ** 31),
      ...(this.stage ? { stage: this.stage } : {}),
      decide: (thrown) => {
        worked = this.wildTurn({ kind: "catch", throw: thrown });
        return worked.outcome === "caught";
      },
      done: (thrown) => {
        this.scene.stop("Catch");
        this.scene.wake();
        const next = worked ?? this.wildTurn({ kind: "catch", throw: thrown });
        if (!this.stage) return this.presentTurn(next);
        // Back to the battle in the meadow: my monster steps back in, then the turn plays out.
        this.relayout();
        void this.stage.endCatch().then(() => this.presentTurn(next));
      },
      unavailable: () => {
        this.scene.stop("Catch");
        this.scene.wake();
        this.playBallThrowAnimation(() => {
          this.busy = false;
          this.performTurn({ kind: "catch" });
        });
      },
    };
    this.scene.launch("Catch", data);
    this.scene.sleep();
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

    this.presentTurn(this.wildTurn(playerAction));
  }

  /** Works out a wild battle's turn: my action and the wild monster's move. */
  private wildTurn(playerAction: BattleAction): BattleState {
    const wild = this.battleState.participants[1];
    return resolveTurn(
      this.battleState,
      [
        { playerId: "player", action: playerAction },
        { playerId: "wild", action: { kind: "move", moveId: pickWildMoveId(wild.species) } },
      ],
      this.rng
    );
  }

  /** Shows a worked-out turn: its log, the HP bars, and what comes next. */
  private presentTurn(nextState: BattleState): void {
    if (this.stage) {
      void this.presentTurn3d(nextState);
      return;
    }
    const newEntries = nextState.log.slice(this.battleState.log.length);
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

  /** In 3D the turn plays out one thing at a time: each move flies, hits (the health bar drops then), faints sink. */
  private async presentTurn3d(nextState: BattleState): Promise<void> {
    const before = this.battleState;
    const entries = nextState.log.slice(before.log.length);
    const hp: Record<string, number> = Object.fromEntries(before.participants.map((p) => [p.playerId, p.active.currentHp]));
    this.clearActionButtons();
    this.battleState = nextState;
    for (const [id, value] of Object.entries(hp)) this.setBar(id, value);
    for (const entry of entries) {
      if (!this.alive) return;
      await this.play3d(entry, hp);
    }
    if (!this.alive) return;
    this.updateHpBars();
    if (nextState.outcome !== "ongoing") {
      this.showOutcomeMessage(nextState.outcome);
      this.time.delayedCall(1400, () => this.endBattle());
    } else {
      this.busy = false;
      this.renderActions();
    }
  }

  /** One log entry in the meadow: its message, then its animation and sounds. */
  private async play3d(entry: BattleLogEntry, hp: Record<string, number>): Promise<void> {
    const stage = this.stage;
    if (!stage) return;
    this.say(entry.text, LOG_ICONS[entry.kind]);
    const sideOf = (id?: string): Side => (id === this.myId ? "mine" : "wild");
    if (entry.kind === "damage" || entry.kind === "miss") {
      const attacker = this.battleState.participants.find((p) => p.playerId === entry.actorPlayerId);
      const move = entry.moveId ? attacker?.moves[entry.moveId] : undefined;
      const type: TypeId = move?.type ?? attacker?.species.type ?? "sten";
      const impact: Impact = entry.kind === "miss" ? "miss" : entry.effectiveness === "strong" ? "strong" : entry.effectiveness === "weak" ? "weak" : "hit";
      await stage.attack(sideOf(entry.actorPlayerId), type, impact, move ? BattleScene.isCloseMove(move) : false, () => {
        if (entry.kind === "miss") return playMissSound();
        playHitSound();
        const target = entry.targetPlayerId ?? "";
        hp[target] = Math.max(0, (hp[target] ?? 0) - (entry.amount ?? 0));
        this.setBar(target, hp[target]!);
        if (entry.effectiveness === "strong") this.flashFeedback(`${ic(STRONG_ICON)} ${t("battle_effective_strong")}`);
        else if (entry.effectiveness === "weak") this.flashFeedback(`${ic(WEAK_ICON)} ${t("battle_effective_weak")}`);
      });
    } else if (entry.kind === "faint") {
      playFaintSound();
      await stage.faint(sideOf(entry.targetPlayerId));
    } else if (entry.kind === "flee") {
      await stage.flee();
    }
    // Time to read the message (the catching entries were already shown in the meadow).
    await new Promise<void>((resolve) => this.time.delayedCall(entry.kind === "faint" ? 400 : 700, resolve));
  }

  /** Sets one side's health bar. */
  private setBar(playerId: string, value: number): void {
    const p = this.battleState.participants.find((q) => q.playerId === playerId);
    if (!p) return;
    (playerId === this.myId ? this.playerHpBar : this.wildHpBar).setHp(value, p.species.baseStats.hp);
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
    const style = { fontFamily: FONT, fontSize: layout.font(26), color: CSS.accent };
    // Over the bright meadow it needs an ink chip behind it.
    const text = (this.stage ? richChip(this, layout.width / 2, this.feedbackY, label, style) : richText(this, layout.width / 2, this.feedbackY, label, style)).setAlpha(0);
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

    if (this.battleState.outcome === "won") recordProgress({ kind: "wildWin" }, true);
    if (this.battleState.outcome === "caught") {
      const wild = this.battleState.participants[1];
      this.battleData.save.creatures.push({ ...wild.active, ownerId: this.battleData.save.player.id });
      const counts = this.battleData.save.caughtCounts;
      recordProgress({ kind: "catch", newSpecies: !counts[wild.species.id] }, true);
      counts[wild.species.id] = (counts[wild.species.id] ?? 0) + 1;
      // Counted on the family scoreboard when the server has acknowledged it (now, or once back online).
      this.battleData.save.pendingScore.push({ id: crypto.randomUUID(), kind: "catch", at: new Date().toISOString() });
      if (!this.battleData.save.seenSpeciesIds.includes(wild.species.id)) {
        this.battleData.save.seenSpeciesIds.push(wild.species.id);
      }
    }

    void persist().then(() => presence.flushScore());
    // Caught: it's mine and gone for everyone. Otherwise it waits for the next one to try.
    if (this.battleData.spawnId) presence.send("spawnDone", { spawnId: this.battleData.spawnId, caught: this.battleState.outcome === "caught" });

    this.scene.start("Overworld", { save: this.battleData.save, content: this.battleData.content });
  }
}

function pickWildMoveId(species: CreatureSpecies): string {
  const ids = species.moveIds;
  return ids[Math.floor(Math.random() * ids.length)] ?? ids[0];
}
