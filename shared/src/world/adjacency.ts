/** Where a player stands: an area id plus a tile. An empty areaId means "position unknown" (never adjacent to anyone). */
export interface WorldPosition {
  areaId: string;
  x: number;
  y: number;
}

/**
 * Two players can trade or duel only when they are touching: same area and at
 * most one tile apart in each direction (diagonals count). The client uses it to
 * decide when the meeting popup appears; the server uses the same function to
 * refuse invites from anyone who isn't really next to the other player.
 */
export function isAdjacent(a: WorldPosition, b: WorldPosition): boolean {
  if (!a.areaId || a.areaId !== b.areaId) return false;
  return Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1;
}
