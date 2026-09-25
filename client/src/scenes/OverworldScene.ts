import Phaser from "phaser";
import { BAG_MAX, DIAGONAL_TIME_FACTOR, chooseStep, dragDirection, eatFood, isAdjacent, secondsLeft } from "@shared";
import type { CreatureInstance, CreatureSpecies, AreaMeta, LobbyPlayer, BossDefinition, DisasterMessage } from "@shared";
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
import { bossesById } from "../content/load-raid";
import type { RaidBattleUpdate } from "../net/presence";
import { DRAGON_ICON, SLEEP_ICON, REST_ICON, SCORES_ICON, TEAM_ICON, OWNED_ICON, DISASTER_ICONS, foodIcon } from "../ui/icons";
import { WorldLayer } from "../gfx/world-layer";
import { disasterConfigs } from "../content/load-disasters";
import { currentGame } from "../save/games";
import { t } from "../i18n/da";
import { createButton } from "../ui/Button";
import { getLayout, onRelayout } from "../ui/layout";
import { ic, richChip, richText } from "../ui/rich-text";
import { addIcon } from "../gfx/icon-art";
import { addAvatar } from "../gfx/avatar-sprites";
import { Minimap } from "../gfx/minimap";
import type { MinimapDot } from "../gfx/minimap";
import { C, CSS, FONT } from "../ui/theme";

export interface OverworldSceneData {
  save: SaveData;
  content: GameContent;
}

interface TileCoord {
  x: number;
  y: number;
}

const TILE_SIZE = 64;
/** `pendingMeet` for walking over to a waiting monster (the UFO's alien): this prefix + its spawn id. */
const SPAWN_MEET = "spawn:";
const MOVE_DURATION_MS = 200;
/** The connection button shows the state: others online, connecting, offline, code needed. */
const STATUS_ICON: Record<PresenceStatus, string> = { online: "team", connecting: "hourglass", offline: "offline", needCode: "key", off: "gear" };

/** How far (px) the finger must move from where it touched down before the player walks. */
const DRAG_DEAD_ZONE = 18;
/** The joystick drawn under the finger: base ring radius and how far the knob may travel. */
const STICK_RADIUS = 56;

/** `pendingMeet` value meaning "I'm walking over to the dragon". */
const DRAGON_MEET = "__dragon__";

/** How another player is drawn on the map. */
interface OtherView {
  circle: Phaser.GameObjects.Arc;
  /** Their chosen animal, on the circle. */
  face: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
}

/** The chosen animal drawn on a player's circle. */
function addFace(scene: Phaser.Scene, x: number, y: number, avatarId: string, depth: number): Phaser.GameObjects.Image {
  return addAvatar(scene, x, y, avatarId, TILE_SIZE * 0.62).setDepth(depth);
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
  private toast?: Phaser.GameObjects.Container;
  private statusButton?: Phaser.GameObjects.Container;
  private hud: Phaser.GameObjects.Container[] = [];
  /** The finger currently steering: where it touched down (screen px) and where it is now. */
  private drag?: { pointerId: number; ox: number; oy: number; x: number; y: number; moved: boolean };
  private stick?: Phaser.GameObjects.Graphics;
  /** The player has moved since the position was last saved. */
  private positionDirty = false;
  private foodSprites = new Map<string, Phaser.GameObjects.Image>();
  private bagChip?: Phaser.GameObjects.Container;
  /** The "passed out" panel (dizzy face, countdown, food to eat) while the player can't move. */
  private passOutUi: Array<Phaser.GameObjects.Text | Phaser.GameObjects.Rectangle | Phaser.GameObjects.Container | Phaser.GameObjects.Image> = [];
  private passOutTimer?: Phaser.Time.TimerEvent;
  private dragon?: { sprite: Phaser.GameObjects.Image; label?: Phaser.GameObjects.Container; tile: TileCoord };
  /** The dragon is in the air (its flight animation is running). */
  private dragonFlying = false;
  private dragonShadow?: Phaser.GameObjects.Ellipse;
  /** My chosen animal, riding on my circle. */
  private playerFace?: Phaser.GameObjects.Image;
  private minimap?: Minimap;
  /** What natural disasters did to this map, and warnings of the next one. */
  private world!: WorldLayer;

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
    // The map as natural disasters have left it (the last known state, until the server says more).
    this.world = new WorldLayer(this, this.map, groundLayer, grassLayer, TILE_SIZE, (id) => this.content.speciesById[id]?.spriteFront);
    this.world.apply(presence.terrain.get(area.meta.id));
    this.events.once("shutdown", () => this.world.destroy());

    // (0,0) sits inside the border wall, so it can never be a real position —
    // use it as the "no saved position yet" sentinel for this map. A saved spot that
    // is no longer walkable (the map was redrawn since) also falls back to the start.
    const saved = { x: this.save.position.x, y: this.save.position.y };
    const hasSaved = !(saved.x === 0 && saved.y === 0) && saved.x < this.map.width && saved.y < this.map.height;
    this.playerTile = hasSaved ? saved : { ...area.meta.playerStart };
    // A disaster (or a redrawn map) blocked where I stood: step to the nearest free tile.
    if (!this.isWalkable(this.playerTile.x, this.playerTile.y)) this.playerTile = this.nearestFree(this.playerTile);

    const colour = Phaser.Display.Color.HexStringToColor(this.save.player.farve).color;
    this.player = this.add.circle(
      this.playerTile.x * TILE_SIZE + TILE_SIZE / 2,
      this.playerTile.y * TILE_SIZE + TILE_SIZE / 2,
      TILE_SIZE * 0.3,
      colour
    );
    this.player.setDepth(6);
    this.playerFace = addFace(this, this.player.x, this.player.y, this.save.player.avatarId, 6.5);
    this.others.clear();
    this.popup = [];
    this.toast = undefined;
    this.pendingMeet = undefined;

    // The map is bigger than the screen: follow the player, never showing past the edge.
    const camera = this.cameras.main;
    camera.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
    camera.startFollow(this.player, true, 0.15, 0.15);

    // Walking is drag-to-steer: touch anywhere, drag, and the player keeps walking in
    // that direction (8 ways) until the finger lifts. A short tap is still a tap: on
    // another player or the dragon it opens the meeting choice (walking over if needed).
    this.drag = undefined;
    this.positionDirty = false;
    this.stick = this.add.graphics().setScrollFactor(0).setDepth(25);
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      // A UI button (e.g. the Monsterbog corner button) already handled this tap.
      if (this.input.hitTestPointer(pointer).length > 0) return;
      if (this.drag) return; // one steering finger at a time
      if (this.isPassedOut()) return; // can't move (or meet anyone) while passed out
      this.closePopup();
      this.pendingMeet = undefined;
      this.pendingPath = [];
      this.drag = { pointerId: pointer.id, ox: pointer.x, oy: pointer.y, x: pointer.x, y: pointer.y, moved: false };
    });
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      const drag = this.drag;
      if (!drag || pointer.id !== drag.pointerId) return;
      drag.x = pointer.x;
      drag.y = pointer.y;
      if (!drag.moved && dragDirection(drag.x - drag.ox, drag.y - drag.oy, DRAG_DEAD_ZONE)) drag.moved = true;
      if (drag.moved) {
        this.drawStick();
        this.stepFromDrag();
      }
    });
    const release = (pointer: Phaser.Input.Pointer) => {
      const drag = this.drag;
      if (!drag || pointer.id !== drag.pointerId) return;
      this.drag = undefined;
      this.stick?.clear();
      if (!drag.moved) return this.onTap(pointer);
      // The step under way finishes on its own; save if we are already standing still.
      if (!this.isMoving) this.savePosition();
    };
    this.input.on("pointerup", release);
    this.input.on("pointerupoutside", release);
    // Something opened over the map mid-drag (an invite, a menu): the lift would never reach us.
    const stopSteering = () => {
      this.drag = undefined;
      this.stick?.clear();
      if (!this.isMoving) this.savePosition();
    };
    this.events.on("pause", stopSteering);
    this.events.once("shutdown", () => this.events.off("pause", stopSteering));

    const minimapIds = area.meta.minimap ?? {};
    this.minimap = new Minimap(this, this.map, groundLayer, grassLayer, { ...minimapIds, tree: minimapIds.tree ?? area.meta.collisionGids }, `minimap-${area.meta.id}`);
    this.minimap.refresh(); // the map may have changed since the picture was last drawn

    this.buildHud();
    this.foodSprites.clear();
    this.bagChip = undefined;
    this.passOutUi = [];
    this.passOutTimer = undefined;
    // Rotating the phone: the camera resizes itself; the HUD, popups and the open map are laid out again.
    onRelayout(this, () => {
      this.closePopup();
      this.buildHud();
      this.minimap?.relayout();
      this.drawBag();
      if (this.isPassedOut()) this.showPassOut();
    });
    if (multiplayerEnabled) this.joinWorld();
    const onResumeRecovery = () => {
      this.drawBag();
      this.checkPassOut();
    };
    this.events.on("resume", onResumeRecovery);
    this.events.once("shutdown", () => this.events.off("resume", onResumeRecovery));
    this.drawBag();
    this.checkPassOut();
  }

  // ------------------------------------------------------------ passing out and food

  private isPassedOut(): boolean {
    return secondsLeft(this.save.passedOutUntil, new Date()) > 0;
  }

  /** Shows the passed-out panel if the wait isn't over; clears a finished one. */
  private checkPassOut(): void {
    if (this.isPassedOut()) return this.showPassOut();
    if (this.save.passedOutUntil) this.recover();
  }

  /**
   * A dizzy face and a countdown over the map; one button per piece of food in the bag, each
   * taking FOOD_SECONDS off. The player can't move or meet anyone meanwhile, and
   * other players can't invite them.
   */
  private showPassOut(): void {
    this.clearPassOutUi();
    this.closePopup();
    this.drag = undefined;
    this.stick?.clear();
    this.pendingPath = [];
    this.player.setAlpha(0.45);
    if (multiplayerEnabled) presence.setAway(true);

    const layout = getLayout(this);
    const bag = this.save.bag;
    const buttonSize = layout.touch(72);
    const gap = layout.px(12);
    const panelW = Math.min(layout.width - 24, Math.max(layout.px(300), bag.length * (buttonSize + gap) + gap + layout.px(40)));
    const panelH = layout.px(150) + (bag.length ? buttonSize + layout.px(20) : 0);
    const cx = layout.width / 2;
    const cy = layout.height - layout.safe.bottom - layout.px(20) - panelH / 2;
    const bg = this.add.rectangle(cx, cy, panelW, panelH, C.background, 0.94).setStrokeStyle(4, C.border);
    const rowY = cy - panelH / 2 + layout.px(70);
    const face = addIcon(this, cx - layout.px(90), rowY, "faint", Math.max(56, layout.px(80)));
    const glass = addIcon(this, cx + layout.px(10), rowY, "hourglass", Math.max(40, layout.px(56)));
    const count = this.add.text(cx + layout.px(48), rowY, "", { fontFamily: FONT, fontSize: layout.font(48), color: CSS.accent }).setOrigin(0, 0.5);
    const rowW = bag.length * buttonSize + (bag.length - 1) * gap;
    const foods = bag.map((kind, i) =>
      createButton(this, cx - rowW / 2 + buttonSize / 2 + i * (buttonSize + gap), cy + panelH / 2 - layout.px(16) - buttonSize / 2, ic(foodIcon(kind)), () => this.eat(i), {
        width: buttonSize,
        height: buttonSize,
        fontSize: `${Math.round(buttonSize * 0.5)}px`,
        backgroundColor: C.ok,
      })
    );
    this.passOutUi = [bg, face, glass, count, ...foods];
    for (const o of this.passOutUi) o.setScrollFactor(0).setDepth(22);

    const tick = () => {
      const left = secondsLeft(this.save.passedOutUntil, new Date());
      if (left <= 0) return this.recover();
      count.setText(String(left));
    };
    tick();
    this.passOutTimer = this.time.addEvent({ delay: 250, loop: true, callback: tick });
  }

  private eat(index: number): void {
    const until = this.save.passedOutUntil;
    if (!until || !this.save.bag[index]) return;
    this.save.bag.splice(index, 1);
    const next = eatFood(until, new Date());
    if (next) this.save.passedOutUntil = next;
    else delete this.save.passedOutUntil;
    void persist();
    this.drawBag();
    if (next) this.showPassOut();
    else this.recover();
  }

  /** Back on its feet: the panel goes, the player can move and be invited again. */
  private recover(): void {
    this.clearPassOutUi();
    this.player.setAlpha(1);
    if (this.save.passedOutUntil) {
      delete this.save.passedOutUntil;
      void persist();
    }
    if (multiplayerEnabled) presence.setAway(false);
  }

  private clearPassOutUi(): void {
    this.passOutTimer?.remove();
    this.passOutTimer = undefined;
    for (const o of this.passOutUi) o.destroy();
    this.passOutUi = [];
  }

  /** The bag (a furoshiki) and the food in it, top-left, while there is any. */
  private drawBag(): void {
    this.bagChip?.destroy();
    this.bagChip = undefined;
    if (this.save.bag.length === 0) return;
    const layout = getLayout(this);
    const content = `${ic(OWNED_ICON)} ${this.save.bag.map((kind) => ic(foodIcon(kind))).join("")}`;
    this.bagChip = richChip(this, layout.safe.left + 14, layout.safe.top + 14, content, { fontFamily: FONT, fontSize: layout.font(24), color: CSS.text }, 0, 0)
      .setScrollFactor(0)
      .setDepth(10);
  }

  /** Food lying on this map, drawn where it grows (shared with everyone on the server). */
  private syncFood(): void {
    const here = presence.food.filter((f) => f.areaId === this.save.position.areaId);
    const wanted = new Set(here.map((f) => f.id));
    for (const [id, sprite] of this.foodSprites) {
      if (!wanted.has(id)) {
        sprite.destroy();
        this.foodSprites.delete(id);
      }
    }
    for (const f of here) {
      if (this.foodSprites.has(f.id)) continue;
      const c = this.tileCentre(f);
      this.foodSprites.set(f.id, addIcon(this, c.x, c.y, foodIcon(f.kind), 40).setDepth(3));
    }
  }

  /** Stepped onto food: ask the server for it (it may already be gone), if the bag has room. */
  private pickUpFood(tile: TileCoord): void {
    if (!multiplayerEnabled || this.save.bag.length >= BAG_MAX) return;
    const item = presence.food.find((f) => f.areaId === this.save.position.areaId && f.x === tile.x && f.y === tile.y);
    if (item) presence.send("foodTake", { foodId: item.id });
  }

  /** A tap (no drag): on another player or the dragon, meet them; on the ground, nothing. */
  private onTap(pointer: Phaser.Input.Pointer): void {
    const tile: TileCoord = { x: Math.floor(pointer.worldX / TILE_SIZE), y: Math.floor(pointer.worldY / TILE_SIZE) };
    const tapped = this.playerAt(tile);
    if (tapped) return this.onTapPlayer(tapped);
    const boss = this.visibleBoss();
    if (boss && tile.x === boss.lair.x && tile.y === boss.lair.y) return this.onTapDragon(boss);
    const spawn = this.world.spawnAt(tile.x, tile.y);
    if (spawn) this.onTapSpawn(spawn.id, tile);
  }

  /** Starts the next step in the direction the finger points, unless one is already under way. */
  private stepFromDrag(): void {
    const drag = this.drag;
    if (!drag?.moved || this.isMoving) return;
    const vx = drag.x - drag.ox;
    const vy = drag.y - drag.oy;
    const direction = dragDirection(vx, vy, DRAG_DEAD_ZONE);
    if (!direction) return;
    const step = chooseStep(this.playerTile, direction, vx, vy, (x, y) => this.isWalkable(x, y));
    if (!step) return; // walking into a wall: wait until the finger points somewhere free
    this.pendingPath = [{ x: this.playerTile.x + step.dx, y: this.playerTile.y + step.dy }];
    this.advancePath();
  }

  /** The joystick under the finger: a ring where it touched down and a knob that follows (up to the ring's edge). */
  private drawStick(): void {
    const drag = this.drag;
    if (!drag || !this.stick) return;
    const vx = drag.x - drag.ox;
    const vy = drag.y - drag.oy;
    const length = Math.hypot(vx, vy);
    const k = length > STICK_RADIUS ? STICK_RADIUS / length : 1;
    this.stick
      .clear()
      .fillStyle(C.border, 0.18)
      .fillCircle(drag.ox, drag.oy, STICK_RADIUS)
      .lineStyle(3, C.border, 0.5)
      .strokeCircle(drag.ox, drag.oy, STICK_RADIUS)
      .fillStyle(C.border, 0.55)
      .fillCircle(drag.ox + vx * k, drag.oy + vy * k, STICK_RADIUS * 0.45);
  }

  /** Saves where the player stands (only when they stop, not on every step). */
  private savePosition(): void {
    if (!this.positionDirty) return;
    this.positionDirty = false;
    this.save.position.x = this.playerTile.x;
    this.save.position.y = this.playerTile.y;
    void persist();
  }

  /** The row of buttons in the top-right corner, fixed on screen while the camera scrolls. */
  private buildHud(): void {
    for (const button of this.hud) button.destroy();
    const layout = getLayout(this);
    const size = layout.touch(64);
    const gap = layout.px(14);
    const y = layout.safe.top + gap + size / 2;
    let x = layout.width - layout.safe.right - gap - size / 2;
    const add = (label: string, onTap: () => void) => {
      const button = this.hudButton(x, y, size, label, onTap);
      x -= size + gap;
      this.hud.push(button);
      return button;
    };
    this.hud = [];
    add(ic("book"), () => this.openMonsterbog());
    if (multiplayerEnabled) {
      this.statusButton = add(ic(STATUS_ICON[presence.status]), () => this.openSettings());
      add(ic(SCORES_ICON), () => this.openOverlay("Scoreboard"));
    }
    add(ic("map"), () => {
      this.closePopup();
      this.minimap?.open();
    });
  }

  update(): void {
    // The animal follows my circle (which walks by tween) and fades with it when passed out.
    this.playerFace?.setPosition(this.player.x, this.player.y).setAlpha(this.player.alpha);
    if (!this.minimap?.isOpen) return;
    const dots: MinimapDot[] = this.visibleOthers().map((p) => ({
      x: p.x,
      y: p.y,
      colour: Phaser.Display.Color.HexStringToColor(p.farve).color,
      dim: p.busy || p.away,
    }));
    const boss = this.visibleBoss();
    if (boss) dots.push({ x: boss.lair.x, y: boss.lair.y, colour: 0, kind: "dragon", dim: presence.raid?.defeated });
    // My dot follows the sprite while it walks, not just the tile it left.
    dots.push({
      x: (this.player.x - TILE_SIZE / 2) / TILE_SIZE,
      y: (this.player.y - TILE_SIZE / 2) / TILE_SIZE,
      colour: Phaser.Display.Color.HexStringToColor(this.save.player.farve).color,
      kind: "me",
    });
    this.minimap.draw(dots, this.cameras.main.worldView, TILE_SIZE);
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
      void status;
      this.buildHud(); // the connection button's icon shows the new state
    };
    const onProblem = (reason: string) => {
      if (reason === "too far away") this.showToast(t("meet_far"));
      else if (reason === "player is busy") this.showToast(t("meet_busy"));
      else if (reason === "dragon sleeping") this.showToast(`${ic(SLEEP_ICON)} ${t("raid_sleeping")}`);
      else if (reason === "dragon flying") this.showToast(`${ic(DRAGON_ICON)} ${t("raid_flies")}`);
      else if (reason === "resting") this.showToast(`${ic(REST_ICON)} ${t("raid_resting")}`);
      else if (reason === "a team is already at the dragon" || reason === "team is full" || reason === "team has already started") this.showToast(`${ic(TEAM_ICON)} ${t("meet_busy")}`);
    };
    const onRaid = () => this.syncDragon();
    const onFood = () => this.syncFood();
    const onTerrain = (areaId: string) => {
      if (areaId === this.save.position.areaId) this.applyTerrain();
    };
    const onDisaster = (message: DisasterMessage | undefined) => this.onDisaster(message);
    const onStruck = () => {
      this.pendingPath = [];
      this.pendingMeet = undefined;
      this.drag = undefined;
      this.stick?.clear();
      this.checkPassOut();
    };
    const onSpawnBattle = ({ spawnId, speciesId }: { spawnId: string; speciesId: string }) => this.startSpawnBattle(spawnId, speciesId);
    presence.events.on("terrain", onTerrain);
    presence.events.on("disaster", onDisaster);
    presence.events.on("struck", onStruck);
    presence.events.on("spawnBattle", onSpawnBattle);
    const onDragonFlight = (flight: Parameters<OverworldScene["onDragonFlight"]>[0]) => this.onDragonFlight(flight);
    presence.events.on("dragonFlight", onDragonFlight);
    const onFoodTaken = (kind: string) => {
      this.drawBag();
      this.showToast(`+ ${ic(foodIcon(kind))}`);
    };
    presence.events.on("food", onFood);
    presence.events.on("foodTaken", onFoodTaken);
    const onRaidBattle = (update: RaidBattleUpdate) => this.startRaidBattle(update);
    presence.events.on("raid", onRaid);
    presence.events.on("raidBattle", onRaidBattle);
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
      presence.events.off("raid", onRaid);
      presence.events.off("food", onFood);
      presence.events.off("foodTaken", onFoodTaken);
      presence.events.off("raidBattle", onRaidBattle);
      presence.events.off("terrain", onTerrain);
      presence.events.off("disaster", onDisaster);
      presence.events.off("struck", onStruck);
      presence.events.off("spawnBattle", onSpawnBattle);
      presence.events.off("dragonFlight", onDragonFlight);
    });
    if (presence.disaster) this.onDisaster(presence.disaster);
    this.showNews();
    this.dragon = undefined;
    this.dragonFlying = false;
    this.dragonShadow = undefined;
    this.syncDragon();
    this.syncFood();
    // Coming back from a menu or a battle (onResume): show anyone who moved meanwhile, and anything waiting for me.
    this.syncOthers(true);
  }

  // ------------------------------------------------------------ natural disasters

  /** The server says the map changed: redraw it, and step off a tile that is now blocked. */
  private applyTerrain(): void {
    if (this.world.apply(presence.terrain.get(this.save.position.areaId))) this.minimap?.refresh();
    this.ensureFreeTile();
    this.showNews();
  }

  /** A warning (the danger glows, run!), or the strike itself. */
  private onDisaster(message: DisasterMessage | undefined): void {
    if (!message || message.areaId !== this.save.position.areaId) return this.world.clearWarning();
    this.markSeen(message.id); // seen live, so no "while you were away" note for it later
    if (message.phase === "warning") {
      this.world.showWarning(message);
      const here = `${this.playerTile.x},${this.playerTile.y}`;
      const name = disasterConfigs[message.kind].navn;
      this.showToast(message.danger.includes(here) ? `${ic(DISASTER_ICONS[message.kind])} ${t("disaster_run")}` : `${ic(DISASTER_ICONS[message.kind])} ${name}!`, 4000);
    } else {
      this.world.strike(message);
    }
  }

  /** "While you were away": the newest disaster of the last day this device hasn't shown yet. */
  private showNews(): void {
    const recent = presence.recent.get(this.save.position.areaId) ?? [];
    const unseen = recent.filter((n) => this.markSeen(n.id));
    const newest = unseen[0];
    if (newest) this.showToast(`${ic(DISASTER_ICONS[newest.kind])} ${disasterConfigs[newest.kind].navn}!`, 4000);
  }

  /** Remembers (per game, on this device) that a disaster has been shown. True if it wasn't before. */
  private markSeen(id: string): boolean {
    const key = `monsterjagt-set-${currentGame()?.id ?? ""}`;
    try {
      const seen: string[] = JSON.parse(localStorage.getItem(key) ?? "[]");
      if (seen.includes(id)) return false;
      localStorage.setItem(key, JSON.stringify([id, ...seen].slice(0, 40)));
      return true;
    } catch {
      return false;
    }
  }

  /** The nearest tile I can stand on (breadth-first from `from`). */
  private nearestFree(from: TileCoord): TileCoord {
    const seen = new Set([`${from.x},${from.y}`]);
    const queue = [from];
    while (queue.length) {
      const c = queue.shift()!;
      if (this.isWalkable(c.x, c.y)) return c;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const n = { x: c.x + dx, y: c.y + dy };
        const k = `${n.x},${n.y}`;
        if (n.x < 0 || n.y < 0 || n.x >= this.map.width || n.y >= this.map.height || seen.has(k)) continue;
        seen.add(k);
        queue.push(n);
      }
    }
    return { ...this.areaMeta.playerStart };
  }

  /** Tapped the UFO's alien: battle it if I'm next to it (the server says who's first), else walk over. */
  private onTapSpawn(spawnId: string, tile: TileCoord): void {
    if (!presence.connectedRoom) return;
    if (isAdjacent(this.myPosition(), { areaId: this.save.position.areaId, ...tile })) return presence.send("spawnClaim", { spawnId });
    this.walkNextTo(tile, SPAWN_MEET + spawnId);
  }

  private startSpawnBattle(spawnId: string, speciesId: string): void {
    const species = this.content.speciesById[speciesId];
    if (!this.scene.isActive() || !species) {
      presence.send("spawnDone", { spawnId, caught: false });
      return;
    }
    this.startWildBattle(species, spawnId);
  }

  // ------------------------------------------------------------ the family dragon

  /**
   * The boss whose perch is on this map, while the server runs the raid (protocol v4). Its
   * `lair` is where it sits right now: a v10 server moves it about, an older one never does.
   */
  private visibleBoss(): BossDefinition | undefined {
    if (!presence.raidSupported || !presence.raid) return undefined;
    const boss = bossesById[presence.raid.bossId];
    if (!boss) return undefined;
    const lair = presence.raid.lair ?? boss.lair;
    return lair.areaId === this.save.position.areaId ? { ...boss, lair } : undefined;
  }

  /** Draws (or removes) the dragon at its lair, with its shared HP — or 💤 once the family has beaten it. */
  private syncDragon(): void {
    const boss = this.visibleBoss();
    if (!boss) {
      this.dragon?.sprite.destroy();
      this.dragon?.label?.destroy();
      this.dragon = undefined;
      return;
    }
    const raid = presence.raid!;
    const centre = this.tileCentre(boss.lair);
    if (!this.dragon) {
      this.dragon = { sprite: this.add.image(centre.x, centre.y - 8, boss.spriteFront).setScale(0.9).setDepth(5), tile: { x: boss.lair.x, y: boss.lair.y } };
    } else if (!this.dragonFlying && (this.dragon.tile.x !== boss.lair.x || this.dragon.tile.y !== boss.lair.y)) {
      // It sits somewhere else now and we didn't see it fly (we were in a menu, or just connected): it is simply there.
      this.dragon.sprite.setPosition(centre.x, centre.y - 8);
      this.dragon.tile = { x: boss.lair.x, y: boss.lair.y };
      this.ensureFreeTile();
    }
    this.dragon.sprite.setAlpha(raid.defeated ? 0.45 : 1);
    this.dragon.label?.destroy();
    this.dragon.label = undefined;
    if (this.dragonFlying) return; // no HP label on something in the air
    const label = raid.defeated ? ic(SLEEP_ICON) : `${ic("heart")} ${raid.hp}/${raid.maxHp}`;
    this.dragon.label = richChip(this, centre.x, centre.y - TILE_SIZE * 0.98, label, { fontFamily: FONT, fontSize: "18px", color: CSS.text }).setDepth(7);
  }

  /**
   * The dragon takes off and lands on a new perch: it rises with a shadow on the ground,
   * flies over in an arc and lands with a small shake. (The raid view with the new lair
   * follows at once; while flying, syncDragon leaves the sprite alone.)
   */
  private onDragonFlight({ from, to, ms }: { from: { areaId: string; x: number; y: number }; to: { areaId: string; x: number; y: number }; ms: number }): void {
    const here = this.save.position.areaId;
    if (from.areaId !== here && to.areaId !== here) return;
    if (from.areaId === here && to.areaId === here) this.showToast(`${ic(DRAGON_ICON)} ${t("raid_flies")}`, 4000);
    if (!this.dragon || from.areaId !== here || to.areaId !== here) return; // nothing to animate: syncDragon places it
    const dragon = this.dragon;
    const a = this.tileCentre(from);
    const b = this.tileCentre(to);
    this.dragonFlying = true;
    dragon.label?.destroy();
    dragon.label = undefined;
    dragon.sprite.setDepth(9).setPosition(a.x, a.y - 8);
    this.dragonShadow?.destroy();
    const shadow = this.add.ellipse(a.x, a.y + 20, 74, 26, 0x000000, 0.35).setDepth(4);
    this.dragonShadow = shadow;
    const flight = { t: 0 };
    this.tweens.add({
      targets: flight,
      t: 1,
      duration: ms,
      ease: "Sine.inOut",
      onUpdate: () => {
        const arc = Math.sin(Math.PI * flight.t);
        const x = a.x + (b.x - a.x) * flight.t;
        const y = a.y + (b.y - a.y) * flight.t;
        dragon.sprite.setPosition(x, y - 8 - arc * TILE_SIZE * 2.4).setScale(0.9 * (1 + 0.4 * arc));
        shadow.setPosition(x, y + 20).setScale(1 - 0.4 * arc).setAlpha(0.35 - 0.15 * arc);
      },
      onComplete: () => {
        shadow.destroy();
        if (this.dragonShadow === shadow) this.dragonShadow = undefined;
        this.dragonFlying = false;
        dragon.sprite.setDepth(5).setScale(0.9).setPosition(b.x, b.y - 8);
        dragon.tile = { x: to.x, y: to.y };
        // A shake if it lands close by.
        if (Math.hypot(this.playerTile.x - to.x, this.playerTile.y - to.y) < 12) this.cameras.main.shake(350, 0.007);
        this.syncDragon();
        this.ensureFreeTile();
      },
    });
  }

  /** Steps off a tile that is blocked now (something landed on it) to the nearest free one. */
  private ensureFreeTile(): void {
    if (this.isMoving || this.isWalkable(this.playerTile.x, this.playerTile.y)) return;
    this.playerTile = this.nearestFree(this.playerTile);
    const c = this.tileCentre(this.playerTile);
    this.player.setPosition(c.x, c.y);
    this.positionDirty = true;
    this.savePosition();
    if (multiplayerEnabled) presence.moveTo(this.myPosition());
  }

  private onTapDragon(boss: BossDefinition): void {
    const raid = presence.raid;
    if (!raid) return;
    if (this.dragonFlying) return this.showToast(`${ic(DRAGON_ICON)} ${t("raid_flies")}`);
    if (raid.defeated) return this.showToast(`${ic(SLEEP_ICON)} ${t("raid_sleeping")}`);
    if (presence.restUntil > Date.now()) return this.showToast(`${ic(REST_ICON)} ${t("raid_resting")}`);
    if (isAdjacent(this.myPosition(), boss.lair)) return this.showDragonChoice(boss);
    this.walkNextTo(boss.lair, DRAGON_MEET);
  }

  /**
   * At the dragon: ⚔️ fights alone, 👥 gathers a team others can join. If someone is
   * already gathering one, ✓ joins it instead.
   */
  private showDragonChoice(boss: BossDefinition): void {
    const raid = presence.raid;
    const seat = () => seatFor(this.save, this.content);
    const gathering = presence.teamSupported ? raid?.gathering : undefined;
    if (gathering && gathering.leaderId !== this.save.player.id) {
      const leader = presence.players.get(gathering.leaderId)?.navn ?? "?";
      this.showPopup(`${ic(TEAM_ICON)} ${leader} +${gathering.size - 1}`, [
        { label: "✓", colour: C.ok, onTap: () => presence.send("teamJoin", { teamId: gathering.teamId, seat: seat() }) },
        { label: "✗", colour: C.buttonQuiet, onTap: () => {} },
      ]);
      return;
    }
    const buttons = [{ label: ic("sword"), colour: C.danger, onTap: () => presence.send("raidStart", { seat: seat() }) }];
    // "Fight together" — not just 👥, which is also the connection button in the top row.
    if (presence.teamSupported && !gathering) buttons.push({ label: `${ic(TEAM_ICON)}${ic("sword")}`, colour: C.button, onTap: () => presence.send("teamCreate", { seat: seat() }) });
    buttons.push({ label: "✗", colour: C.buttonQuiet, onTap: () => {} });
    this.showPopup(`${ic(DRAGON_ICON)} ${boss.navn}  ${ic("heart")} ${raid?.hp ?? "?"}`, buttons);
  }

  /** The server accepted my attack: the battle takes over the screen until the attempt ends. */
  private startRaidBattle(update: RaidBattleUpdate): void {
    if (!this.scene.isActive() || update.over || update.battle.outcome !== "ongoing") return;
    this.closePopup();
    this.pendingPath = [];
    const data: BattleSceneData = { save: this.save, content: this.content, raid: { battle: update.battle, myId: this.save.player.id } };
    this.scene.start("Battle", data);
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
        view.face.destroy();
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
          face: addFace(this, centre.x, centre.y, player.avatarId, 4.5),
          label: this.add
            .text(centre.x, centre.y - TILE_SIZE * 0.55, player.navn, {
              fontFamily: FONT,
              fontSize: "18px",
              color: CSS.text,
              stroke: CSS.ink,
              strokeThickness: 4,
            })
            .setOrigin(0.5)
            .setDepth(7),
        };
        this.others.set(player.playerId, view);
      } else if (snap) {
        this.tweens.killTweensOf([view.circle, view.face, view.label]);
        view.circle.setPosition(centre.x, centre.y);
        view.face.setPosition(centre.x, centre.y);
        view.label.setPosition(centre.x, centre.y - TILE_SIZE * 0.55);
      }
      const dim = player.busy || player.away ? 0.4 : 1;
      view.circle.setAlpha(dim);
      view.face.setAlpha(dim);
      view.label.setAlpha(dim);
    }
  }

  private moveOther(playerId: string): void {
    const player = presence.players.get(playerId);
    const view = this.others.get(playerId);
    if (!player || !view) return this.syncOthers();
    const centre = this.tileCentre(player);
    this.tweens.add({ targets: [view.circle, view.face], x: centre.x, y: centre.y, duration: MOVE_DURATION_MS });
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
    this.walkNextTo(player, player.playerId);
  }

  /** Walks to the nearest free tile touching `target`; `meet` says what to offer on arrival (a playerId or DRAGON_MEET). */
  private walkNextTo(target: TileCoord, meet: string): void {
    let best: TileCoord[] | undefined;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const path = this.findPath(this.playerTile, { x: target.x + dx, y: target.y + dy });
        if (path.length > 0 && (!best || path.length < best.length)) best = path;
      }
    }
    if (!best) return;
    this.pendingMeet = meet;
    this.pendingPath = best;
    this.advancePath();
  }

  private closePopup(): void {
    for (const object of this.popup) object.destroy();
    this.popup = [];
  }

  /** Small 🤝 / ⚔️ / ✗ choice, fixed on screen, for the player I'm standing next to. */
  private showMeeting(player: LobbyPlayer): void {
    this.showPopup(player.navn, [
      { label: ic("trade"), colour: C.ok, onTap: () => presence.send("invite", { toPlayerId: player.playerId }) },
      { label: ic("sword"), colour: C.danger, onTap: () => presence.send("duelInvite", { toPlayerId: player.playerId, seat: seatFor(this.save, this.content) }) },
      { label: "✗", colour: C.buttonQuiet, onTap: () => {} },
    ]);
  }

  /**
   * A small panel at the bottom of the screen with a title and a row of big buttons
   * (any of them closes it). Sized for the screen, above the iPhone home indicator.
   */
  private showPopup(title: string, buttons: Array<{ label: string; colour: number; onTap: () => void }>): void {
    this.closePopup();
    const layout = getLayout(this);
    const gap = layout.px(18);
    const buttonH = layout.touch(72);
    const buttonW = Math.min(layout.px(150), (layout.width - 40 - gap * (buttons.length + 1)) / buttons.length);
    const panelW = Math.min(layout.width - 24, buttons.length * buttonW + (buttons.length + 1) * gap + layout.px(40));
    const panelH = buttonH + layout.px(110);
    const cx = layout.width / 2;
    const cy = layout.height - layout.safe.bottom - layout.px(16) - panelH / 2;
    const bg = this.add.rectangle(cx, cy, panelW, panelH, C.background, 0.95).setStrokeStyle(4, C.border);
    const name = richText(this, cx, cy - panelH / 2 + layout.px(40), title, { fontFamily: FONT, fontSize: layout.font(30), color: CSS.text });
    const rowW = buttons.length * buttonW + (buttons.length - 1) * gap;
    const made = buttons.map((b, i) =>
      createButton(this, cx - rowW / 2 + buttonW / 2 + i * (buttonW + gap), cy + panelH / 2 - layout.px(24) - buttonH / 2, b.label, () => {
        this.closePopup();
        b.onTap();
      }, { width: buttonW, height: buttonH, fontSize: layout.font(36), backgroundColor: b.colour })
    );
    this.popup = [bg, name, ...made];
    // Fixed on screen while the camera scrolls, drawn above the map.
    for (const object of this.popup) object.setScrollFactor(0).setDepth(20);
  }

  private showToast(message: string, ms = 1600): void {
    this.toast?.destroy();
    const layout = getLayout(this);
    const toast = richChip(this, this.scale.width / 2, layout.safe.top + layout.touch(64) + 60, message, { fontFamily: FONT, fontSize: layout.font(28), color: CSS.accent })
      .setScrollFactor(0)
      .setDepth(20);
    this.toast = toast;
    this.time.delayedCall(ms, () => toast.destroy());
  }


  /** A trade or duel invite (or a just-finished trade) is waiting: show it over the map. */
  private openInteractIfNeeded(): void {
    if (!this.scene.isActive()) return; // a menu is open; we'll be asked again when it closes
    const gathering = presence.team?.phase === "gathering";
    if (!presence.trade && !presence.duel && !presence.received && !presence.interactNotice && !gathering) return;
    this.closePopup();
    this.pendingPath = [];
    this.pendingMeet = undefined;
    const data: InteractSceneData = { content: this.content, save: this.save };
    this.scene.launch("Interact", data);
    this.scene.pause();
  }

  private hudButton(x: number, y: number, size: number, label: string, onTap: () => void): Phaser.GameObjects.Container {
    const button = createButton(this, x, y, label, onTap, {
      width: size,
      height: size,
      fontSize: `${Math.round(size * 0.44)}px`,
      backgroundColor: C.button,
    });
    button.setScrollFactor(0).setDepth(10);
    return button;
  }

  private openSettings(): void {
    this.openOverlay("Settings");
  }

  private openOverlay(key: string): void {
    this.closePopup();
    this.scene.launch(key);
    this.scene.pause();
  }

  private openMonsterbog(): void {
    const data: MonsterbogSceneData = { content: this.content, save: this.save, position: { ...this.playerTile } };
    this.scene.launch("Monsterbog", data);
    this.scene.pause();
  }

  private isWalkable(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.map.width || y >= this.map.height) return false;
    const boss = this.dragon ? this.visibleBoss() : undefined;
    if (boss && boss.lair.x === x && boss.lair.y === y) return false; // nobody walks through the dragon
    if (this.world?.spawnAt(x, y)) return false; // nor through the UFO's alien
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
    const diagonal = next.x !== this.playerTile.x && next.y !== this.playerTile.y;

    this.tweens.add({
      targets: this.player,
      x: next.x * TILE_SIZE + TILE_SIZE / 2,
      y: next.y * TILE_SIZE + TILE_SIZE / 2,
      // Same walking speed either way, so a diagonal (√2 tiles) takes longer.
      duration: MOVE_DURATION_MS * (diagonal ? DIAGONAL_TIME_FACTOR : 1),
      onComplete: () => {
        this.playerTile = next;
        this.isMoving = false;
        this.positionDirty = true;
        this.pickUpFood(next);

        if (this.isEncounterTile(next.x, next.y) && this.rollEncounter()) {
          this.pendingPath = [];
          this.drag = undefined;
          return;
        }

        // Still steering: keep walking in the finger's current direction.
        if (this.pendingPath.length === 0 && this.drag?.moved) return this.stepFromDrag();
        if (this.pendingPath.length === 0) this.savePosition();

        if (this.pendingPath.length === 0 && this.pendingMeet) {
          // Walked over to someone (or to the dragon): offer the choice if they're still next to me.
          const meet = this.pendingMeet;
          this.pendingMeet = undefined;
          const boss = this.visibleBoss();
          if (meet === DRAGON_MEET) {
            if (boss && isAdjacent(this.myPosition(), boss.lair)) this.onTapDragon(boss);
          } else if (meet.startsWith(SPAWN_MEET)) {
            const spawnId = meet.slice(SPAWN_MEET.length);
            const spawn = presence.terrain.get(this.save.position.areaId)?.spawns.find((s) => s.id === spawnId);
            if (spawn && isAdjacent(this.myPosition(), { areaId: this.save.position.areaId, x: spawn.x, y: spawn.y })) presence.send("spawnClaim", { spawnId });
          } else {
            const target = presence.players.get(meet);
            if (target && isAdjacent(this.myPosition(), target)) this.showMeeting(target);
          }
        }

        this.advancePath();
      },
    });
  }

  /** Tall grass, or a place where a disaster left rare monsters for a while. */
  private isEncounterTile(x: number, y: number): boolean {
    return !!this.grassLayer.getTileAt(x, y) || Boolean(this.world.zoneAt(x, y));
  }

  /** Returns true (and starts a battle) if the roll triggers a wild encounter. */
  private rollEncounter(): boolean {
    const zone = this.world.zoneAt(this.playerTile.x, this.playerTile.y);
    // In a disaster's zone its rare monster turns up (at the zone's own rate); tall grass there still has its usual ones.
    const inGrass = !!this.grassLayer.getTileAt(this.playerTile.x, this.playerTile.y);
    let speciesId: string | undefined;
    if (zone && Math.random() < zone.rate) speciesId = zone.speciesId;
    else if (inGrass && Math.random() <= this.areaMeta.encounterRate) speciesId = pickWeightedSpecies(this.areaMeta.encounterTable);
    const species = speciesId ? this.content.speciesById[speciesId] : undefined;
    if (!species) return false;
    this.startWildBattle(species);
    return true;
  }

  /** A wild battle — `spawnId` when it's a single waiting monster (the UFO's alien), so the server hears how it went. */
  private startWildBattle(species: CreatureSpecies, spawnId?: string): void {
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

    this.savePosition(); // the battle replaces this scene; come back to where it started
    if (multiplayerEnabled) presence.setAway(true); // nobody can invite me during a wild battle
    const data: BattleSceneData = {
      save: this.save,
      content: this.content,
      wildInstance,
      wildSpecies: species,
      ...(spawnId ? { spawnId } : {}),
    };
    this.closePopup();
    this.pendingPath = [];
    this.scene.start("Battle", data);
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
