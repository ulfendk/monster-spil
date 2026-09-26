import Phaser from "phaser";
import { flickToThrow, type CreatureSpecies } from "@shared";
import { getLayout, onRelayout } from "../ui/layout";
import { ic, richChip } from "../ui/rich-text";
import { CSS, FONT } from "../ui/theme";
import { t } from "../i18n/da";
import { faceFrameKey } from "../gfx/placeholder-sprites";
import { playCreatureSound } from "../audio/creature-sound";
import type { MeadowStage } from "../cave/meadow-stage";

/** How a throw went, for the battle engine's catch action. */
export type ThrowOutcome = { hit: false } | { hit: true; precision: number };

export interface CatchSceneData {
  species: CreatureSpecies;
  seed: number;
  /** A hit: the battle works out the turn now and says whether it's caught. */
  decide: (thrown: ThrowOutcome) => boolean;
  /** The throw is over (and its animation done): back to the battle. */
  done: (thrown: ThrowOutcome) => void;
  /** No 3D here (e.g. no WebGL): the battle throws the old way. */
  unavailable: () => void;
}

/** Only the last part of a flick counts: that's where its speed is. */
const FLICK_WINDOW_MS = 160;

/**
 * Catching a wild monster, in 3D: it stands in a sunny meadow (cave/meadow-stage.ts, three.js,
 * loaded only now) in a canvas under this scene, alive and shifting about, and you flick one
 * ball at it. A miss uses the turn; a hit lets the battle engine roll the catch (a hit near
 * the middle helps), and the ball glows or bursts open accordingly. Then it's back to the
 * battle, which shows the turn.
 */
export class CatchScene extends Phaser.Scene {
  private catchData!: CatchSceneData;
  private stage?: MeadowStage;
  private canvas?: HTMLCanvasElement;
  private thrown = false;
  private trail: Array<{ x: number; y: number; t: number }> = [];
  private hint?: Phaser.GameObjects.Container;

  constructor() {
    super("Catch");
  }

  init(data: CatchSceneData): void {
    this.catchData = data;
    this.thrown = false;
    this.trail = [];
  }

  create(): void {
    this.events.once("shutdown", () => this.teardown());
    void import("../cave/meadow-stage")
      .then(({ MeadowStage }) => {
        if (!this.scene.isActive()) return;
        const species = this.catchData.species;
        const picture = (key: string) => (this.textures.exists(key) ? (this.textures.get(key).getSourceImage() as HTMLImageElement | HTMLCanvasElement) : undefined);
        const image = picture(species.spriteFront);
        if (!image) return this.catchData.unavailable();
        this.canvas = document.createElement("canvas");
        this.canvas.className = "cave-stage";
        document.getElementById("game")!.prepend(this.canvas);
        this.stage = new MeadowStage(
          this.canvas,
          { speciesId: species.id, image, blink: picture(faceFrameKey(species.spriteFront, "blink")), talk: picture(faceFrameKey(species.spriteFront, "talk")) },
          this.catchData.seed
        );
        this.stage.onCry = () => playCreatureSound(this, species);
        this.fitStage();
        if (import.meta.env.DEV) (window as unknown as { __catch?: CatchScene }).__catch = this;
        this.time.delayedCall(400, () => this.stage?.greet());
        this.drawHint();
        this.input.on("pointerdown", (p: Phaser.Input.Pointer) => this.onDown(p));
        this.input.on("pointermove", (p: Phaser.Input.Pointer) => this.onMove(p));
        this.input.on("pointerup", (p: Phaser.Input.Pointer) => this.onUp(p));
      })
      .catch((error: unknown) => {
        // No WebGL, or the 3D code couldn't load (offline before it was cached): the old way.
        console.warn("3D catching unavailable:", error);
        this.teardown();
        this.catchData.unavailable();
      });
    onRelayout(this, () => {
      this.fitStage();
      this.drawHint();
    });
  }

  private fitStage(): void {
    const host = document.getElementById("game");
    if (this.stage && host) this.stage.resize(host.clientWidth, host.clientHeight);
  }

  private teardown(): void {
    this.stage?.destroy();
    this.stage = undefined;
    this.canvas?.remove();
    this.canvas = undefined;
    this.input.removeAllListeners();
  }

  private drawHint(message = `${ic("ball")} ${t("cave_throw")}`): void {
    this.hint?.destroy();
    const layout = getLayout(this);
    this.hint = richChip(this, layout.width / 2, layout.safe.top + layout.px(40), message, { fontFamily: FONT, fontSize: layout.font(30), color: CSS.accent });
  }

  // ------------------------------------------------------------ the throw

  private onDown(p: Phaser.Input.Pointer): void {
    if (this.thrown) return;
    this.trail = [{ x: p.x, y: p.y, t: p.time }];
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (!p.isDown || this.trail.length === 0) return;
    this.trail.push({ x: p.x, y: p.y, t: p.time });
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

  /** A flick in screen pixels over `ms` milliseconds: the one throw, if it's a throw. */
  flick(dx: number, dy: number, ms: number): void {
    if (!this.stage || this.thrown) return;
    const v = flickToThrow(dx, dy, ms, this.scale.height);
    if (!v) return;
    this.thrown = true;
    this.hint?.destroy();
    const stage = this.stage;
    void stage.throwBall(v).then(async (result) => {
      if (!result.hit) {
        this.drawHint(`${ic("miss")} ${t("catch_missed")}`);
        stage.end();
        this.time.delayedCall(1100, () => this.catchData.done({ hit: false }));
        return;
      }
      const thrown: ThrowOutcome = { hit: true, precision: result.hit.precision };
      const caught = this.catchData.decide(thrown);
      await stage.catchAnimation(result.hit.index, caught);
      stage.end();
      this.time.delayedCall(caught ? 300 : 700, () => this.catchData.done(thrown));
    });
  }
}
