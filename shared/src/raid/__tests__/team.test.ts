import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { freshRaid, type BossDefinition } from "../raid.js";
import {
  MAX_TEAM,
  TEAM_MAX_MISSED,
  createTeam,
  joinTeam,
  leaveTeam,
  startTeam,
  submitTeamAction,
  teamHpFactor,
  teamViewFor,
  timeoutTeamTurn,
  type TeamSession,
} from "../team.js";
import { makeSpecies, makeMove, makeParticipant } from "../../battle/__tests__/fixtures.js";

const boss: BossDefinition = JSON.parse(readFileSync(path.join(import.meta.dirname, "../../../content/raid/kaempedragen.json"), "utf-8"));
const now = new Date("2026-09-22T12:00:00Z");
const hit = makeMove({ id: "slag", type: "vand", power: 40, accuracy: 1 });
const seat = (id: string, fart = 10, hp = 40) =>
  makeParticipant(id, makeSpecies({ id: "m-" + id, baseStats: { hp, angreb: 20, forsvar: 10, fart } }), [hit]);
const ok = <T extends { ok: boolean }>(r: T) => {
  assert.ok(r.ok, JSON.stringify(r));
  return r as Extract<T, { ok: true }>;
};
const attack = { kind: "move" as const, moveId: "slag" };

function team(...ids: string[]): TeamSession {
  let s = ok(createTeam("t1", ids[0]!, seat(ids[0]!))).session;
  for (const id of ids.slice(1)) s = ok(joinTeam(s, id, seat(id))).session;
  return s;
}

test("the HP factor grows by a quarter per extra player, at most double", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(teamHpFactor), [1, 1.25, 1.5, 1.75, 2, 2]);
});

test("gathering: join once, not after the start, and not beyond the maximum", () => {
  const s = team("anna", "bo");
  assert.equal(joinTeam(s, "bo", seat("bo")).ok, false);
  assert.equal(joinTeam(s, "carl", seat("dan")).ok, false, "seat must be your own");
  let full = team("p0");
  for (let i = 1; i < MAX_TEAM; i++) full = ok(joinTeam(full, `p${i}`, seat(`p${i}`))).session;
  assert.equal(joinTeam(full, "one-too-many", seat("one-too-many")).ok, false);
  const started = ok(startTeam(s, "anna", 1)).session;
  assert.equal(joinTeam(started, "carl", seat("carl")).ok, false);
});

test("only the leader starts, and every monster's HP is multiplied by the team factor", () => {
  const s = team("anna", "bo", "carl");
  assert.equal(startTeam(s, "bo", 1).ok, false);
  const started = ok(startTeam(s, "anna", 1)).session;
  assert.equal(started.phase, "active");
  for (const m of started.members) {
    assert.equal(m.seat.species.baseStats.hp, 60); // 40 × 1.5
    assert.equal(m.seat.active.currentHp, 60);
  }
});

test("a turn waits for everyone, then each member's damage is credited to them", () => {
  const raid = freshRaid(boss, "2026-09-21");
  let s = ok(startTeam(team("anna", "bo"), "anna", 7)).session;
  const first = ok(submitTeamAction(s, "anna", attack, raid, boss, now));
  assert.equal(first.session.turn, 0, "bo hasn't picked yet");
  assert.deepEqual(teamViewFor(first.session, "bo", raid, boss).answered, ["anna"]);
  const second = ok(submitTeamAction(first.session, "bo", attack, first.raid, boss, now));
  s = second.session;
  assert.equal(s.turn, 1);
  assert.ok((second.raid.damageBy["anna"] ?? 0) > 0);
  assert.ok((second.raid.damageBy["bo"] ?? 0) > 0);
  assert.equal(second.raid.hp, boss.maxHp - second.raid.damageBy["anna"]! - second.raid.damageBy["bo"]!);
  // The dragon struck back at exactly one of them.
  const hurt = s.members.filter((m) => m.seat.active.currentHp < m.seat.species.baseStats.hp);
  assert.equal(hurt.length, 1);
});

test("the same seed and choices always give the same turn", () => {
  const raid = freshRaid(boss, "2026-09-21");
  const run = () => {
    const s = ok(startTeam(team("anna", "bo"), "anna", 99)).session;
    const a = ok(submitTeamAction(s, "anna", attack, raid, boss, now));
    return JSON.stringify(ok(submitTeamAction(a.session, "bo", attack, a.raid, boss, now)));
  };
  assert.equal(run(), run());
});

test("whoever empties the HP gets the final blow and the team wins", () => {
  const raid = { ...freshRaid(boss, "2026-09-21"), hp: 3, damageBy: { carl: 597 } };
  let s = ok(startTeam(team("anna", "bo"), "anna", 5)).session;
  s = ok(submitTeamAction(s, "anna", attack, raid, boss, now)).session;
  const r = ok(submitTeamAction(s, "bo", attack, raid, boss, now));
  assert.equal(r.defeatedNow, true);
  assert.equal(r.session.phase, "done");
  assert.equal(r.session.outcome, "won");
  assert.ok(r.raid.finalBlowBy === "anna" || r.raid.finalBlowBy === "bo");
  assert.equal(teamViewFor(r.session, "bo", r.raid, boss).battle?.outcome, "won");
});

test("a fainted member is out; when everyone is out the team has lost", () => {
  let raid = freshRaid(boss, "2026-09-21");
  let s = ok(startTeam({ ...team("anna"), members: [{ playerId: "anna", seat: seat("anna", 1, 1), status: "in" }] }, "anna", 3)).session;
  for (let i = 0; i < 10 && s.phase === "active"; i++) {
    const r = ok(submitTeamAction(s, "anna", attack, raid, boss, now));
    s = r.session;
    raid = r.raid;
  }
  assert.equal(s.members[0]!.status, "fainted");
  assert.equal(s.phase, "done");
  assert.equal(s.outcome, "lost");
});

test("fleeing or leaving takes you out, but the rest fight on", () => {
  const raid = freshRaid(boss, "2026-09-21");
  let s = ok(startTeam(team("anna", "bo"), "anna", 1)).session;
  s = ok(submitTeamAction(s, "anna", { kind: "flee" }, raid, boss, now)).session;
  const r = ok(submitTeamAction(s, "bo", attack, raid, boss, now));
  assert.equal(r.session.members.find((m) => m.playerId === "anna")!.status, "left");
  assert.equal(r.session.phase, "active");
  const gone = leaveTeam(r.session, "bo");
  assert.equal(gone.phase, "done");
  assert.equal(gone.outcome, "lost");
});

test("while gathering, the leader leaving cancels the team; anyone else just drops out", () => {
  const s = team("anna", "bo");
  assert.deepEqual(leaveTeam(s, "bo").members.map((m) => m.playerId), ["anna"]);
  assert.equal(leaveTeam(s, "anna").phase, "cancelled");
});

test("a silent member skips turns and is out after too many", () => {
  let raid = freshRaid(boss, "2026-09-21");
  let s = ok(startTeam(team("anna", "bo"), "anna", 2)).session;
  for (let i = 0; i < TEAM_MAX_MISSED; i++) {
    const a = ok(submitTeamAction(s, "anna", attack, raid, boss, now));
    const t = timeoutTeamTurn(a.session, a.raid, boss, now);
    s = t.session;
    raid = t.raid;
  }
  assert.equal(s.members.find((m) => m.playerId === "bo")!.status, "left");
  assert.equal(raid.damageBy["bo"], undefined);
});

test("the view hides what others picked and shows each viewer their own monster", () => {
  const raid = freshRaid(boss, "2026-09-21");
  const s = ok(startTeam(team("anna", "bo"), "anna", 4)).session;
  const picked = ok(submitTeamAction(s, "anna", attack, raid, boss, now)).session;
  const view = teamViewFor(picked, "bo", raid, boss);
  assert.ok(!JSON.stringify(view).includes('"pending"'));
  assert.equal(view.battle?.participants[0].playerId, "bo");
  assert.equal(view.battle?.participants[1].active.currentHp, raid.hp);
  assert.equal(view.hpFactor, 1.25);
  assert.equal(view.members.length, 2);
});
