import Phaser from "phaser";
import { spriteFit } from "../gfx/creature-sprite";
import { nearestSpot, paintedTiles } from "@shared";
import type { CreatureSpecies, SpotHint, Tile } from "@shared";
import type { GameContent } from "../content/load-content";
import { getAreaAssets } from "../content/load-areas";
import type { SaveData } from "../save/schema";
import type { MonsterInfoSceneData } from "./MonsterInfoScene";
import { createButton } from "../ui/Button";
import { t } from "../i18n/da";
import { getLayout, restartOnResize } from "../ui/layout";
import { CAUGHT_ICON, DISASTER_ICONS, DRAGON_ICON, OWNED_ICON, STEPS_ICON, arrowAngle } from "../ui/icons";
import { disasterForSpecies } from "../content/load-disasters";
import { bossesById } from "../content/load-raid";
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

/** The iPad design size of one book entry; smaller screens scale it down to fit every monster. */
const CELL_SIZE = 170;

export class MonsterbogScene extends Phaser.Scene {
  private bookData!: MonsterbogSceneData;

  constructor() {
    super("Monsterbog");
  }

  create(data: MonsterbogSceneData): void {
    this.bookData = data;
    restartOnResize(this, data);
    const layout = getLayout(this);
    const { width, height, safe } = layout;

    const overlay = this.add.rectangle(0, 0, width, height, C.overlay, 0.94).setOrigin(0, 0);
    addSeigaiha(this, 0, height * 0.66, width, height * 0.34);
    overlay.setInteractive(); // swallow taps so they don't reach the paused Overworld underneath

    const closeSize = layout.touch(64);
    const headerH = safe.top + closeSize + layout.px(20);
    this.add.text(width / 2, safe.top + layout.px(10) + closeSize / 2, t("monsterbog_title"), { fontFamily: FONT, fontSize: layout.font(36), color: CSS.text }).setOrigin(0.5);

    const speciesList = Object.values(data.content.speciesById);
    const owned = new Map<string, number>();
    for (const c of data.save.creatures) owned.set(c.speciesId, (owned.get(c.speciesId) ?? 0) + 1);

    // Pick the column count that gives the biggest entries while every monster still fits.
    const areaW = width - safe.left - safe.right - 16;
    const areaH = height - headerH - safe.bottom - 8;
    let best = { cols: 1, cell: 0 };
    for (let cols = 1; cols <= speciesList.length; cols++) {
      const rows = Math.ceil(speciesList.length / cols);
      const cell = Math.min(CELL_SIZE * Math.max(1, layout.s), areaW / cols, areaH / rows);
      if (cell >= best.cell) best = { cols, cell }; // on a tie, more columns: a flatter grid reads better
    }
    const { cols, cell } = best;
    const k = cell / CELL_SIZE; // everything inside an entry scales with it
    const rows = Math.ceil(speciesList.length / cols);
    const startX = width / 2 - (cols * cell) / 2 + cell / 2;
    const startY = headerH + (areaH - rows * cell) / 2 + cell * 0.36;
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
        ring.setInteractive({ useHandCursor: true });
        ring.on("pointerup", () => this.openInfo(species, caught, ownedCount, caughtCount));
        image.setInteractive({ useHandCursor: true });
        image.on("pointerup", () => this.openInfo(species, caught, ownedCount, caughtCount));
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
        } else if (disasterForSpecies(species.id)) {
          // Only turns up where a natural disaster struck (a meteor crater, floodwater, …).
          addIcon(this, x, y + 76 * k, DISASTER_ICONS[disasterForSpecies(species.id)!], Math.max(26, 34 * k));
        }
      }
    });

    createButton(this, width - safe.right - layout.px(12) - closeSize / 2, safe.top + layout.px(10) + closeSize / 2, "✕", () => this.closeBook(), {
      width: closeSize,
      height: closeSize,
      fontSize: layout.font(28),
      backgroundColor: C.buttonQuiet,
    });
  }

  /**
   * How far, and which way, the nearest place is where this monster can turn up: the wild
   * encounter zone of the area the player is in, if the area's encounter table lists it.
   * Monsters that live nowhere here (the starters) get no hint.
   */
  private hintFor(species: CreatureSpecies): SpotHint | undefined {
    const { save, position } = this.bookData;
    const meta = getAreaAssets(save.position.areaId).meta;
    if (!meta.encounterTable.some((e) => e.speciesId === species.id && e.weight > 0)) return undefined;

    const map = this.cache.tilemap.get("area-map")?.data as { width: number; layers: Array<{ name: string; data?: number[] }> } | undefined;
    const zone = map?.layers.find((l) => l.name === meta.encounterZoneLayer)?.data;
    if (!map || !zone) return undefined;
    return nearestSpot(position, paintedTiles(zone, map.width));
  }

  private openInfo(species: CreatureSpecies, caught: boolean, owned: number, caughtCount: number): void {
    const data: MonsterInfoSceneData = { content: this.bookData.content, species, caught, owned, caughtCount };
    this.scene.launch("MonsterInfo", data);
    this.scene.bringToTop("MonsterInfo");
    this.scene.pause();
  }

  private closeBook(): void {
    this.scene.stop();
    this.scene.resume("Overworld");
  }
}
