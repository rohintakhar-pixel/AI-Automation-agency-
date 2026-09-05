const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

/*
 * Stripe retries a webhook on any answer that is not a 2xx, and the retry
 * carries the same event id. Before this, the same sale landed in the order
 * file twice. These tests are that behaviour, pinned.
 *
 * The order directory is set before the module is loaded, because the module
 * reads the environment when it writes.
 */
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kitset-order-test-"));
process.env.KITSET_ORDER_DIR = dir;

const { recordOrder } = require("../src/lib/orders.ts");

const file = path.join(dir, "orders.jsonl");

function lines() {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));
}

function sale(eventId, sessionId) {
  return {
    recordedAt: new Date().toISOString(),
    eventId,
    sessionId,
    slug: "shopify-support-drafter",
    email: "buyer@example.com",
    amountTotal: 5900,
    currency: "usd",
    livemode: false,
  };
}

test("a sale is written down once", () => {
  const result = recordOrder(sale("evt_one", "cs_one"));
  assert.strictEqual(result.duplicate, false);
  assert.strictEqual(result.written, file);
  assert.strictEqual(lines().filter((row) => row.eventId === "evt_one").length, 1);
});

test("the same signed event delivered twice is recorded once", () => {
  const again = recordOrder(sale("evt_one", "cs_one"));
  assert.strictEqual(again.duplicate, true);
  assert.strictEqual(again.written, null);
  assert.strictEqual(lines().filter((row) => row.eventId === "evt_one").length, 1);
});

test("a retry that lands on a process with no memory of it is still one line", () => {
  // What a second serverless instance sees: nothing in memory, the file on
  // disk. Loading a fresh copy of the module is the closest honest stand-in.
  delete require.cache[require.resolve("../src/lib/orders.ts")];
  const fresh = require("../src/lib/orders.ts");
  const again = fresh.recordOrder(sale("evt_one", "cs_one"));
  assert.strictEqual(again.duplicate, true);
  assert.strictEqual(lines().filter((row) => row.eventId === "evt_one").length, 1);
});

test("a different sale is still recorded", () => {
  const result = recordOrder(sale("evt_two", "cs_two"));
  assert.strictEqual(result.duplicate, false);
  assert.strictEqual(lines().length, 2);
});

test("the same checkout under a new event id is not silently swallowed", () => {
  // Two events about one session is a real thing Stripe does. The event id is
  // what is deduplicated, not the session.
  const result = recordOrder(sale("evt_three", "cs_two"));
  assert.strictEqual(result.duplicate, false);
  assert.strictEqual(lines().length, 3);
});

test("a half-written line in the file does not stop the check", () => {
  fs.appendFileSync(file, "{not json\n", "utf8");
  delete require.cache[require.resolve("../src/lib/orders.ts")];
  const fresh = require("../src/lib/orders.ts");
  const again = fresh.recordOrder(sale("evt_two", "cs_two"));
  assert.strictEqual(again.duplicate, true);
});

test.after(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});
