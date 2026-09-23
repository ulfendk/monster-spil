import Phaser from "phaser";
import type { CreatureInstance, AreaMeta } from "@shared";
import type { SaveData } from "../save/schema";
import type { GameContent } from "../content/load-content";
import { getAreaAssets } from "../content/load-areas";
import { persist } from "../save/game-state";
import type { BattleSceneData } from "./BattleScene";
import type { MonsterbogSceneData } from "./MonsterbogScene";
import type { LobbySceneData } from "./LobbyScene";
import { multiplayerEnabled } from "../net/lobby";
import { createButton } from "../ui/Button";

export interface OverworldSceneData {
  save: SaveData;
  content: GameContent;
}

interface TileCoord {
  x: number;
  y: number;
}

const TILE_SIZE = 64;
const MOVE_DURATION_MS = 160;

export class OverworldScene extends Phaser.Scene {
  private save!: SaveData;
  private content!: GameContent;
  private areaMeta!: AreaMeta;
  private map!: Phaser.Tilemaps.Tilemap;
  private groundLayer!: Phaser.Tilemaps.TilemapLayer;
  private grassLayer!: Phaser.Tilemaps.TilemapLayer;
  private player!: Phaser.GameObjects.Arc;
  private playerTile: TileCoord = { x: 0, y: 0 };
  private isMoving = false;
  private pendingPath: TileCoord[] = [];

  constructor() {
    super("Overworld");
  }

  init(data: OverworldSceneData): void {
    this.save = data.save;
    this.content = data.content;
  }

  preload(): void {
    const area = getAreaAssets(this.save.position.areaId);
    this.load.tilemapTiledJSON("area-map", area.mapUrl);
    this.load.image("area-tileset", area.tilesetUrl);
  }

  create(): void {
    const area = getAreaAssets(this.save.position.areaId);
    this.areaMeta = area.meta;

    this.map = this.make.tilemap({ key: "area-map" });
    const tilesetName = this.map.tilesets[0]?.name;
    const tileset = tilesetName ? this.map.addTilesetImage(tilesetName, "area-tileset") : null;
    if (!tileset) throw new Error("Kunne ikke indlæse tileset til området");

    const groundLayer = this.map.createLayer(area.meta.collisionLayer, tileset, 0, 0);
    const grassLayer = this.map.createLayer(area.meta.encounterZoneLayer, tileset, 0, 0);
    if (!groundLayer || !grassLayer) throw new Error("Kunne ikke indlæse lag til området");
    this.groundLayer = groundLayer;
    this.grassLayer = grassLayer;
    this.groundLayer.setCollision(area.meta.collisionGids);

    // (0,0) sits inside the border wall, so it can never be a real position —
    // use it as the "no saved position yet" sentinel for this map.
    this.playerTile =
      this.save.position.x === 0 && this.save.position.y === 0
        ? { ...area.meta.playerStart }
        : { x: this.save.position.x, y: this.save.position.y };

    const colour = Phaser.Display.Color.HexStringToColor(this.save.player.farve).color;
    this.player = this.add.circle(
      this.playerTile.x * TILE_SIZE + TILE_SIZE / 2,
      this.playerTile.y * TILE_SIZE + TILE_SIZE / 2,
      TILE_SIZE * 0.3,
      colour
    );

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      // A UI button (e.g. the Monsterbog corner button) already handled this tap.
      if (this.input.hitTestPointer(pointer).length > 0) return;

      const targetTile: TileCoord = {
        x: Math.floor(pointer.worldX / TILE_SIZE),
        y: Math.floor(pointer.worldY / TILE_SIZE),
      };
      const path = this.findPath(this.playerTile, targetTile);
      if (path.length > 0) {
        this.pendingPath = path;
        this.advancePath();
      }
    });

    createButton(this, this.scale.width - 60, 60, "📖", () => this.openMonsterbog(), {
      width: 64,
      height: 64,
      fontSize: "28px",
      backgroundColor: 0x4a4e7a,
    });

    if (multiplayerEnabled) {
      createButton(this, this.scale.width - 140, 60, "🤝", () => this.openLobby(), {
        width: 64,
        height: 64,
        fontSize: "28px",
        backgroundColor: 0x4a4e7a,
      });
    }
  }

  private openLobby(): void {
    const data: LobbySceneData = { content: this.content, save: this.save };
    this.scene.launch("Lobby", data);
    this.scene.pause();
  }

  private openMonsterbog(): void {
    const data: MonsterbogSceneData = { content: this.content, save: this.save };
    this.scene.launch("Monsterbog", data);
    this.scene.pause();
  }

  private isWalkable(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.map.width || y >= this.map.height) return false;
    const tile = this.groundLayer.getTileAt(x, y);
    return !!tile && !tile.collides;
  }

  /** Naive BFS — the map is small enough that this is plenty fast. */
  private findPath(start: TileCoord, goal: TileCoord): TileCoord[] {
    if (!this.isWalkable(goal.x, goal.y)) return [];

    const key = (c: TileCoord) => `${c.x},${c.y}`;
    const visited = new Set<string>([key(start)]);
    const cameFrom = new Map<string, TileCoord>();
    const queue: TileCoord[] = [start];
    let found = false;

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.x === goal.x && current.y === goal.y) {
        found = true;
        break;
      }
      const neighbours: TileCoord[] = [
        { x: current.x + 1, y: current.y },
        { x: current.x - 1, y: current.y },
        { x: current.x, y: current.y + 1 },
        { x: current.x, y: current.y - 1 },
      ];
      for (const n of neighbours) {
        const k = key(n);
        if (!visited.has(k) && this.isWalkable(n.x, n.y)) {
          visited.add(k);
          cameFrom.set(k, current);
          queue.push(n);
        }
      }
    }

    if (!found) return [];

    const path: TileCoord[] = [];
    let cur = goal;
    while (!(cur.x === start.x && cur.y === start.y)) {
      path.unshift(cur);
      cur = cameFrom.get(key(cur))!;
    }
    return path;
  }

  private advancePath(): void {
    if (this.isMoving || this.pendingPath.length === 0) return;
    const next = this.pendingPath.shift()!;
    this.isMoving = true;

    this.tweens.add({
      targets: this.player,
      x: next.x * TILE_SIZE + TILE_SIZE / 2,
      y: next.y * TILE_SIZE + TILE_SIZE / 2,
      duration: MOVE_DURATION_MS,
      onComplete: () => {
        this.playerTile = next;
        this.isMoving = false;

        if (this.pendingPath.length === 0) {
          this.save.position.x = next.x;
          this.save.position.y = next.y;
          void persist();
        }

        if (this.isEncounterTile(next.x, next.y) && this.rollEncounter()) {
          this.pendingPath = [];
          return;
        }

        this.advancePath();
      },
    });
  }

  private isEncounterTile(x: number, y: number): boolean {
    return !!this.grassLayer.getTileAt(x, y);
  }

  /** Returns true (and starts a battle) if the roll triggers a wild encounter. */
  private rollEncounter(): boolean {
    if (Math.random() > this.areaMeta.encounterRate) return false;

    const speciesId = pickWeightedSpecies(this.areaMeta.encounterTable);
    const species = speciesId ? this.content.speciesById[speciesId] : undefined;
    if (!species) return false;

    const wildInstance: CreatureInstance = {
      instanceId: crypto.randomUUID(),
      speciesId: species.id,
      ownerId: "wild",
      niveau: 1,
      currentHp: species.baseStats.hp,
      caughtAt: new Date().toISOString(),
    };

    if (!this.save.seenSpeciesIds.includes(species.id)) {
      this.save.seenSpeciesIds.push(species.id);
      void persist();
    }

    const data: BattleSceneData = {
      save: this.save,
      content: this.content,
      wildInstance,
      wildSpecies: species,
    };
    this.scene.start("Battle", data);
    return true;
  }
}

function pickWeightedSpecies(table: AreaMeta["encounterTable"]): string | undefined {
  const total = table.reduce((sum, entry) => sum + entry.weight, 0);
  if (total <= 0) return undefined;

  let roll = Math.random() * total;
  for (const entry of table) {
    roll -= entry.weight;
    if (roll <= 0) return entry.speciesId;
  }
  return table[table.length - 1]?.speciesId;
}
