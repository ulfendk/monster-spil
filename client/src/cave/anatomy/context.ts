import type * as THREE from "three";
import type { CreatureForm, CreatureSpecies, TypeId } from "@shared";
import type { Builder } from "../monster-model";
import type { Ell } from "./kit";

/** Everything a part needs to know about the monster it's on. */
export interface Ctx {
  b: Builder;
  species: CreatureSpecies;
  form: CreatureForm;
  type: TypeId;
  stage: number;
  /** How much bigger crests, horns and tails are at this stage (1, 1.25, 1.5). */
  grow: number;
  colour: number;
  belly: number;
  accent: number;
  /** A darker shade of the main colour (paws, shadows, stripes). */
  dark: number;
  /** Its body, once made (patterns and extras lie on it). */
  body?: Ell;
  head?: Ell;
  /** Little movements, called every frame with the time in seconds. */
  ticks: Array<(t: number) => void>;
  /** Parts that belong to the head, grown together at later stages. */
  headParts: THREE.Object3D[];
}

export const has = (ctx: Ctx, extra: NonNullable<CreatureForm["extras"]>[number]) => ctx.form.extras?.includes(extra) ?? false;
