const test = require("node:test");
const assert = require("node:assert");
const { pairByPosition } = require("../src/pairing.js");

test("matching lengths pair up and the run carries on", () => {
  const result = pairByPosition([{}, {}], [{}, {}], "Ask Shopify");
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.message, null);
});

test("an empty batch is not a mismatch", () => {
  assert.strictEqual(pairByPosition([], [], "Ask Shopify").ok, true);
});

test("more answers than emails stops the run", () => {
  const result = pairByPosition([{}], [{}, {}], "Ask Shopify");
  assert.strictEqual(result.ok, false);
  assert.match(result.message, /2 answers for 1 emails/);
  assert.match(result.message, /Nothing was sent and nothing was drafted/);
});

test("fewer answers than emails stops the run too", () => {
  const result = pairByPosition([{}, {}, {}], [{}], "Ask OpenAI");
  assert.strictEqual(result.ok, false);
  assert.match(result.message, /Ask OpenAI returned 1 answers for 3 emails/);
});

test("a missing list counts as none, and stops rather than guessing", () => {
  assert.strictEqual(pairByPosition(undefined, [{}], "Ask Shopify").ok, false);
  assert.strictEqual(pairByPosition([{}], null, "Ask Shopify").ok, false);
});
