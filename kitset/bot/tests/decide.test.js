const test = require("node:test");
const assert = require("node:assert");
const { decide, mayAutoSend } = require("../src/decide.js");

const shippedOrder = {
  orderNumber: "#1042",
  placedAt: "2026-08-30T10:00:00Z",
  financialStatus: "PAID",
  fulfillmentStatus: "FULFILLED",
  cancelled: false,
  tracking: [{ number: "AB123456789GB", url: null, company: "Royal Mail" }],
};

const clearStatusRead = {
  handle: true,
  category: "order_status",
  reason: "clear",
  orderNumber: "#1042",
};

const base = {
  settings: { autoSend: true },
  read: clearStatusRead,
  chosen: { order: shippedOrder, searchedBy: "order_number", ambiguous: false },
  parsed: { ok: true, problem: null },
};

test("the one routine case is allowed to send", () => {
  const result = decide(base);
  assert.strictEqual(result.action, "send");
});

test("auto-send off means everything is drafted", () => {
  const result = decide({ ...base, settings: { autoSend: false } });
  assert.strictEqual(result.action, "draft");
  assert.match(result.why, /switched off/);
});

test("auto-send defaults to off when the setting is missing", () => {
  const result = decide({ ...base, settings: {} });
  assert.strictEqual(result.action, "draft");
});

test("a return is never auto-sent, even with auto-send on", () => {
  const result = decide({
    ...base,
    read: { ...clearStatusRead, category: "return_request" },
  });
  assert.strictEqual(result.action, "draft");
});

test("an address change is never auto-sent, even with auto-send on", () => {
  const result = decide({
    ...base,
    read: { ...clearStatusRead, category: "address_change" },
  });
  assert.strictEqual(result.action, "draft");
});

test("an order found by email address is never auto-sent", () => {
  const result = decide({
    ...base,
    chosen: { ...base.chosen, searchedBy: "customer_email" },
  });
  assert.strictEqual(result.action, "draft");
  assert.match(result.why, /email address/);
});

test("an unshipped order is never auto-sent", () => {
  const result = decide({
    ...base,
    chosen: {
      ...base.chosen,
      order: { ...shippedOrder, fulfillmentStatus: "UNFULFILLED", tracking: [] },
    },
  });
  assert.strictEqual(result.action, "draft");
});

test("a shipped order with no tracking number is never auto-sent", () => {
  const result = decide({
    ...base,
    chosen: { ...base.chosen, order: { ...shippedOrder, tracking: [] } },
  });
  assert.strictEqual(result.action, "draft");
  assert.match(result.why, /tracking number/);
});

test("a cancelled order is never auto-sent", () => {
  const result = decide({
    ...base,
    chosen: { ...base.chosen, order: { ...shippedOrder, cancelled: true } },
  });
  assert.strictEqual(result.action, "draft");
});

test("a refunded order is never auto-sent", () => {
  const result = decide({
    ...base,
    chosen: {
      ...base.chosen,
      order: { ...shippedOrder, financialStatus: "REFUNDED" },
    },
  });
  assert.strictEqual(result.action, "draft");
});

test("an ambiguous match is never auto-sent", () => {
  const result = decide({ ...base, chosen: { ...base.chosen, ambiguous: true } });
  assert.strictEqual(result.action, "draft");
});

test("machine mail is ignored, not drafted", () => {
  const result = decide({
    ...base,
    read: { handle: false, category: "ignored", reason: "automated_mail" },
  });
  assert.strictEqual(result.action, "ignore");
});

test("a message asking two things goes to a person with no draft", () => {
  const result = decide({
    ...base,
    read: { handle: false, category: "unclear", reason: "mixed_signals" },
  });
  assert.strictEqual(result.action, "escalate");
  assert.match(result.why, /more than one thing/);
});

test("a missing Shopify scope is escalated with the cause named", () => {
  const result = decide({ ...base, parsed: { ok: false, problem: "permission_denied" } });
  assert.strictEqual(result.action, "escalate");
  assert.match(result.why, /read_orders/);
});

test("a Shopify API error is escalated rather than answered", () => {
  const result = decide({ ...base, parsed: { ok: false, problem: "api_error" } });
  assert.strictEqual(result.action, "escalate");
});

test("no order found is escalated, never guessed at", () => {
  const result = decide({
    ...base,
    chosen: { order: null, searchedBy: "order_number", ambiguous: false },
    parsed: { ok: true, problem: "not_found" },
  });
  assert.strictEqual(result.action, "escalate");
  assert.match(result.why, /guess/);
});

test("every blocking reason is reported, not just the first", () => {
  const verdict = mayAutoSend({
    settings: { autoSend: true },
    read: { ...clearStatusRead, category: "return_request" },
    chosen: {
      order: { ...shippedOrder, cancelled: true, tracking: [] },
      searchedBy: "customer_email",
      ambiguous: true,
    },
    parsed: { ok: true, problem: null },
  });
  assert.strictEqual(verdict.allowed, false);
  assert.ok(verdict.reasons.length >= 5);
});
