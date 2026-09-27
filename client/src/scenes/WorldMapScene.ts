import Phaser from "phaser";
import { canEnterWorld, type LinkKind } from "@shared";
import type { SaveData } from "../save/schema";
import { allAreaMetas, worldConfig } from "../content/load-areas";
import { presence } from "../net/presence";
import { multiplayerEnabled } from "../net/lobby";
import { myLevel } from "../progress/record";
import { addCloseButton } from "../ui/Button";
import { getLayout, restartOnResize } from "../ui/layout";
import { ic, richText } from "../ui/rich-text";
import { addIcon } from "../gfx/icon-art";
import { addAvatar } from "../gfx/avatar-sprites";
import { addSeigaiha } from "../gfx/motifs";
import { t } from "../i18n/da";
import { C, CSS, FONT } from "../ui/theme";

export interface WorldMapSceneData {
  save: SaveData;
}

const LINK_ICONS: Record<LinkKind, string> = { boat: "boat", tunnel: "tunnel", bridge: "bridge" };

/**
 * The world map: every world as an island on the sea, joined by the ways between them —
 * row boats, tunnels, a bridge (each map's `links`). Worlds I've been to show their icon and
 * name; the others a "?" (and the level they open at, if I'm not there yet). My figure stands
 * on the world I'm in, and dots show where the rest of the family is. Opened from the
 * overview map; ✕ goes back.
 */
export class WorldMapScene extends Phaser.Scene {
  private mapData!: WorldMapSceneData;

  constructor() {
    super("WorldMap");
  }

  init(data: WorldMapSceneData): void {
    this.mapData = data;
  }

  create(): void {
    restartOnResize(this, this.mapData);
    const layout = getLayout(this);
    const { width, height, safe } = layout;
    const { save } = this.mapData;
    const overlay = this.add.rectangle(0, 0, width, height, C.overlay, 0.97).setOrigin(0, 0);
    overlay.setInteractive(); // taps stay here
    addSeigaiha(this, 0, 0, width, height, 0.1);
    const { headerH } = addCloseButton(this, () => this.close());
    richText(this, width / 2, safe.top + 10 + layout.touch(64) / 2, `${ic("globe")} ${t("world_map")}`, { fontFamily: FONT, fontSize: layout.font(36), color: CSS.text });

    const area = { x: safe.left + 24, y: headerH + 16, w: width - safe.left - safe.right - 48, h: height - headerH - safe.bottom - 40 };
    const at = (w: { x: number; y: number }) => ({ x: area.x + w.x * area.w, y: area.y + w.y * area.h });
    const r = Math.max(34, Math.min(area.w, area.h) * 0.11);
    const stats = save.progress?.stats ?? {};
    const home = worldConfig.worlds[0]?.id;
    const here = save.position.areaId;
    const visited = (id: string) => id === home || id === here || (stats[`world:${id}`] ?? 0) > 0;
    const level = myLevel();

    // The ways between them, each once, with how you travel it halfway along.
    const lines = this.add.graphics();
    const drawn = new Set<string>();
    for (const meta of allAreaMetas()) {
      for (const link of meta.links ?? []) {
        const key = [meta.id, link.to.areaId].sort().join("|") + link.kind;
        if (drawn.has(key)) continue;
        drawn.add(key);
        const a = worldConfig.worlds.find((w) => w.id === meta.id);
        const b = worldConfig.worlds.find((w) => w.id === link.to.areaId);
        if (!a || !b) continue;
        const pa = at(a);
        const pb = at(b);
        const known = visited(a.id) || visited(b.id);
        lines.lineStyle(6, C.border, known ? 0.8 : 0.3);
        // A dashed line: a trail across the sea.
        const steps = Math.floor(Math.hypot(pb.x - pa.x, pb.y - pa.y) / 18);
        for (let i = 0; i < steps; i += 2) {
          lines.lineBetween(pa.x + ((pb.x - pa.x) * i) / steps, pa.y + ((pb.y - pa.y) * i) / steps, pa.x + ((pb.x - pa.x) * (i + 1)) / steps, pa.y + ((pb.y - pa.y) * (i + 1)) / steps);
        }
        addIcon(this, (pa.x + pb.x) / 2, (pa.y + pb.y) / 2, LINK_ICONS[link.kind], r * 0.8).setAlpha(known ? 1 : 0.45);
      }
    }

    // Who of the family is where.
    const others = new Map<string, string[]>();
    if (multiplayerEnabled) for (const p of presence.players.values()) others.set(p.areaId, [...(others.get(p.areaId) ?? []), p.farve]);

    for (const w of worldConfig.worlds) {
      const p = at(w);
      const been = visited(w.id);
      const open = canEnterWorld(worldConfig, w.id, level);
      this.add.circle(p.x, p.y + r * 0.12, r * 1.05, C.shadow, 0.35);
      this.add.circle(p.x, p.y, r, been ? C.panelHi : C.panel).setStrokeStyle(4, w.id === here ? C.accent : C.border, been ? 1 : 0.5);
      if (been) addIcon(this, p.x, p.y, w.icon, r * 1.2);
      else this.add.text(p.x, p.y, "?", { fontFamily: FONT, fontSize: `${Math.round(r * 1.1)}px`, color: CSS.faint }).setOrigin(0.5);
      const label = been ? w.navn : open ? "" : `${ic("star")} ${w.minLevel}`;
      if (label) richText(this, p.x, p.y + r + layout.px(22), label, { fontFamily: FONT, fontSize: layout.font(24), color: been ? CSS.text : CSS.muted });
      if (w.id === here) addAvatar(this, p.x + r * 0.8, p.y - r * 0.8, save.player.avatarId, r * 0.8);
      (others.get(w.id) ?? []).slice(0, 6).forEach((farve, i) => {
        this.add.circle(p.x - r * 0.9 + i * r * 0.32, p.y + r * 0.95, r * 0.13, Phaser.Display.Color.HexStringToColor(farve).color).setStrokeStyle(2, C.overlay);
      });
    }
  }

  private close(): void {
    this.scene.stop();
    this.scene.resume("Overworld");
  }
}
