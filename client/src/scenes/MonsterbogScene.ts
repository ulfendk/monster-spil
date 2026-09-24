import Phaser from "phaser";
import { nearestSpot, paintedTiles } from "@shared";
import type { CreatureSpecies, SpotHint, Tile } from "@shared";
import type { GameContent } from "../content/load-content";
import { getAreaAssets } from "../content/load-areas";
import type { SaveData } from "../save/schema";
import type { MonsterInfoSceneData } from "./MonsterInfoScene";
import { createButton } from "../ui/Button";
import { t } from "../i18n/da";
import { getLayout, restartOnResize } from "../ui/layout";
import { CAUGHT_ICON, DRAGON_ICON, OWNED_ICON, STEPS_ICON } from "../ui/icons";
import { bossesById } from "../content/load-raid";

export interface MonsterbogSceneData {
  content: GameContent;
  save: SaveData;
  /** Where the player stands right now, for the "how far away" hints. */
  position: Tile;
}

/** The iPad design size of one book entry; smaller screens scale it down to fit every monster. */
const CELL_SIZE = 170;
const FONT = "sans-serif";

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

    const overlay = this.add.rectangle(0, 0, width, height, 0x10132a, 0.94).setOrigin(0, 0);
    overlay.setInteractive(); // swallow taps so they don't reach the paused Overworld underneath

    const closeSize = layout.touch(64);
    const headerH = safe.top + closeSize + layout.px(20);
    this.add.text(width / 2, safe.top + layout.px(10) + closeSize / 2, t("monsterbog_title"), { fontFamily: FONT, fontSize: layout.font(36), color: "#ffffff" }).setOrigin(0.5);

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
      const ring = this.add.circle(x, y, 58 * k, 0x2b2f52).setStrokeStyle(3, 0xffffff, caught ? 1 : 0.4);

      if (caught || seen) {
        const image = this.add.image(x, y, species.spriteFront).setScale(k);
        if (!caught) image.setTint(0x000000);
        this.add.text(x, y + 72 * k, species.navn, { fontFamily: FONT, fontSize: label(18), color: caught ? "#ffffff" : "#777777" }).setOrigin(0.5);
        if (caught) {
          this.add.text(x, y + 97 * k, `${CAUGHT_ICON} ${caughtCount}   ${OWNED_ICON} ${ownedCount}`, { fontFamily: FONT, fontSize: label(18), color: "#ffffff" }).setOrigin(0.5);
        }
        // Tapping a known monster opens its page (and plays its cry).
        ring.setInteractive({ useHandCursor: true });
        ring.on("pointerup", () => this.openInfo(species, caught, ownedCount, caughtCount));
        image.setInteractive({ useHandCursor: true });
        image.on("pointerup", () => this.openInfo(species, caught, ownedCount, caughtCount));
      } else {
        this.add.text(x, y, "?", { fontFamily: FONT, fontSize: label(48), color: "#555555" }).setOrigin(0.5);
        const hint = this.hintFor(species);
        if (hint) {
          const text = hint.distance === 0 ? hint.arrow : `${STEPS_ICON} ${hint.distance} ${hint.arrow}`;
          this.add.text(x, y + 76 * k, text, { fontFamily: FONT, fontSize: label(22), color: "#ffce54" }).setOrigin(0.5);
        } else if (Object.values(bossesById).some((b) => b.rewardSpeciesId === species.id)) {
          // Not found in the wild: this one hatches from beating the family dragon.
          this.add.text(x, y + 76 * k, DRAGON_ICON, { fontFamily: FONT, fontSize: label(26) }).setOrigin(0.5);
        }
      }
    });

    createButton(this, width - safe.right - layout.px(12) - closeSize / 2, safe.top + layout.px(10) + closeSize / 2, "X", () => this.closeBook(), {
      width: closeSize,
      height: closeSize,
      fontSize: layout.font(28),
      backgroundColor: 0x555555,
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
