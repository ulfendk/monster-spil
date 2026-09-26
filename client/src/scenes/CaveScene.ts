import Phaser from "phaser";
import { caveCatchChance, createRng, flickToThrow, type CaveVisit, type CreatureInstance, type Rng } from "@shared";
import type { GameContent } from "../content/load-content";
import type { SaveData } from "../save/schema";
import { persist } from "../save/game-state";
import { presence } from "../net/presence";
import { multiplayerEnabled } from "../net/lobby";
import { getLayout, onRelayout } from "../ui/layout";
import { addCloseButton, createButton } from "../ui/Button";
import { ic, richChip, richText } from "../ui/rich-text";
import { C, CSS, FONT } from "../ui/theme";
import { CAVE_ICON, POINTS_ICON } from "../ui/icons";
import { t } from "../i18n/da";
import type { CaveStage } from "../cave/cave-stage";

export interface CaveSceneData {
  save: SaveData;
  content: GameContent;
  visit: CaveVisit;
}

/** Only the last part of a flick counts: that's where its speed is. */
const FLICK_WINDOW_MS = 160;

/**
 * Inside a cave: monsters peek out from behind rocks and you flick balls at them. The cave
 * itself is 3D (cave/cave-stage.ts, three.js, loaded only now) in a canvas under this
 * scene; this scene draws the buttons and texts on top, turns flicks into throws and does
 * the catching, which works like catching in the wild: caught monsters go into the save
 * and count on the scoreboard. The visit (who is in there, how many balls) came from the
 * server when the player went in.
 */
export class CaveScene extends Phaser.Scene {
  private caveData!: CaveSceneData;
  private stage?: CaveStage;
  private canvas?: HTMLCanvasElement;
  private rng!: Rng;
  private balls = 0;
  private caught: string[] = [];
  private throwing = false;
  private done = false;
  private trail: Array<{ x: number; y: number; t: number }> = [];
  private hud: Phaser.GameObjects.GameObject[] = [];
  private toast?: Phaser.GameObjects.Container;

  constructor() {
    super("Cave");
  }

  init(data: CaveSceneData): void {
    this.caveData = data;
    this.rng = createRng(data.visit.seed ^ 0x5bd1e995);
    this.balls = data.visit.balls;
    this.caught = [];
    this.throwing = false;
    this.done = false;
    this.trail = [];
  }

  create(): void {
    if (multiplayerEnabled) presence.setAway(true); // nobody can invite me while I'm in here
    const layout = getLayout(this);
    const loading = this.add.text(layout.width / 2, layout.height / 2, t("cave_loading"), { fontFamily: FONT, fontSize: layout.font(30), color: CSS.soft }).setOrigin(0.5);
    this.events.once("shutdown", () => this.teardown());
    void import("../cave/cave-stage").then(({ CaveStage }) => {
      if (!this.scene.isActive()) return;
      loading.destroy();
      this.canvas = document.createElement("canvas");
      this.canvas.className = "cave-stage";
      document.getElementById("game")!.prepend(this.canvas);
      const monsters = this.caveData.visit.speciesIds.flatMap((id) => {
        const species = this.caveData.content.speciesById[id];
        const key = species?.spriteFront;
        if (!key || !this.textures.exists(key)) return [];
        return [{ speciesId: id, image: this.textures.get(key).getSourceImage() as HTMLImageElement | HTMLCanvasElement }];
      });
      this.stage = new CaveStage(this.canvas, monsters, this.caveData.visit.seed);
      this.stage.onSeen = (speciesId) => this.markSeen(speciesId);
      this.fitStage();
      if (import.meta.env.DEV) (window as unknown as { __cave?: CaveScene }).__cave = this;
      this.drawHud();
      this.say(`${ic("ball")} ${t("cave_throw")}`, 3000);
      this.input.on("pointerdown", (p: Phaser.Input.Pointer) => this.onDown(p));
      this.input.on("pointermove", (p: Phaser.Input.Pointer) => this.onMove(p));
      this.input.on("pointerup", (p: Phaser.Input.Pointer) => this.onUp(p));
    });
    onRelayout(this, () => {
      this.fitStage();
      this.drawHud();
    });
  }

  /** The 3D canvas covers the game's area exactly, under the Phaser canvas. */
  private fitStage(): void {
    const host = document.getElementById("game");
    if (!this.stage || !host) return;
    this.stage.resize(host.clientWidth, host.clientHeight);
  }

  private teardown(): void {
    this.stage?.destroy();
    this.stage = undefined;
    this.canvas?.remove();
    this.canvas = undefined;
    this.input.removeAllListeners();
  }

  // ------------------------------------------------------------ throwing

  private onDown(p: Phaser.Input.Pointer): void {
    if (this.done || this.throwing) return;
    this.trail = [{ x: p.x, y: p.y, t: p.time }];
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (!p.isDown || this.trail.length === 0) return;
    this.trail.push({ x: p.x, y: p.y, t: p.time });
    // Keep just the recent part of the movement.
    while (this.trail.length > 2 && p.time - this.trail[0]!.t > FLICK_WINDOW_MS) this.trail.shift();
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (this.trail.length === 0) return;
    this.trail.push({ x: p.x, y: p.y, t: p.time });
    while (this.trail.length > 2 && p.time - this.trail[0]!.t > FLICK_WINDOW_MS) this.trail.shift();
    const first = this.trail[0]!;
    this.trail = [];
    this.flick(p.x - first.x, p.y - first.y, Math.max(16, p.time - first.t));
  }

  /** A flick in screen pixels over `ms` milliseconds: throw, if it's a throw. */
  flick(dx: number, dy: number, ms: number): void {
    if (!this.stage || this.done || this.throwing || this.balls <= 0) return;
    const v = flickToThrow(dx, dy, ms, this.scale.height);
    if (!v) return;
    this.throwing = true;
    this.balls--;
    this.drawHud();
    void this.stage.throwBall(v).then(async (result) => {
      if (result.hit && this.stage) {
        const index = result.hit.index;
        const speciesId = this.caveData.visit.speciesIds[index]!;
        const species = this.caveData.content.speciesById[speciesId];
        const success = this.rng.next() < caveCatchChance(species?.catchRate ?? 0.3, result.hit.precision);
        await this.stage.catchAnimation(index, success);
        if (success) {
          this.caught.push(speciesId);
          await this.keep(speciesId);
          this.say(`${ic(POINTS_ICON)} ${species?.navn ?? ""} ${t("cave_caught").toLowerCase()}`);
        } else {
          this.say(t("cave_free"));
        }
      }
      this.throwing = false;
      this.drawHud();
      if (this.stage && (this.stage.remaining === 0 || this.balls <= 0)) this.finish();
    });
  }

  // ------------------------------------------------------------ the save

  private markSeen(speciesId: string): void {
    const save = this.caveData.save;
    if (save.seenSpeciesIds.includes(speciesId)) return;
    save.seenSpeciesIds.push(speciesId);
    void persist();
  }

  /** A caught monster is mine, exactly like one caught in the wild. */
  private async keep(speciesId: string): Promise<void> {
    const save = this.caveData.save;
    const species = this.caveData.content.speciesById[speciesId];
    const creature: CreatureInstance = {
      instanceId: crypto.randomUUID(),
      speciesId,
      ownerId: save.player.id,
      niveau: 1,
      currentHp: species?.baseStats.hp ?? 1,
      caughtAt: new Date().toISOString(),
    };
    save.creatures.push(creature);
    save.caughtCounts[speciesId] = (save.caughtCounts[speciesId] ?? 0) + 1;
    // Counted on the family scoreboard when the server has acknowledged it.
    save.pendingScore.push({ id: crypto.randomUUID(), kind: "catch", at: creature.caughtAt });
    this.markSeen(speciesId);
    await persist();
    presence.flushScore();
  }

  // ------------------------------------------------------------ what's on top

  private drawHud(): void {
    for (const o of this.hud) o.destroy();
    this.hud = [];
    if (!this.stage) return;
    const layout = getLayout(this);
    const top = layout.safe.top + layout.px(14) + layout.touch(64) / 2;
    const style = { fontFamily: FONT, fontSize: layout.font(28), color: CSS.text };
    this.hud.push(richChip(this, layout.safe.left + 16, top, `${ic("ball")} ${this.balls}   ${ic(POINTS_ICON)} ${this.caught.length}`, style, 0, 0.5).setDepth(10));
    if (!this.done) this.hud.push(addCloseButton(this, () => this.finish()).button);
  }

  private say(message: string, ms = 1800): void {
    this.toast?.destroy();
    const layout = getLayout(this);
    const toast = richChip(this, layout.width / 2, layout.safe.top + layout.touch(64) + layout.px(60), message, { fontFamily: FONT, fontSize: layout.font(30), color: CSS.accent }).setDepth(20);
    this.toast = toast;
    this.time.delayedCall(ms, () => toast.destroy());
  }

  /** Out of balls, all caught, or leaving: show what I caught, then back to the map. */
  private finish(): void {
    if (this.done) return;
    this.done = true;
    this.stage?.end();
    this.drawHud();
    const layout = getLayout(this);
    const { width, height } = layout;
    const panel = this.add.rectangle(0, 0, width, height, C.overlay, 0.75).setOrigin(0, 0).setDepth(30);
    const title = this.stage?.remaining === 0 ? t("cave_everyone_caught") : this.balls <= 0 ? t("cave_out_of_balls") : "";
    const objects: Phaser.GameObjects.GameObject[] = [panel];
    objects.push(richText(this, width / 2, height * 0.22, `${ic(CAVE_ICON)} ${title}`, { fontFamily: FONT, fontSize: layout.font(40), color: CSS.accent }).setDepth(31));
    const n = this.caught.length;
    const size = Math.min(layout.px(140), (width - layout.safe.left - layout.safe.right - 40) / Math.max(1, n));
    this.caught.forEach((id, i) => {
      const key = this.caveData.content.speciesById[id]?.spriteFront;
      if (!key) return;
      const x = width / 2 + (i - (n - 1) / 2) * size;
      const img = this.add.image(x, height * 0.47, key).setDepth(31);
      img.setScale(size / Math.max(img.width, img.height));
      objects.push(img);
    });
    objects.push(richText(this, width / 2, height * 0.64, `${ic(POINTS_ICON)} ${n}`, { fontFamily: FONT, fontSize: layout.font(36), color: CSS.text }).setDepth(31));
    objects.push(
      createButton(this, width / 2, height - layout.safe.bottom - layout.px(24) - layout.touch(72) / 2, "OK", () => this.leave(), {
        width: layout.touch(160),
        height: layout.touch(72),
        fontSize: layout.font(32),
        backgroundColor: C.ok,
      }).setDepth(32)
    );
  }

  private leave(): void {
    this.scene.start("Overworld", { save: this.caveData.save, content: this.caveData.content });
  }
}
