/** A tile position on a map. */
export interface Tile {
  x: number;
  y: number;
}

/** Where the nearest place to find something is, seen from a tile. */
export interface SpotHint {
  /** Walking steps if nothing were in the way (|dx| + |dy|); 0 means you are standing in it. */
  distance: number;
  dx: number;
  dy: number;
  /** An emoji arrow pointing the way, or 📍 when you are already there. */
  arrow: string;
}

// Index 0 = east, going clockwise on a map where y grows downwards.
const ARROWS = ["➡️", "↘️", "⬇️", "↙️", "⬅️", "↖️", "⬆️", "↗️"];

export function arrowFor(dx: number, dy: number): string {
  if (dx === 0 && dy === 0) return "📍";
  const octant = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  return ARROWS[((octant % 8) + 8) % 8]!;
}

/** The tiles of a Tiled layer that are painted (non-zero), given its flat `data` array and `width`. */
export function paintedTiles(data: readonly number[], width: number): Tile[] {
  const tiles: Tile[] = [];
  data.forEach((gid, i) => {
    if (gid !== 0) tiles.push({ x: i % width, y: Math.floor(i / width) });
  });
  return tiles;
}

/** The closest of `spots` to `from`, or undefined if there are none. Ties keep the first found. */
export function nearestSpot(from: Tile, spots: Iterable<Tile>): SpotHint | undefined {
  let best: SpotHint | undefined;
  for (const spot of spots) {
    const dx = spot.x - from.x;
    const dy = spot.y - from.y;
    const distance = Math.abs(dx) + Math.abs(dy);
    if (!best || distance < best.distance) best = { distance, dx, dy, arrow: arrowFor(dx, dy) };
  }
  return best;
}
