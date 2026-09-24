import Phaser from "phaser";
import { isAdjacent } from "@shared";
import type { CreatureInstance, AreaMeta, LobbyPlayer } from "@shared";
import type { SaveData } from "../save/schema";
import type { GameContent } from "../content/load-content";
import { getAreaAssets } from "../content/load-areas";
import { persist } from "../save/game-state";
import type { BattleSceneData } from "./BattleScene";
import type { MonsterbogSceneData } from "./MonsterbogScene";
import type { InteractSceneData } from "./InteractScene";
import { multiplayerEnabled } from "../net/lobby";
import { presence } from "../net/presence";
import type { PresenceStatus } from "../net/presence";
import { seatFor } from "../battle-participant";
import { t } from "../i18n/da";
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
const STATUS_ICON: Record<PresenceStatus, string> = { online: "👥", connecting: "⏳", offline: "📵", needCode: "🔑", off: "⚙️" };

/** How another player is drawn on the map. */
interface OtherView {
  circle: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
}

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
  private others = new Map<string, OtherView>();
  /** Someone I tapped from afar; when the walk ends next to them the meeting popup opens. */
  private pendingMeet?: string;
  /** Top-level objects (not nested in a container) so taps hit-test correctly while the camera is scrolled. */
  private popup: Array<Phaser.GameObjects.Rectangle | Phaser.GameObjects.Text | Phaser.GameObjects.Container> = [];
  private toast?: Phaser.GameObjects.Text;
  private statusButton?: Phaser.GameObjects.Container;

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
    // use it as the "no saved position yet" sentinel for this map. A saved spot that
    // is no longer walkable (the map was redrawn since) also falls back to the start.
    const saved = { x: this.save.position.x, y: this.save.position.y };
    const hasSaved = !(saved.x === 0 && saved.y === 0) && this.isWalkable(saved.x, saved.y);
    this.playerTile = hasSaved ? saved : { ...area.meta.playerStart };

    const colour = Phaser.Display.Color.HexStringToColor(this.save.player.farve).color;
    this.player = this.add.circle(
      this.playerTile.x * TILE_SIZE + TILE_SIZE / 2,
      this.playerTile.y * TILE_SIZE + TILE_SIZE / 2,
      TILE_SIZE * 0.3,
      colour
    );
    this.player.setDepth(6);
    this.others.clear();
    this.popup = [];
    this.toast = undefined;
    this.pendingMeet = undefined;

    // The map is bigger than the screen: follow the player, never showing past the edge.
    const camera = this.cameras.main;
    camera.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
    camera.startFollow(this.player, true, 0.15, 0.15);

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      // A UI button (e.g. the Monsterbog corner button) already handled this tap.
      if (this.input.hitTestPointer(pointer).length > 0) return;
      this.closePopup();
      this.pendingMeet = undefined;

      const targetTile: TileCoord = {
        x: Math.floor(pointer.worldX / TILE_SIZE),
        y: Math.floor(pointer.worldY / TILE_SIZE),
      };
      const tapped = this.playerAt(targetTile);
      if (tapped) return this.onTapPlayer(tapped);
      const path = this.findPath(this.playerTile, targetTile);
      if (path.length > 0) {
        this.pendingPath = path;
        this.advancePath();
      }
    });

    // HUD buttons stay put on screen while the camera scrolls.
    this.hudButton(this.scale.width - 60, "📖", () => this.openMonsterbog());
    if (multiplayerEnabled) {
      this.statusButton = this.hudButton(this.scale.width - 140, STATUS_ICON[presence.status], () => this.openSettings());
      this.joinWorld();
    }
  }

  // ------------------------------------------------------------ other players

  /** Connects (once) and starts following who else is on the map. */
  private joinWorld(): void {
    presence.start({ areaId: this.save.position.areaId, x: this.playerTile.x, y: this.playerTile.y });
    presence.moveTo({ areaId: this.save.position.areaId, x: this.playerTile.x, y: this.playerTile.y });
    presence.setAway(false);

    const onPlayers = () => this.syncOthers();
    const onMoved = (id: string) => this.moveOther(id);
    const onInteraction = () => this.openInteractIfNeeded();
    const onStatus = (status: PresenceStatus) => {
      (this.statusButton?.list[1] as Phaser.GameObjects.Text | undefined)?.setText(STATUS_ICON[status]);
    };
    const onProblem = (reason: string) => {
      if (reason === "too far away") this.showToast(t("meet_far"));
      else if (reason === "player is busy") this.showToast(t("meet_busy"));
    };
    presence.events.on("players", onPlayers);
    presence.events.on("moved", onMoved);
    presence.events.on("interaction", onInteraction);
    presence.events.on("status", onStatus);
    presence.events.on("problem", onProblem);
    const onResume = () => {
      this.syncOthers(true);
      this.openInteractIfNeeded();
    };
    this.events.on("resume", onResume);
    this.events.once("shutdown", () => {
      this.events.off("resume", onResume);
      presence.events.off("players", onPlayers);
      presence.events.off("moved", onMoved);
      presence.events.off("interaction", onInteraction);
      presence.events.off("status", onStatus);
      presence.events.off("problem", onProblem);
    });
    // Coming back from a menu or a battle (onResume): show anyone who moved meanwhile, and anything waiting for me.
    this.syncOthers(true);
  }

  private visibleOthers(): LobbyPlayer[] {
    if (!presence.worldSupported) return [];
    return [...presence.players.values()].filter((p) => p.areaId === this.save.position.areaId);
  }

  private tileCentre(tile: TileCoord): { x: number; y: number } {
    return { x: tile.x * TILE_SIZE + TILE_SIZE / 2, y: tile.y * TILE_SIZE + TILE_SIZE / 2 };
  }

  /** Makes the drawn players match `presence.players`: add, remove, dim the unavailable ones. */
  private syncOthers(snap = false): void {
    const wanted = new Map(this.visibleOthers().map((p) => [p.playerId, p]));
    for (const [id, view] of this.others) {
      if (!wanted.has(id)) {
        view.circle.destroy();
        view.label.destroy();
        this.others.delete(id);
      }
    }
    for (const player of wanted.values()) {
      const centre = this.tileCentre(player);
      let view = this.others.get(player.playerId);
      if (!view) {
        const colour = Phaser.Display.Color.HexStringToColor(player.farve).color;
        view = {
          circle: this.add.circle(centre.x, centre.y, TILE_SIZE * 0.3, colour).setDepth(4),
          label: this.add
            .text(centre.x, centre.y - TILE_SIZE * 0.55, player.navn, {
              fontFamily: "sans-serif",
              fontSize: "18px",
              color: "#ffffff",
              stroke: "#000000",
              strokeThickness: 4,
            })
            .setOrigin(0.5)
            .setDepth(7),
        };
        this.others.set(player.playerId, view);
      } else if (snap) {
        this.tweens.killTweensOf([view.circle, view.label]);
        view.circle.setPosition(centre.x, centre.y);
        view.label.setPosition(centre.x, centre.y - TILE_SIZE * 0.55);
      }
      const dim = player.busy || player.away ? 0.4 : 1;
      view.circle.setAlpha(dim);
      view.label.setAlpha(dim);
    }
  }

  private moveOther(playerId: string): void {
    const player = presence.players.get(playerId);
    const view = this.others.get(playerId);
    if (!player || !view) return this.syncOthers();
    const centre = this.tileCentre(player);
    this.tweens.add({ targets: view.circle, x: centre.x, y: centre.y, duration: MOVE_DURATION_MS });
    this.tweens.add({ targets: view.label, x: centre.x, y: centre.y - TILE_SIZE * 0.55, duration: MOVE_DURATION_MS });
  }

  private playerAt(tile: TileCoord): LobbyPlayer | undefined {
    return this.visibleOthers().find((p) => p.x === tile.x && p.y === tile.y);
  }

  private myPosition() {
    return { areaId: this.save.position.areaId, x: this.playerTile.x, y: this.playerTile.y };
  }

  /** Tapping someone next to me offers trade/duel; tapping someone further away walks me over to them first. */
  private onTapPlayer(player: LobbyPlayer): void {
    if (player.busy || player.away) return this.showToast(t("meet_busy"));
    if (isAdjacent(this.myPosition(), player)) return this.showMeeting(player);

    let best: TileCoord[] | undefined;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const path = this.findPath(this.playerTile, { x: player.x + dx, y: player.y + dy });
        if (path.length > 0 && (!best || path.length < best.length)) best = path;
      }
    }
    if (!best) return;
    this.pendingMeet = player.playerId;
    this.pendingPath = best;
    this.advancePath();
  }

  private closePopup(): void {
    for (const object of this.popup) object.destroy();
    this.popup = [];
  }

  /** Small 🤝 / ⚔️ / ✗ choice, fixed on screen, for the player I'm standing next to. */
  private showMeeting(player: LobbyPlayer): void {
    this.closePopup();
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height - 130;
    const bg = this.add.rectangle(cx, cy, 560, 190, 0x1b1f3b, 0.95).setStrokeStyle(4, 0xffffff);
    const name = this.add.text(cx, cy - 60, player.navn, { fontFamily: "sans-serif", fontSize: "30px", color: "#ffffff" }).setOrigin(0.5);
    const buttonOptions = { width: 130, height: 72, fontSize: "36px" };
    const trade = createButton(this, cx - 150, cy + 25, "🤝", () => {
      presence.send("invite", { toPlayerId: player.playerId });
      this.closePopup();
    }, { ...buttonOptions, backgroundColor: 0x2e7d32 });
    const duel = createButton(this, cx, cy + 25, "⚔️", () => {
      presence.send("duelInvite", { toPlayerId: player.playerId, seat: seatFor(this.save, this.content) });
      this.closePopup();
    }, { ...buttonOptions, backgroundColor: 0xc62828 });
    const cancel = createButton(this, cx + 150, cy + 25, "✗", () => this.closePopup(), { ...buttonOptions, backgroundColor: 0x555555 });
    this.popup = [bg, name, trade, duel, cancel];
    // Fixed on screen while the camera scrolls, drawn above the map.
    for (const object of this.popup) object.setScrollFactor(0).setDepth(20);
  }

  private showToast(message: string): void {
    this.toast?.destroy();
    const toast = this.add
      .text(this.scale.width / 2, 120, message, { fontFamily: "sans-serif", fontSize: "28px", color: "#ffce54", backgroundColor: "#1b1f3bcc", padding: { x: 16, y: 10 } })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(20);
    this.toast = toast;
    this.time.delayedCall(1600, () => toast.destroy());
  }

  /** A trade or duel invite (or a just-finished trade) is waiting: show it over the map. */
  private openInteractIfNeeded(): void {
    if (!this.scene.isActive()) return; // a menu is open; we'll be asked again when it closes
    if (!presence.trade && !presence.duel && !presence.received && !presence.interactNotice) return;
    this.closePopup();
    this.pendingPath = [];
    this.pendingMeet = undefined;
    const data: InteractSceneData = { content: this.content, save: this.save };
    this.scene.launch("Interact", data);
    this.scene.pause();
  }

  private hudButton(x: number, label: string, onTap: () => void): Phaser.GameObjects.Container {
    const button = createButton(this, x, 60, label, onTap, {
      width: 64,
      height: 64,
      fontSize: "28px",
      backgroundColor: 0x4a4e7a,
    });
    button.setScrollFactor(0).setDepth(10);
    return button;
  }

  private openSettings(): void {
    this.scene.launch("Settings");
    this.scene.pause();
  }

  private openMonsterbog(): void {
    const data: MonsterbogSceneData = { content: this.content, save: this.save, position: { ...this.playerTile } };
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
    if (multiplayerEnabled) presence.moveTo({ areaId: this.save.position.areaId, x: next.x, y: next.y });

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

        if (this.pendingPath.length === 0 && this.pendingMeet) {
          // Walked over to someone: offer the choice if they're still next to me.
          const target = presence.players.get(this.pendingMeet);
          this.pendingMeet = undefined;
          if (target && isAdjacent(this.myPosition(), target)) this.showMeeting(target);
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

    if (multiplayerEnabled) presence.setAway(true); // nobody can invite me during a wild battle
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
