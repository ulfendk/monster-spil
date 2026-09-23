import { test } from "node:test";
import assert from "node:assert/strict";
import type { CreatureInstance } from "../../types/creature.js";
import { acceptInvite, cancelTrade, confirmTrade, createTrade, deliveriesFor, setOffer } from "../trade-session.js";
import type { TradeResult, TradeSession } from "../trade-session.js";
import { applyDelivery } from "../apply-trade.js";

const creature = (instanceId: string, ownerId: string, speciesId = "flammepels"): CreatureInstance => ({
  instanceId,
  speciesId,
  ownerId,
  niveau: 1,
  currentHp: 30,
  caughtAt: "2026-01-01T00:00:00.000Z",
});

function ok(r: TradeResult): TradeSession {
  if (!r.ok) assert.fail(r.reason);
  return r.session;
}

function pickingSession(): TradeSession {
  const s = ok(createTrade("t1", "anna", "bo"));
  return ok(acceptInvite(s, "bo"));
}

test("cannot trade with yourself", () => {
  assert.equal(createTrade("t", "anna", "anna").ok, false);
});

test("only the invitee can accept, and only once", () => {
  const s = ok(createTrade("t1", "anna", "bo"));
  assert.equal(acceptInvite(s, "anna").ok, false);
  const accepted = ok(acceptInvite(s, "bo"));
  assert.equal(accepted.phase, "picking");
  assert.equal(acceptInvite(accepted, "bo").ok, false);
});

test("offers must be your own creature and need the picking phase", () => {
  const invited = ok(createTrade("t1", "anna", "bo"));
  assert.equal(setOffer(invited, "anna", creature("c1", "anna")).ok, false);
  const s = pickingSession();
  assert.equal(setOffer(s, "anna", creature("c1", "bo")).ok, false);
  assert.equal(setOffer(s, "carl", creature("c1", "carl")).ok, false);
  assert.equal(setOffer(s, "anna", creature("c1", "anna")).ok, true);
});

test("cannot confirm until both sides have offered", () => {
  let s = pickingSession();
  s = ok(setOffer(s, "anna", creature("c1", "anna")));
  assert.equal(confirmTrade(s, "anna").ok, false);
});

test("changing an offer clears both confirmations", () => {
  let s = pickingSession();
  s = ok(setOffer(s, "anna", creature("c1", "anna")));
  s = ok(setOffer(s, "bo", creature("c2", "bo")));
  s = ok(confirmTrade(s, "anna"));
  assert.equal(s.inviter.confirmed, true);
  s = ok(setOffer(s, "bo", creature("c3", "bo")));
  assert.equal(s.inviter.confirmed, false);
  assert.equal(s.invitee.confirmed, false);
  assert.equal(s.phase, "picking");
});

test("both confirming finishes the trade and swaps ownership in the deliveries", () => {
  let s = pickingSession();
  s = ok(setOffer(s, "anna", creature("c1", "anna", "flammepels")));
  s = ok(setOffer(s, "bo", creature("c2", "bo", "vandbjoern")));
  s = ok(confirmTrade(s, "anna"));
  assert.equal(s.phase, "picking");
  s = ok(confirmTrade(s, "bo"));
  assert.equal(s.phase, "done");

  const [forAnna, forBo] = deliveriesFor(s);
  assert.deepEqual([forAnna!.give, forAnna!.receive.instanceId, forAnna!.receive.ownerId], ["c1", "c2", "anna"]);
  assert.deepEqual([forBo!.give, forBo!.receive.instanceId, forBo!.receive.ownerId], ["c2", "c1", "bo"]);
});

test("a finished trade cannot be cancelled, an unfinished one can", () => {
  const s = pickingSession();
  assert.equal(cancelTrade(s).phase, "cancelled");
  let done = ok(setOffer(s, "anna", creature("c1", "anna")));
  done = ok(setOffer(done, "bo", creature("c2", "bo")));
  done = ok(confirmTrade(ok(confirmTrade(done, "anna")), "bo"));
  assert.equal(cancelTrade(done).phase, "done");
});

test("no deliveries before the trade is done", () => {
  assert.deepEqual(deliveriesFor(pickingSession()), []);
});

test("applyDelivery swaps the creature and is idempotent", () => {
  const mine = [creature("c1", "anna"), creature("c9", "anna")];
  const delivery = { tradeId: "t1", give: "c1", receive: creature("c2", "anna", "vandbjoern") };
  const once = applyDelivery(mine, delivery);
  assert.deepEqual(once.map((c) => c.instanceId).sort(), ["c2", "c9"]);
  const twice = applyDelivery(once, delivery);
  assert.deepEqual(twice, once);
  assert.equal(mine.length, 2, "input array is not mutated");
});
