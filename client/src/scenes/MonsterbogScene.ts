import Phaser from "phaser";
import { nearestSpot, paintedTiles } from "@shared";
import type { CreatureSpecies, SpotHint, Tile } from "@shared";
import type { GameContent } from "../content/load-content";
import { getAreaAssets } from "../content/load-areas";
import type { SaveData } from "../save/schema";
import type { MonsterInfoSceneData } from "./MonsterInfoScene";
import { createButton } from "../ui/Button";
import { t } from "../i18n/da";
import { CAUGHT_ICON, DRAGON_ICON, OWNED_ICON, STEPS_ICON } from "../ui/icons";
import { bossesById } from "../content/load-raid";

export interface MonsterbogSceneData {
  content: GameContent;
  save: SaveData;
  /** Where the player stands right now, for the "how far away" hints. */
  position: Tile;
}

const CELL_SIZE = 170;
const COLUMNS = 3;
const FONT = "sans-serif";

export class MonsterbogScene extends Phaser.Scene {
  private bookData!: MonsterbogSceneData;

  constructor() {
    super("Monsterbog");
  }

  create(data: MonsterbogSceneData): void {
    this.bookData = data;
    const { width, height } = this.scale;

    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.8).setOrigin(0, 0);
    overlay.setInteractive(); // swallow taps so they don't reach the paused Overworld underneath

    this.add.text(width / 2, 36, t("monsterbog_title"), { fontFamily: FONT, fontSize: "36px", color: "#ffffff" }).setOrigin(0.5, 0);

    const speciesList = Object.values(data.content.speciesById);
    const owned = new Map<string, number>();
    for (const c of data.save.creatures) owned.set(c.speciesId, (owned.get(c.speciesId) ?? 0) + 1);

    const gridWidth = COLUMNS * CELL_SIZE;
    const startX = width / 2 - gridWidth / 2 + CELL_SIZE / 2;
    const startY = 150;

    speciesList.forEach((species, i) => {
      const col = i % COLUMNS;
      const row = Math.floor(i / COLUMNS);
      const x = startX + col * CELL_SIZE;
      const y = startY + row * CELL_SIZE;
      const ownedCount = owned.get(species.id) ?? 0;
      const caughtCount = data.save.caughtCounts[species.id] ?? 0;
      const caught = ownedCount > 0 || caughtCount > 0;
      const seen = data.save.seenSpeciesIds.includes(species.id);
      const ring = this.add.circle(x, y, 58, 0x2b2f52).setStrokeStyle(3, 0xffffff, caught ? 1 : 0.4);

      if (caught || seen) {
        const image = this.add.image(x, y, species.spriteFront);
        if (!caught) image.setTint(0x000000);
        this.add.text(x, y + 72, species.navn, { fontFamily: FONT, fontSize: "18px", color: caught ? "#ffffff" : "#777777" }).setOrigin(0.5);
        if (caught) {
          this.add.text(x, y + 97, `${CAUGHT_ICON} ${caughtCount}   ${OWNED_ICON} ${ownedCount}`, { fontFamily: FONT, fontSize: "18px", color: "#ffffff" }).setOrigin(0.5);
        }
        // Tapping a known monster opens its page (and plays its cry).
        ring.setInteractive({ useHandCursor: true });
        ring.on("pointerup", () => this.openInfo(species, caught, ownedCount, caughtCount));
        image.setInteractive({ useHandCursor: true });
        image.on("pointerup", () => this.openInfo(species, caught, ownedCount, caughtCount));
      } else {
        this.add.text(x, y, "?", { fontFamily: FONT, fontSize: "48px", color: "#555555" }).setOrigin(0.5);
        const hint = this.hintFor(species);
        if (hint) {
          const text = hint.distance === 0 ? hint.arrow : `${STEPS_ICON} ${hint.distance} ${hint.arrow}`;
          this.add.text(x, y + 76, text, { fontFamily: FONT, fontSize: "22px", color: "#ffce54" }).setOrigin(0.5);
        } else if (Object.values(bossesById).some((b) => b.rewardSpeciesId === species.id)) {
          // Not found in the wild: this one hatches from beating the family dragon.
          this.add.text(x, y + 76, DRAGON_ICON, { fontFamily: FONT, fontSize: "26px" }).setOrigin(0.5);
        }
      }
    });

    createButton(this, width - 90, 50, "X", () => this.closeBook(), {
      width: 72,
      height: 64,
      fontSize: "28px",
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
