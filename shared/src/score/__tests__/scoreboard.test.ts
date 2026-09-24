import { test } from "node:test";
import assert from "node:assert/strict";
import { SCORE_POINTS, inWindow, scoreboard, type ScoreEvent } from "../scoreboard.js";

const now = new Date("2026-09-24T12:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
const players = { a: { navn: "Anna", farve: "#f00" }, b: { navn: "Bo", farve: "#00f" }, c: { navn: "Carl", farve: "#0f0" } };
let n = 0;
const ev = (playerId: string, kind: ScoreEvent["kind"], at = daysAgo(1), finalBlow?: boolean): ScoreEvent => ({
  id: String(n++), playerId, kind, at, ...(finalBlow ? { finalBlow } : {}),
});

test("points add up per category, with a bonus for the final blow", () => {
  const rows = scoreboard([ev("a", "catch"), ev("a", "catch"), ev("a", "duel"), ev("a", "dragon", daysAgo(1), true), ev("b", "dragon")], players, now);
  const anna = rows.find((r) => r.playerId === "a")!;
  assert.deepEqual([anna.catches, anna.duels, anna.dragons], [2, 1, 1]);
  assert.equal(anna.points, 2 * SCORE_POINTS.catch + SCORE_POINTS.duel + SCORE_POINTS.dragon + SCORE_POINTS.finalBlow);
  assert.equal(rows.find((r) => r.playerId === "b")!.points, SCORE_POINTS.dragon);
});

test("only the last 7 days count, and events from the future are ignored", () => {
  const rows = scoreboard([ev("a", "catch", daysAgo(6.9)), ev("a", "catch", daysAgo(7.1)), ev("a", "catch", daysAgo(-1))], players, now);
  assert.equal(rows[0]!.catches, 1);
  assert.equal(inWindow("not a date", now), false);
});

test("everyone known gets a row, best first, and ties share a rank", () => {
  const rows = scoreboard([ev("b", "duel"), ev("c", "duel")], players, now);
  assert.deepEqual(rows.map((r) => [r.navn, r.rank]), [["Bo", 1], ["Carl", 1], ["Anna", 3]]);
});

test("events from unknown players are ignored", () => {
  assert.equal(scoreboard([ev("stranger", "catch")], players, now).every((r) => r.points === 0), true);
});
