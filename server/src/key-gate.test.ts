import { test } from "node:test";
import assert from "node:assert/strict";
import { KeyGate, clientAddress, sameSecret } from "./key-gate.js";

const MINUTE = 60 * 1000;

test("sameSecret accepts only the exact string", () => {
  assert.equal(sameSecret("hemmelig", "hemmelig"), true);
  assert.equal(sameSecret("forkert", "hemmelig"), false);
  assert.equal(sameSecret("", "hemmelig"), false);
  assert.equal(sameSecret(1234, "hemmelig"), false);
  assert.equal(sameSecret(undefined, "hemmelig"), false);
});

test("attempt returns what the lookup found, and undefined for a miss", () => {
  const gate = new KeyGate();
  assert.equal(gate.attempt("a", () => "spil-1"), "spil-1");
  assert.equal(gate.attempt("a", () => undefined), undefined);
  assert.equal(gate.check("a", "hemmelig", "hemmelig"), true);
  assert.equal(gate.check("a", "nej", "hemmelig"), false);
});

test("five wrong guesses lock the address out, even for a correct one", () => {
  const gate = new KeyGate();
  for (let i = 0; i < 5; i++) assert.equal(gate.check("a", "nej", "hemmelig"), false);
  assert.equal(gate.check("a", "hemmelig", "hemmelig"), false);
  let looked = false;
  assert.equal(gate.attempt("a", () => ((looked = true), "x")), undefined);
  assert.equal(looked, false, "a locked address doesn't even get to look");
  assert.equal(gate.check("b", "hemmelig", "hemmelig"), true, "other addresses are unaffected");
});

test("misses count across different secrets (guessing keys of several games)", () => {
  const gate = new KeyGate();
  for (let i = 0; i < 3; i++) gate.check("a", "nej", "spil-a");
  for (let i = 0; i < 2; i++) gate.check("a", "nej", "spil-b");
  assert.equal(gate.check("a", "spil-a", "spil-a"), false);
});

test("the lockout expires after ten minutes", () => {
  let now = 0;
  const gate = new KeyGate(() => now);
  for (let i = 0; i < 5; i++) gate.check("a", "nej", "hemmelig");
  now = 9 * MINUTE;
  assert.equal(gate.check("a", "hemmelig", "hemmelig"), false);
  now = 10 * MINUTE + 1;
  assert.equal(gate.check("a", "hemmelig", "hemmelig"), true);
});

test("a correct guess clears the earlier failures", () => {
  const gate = new KeyGate();
  for (let i = 0; i < 4; i++) gate.check("a", "nej", "hemmelig");
  assert.equal(gate.check("a", "hemmelig", "hemmelig"), true);
  for (let i = 0; i < 4; i++) assert.equal(gate.check("a", "nej", "hemmelig"), false);
  assert.equal(gate.check("a", "hemmelig", "hemmelig"), true, "counter restarted, so 4 more misses don't lock");
});

test("clientAddress trusts the last X-Forwarded-For entry and falls back to the socket ip", () => {
  assert.equal(clientAddress({ "x-forwarded-for": "6.6.6.6, 10.0.0.1" }, "127.0.0.1"), "10.0.0.1");
  assert.equal(clientAddress({ "x-forwarded-for": ["1.1.1.1", "2.2.2.2"] }, "127.0.0.1"), "2.2.2.2");
  assert.equal(clientAddress({}, "127.0.0.1"), "127.0.0.1");
  assert.equal(clientAddress({}, ["9.9.9.9"]), "9.9.9.9");
});
