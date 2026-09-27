import Phaser from "phaser";
import type { CreatureSpecies, Egg } from "@shared";
import type { GameContent } from "../content/load-content";
import { drawEgg } from "../gfx/egg-art";
import { pictureKey, variantScale } from "../gfx/variants";
import { spriteFit } from "../gfx/creature-sprite";
import { playCreatureSound } from "../audio/creature-sound";
import { nameWithVariant } from "../content/load-variants";
import { createButton } from "../ui/Button";
import { getLayout } from "../ui/layout";
import { ic, richText } from "../ui/rich-text";
import { C, CSS, FONT } from "../ui/theme";
import { t } from "../i18n/da";

export interface HatchSceneData {
  egg: Egg;
  species: CreatureSpecies;
  content: GameContent;
}

/**
 * An egg hatching, over the map: it wobbles, cracks, wobbles harder, bursts in a flash — and
 * the monster pops out and cries (a rare variant in its own colours). OK goes back to the map.
 */
export class HatchScene extends Phaser.Scene {
  constructor() {
    super("Hatch");
  }

  create(data: HatchSceneData): void {
    const layout = getLayout(this);
    const { width, height } = layout;
    this.add.rectangle(0, 0, width, height, C.overlay, 0.92).setOrigin(0, 0).setInteractive();
    const cx = width / 2;
    const cy = height * 0.45;
    const size = Math.min(width, height) * 0.36;
    const egg = drawEgg(this, cx, cy, size, data.egg.type, 0.4);
    richText(this, cx, layout.safe.top + layout.px(60), `${ic("egg")} ${t("egg_hatched")}`, { fontFamily: FONT, fontSize: layout.font(38), color: CSS.accent });

    // Wobble, wobble, crack… wobble harder… burst.
    const wobble = (angle: number, times: number) => ({ targets: egg, angle: { from: -angle, to: angle }, duration: 120, yoyo: true, repeat: times, ease: "Sine.inOut" });
    this.tweens.chain({
      tweens: [
        wobble(8, 2),
        { targets: egg, angle: 0, duration: 250 },
        wobble(14, 3),
        { targets: egg, scale: 1.12, duration: 160, yoyo: true },
      ],
      onComplete: () => this.burst(data, egg, cx, cy, size),
    });
    // Cracks growing during the wobbles.
    this.time.delayedCall(900, () => {
      const cracked = drawEgg(this, cx, cy, size, data.egg.type, 0.95);
      egg.removeAll(true);
      egg.add(cracked.list);
      cracked.destroy();
    });
  }

  private burst(data: HatchSceneData, egg: Phaser.GameObjects.Container, cx: number, cy: number, size: number): void {
    const layout = getLayout(this);
    this.cameras.main.flash(300, 240, 230, 210);
    // Shell pieces flying off.
    for (let i = 0; i < 8; i++) {
      const piece = this.add.triangle(cx, cy, 0, 0, size * 0.12, size * 0.03, size * 0.04, size * 0.12, C.paper);
      const a = (i / 8) * Math.PI * 2;
      this.tweens.add({ targets: piece, x: cx + Math.cos(a) * size * 0.9, y: cy + Math.sin(a) * size * 0.7 + size * 0.3, angle: 200, alpha: 0, duration: 700, ease: "Quad.easeOut" });
    }
    egg.destroy();
    const key = pictureKey(this, data.species.spriteFront, data.egg.variant);
    const monster = this.add.image(cx, cy, this.textures.exists(key) ? key : "__MISSING").setScale(0);
    const scale = (size / 128) * 1.3 * variantScale(data.egg.variant) * spriteFit(this, key);
    this.tweens.add({ targets: monster, scale, duration: 450, ease: "Back.easeOut" });
    playCreatureSound(this, data.species);
    richText(this, cx, cy + size * 0.85, nameWithVariant(data.species.navn, data.egg.variant), { fontFamily: FONT, fontSize: layout.font(36), color: CSS.text });
    createButton(this, cx, layout.height - layout.safe.bottom - layout.px(30) - layout.touch(72) / 2, "OK", () => this.close(), {
      width: layout.touch(160),
      height: layout.touch(72),
      fontSize: layout.font(32),
      backgroundColor: C.ok,
    });
  }

  private close(): void {
    this.scene.stop();
    this.scene.resume("Overworld");
  }
}
