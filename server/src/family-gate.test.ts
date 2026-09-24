import { test } from "node:test";
import assert from "node:assert/strict";
import { FamilyGate, clientAddress } from "./family-gate.js";

const MINUTE = 60 * 1000;

test("a gate with no code configured lets everyone in", () => {
  const gate = new FamilyGate(undefined);
  assert.equal(gate.isOpen, true);
  assert.equal(gate.check("1.2.3.4", undefined), true);
});

test("the right code passes and wrong or non-string guesses fail", () => {
  const gate = new FamilyGate("hemmelig");
  assert.equal(gate.isOpen, false);
  assert.equal(gate.check("a", "hemmelig"), true);
  assert.equal(gate.check("a", "forkert"), false);
  assert.equal(gate.check("a", ""), false);
  assert.equal(gate.check("a", 1234), false);
  assert.equal(gate.check("a", undefined), false);
});

test("five wrong guesses lock the address out, even for the correct code", () => {
  const gate = new FamilyGate("hemmelig");
  for (let i = 0; i < 5; i++) assert.equal(gate.check("a", "nej"), false);
  assert.equal(gate.check("a", "hemmelig"), false);
  assert.equal(gate.check("b", "hemmelig"), true, "other addresses are unaffected");
});

test("the lockout expires after ten minutes", () => {
  let now = 0;
  const gate = new FamilyGate("hemmelig", () => now);
  for (let i = 0; i < 5; i++) gate.check("a", "nej");
  now = 9 * MINUTE;
  assert.equal(gate.check("a", "hemmelig"), false);
  now = 10 * MINUTE + 1;
  assert.equal(gate.check("a", "hemmelig"), true);
});

test("a correct guess clears the earlier failures", () => {
  const gate = new FamilyGate("hemmelig");
  for (let i = 0; i < 4; i++) gate.check("a", "nej");
  assert.equal(gate.check("a", "hemmelig"), true);
  for (let i = 0; i < 4; i++) assert.equal(gate.check("a", "nej"), false);
  assert.equal(gate.check("a", "hemmelig"), true, "counter restarted, so 4 more misses don't lock");
});

test("clientAddress trusts the last X-Forwarded-For entry and falls back to the socket ip", () => {
  assert.equal(clientAddress({ "x-forwarded-for": "6.6.6.6, 10.0.0.1" }, "127.0.0.1"), "10.0.0.1");
  assert.equal(clientAddress({ "x-forwarded-for": ["1.1.1.1", "2.2.2.2"] }, "127.0.0.1"), "2.2.2.2");
  assert.equal(clientAddress({}, "127.0.0.1"), "127.0.0.1");
  assert.equal(clientAddress({}, ["9.9.9.9"]), "9.9.9.9");
});
