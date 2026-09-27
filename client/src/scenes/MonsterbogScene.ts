import Phaser from "phaser";
import { spriteFit } from "../gfx/creature-sprite";
import { livesAt, livesInArea, nearestSpot, paintedTiles } from "@shared";
import type { CreatureSpecies, SpotHint, Tile } from "@shared";
import type { GameContent } from "../content/load-content";
import { allAreaMetas, getAreaAssets, worldConfig } from "../content/load-areas";
import type { SaveData } from "../save/schema";
import type { MonsterInfoSceneData } from "./MonsterInfoScene";
import { createButton, whenTapped } from "../ui/Button";
import { t } from "../i18n/da";
import { getLayout, restartOnResize } from "../ui/layout";
import { BEAST_ICONS, CAUGHT_ICON, CAVE_ICON, DISASTER_ICONS, DRAGON_ICON, OWNED_ICON, STEPS_ICON, arrowAngle } from "../ui/icons";
import { disasterForSpecies } from "../content/load-disasters";
import { bossesById } from "../content/load-raid";
import { beastForBaby } from "../content/load-beasts";
import { livesInCaves } from "../content/load-caves";
import { livesUnderground } from "../content/load-minigames";
import { C, CSS, FONT } from "../ui/theme";
import { addSeigaiha } from "../gfx/motifs";
import { ic, richText } from "../ui/rich-text";
import { addIcon } from "../gfx/icon-art";

export interface MonsterbogSceneData {
  content: GameContent;
  save: SaveData;
  /** Where the player stands right now, for the "how far away" hints. */
  position: Tile;
}

/** The iPad design size of one book entry; small screens scale it down a little, and the book scrolls. */
const CELL_SIZE = 170;
/** A finger that moves further than this (px) is scrolling, not tapping a monster. */
const TAP_SLOP = 10;

export class MonsterbogScene extends Phaser.Scene {
  private bookData!: MonsterbogSceneData;
  /** The finger scrolling the book: where it pressed, the scroll then, and whether it has moved (so it's no tap). */
  private scroll?: { y: number; from: number; moved: boolean; lastY: number; lastT: number };
  /** How fast the book glides after a flick (px per ms; positive = down the book). */
  private velocity = 0;
  private maxScroll = 0;

  constructor() {
    super("Monsterbog");
  }

  create(data: MonsterbogSceneData): void {
    this.bookData = data;
    restartOnResize(this, data);
    const layout = getLayout(this);
    const { width, height, safe } = layout;

    // The backdrop and the header stay put (scroll factor 0) while the monsters scroll under them.
    const overlay = this.add.rectangle(0, 0, width, height, C.overlay, 0.94).setOrigin(0, 0).setScrollFactor(0);
    addSeigaiha(this, 0, height * 0.66, width, height * 0.34).setScrollFactor(0);
    overlay.setInteractive(); // swallow taps so they don't reach the paused Overworld underneath

    const closeSize = layout.touch(64);
    const headerH = safe.top + closeSize + layout.px(20);
    this.add.rectangle(0, 0, width, headerH, C.overlay, 1).setOrigin(0, 0).setScrollFactor(0).setDepth(10);
    this.add.text(width / 2, safe.top + layout.px(10) + closeSize / 2, t("monsterbog_title"), { fontFamily: FONT, fontSize: layout.font(36), color: CSS.text }).setOrigin(0.5).setScrollFactor(0).setDepth(11);

    const speciesList = Object.values(data.content.speciesById);
    const owned = new Map<string, number>();
    const rare = new Map<string, Set<string>>();
    for (const c of data.save.creatures) {
      owned.set(c.speciesId, (owned.get(c.speciesId) ?? 0) + 1);
      if (c.variant) rare.set(c.speciesId, (rare.get(c.speciesId) ?? new Set()).add(c.variant));
    }

    // Entries at a readable size (a little smaller on a phone), as many per row as fit; the rest scrolls.
    const areaW = width - safe.left - safe.right - 16;
    const areaH = height - headerH - safe.bottom - 8;
    const target = CELL_SIZE * Phaser.Math.Clamp(layout.s, 0.72, 1.2);
    const cols = Math.max(2, Math.min(speciesList.length, Math.floor(areaW / target)));
    const cell = Math.min(areaW / cols, CELL_SIZE * Math.max(1, layout.s));
    const k = cell / CELL_SIZE; // everything inside an entry scales with it
    const rows = Math.ceil(speciesList.length / cols);
    const startX = width / 2 - (cols * cell) / 2 + cell / 2;
    const startY = headerH + Math.max(0, (areaH - rows * cell) / 2) + cell * 0.36;
    this.setUpScrolling(Math.max(0, headerH + rows * cell + layout.px(16) + safe.bottom - height));
    const label = (px: number) => `${Math.max(13, Math.round(px * k))}px`;

    speciesList.forEach((species, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * cell;
      const y = startY + row * cell;
      const ownedCount = owned.get(species.id) ?? 0;
      const caughtCount = data.save.caughtCounts[species.id] ?? 0;
      const caught = ownedCount > 0 || caughtCount > 0;
      const seen = data.save.seenSpeciesIds.includes(species.id);
      const ring = this.add.circle(x, y, 58 * k, C.panel).setStrokeStyle(3, C.border, caught ? 1 : 0.4);

      if (caught || seen) {
        const image = this.add.image(x, y, species.spriteFront).setScale(k * spriteFit(this, species.spriteFront));
        if (!caught) image.setTint(C.overlay);
        this.add.text(x, y + 72 * k, species.navn, { fontFamily: FONT, fontSize: label(18), color: caught ? CSS.text : CSS.muted }).setOrigin(0.5);
        if (caught) {
          richText(this, x, y + 97 * k, `${ic(CAUGHT_ICON)} ${caughtCount}   ${ic(OWNED_ICON)} ${ownedCount}`, { fontFamily: FONT, fontSize: label(18), color: CSS.text });
        }
        // Tapping a known monster opens its page (and plays its cry).
        const variants = [...(rare.get(species.id) ?? [])];
        // I have a rare one of these: a sparkle on its ring.
        if (variants.length) addIcon(this, x + 44 * k, y - 44 * k, "sparkle", Math.max(22, 34 * k));
        const open = () => {
          if (!this.scroll?.moved) this.openInfo(species, caught, ownedCount, caughtCount, variants);
        };
        ring.setInteractive({ useHandCursor: true });
        whenTapped(ring, open);
        image.setInteractive({ useHandCursor: true });
        whenTapped(image, open);
      } else {
        this.add.text(x, y, "?", { fontFamily: FONT, fontSize: label(48), color: CSS.faint }).setOrigin(0.5);
        const hint = this.hintFor(species);
        if (hint) {
          // How far (in steps) and which way: a drawn arrow turned to point there, or a pin when you are in it.
          const angle = arrowAngle(hint.arrow);
          const text = angle === undefined ? ic("pin") : `${ic(STEPS_ICON)} ${hint.distance}`;
          const hintLabel = richText(this, x, y + 76 * k, text, { fontFamily: FONT, fontSize: label(22), color: CSS.accent });
          if (angle !== undefined) {
            const size = Math.max(22, 28 * k);
            addIcon(this, x + hintLabel.width / 2 + size * 0.7, y + 76 * k, "arrow", size).setAngle(angle);
          }
        } else if (Object.values(bossesById).some((b) => b.rewardSpeciesId === species.id)) {
          // Not found in the wild: this one hatches from beating the family dragon.
          addIcon(this, x, y + 76 * k, DRAGON_ICON, Math.max(26, 34 * k));
        } else if (beastForBaby(species.id)) {
          // Hatches from beating a visiting beast: a sand serpent or a giant eagle.
          addIcon(this, x, y + 76 * k, BEAST_ICONS[beastForBaby(species.id)!.habitat], Math.max(26, 34 * k));
        } else if (livesInCaves(species.id)) {
          // Lives in the caves that open in the mountains now and then.
          addIcon(this, x, y + 76 * k, CAVE_ICON, Math.max(26, 34 * k));
        } else if (disasterForSpecies(species.id)) {
          // Only turns up where a natural disaster struck (a meteor crater, floodwater, …).
          addIcon(this, x, y + 76 * k, DISASTER_ICONS[disasterForSpecies(species.id)!], Math.max(26, 34 * k));
        } else if (livesUnderground(species.id)) {
          // Dug up with the shovel (some only out of the sand).
          addIcon(this, x, y + 76 * k, "shovel", Math.max(26, 34 * k));
        } else {
          // Lives in another world: that world's icon.
          const world = worldConfig.worlds.find((w) => w.id !== data.save.position.areaId && allAreaMetas().some((m) => m.id === w.id && livesInArea(m, species.id)));
          if (world) addIcon(this, x, y + 76 * k, world.icon, Math.max(26, 34 * k));
        }
      }
    });

    createButton(this, width - safe.right - layout.px(12) - closeSize / 2, safe.top + layout.px(10) + closeSize / 2, "✕", () => this.closeBook(), {
      width: closeSize,
      height: closeSize,
      fontSize: layout.font(28),
      backgroundColor: C.buttonQuiet,
    })
      .setScrollFactor(0)
      .setDepth(11);
  }

  /**
   * Scrolling that feels like a phone's: the book follows the finger, glides on after a
   * flick and slows down, stretches a little past either end and springs back. A touch
   * stops a glide (and that touch doesn't open a monster); a drag never opens one.
   */
  private setUpScrolling(maxScroll: number): void {
    const camera = this.cameras.main;
    camera.setScroll(0, 0);
    this.scroll = undefined;
    this.velocity = 0;
    this.maxScroll = maxScroll;
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      const gliding = Math.abs(this.velocity) > 0.05;
      this.velocity = 0;
      this.scroll = { y: p.y, from: camera.scrollY, moved: gliding, lastY: p.y, lastT: performance.now() };
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      const s = this.scroll;
      if (!s || !p.isDown) return;
      if (!s.moved && Math.abs(p.y - s.y) > TAP_SLOP) {
        // Start from here, so the book doesn't jump by the slop.
        s.moved = true;
        s.y = p.y;
        s.from = camera.scrollY;
      }
      if (!s.moved) return;
      camera.setScroll(0, this.stretched(s.from - (p.y - s.y)));
      const now = performance.now();
      const dt = Math.max(1, now - s.lastT);
      // The finger's speed, smoothed a little: that's what a flick carries on with.
      this.velocity = 0.7 * ((s.lastY - p.y) / dt) + 0.3 * this.velocity;
      s.lastY = p.y;
      s.lastT = now;
    });
    this.input.on("pointerup", () => {
      const s = this.scroll;
      // A finger that stopped before lifting doesn't flick.
      if (!s?.moved || performance.now() - s.lastT > 80) this.velocity = 0;
      // The tap on a monster is handled first (pointerup on it); forget the drag afterwards.
      this.time.delayedCall(0, () => (this.scroll = undefined));
    });
    this.input.on("wheel", (_p: unknown, _o: unknown, _dx: number, dy: number) => camera.setScroll(0, Phaser.Math.Clamp(camera.scrollY + dy, 0, maxScroll)));
  }

  /** Past either end the book only follows the finger a third of the way: it stretches. */
  private stretched(y: number): number {
    if (y < 0) return y / 3;
    if (y > this.maxScroll) return this.maxScroll + (y - this.maxScroll) / 3;
    return y;
  }

  update(_time: number, delta: number): void {
    if (this.scroll?.moved && this.input.activePointer.isDown) return; // the finger has it
    const camera = this.cameras.main;
    let y = camera.scrollY;
    if (Math.abs(this.velocity) > 0.01) {
      y += this.velocity * delta;
      // Slowing down like a phone's list (about a third of a second to lose most speed);
      // much faster once it's run past an end.
      const outside = y < 0 || y > this.maxScroll;
      this.velocity *= Math.exp(-delta / (outside ? 45 : 325));
    } else {
      this.velocity = 0;
    }
    // Past an end: spring back.
    const target = Phaser.Math.Clamp(y, 0, this.maxScroll);
    if (y !== target) y += (target - y) * (1 - Math.exp(-delta / 90));
    if (Math.abs(y - target) < 0.5 && Math.abs(this.velocity) <= 0.01) y = target;
    if (y !== camera.scrollY) camera.setScroll(0, y);
  }

  /**
   * How far, and which way, the nearest place is where this monster can turn up: the tall
   * grass of the area the player is in, in the parts of the map (regions) where it lives.
   * Monsters that live nowhere here (the starters) get no hint.
   */
  private hintFor(species: CreatureSpecies): SpotHint | undefined {
    const { save, position } = this.bookData;
    const meta = getAreaAssets(save.position.areaId).meta;
    if (!livesInArea(meta, species.id)) return undefined;

    const map = this.cache.tilemap.get(`area-map-${save.position.areaId}`)?.data as { width: number; layers: Array<{ name: string; data?: number[] }> } | undefined;
    const zone = map?.layers.find((l) => l.name === meta.encounterZoneLayer)?.data;
    if (!map || !zone) return undefined;
    return nearestSpot(position, paintedTiles(zone, map.width).filter((tile) => livesAt(meta, species.id, tile.x, tile.y)));
  }

  private openInfo(species: CreatureSpecies, caught: boolean, owned: number, caughtCount: number, variants: string[]): void {
    const data: MonsterInfoSceneData = { content: this.bookData.content, species, caught, owned, caughtCount, variants };
    this.scene.launch("MonsterInfo", data);
    this.scene.bringToTop("MonsterInfo");
    this.scene.pause();
  }

  private closeBook(): void {
    this.scene.stop();
    this.scene.resume("Overworld");
  }
}
