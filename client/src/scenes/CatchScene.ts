import Phaser from "phaser";
import type { CreatureSpecies } from "@shared";
import { getLayout, onRelayout } from "../ui/layout";
import { ic, richChip } from "../ui/rich-text";
import { C, CSS, FONT } from "../ui/theme";
import { t } from "../i18n/da";
import { faceFrameKey, placeholderSpec } from "../gfx/placeholder-sprites";
import { pictureKey, variantScale, variantSparkles } from "../gfx/variants";
import { sceneKind } from "../content/load-scenes";
import { playCreatureSound } from "../audio/creature-sound";
import type { MeadowStage } from "../cave/meadow-stage";
import type { BattleStage } from "../cave/battle-stage";
import { AimInput } from "../ui/aim-input";
import { CATCH_ICON } from "../ui/icons";
import { createButton } from "../ui/Button";

/** How a throw went, for the battle engine's catch action. */
export type ThrowOutcome = { hit: false } | { hit: true; precision: number };

export interface CatchSceneData {
  species: CreatureSpecies;
  /** A rare variant: its colours and size. */
  variant?: string;
  /** Where it stands (a scene id). */
  scene?: string;
  seed: number;
  /** A 3D battle's meadow: catch in it (my monster steps aside) instead of opening a new one. */
  stage?: BattleStage;
  /** A hit: the battle works out the turn now and says whether it's caught. */
  decide: (thrown: ThrowOutcome) => boolean;
  /** The throw is over (and its animation done): back to the battle. */
  done: (thrown: ThrowOutcome) => void;
  /**
   * Not caught, and the player tries again right here: the battle counts the throw as its turn
   * (a catch turn has no counter-attack) and says whether the battle goes on — then another ball.
   */
  again: (thrown: ThrowOutcome) => boolean;
  /** No 3D here (e.g. no WebGL): the battle throws the old way. */
  unavailable: () => void;
}

/**
 * Catching a wild monster, in 3D: it stands in a sunny meadow (cave/meadow-stage.ts, three.js,
 * loaded only now) in a canvas under this scene, alive and shifting about, and you shoot one
 * ball at it (crosshairs and a trigger). A miss uses the turn; a hit lets the battle engine roll the catch (a hit near
 * the middle helps), and the ball glows or bursts open accordingly. Then it's back to the
 * battle, which shows the turn.
 */
export class CatchScene extends Phaser.Scene {
  private catchData!: CatchSceneData;
  private stage?: MeadowStage;
  /** The meadow belongs to the battle: don't tear it down here. */
  private borrowed = false;
  private canvas?: HTMLCanvasElement;
  private thrown = false;
  private aiming?: AimInput;
  private hint?: Phaser.GameObjects.Container;

  constructor() {
    super("Catch");
  }

  init(data: CatchSceneData): void {
    this.catchData = data;
    this.thrown = false;
  }

  create(): void {
    this.events.once("shutdown", () => this.teardown());
    onRelayout(this, () => {
      this.fitStage();
      this.aiming?.layout();
      this.drawHint();
    });
    const battleStage = this.catchData.stage;
    if (battleStage) {
      this.borrowed = true;
      this.stage = battleStage;
      this.fitStage();
      void battleStage.beginCatch().then(() => {
        if (!this.scene.isActive()) return;
        battleStage.greet();
        this.startAiming();
      });
      return;
    }
    this.borrowed = false;
    void import("../cave/meadow-stage")
      .then(({ MeadowStage }) => {
        if (!this.scene.isActive()) return;
        const species = this.catchData.species;
        const picture = (key: string) => (this.textures.exists(key) ? (this.textures.get(key).getSourceImage() as HTMLImageElement | HTMLCanvasElement) : undefined);
        const variant = this.catchData.variant;
        const image = picture(pictureKey(this, species.spriteFront, variant));
        if (!image) return this.catchData.unavailable();
        this.canvas = document.createElement("canvas");
        this.canvas.className = "cave-stage";
        document.getElementById("game")!.prepend(this.canvas);
        this.stage = new MeadowStage(
          this.canvas,
          {
            speciesId: species.id,
            image,
            blink: picture(pictureKey(this, faceFrameKey(species.spriteFront, "blink"), variant)),
            talk: picture(pictureKey(this, faceFrameKey(species.spriteFront, "talk"), variant)),
            scale: variantScale(variant),
            sparkly: variantSparkles(variant),
            ...(placeholderSpec(species.spriteFront) ? { model: { ...placeholderSpec(species.spriteFront)!, ...(variant ? { variant } : {}) } } : {}),
          },
          this.catchData.seed,
          false,
          sceneKind(this.catchData.scene).look
        );
        this.stage.onCry = () => playCreatureSound(this, species);
        this.fitStage();
        this.time.delayedCall(400, () => this.stage?.greet());
        this.startAiming();
      })
      .catch((error: unknown) => {
        // No WebGL, or the 3D code couldn't load (offline before it was cached): the old way.
        console.warn("3D catching unavailable:", error);
        this.teardown();
        this.catchData.unavailable();
      });
  }

  /** Ready to throw: say how, and bring up the crosshairs and the trigger. */
  private startAiming(): void {
    if (import.meta.env.DEV) (window as unknown as { __catch?: CatchScene }).__catch = this;
    this.drawHint();
    this.aiming = new AimInput(this, () => this.stage, () => !this.thrown, (x, y) => this.shoot(x, y));
  }

  private fitStage(): void {
    const host = document.getElementById("game");
    if (this.stage && host) this.stage.resize(host.clientWidth, host.clientHeight);
  }

  private teardown(): void {
    if (!this.borrowed) this.stage?.destroy();
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

  /**
   * Not caught (a miss, or it broke free): try again right here with a new ball, or back to
   * the battle. Either way the throw counts as the turn.
   */
  private offerRetry(thrown: ThrowOutcome): void {
    this.aiming?.destroy();
    this.aiming = undefined;
    const layout = getLayout(this);
    const w = Math.min(layout.px(300), (layout.width - layout.safe.left - layout.safe.right - 60) / 2);
    const h = layout.touch(96);
    const y = layout.height - layout.safe.bottom - layout.px(30) - h / 2;
    const choose = (retry: boolean) => {
      for (const b of buttons) b.destroy();
      if (!retry || !this.catchData.again(thrown)) return this.catchData.done(thrown);
      // Another ball, right here.
      this.thrown = false;
      this.stage?.readyBall();
      this.startAiming();
    };
    const buttons = [
      createButton(this, layout.width / 2 - w / 2 - layout.px(12), y, t("catch_retry"), () => choose(true), { width: w, height: h, fontSize: layout.font(28), backgroundColor: C.catch, icon: CATCH_ICON }),
      createButton(this, layout.width / 2 + w / 2 + layout.px(12), y, t("catch_back"), () => choose(false), { width: w, height: h, fontSize: layout.font(28), backgroundColor: C.buttonQuiet, icon: "sword" }),
    ];
    for (const b of buttons) b.setDepth(20);
  }

  /** Aims at a point on the screen and pulls the trigger (for testing in dev builds). */
  aimAndFire(x: number, y: number): void {
    this.aiming?.aim(x, y);
    this.aiming?.fire();
  }

  /** The trigger: the one throw, to where the crosshairs point. */
  private shoot(x: number, y: number): void {
    if (!this.stage || this.thrown) return;
    this.thrown = true;
    this.hint?.destroy();
    const stage = this.stage;
    void stage.throwAt(x, y).then(async (result) => {
      if (!result.hit) {
        this.drawHint(`${ic("miss")} ${t("catch_missed")}`);
        stage.end();
        this.time.delayedCall(600, () => this.offerRetry({ hit: false }));
        return;
      }
      const thrown: ThrowOutcome = { hit: true, precision: result.hit.precision };
      const caught = this.catchData.decide(thrown);
      await stage.catchAnimation(result.hit.index, caught);
      stage.end();
      if (caught) this.time.delayedCall(300, () => this.catchData.done(thrown));
      else {
        this.drawHint(`${ic("miss")} ${t("cave_free")}`);
        this.time.delayedCall(400, () => this.offerRetry(thrown));
      }
    });
  }
}
