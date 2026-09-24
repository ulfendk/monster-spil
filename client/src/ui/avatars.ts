/**
 * The figures a player can be: an animal face drawn on their coloured circle on the
 * map (and next to their name on the scoreboard and restore list). The ids are what
 * is saved; figur1–4 existed before the animals did, so they map to the first four.
 * The pictures are drawn in code: see gfx/avatar-sprites.ts.
 */
export const AVATARS: ReadonlyArray<{ id: string; navn: string }> = [
  { id: "figur1", navn: "Ræv" },
  { id: "figur2", navn: "Frø" },
  { id: "figur3", navn: "Panda" },
  { id: "figur4", navn: "Kat" },
  { id: "figur5", navn: "Kanin" },
  { id: "figur6", navn: "Bjørn" },
];
