/**
 * The family's weekly scoreboard: the server records events as they happen and
 * this turns them into ranked rows for the last `days` days. Pure and plain data.
 */
export type ScoreKind = "catch" | "duel" | "dragon" | "beast";

export interface ScoreEvent {
  /** Unique, so an event reported twice (e.g. after a reconnect) is only counted once. */
  id: string;
  playerId: string;
  kind: ScoreKind;
  /** ISO timestamp of when it happened (for catches: on the device, possibly offline). */
  at: string;
  /** Set on the "dragon" or "beast" event of the player who struck the final blow. */
  finalBlow?: boolean;
}

export const SCORE_POINTS = { catch: 1, duel: 2, dragon: 5, finalBlow: 3, beast: 3, beastFinalBlow: 2 } as const;

export const SCOREBOARD_DAYS = 7;

export interface ScorePlayer {
  navn: string;
  farve: string;
  /** Their chosen figure (an animal on the map); absent for players stored before figures showed. */
  avatarId?: string;
  /** Their player level, as their device last told the server (v13+). */
  level?: number;
}

export interface ScoreRow {
  playerId: string;
  navn: string;
  farve: string;
  avatarId?: string;
  level?: number;
  catches: number;
  duels: number;
  /** Big beasts beaten: the dragon and the visiting beasts. */
  dragons: number;
  points: number;
  /** 1-based; players with equal points share a rank. */
  rank: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** True if `at` is within the scoreboard window ending at `now`. */
export function inWindow(at: string, now: Date, days = SCOREBOARD_DAYS): boolean {
  const t = Date.parse(at);
  return Number.isFinite(t) && t > now.getTime() - days * DAY_MS && t <= now.getTime() + 5 * 60 * 1000;
}

/** Every known family member gets a row (zero if quiet this week), best first. */
export function scoreboard(events: ScoreEvent[], players: Record<string, ScorePlayer>, now: Date, days = SCOREBOARD_DAYS): ScoreRow[] {
  const rows = new Map<string, ScoreRow>();
  for (const [playerId, p] of Object.entries(players)) {
    rows.set(playerId, { playerId, navn: p.navn, farve: p.farve, ...(p.avatarId ? { avatarId: p.avatarId } : {}), ...(p.level ? { level: p.level } : {}), catches: 0, duels: 0, dragons: 0, points: 0, rank: 0 });
  }
  for (const e of events) {
    const row = rows.get(e.playerId);
    if (!row || !inWindow(e.at, now, days)) continue;
    if (e.kind === "catch") {
      row.catches++;
      row.points += SCORE_POINTS.catch;
    } else if (e.kind === "duel") {
      row.duels++;
      row.points += SCORE_POINTS.duel;
    } else if (e.kind === "beast") {
      row.dragons++;
      row.points += SCORE_POINTS.beast + (e.finalBlow ? SCORE_POINTS.beastFinalBlow : 0);
    } else {
      row.dragons++;
      row.points += SCORE_POINTS.dragon + (e.finalBlow ? SCORE_POINTS.finalBlow : 0);
    }
  }
  const sorted = [...rows.values()].sort((a, b) => b.points - a.points || a.navn.localeCompare(b.navn, "da"));
  sorted.forEach((row, i) => {
    row.rank = i > 0 && sorted[i - 1]!.points === row.points ? sorted[i - 1]!.rank : i + 1;
  });
  return sorted;
}
