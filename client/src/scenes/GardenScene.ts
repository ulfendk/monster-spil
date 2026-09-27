import Phaser from "phaser";
import { bondForNext, canEvolve, care, evolve, itemDay, stageCount, stageName, stageOf, type CareKind, type CreatureInstance } from "@shared";
import type { SaveData } from "../save/schema";
import type { GameContent } from "../content/load-content";
import { nurtureConfig } from "../content/load-nurture";
import { nameWithVariant } from "../content/load-variants";
import { placeholderSpec } from "../gfx/placeholder-sprites";
import { pictureKey, variantScale } from "../gfx/variants";
import { playCreatureSound } from "../audio/creature-sound";
import { persist } from "../save/game-state";
import { recordProgress } from "../progress/record";
import { addCloseButton, createButton } from "../ui/Button";
import { getLayout, onRelayout } from "../ui/layout";
import { ic, richChip, richText } from "../ui/rich-text";
import { foodIcon } from "../ui/icons";
import { C, CSS, FONT } from "../ui/theme";
import { t } from "../i18n/da";
import type { GardenMonster, GardenStage } from "../cave/garden-stage";

export interface GardenSceneData {
  save: SaveData;
  content: GameContent;
}

/** How many monsters walk in the garden at once (the rest on the next pages). */
const PER_PAGE = 8;

/**
 * The monster garden: my monsters walking about in a sunny garden (3D, cave/garden-stage.ts).
 * Tap one: it comes to the front, and the panel shows its name, its stage (stars) and how close
 * it is to evolving (hearts). Pet it, feed it (food from the bag) or play with it — a few times
 * a day — to grow its bond; win battles with it too. With bond enough it can evolve. And the
 * star makes it my fighter (the monster that battles first).
 */
export class GardenScene extends Phaser.Scene {
  private garden!: GardenSceneData;
  private stage?: GardenStage;
  private canvas?: HTMLCanvasElement;
  private page = 0;
  private selected?: string;
  private ui: Phaser.GameObjects.GameObject[] = [];
  private toast?: Phaser.GameObjects.Container;

  constructor() {
    super("Garden");
  }

  init(data: GardenSceneData): void {
    this.garden = data;
    this.page = 0;
    this.selected = undefined;
  }

  create(): void {
    // The map underneath steps aside while the garden is open (it would show through).
    this.scene.setVisible(false, "Overworld");
    this.events.once("shutdown", () => {
      this.stage?.destroy();
      this.stage = undefined;
      this.canvas?.remove();
      this.scene.setVisible(true, "Overworld");
    });
    const layout = getLayout(this);
    const loading = this.add.text(layout.width / 2, layout.height / 2, "…", { fontFamily: FONT, fontSize: layout.font(40), color: CSS.soft }).setOrigin(0.5);
    void import("../cave/garden-stage")
      .then(({ GardenStage }) => {
        if (!this.scene.isActive()) return;
        loading.destroy();
        this.canvas = document.createElement("canvas");
        this.canvas.className = "cave-stage";
        const host = document.getElementById("game")!;
        host.insertBefore(this.canvas, this.game.canvas.parentElement === host ? this.game.canvas : host.firstChild);
        this.stage = new GardenStage(this.canvas, this.pageMonsters());
        this.fit();
        if (import.meta.env.DEV) (window as unknown as { __garden?: GardenScene }).__garden = this;
        this.input.on("pointerup", (p: Phaser.Input.Pointer) => {
          if (this.input.hitTestPointer(p).length > 0) return; // a button
          const id = this.stage?.pick(p.x, p.y);
          if (id) this.choose(id);
        });
        this.drawUi();
      })
      .catch(() => loading.setText("?"));
    onRelayout(this, () => {
      this.fit();
      this.drawUi();
    });
  }

  private fit(): void {
    const host = document.getElementById("game");
    if (this.stage && host) this.stage.resize(host.clientWidth, host.clientHeight);
  }

  // ------------------------------------------------------------ the monsters

  private get monsters(): CreatureInstance[] {
    return this.garden.save.creatures;
  }

  private gardenMonster(c: CreatureInstance): GardenMonster {
    const species = this.garden.content.speciesById[c.speciesId]!;
    const stage = stageOf(c, species);
    const spec = placeholderSpec(species.spriteFront);
    const key = pictureKey(this, species.spriteFront, c.variant);
    return {
      id: c.instanceId,
      ...(spec ? { spec: { ...spec, ...(c.variant ? { variant: c.variant } : {}), stage } } : {}),
      ...(this.textures.exists(key) ? { image: this.textures.get(key).getSourceImage() as HTMLCanvasElement } : {}),
      scale: variantScale(c.variant) * (1 + 0.15 * (stage - 1)),
    };
  }

  private pageMonsters(): GardenMonster[] {
    return this.monsters.slice(this.page * PER_PAGE, (this.page + 1) * PER_PAGE).filter((c) => this.garden.content.speciesById[c.speciesId]).map((c) => this.gardenMonster(c));
  }

  private choose(id: string): void {
    this.selected = id;
    this.stage?.select(id);
    const c = this.monsters.find((m) => m.instanceId === id);
    const species = c && this.garden.content.speciesById[c.speciesId];
    if (species) playCreatureSound(this, species);
    this.drawUi();
  }

  // ------------------------------------------------------------ caring

  private careFor(kind: CareKind): void {
    const index = this.monsters.findIndex((m) => m.instanceId === this.selected);
    const c = this.monsters[index];
    if (!c) return;
    if (kind === "feed") {
      if (this.garden.save.bag.length === 0) return;
      this.garden.save.bag.shift();
    }
    const result = care(c, kind, itemDay(new Date()), nurtureConfig);
    if (!result.ok) {
      this.stage?.react(c.instanceId, "tired");
      this.say(`${ic("sleep")} ${t("care_tired")}`);
      return;
    }
    this.monsters[index] = result.instance;
    this.stage?.react(c.instanceId, kind);
    void persist();
    this.drawUi();
  }

  private async evolveSelected(): Promise<void> {
    const index = this.monsters.findIndex((m) => m.instanceId === this.selected);
    const c = this.monsters[index];
    const species = c && this.garden.content.speciesById[c.speciesId];
    if (!c || !species || !canEvolve(c, species, nurtureConfig)) return;
    const next = evolve(c, species, nurtureConfig);
    this.monsters[index] = next;
    recordProgress({ kind: "evolve" }, true);
    void persist();
    for (const o of this.ui) o.destroy();
    this.ui = [];
    await this.stage?.evolve(c.instanceId, this.gardenMonster(next));
    playCreatureSound(this, species);
    this.say(`${ic("sparkle")} ${nameWithVariant(stageName(species, stageOf(next, species)), next.variant)}!`, 3000);
    this.drawUi();
  }

  /** This one fights first from now on. */
  private makeFighter(): void {
    const index = this.monsters.findIndex((m) => m.instanceId === this.selected);
    if (index <= 0) return;
    const [c] = this.monsters.splice(index, 1);
    this.monsters.unshift(c!);
    void persist();
    this.say(`${ic("sword")} ${t("garden_fighter")}`);
    this.page = 0;
    this.stage?.setMonsters(this.pageMonsters());
    this.stage?.select(this.selected);
    this.drawUi();
  }

  // ------------------------------------------------------------ what's on top

  private drawUi(): void {
    for (const o of this.ui) o.destroy();
    this.ui = [];
    if (!this.stage) return;
    const layout = getLayout(this);
    const { width, height, safe } = layout;
    const close = addCloseButton(this, () => this.leave());
    this.ui.push(close.button);
    this.ui.push(richChip(this, width / 2, safe.top + 10 + close.size / 2, `${ic("garden")} ${t("garden_title")}`, { fontFamily: FONT, fontSize: layout.font(32), color: CSS.text }));
    // More monsters than fit: pages.
    const pages = Math.ceil(this.monsters.length / PER_PAGE);
    if (pages > 1) {
      const size = layout.touch(64);
      const y = safe.top + 10 + size * 1.5 + layout.px(12);
      const turn = (d: number) => {
        this.page = (this.page + d + pages) % pages;
        this.selected = undefined;
        this.stage?.setMonsters(this.pageMonsters());
        this.drawUi();
      };
      this.ui.push(createButton(this, safe.left + 12 + size / 2, y, "◀", () => turn(-1), { width: size, height: size, fontSize: layout.font(28), backgroundColor: C.buttonQuiet }));
      this.ui.push(createButton(this, width - safe.right - 12 - size / 2, y, "▶", () => turn(1), { width: size, height: size, fontSize: layout.font(28), backgroundColor: C.buttonQuiet }));
      this.ui.push(richChip(this, width / 2, y, `${this.page + 1} / ${pages}`, { fontFamily: FONT, fontSize: layout.font(22), color: CSS.soft }));
    }
    const c = this.monsters.find((m) => m.instanceId === this.selected);
    const species = c && this.garden.content.speciesById[c.speciesId];
    if (!c || !species) {
      this.ui.push(richChip(this, width / 2, height - safe.bottom - layout.px(60), `${ic("hand")} ${t("garden_tap")}`, { fontFamily: FONT, fontSize: layout.font(26), color: CSS.accent }));
      return;
    }
    // The panel: name, stage stars, hearts towards the next stage, and what to do.
    const stage = stageOf(c, species);
    const stages = stageCount(species);
    const need = bondForNext(c, species, nurtureConfig);
    const bond = c.bond ?? 0;
    const panelH = layout.touch(96) + layout.px(110);
    const top = height - safe.bottom - panelH - layout.px(8);
    const panel = this.add.graphics();
    panel.fillStyle(C.overlay, 0.88).fillRoundedRect(safe.left + 8, top, width - safe.left - safe.right - 16, panelH, 18);
    this.ui.push(panel);
    const stars = Array.from({ length: stages }, (_, i) => (i < stage ? ic("star") : "☆")).join("");
    this.ui.push(richText(this, width / 2, top + layout.px(26), `${nameWithVariant(stageName(species, stage), c.variant)}  ${stars}`, { fontFamily: FONT, fontSize: layout.font(28), color: CSS.text }));
    // Hearts: filled as far as the bond reaches towards the next stage.
    const hearts = 5;
    const prev = stage >= 2 ? nurtureConfig.bondToEvolve[stage - 2] ?? 0 : 0;
    const filled = need === undefined ? hearts : Math.min(hearts, Math.floor(((bond - prev) / Math.max(1, need - prev)) * hearts));
    this.ui.push(
      richText(this, width / 2, top + layout.px(62), Array.from({ length: hearts }, (_, i) => (i < filled ? ic("heart") : "♡")).join(" "), { fontFamily: FONT, fontSize: layout.font(26), color: CSS.soft })
    );
    const ready = canEvolve(c, species, nurtureConfig);
    const food = this.garden.save.bag[0];
    const actions: Array<{ label: string; colour: number; onTap: () => void; icon?: string; off?: boolean }> = [
      { label: t("care_pet"), icon: "hand", colour: C.button, onTap: () => this.careFor("pet") },
      { label: `${t("care_feed")} ${this.garden.save.bag.length}`, icon: food ? foodIcon(food) : "apple", colour: C.button, onTap: () => this.careFor("feed"), off: !food },
      { label: t("care_play"), icon: "ball", colour: C.button, onTap: () => this.careFor("play") },
    ];
    if (ready) actions.push({ label: t("care_evolve"), icon: "sparkle", colour: C.catch, onTap: () => void this.evolveSelected() });
    if (this.monsters[0]?.instanceId !== c.instanceId) actions.push({ label: t("care_fighter"), icon: "sword", colour: C.buttonQuiet, onTap: () => this.makeFighter() });
    const gap = layout.px(10);
    const bw = Math.min(layout.px(170), (width - safe.left - safe.right - 32 - gap * (actions.length - 1)) / actions.length);
    const bh = layout.touch(96);
    actions.forEach((a, i) => {
      const x = width / 2 + (i - (actions.length - 1) / 2) * (bw + gap);
      const b = createButton(this, x, top + panelH - layout.px(12) - bh / 2, a.label, a.onTap, { width: bw, height: bh, fontSize: layout.font(18), backgroundColor: a.colour, ...(a.icon ? { icon: a.icon } : {}) });
      if (a.off) b.setAlpha(0.4).disableInteractive();
      this.ui.push(b);
    });
  }

  private say(message: string, ms = 1800): void {
    this.toast?.destroy();
    const layout = getLayout(this);
    const toast = richChip(this, layout.width / 2, layout.safe.top + layout.touch(64) * 2 + layout.px(40), message, { fontFamily: FONT, fontSize: layout.font(28), color: CSS.accent }).setDepth(20);
    this.toast = toast;
    this.time.delayedCall(ms, () => toast.destroy());
  }

  private leave(): void {
    this.scene.stop();
    this.scene.resume("Overworld");
  }
}
