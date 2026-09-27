import Phaser from "phaser";
import { newEgg, nestHasRoom, rollVariant, stageStats, type CastleDef, type CreatureInstance } from "@shared";
import type { SaveData } from "../save/schema";
import type { GameContent } from "../content/load-content";
import type { BattleSceneData } from "./BattleScene";
import { castleFor, castleProgress } from "../content/load-castles";
import { eggConfig } from "../content/load-eggs";
import { itemById } from "../content/load-items";
import { nurtureConfig } from "../content/load-nurture";
import { variantConfig } from "../content/load-variants";
import { persist } from "../save/game-state";
import { recordProgress } from "../progress/record";
import { pictureKey, variantScale } from "../gfx/variants";
import { spriteFit } from "../gfx/creature-sprite";
import { addIcon } from "../gfx/icon-art";
import { addScreenBackdrop } from "../gfx/motifs";
import { playCreatureSound } from "../audio/creature-sound";
import { addCloseButton, createButton, whenTapped } from "../ui/Button";
import { getLayout, restartOnResize } from "../ui/layout";
import { ic, richText } from "../ui/rich-text";
import { C, CSS, FONT } from "../ui/theme";

export interface CastleSceneData {
  save: SaveData;
  content: GameContent;
  worldId: string;
}

/**
 * Inside a castle (the key found): three guardians behind three gates — strong, evolved
 * monsters — and a treasure chest behind them. The next guardian's gate has a sword to fight
 * it (a battle without catching; a beaten guardian stays beaten, losing means passing out as
 * in the wild); once all three are beaten the chest opens: eggs, potions, XP, and the last
 * guardian's kind joins you in rare colours. Told in pictures only.
 */
export class CastleScene extends Phaser.Scene {
  constructor() {
    super("Castle");
  }

  create(data: CastleSceneData): void {
    restartOnResize(this, data);
    const castle = castleFor(data.worldId);
    if (!castle) return this.leave(data);
    const progress = castleProgress(data.save, castle.worldId);
    if (import.meta.env.DEV) (window as unknown as { __castle?: object }).__castle = { fight: (i: number) => this.fight(data, castle, i), open: () => this.openTreasure(data, castle) };
    const layout = getLayout(this);
    const { width, height, safe } = layout;
    addScreenBackdrop(this, width, height, { alpha: 1 });
    addCloseButton(this, () => this.leave(data));
    richText(this, width / 2, safe.top + 10 + layout.touch(64) / 2, `${ic("castle")} ${castle.navn}`, { fontFamily: FONT, fontSize: layout.font(36), color: CSS.text });

    // The three gates, side by side; the chest below.
    const top = safe.top + layout.touch(64) + layout.px(30);
    const usableW = width - safe.left - safe.right;
    const cellW = usableW / castle.guardians.length;
    const gateH = Math.min((height - top - safe.bottom) * 0.5, cellW * (layout.portrait ? 2.4 : 1.7));
    castle.guardians.forEach((guardian, i) => {
      const species = data.content.speciesById[guardian.speciesId];
      if (!species) return;
      const cx = safe.left + cellW * (i + 0.5);
      const gateW = cellW * 0.86;
      const beaten = i < progress.beaten;
      const next = i === progress.beaten;
      // The gate: a dark arch with a red torii-like beam over it.
      const gate = this.add.graphics();
      gate.fillStyle(C.panel, 1).fillRoundedRect(cx - gateW / 2, top, gateW, gateH, { tl: gateW / 2, tr: gateW / 2, bl: 8, br: 8 });
      gate.lineStyle(3, next ? C.danger : C.border, next ? 1 : 0.6).strokeRoundedRect(cx - gateW / 2, top, gateW, gateH, { tl: gateW / 2, tr: gateW / 2, bl: 8, br: 8 });
      const size = Math.min(gateW * 0.8, gateH * 0.5);
      const key = pictureKey(this, species.spriteFront, undefined);
      const picture = this.add.image(cx, top + gateH * 0.42, this.textures.exists(key) ? key : "__MISSING");
      const scale = (size / 128) * spriteFit(this, key) * (1 + 0.12 * (guardian.stage - 1));
      picture.setScale(scale);
      if (beaten) picture.setTint(C.shadow).setAlpha(0.55);
      else if (!next) picture.setTint(C.shadow);
      else {
        // The one to fight now breathes and cries when tapped.
        this.tweens.add({ targets: picture, scaleY: scale * 1.05, duration: 900, yoyo: true, repeat: -1, ease: "Sine.inOut" });
        picture.setInteractive();
        whenTapped(picture, () => playCreatureSound(this, species));
      }
      // Its stage as stars.
      richText(this, cx, top + gateH * 0.76, Array.from({ length: guardian.stage }, () => ic("star")).join(""), { fontFamily: FONT, fontSize: layout.font(24), color: CSS.text });
      if (beaten) {
        this.add.text(cx, top + gateH * 0.42, "✓", { fontFamily: FONT, fontSize: `${Math.round(size * 0.7)}px`, color: CSS.ok }).setOrigin(0.5);
      } else if (next) {
        const button = createButton(this, cx, top + gateH + layout.touch(72) / 2 + layout.px(12), "[[sword]]", () => this.fight(data, castle, i), {
          width: Math.min(gateW, layout.touch(120)),
          height: layout.touch(72),
          backgroundColor: C.danger,
        });
        this.tweens.add({ targets: button, scale: 1.08, duration: 600, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      }
    });

    // The treasure.
    const chestY = top + gateH + layout.touch(72) + layout.px(24) + (height - safe.bottom - (top + gateH + layout.touch(72) + layout.px(24))) / 2;
    const chestSize = Math.min(layout.px(170), (height - safe.bottom - chestY) * 1.6, width * 0.45);
    const chest = addIcon(this, width / 2, chestY, "chest", chestSize);
    const allBeaten = progress.beaten >= castle.guardians.length;
    if (progress.done) {
      chest.setAlpha(0.6);
      this.add.text(width / 2 + chestSize * 0.45, chestY - chestSize * 0.3, "✓", { fontFamily: FONT, fontSize: layout.font(44), color: CSS.ok }).setOrigin(0.5);
    } else if (!allBeaten) {
      chest.setTint(C.shadow).setAlpha(0.7);
    } else {
      chest.setInteractive({ useHandCursor: true });
      this.tweens.add({ targets: chest, angle: { from: -6, to: 6 }, duration: 180, yoyo: true, repeat: 3, loop: -1, loopDelay: 900 });
      whenTapped(chest, () => this.openTreasure(data, castle));
    }
  }

  /** Into battle with a guardian: a wild battle in the castle yard, but no catching. */
  private fight(data: CastleSceneData, castle: CastleDef, index: number): void {
    const guardian = castle.guardians[index];
    const species = guardian && data.content.speciesById[guardian.speciesId];
    if (!guardian || !species) return;
    const wildInstance: CreatureInstance = {
      instanceId: crypto.randomUUID(),
      speciesId: species.id,
      ownerId: "wild",
      niveau: 1,
      currentHp: stageStats(species.baseStats, guardian.stage, nurtureConfig).hp,
      caughtAt: new Date().toISOString(),
      ...(guardian.stage > 1 ? { stage: guardian.stage } : {}),
    };
    const battle: BattleSceneData = { save: data.save, content: data.content, wildInstance, wildSpecies: species, scene: "borg", castle: { worldId: castle.worldId } };
    this.scene.start("Battle", battle);
  }

  /** All three beaten: the chest opens and everything in it is mine. */
  private openTreasure(data: CastleSceneData, castle: CastleDef): void {
    const save = data.save;
    const progress = castleProgress(save, castle.worldId);
    if (progress.done) return;
    progress.done = true;
    const shown: string[] = [];
    // Eggs, as many as the nest has room for.
    const eggs = (save.eggs ??= []);
    let eggsKept = 0;
    for (let i = 0; i < castle.rewards.eggs && nestHasRoom(eggConfig, eggs); i++) {
      eggs.push(newEgg(eggConfig, crypto.randomUUID(), new Date(), Math.random, () => rollVariant({ ...variantConfig, chance: 1 }, Math.random)));
      eggsKept++;
    }
    if (eggsKept > 0) shown.push(`${ic("egg")}×${eggsKept}`);
    // Potions and the like (a treasure may fill the bag past its usual limit).
    const items = (save.items ??= {});
    for (const [id, count] of Object.entries(castle.rewards.items)) {
      const item = itemById(id);
      if (!item) continue;
      items[id] = (items[id] ?? 0) + count;
      shown.push(`${ic(item.icon)}×${count}`);
    }
    shown.push(`${ic("star")}+${castle.rewards.xp}`);
    // The last guardian's kind joins me, in rare colours.
    const last = castle.guardians[castle.guardians.length - 1];
    const species = last && data.content.speciesById[last.speciesId];
    let joined: { key: string; variant?: string } | undefined;
    if (species) {
      const variant = rollVariant({ ...variantConfig, chance: 1 }, Math.random);
      save.creatures.push({
        instanceId: crypto.randomUUID(),
        speciesId: species.id,
        ownerId: save.player.id,
        niveau: 1,
        currentHp: species.baseStats.hp,
        caughtAt: new Date().toISOString(),
        ...(variant ? { variant } : {}),
      });
      save.caughtCounts[species.id] = (save.caughtCounts[species.id] ?? 0) + 1;
      if (!save.seenSpeciesIds.includes(species.id)) save.seenSpeciesIds.push(species.id);
      joined = { key: pictureKey(this, species.spriteFront, variant), variant };
    }
    recordProgress({ kind: "castle", xp: castle.rewards.xp }, true);
    void persist();
    this.showTreasure(data, shown, joined, species ?? undefined);
  }

  private showTreasure(data: CastleSceneData, shown: string[], joined: { key: string; variant?: string } | undefined, species: GameContent["speciesById"][string] | undefined): void {
    const layout = getLayout(this);
    const { width, height } = layout;
    this.add.rectangle(0, 0, width, height, C.overlay, 0.94).setOrigin(0, 0).setInteractive();
    this.cameras.main.flash(300, 240, 220, 150);
    const chest = addIcon(this, width / 2, height * 0.2, "chest", layout.px(150));
    this.tweens.add({ targets: chest, scale: chest.scale * 1.15, duration: 300, yoyo: true, ease: "Back.easeOut" });
    // Sparkles bursting out.
    for (let i = 0; i < 10; i++) {
      const sparkle = addIcon(this, width / 2, height * 0.2, "sparkle", layout.px(40));
      const a = (i / 10) * Math.PI * 2;
      this.tweens.add({ targets: sparkle, x: width / 2 + Math.cos(a) * layout.px(200), y: height * 0.2 + Math.sin(a) * layout.px(140), alpha: 0, duration: 900, ease: "Quad.easeOut" });
    }
    let y = height * 0.2 + layout.px(110);
    if (joined && species && this.textures.exists(joined.key)) {
      const size = Math.min(width * 0.45, height * 0.25);
      const monster = this.add.image(width / 2, y + size / 2, joined.key).setScale(0);
      this.tweens.add({ targets: monster, scale: (size / 128) * spriteFit(this, joined.key) * variantScale(joined.variant), duration: 500, delay: 300, ease: "Back.easeOut" });
      this.time.delayedCall(400, () => playCreatureSound(this, species));
      y += size + layout.px(20);
    }
    richText(this, width / 2, y, shown.join("   "), { fontFamily: FONT, fontSize: layout.font(34), color: CSS.accent });
    createButton(this, width / 2, height - layout.safe.bottom - layout.px(30) - layout.touch(72) / 2, "OK", () => this.scene.restart(data), {
      width: layout.touch(160),
      height: layout.touch(72),
      fontSize: layout.font(32),
      backgroundColor: C.ok,
    });
  }

  private leave(data: CastleSceneData): void {
    this.scene.start("Overworld", { save: data.save, content: data.content });
  }
}
