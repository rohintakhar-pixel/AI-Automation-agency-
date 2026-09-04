const test = require("node:test");
const assert = require("node:assert");
const { describeOrder, buildMessages, buildRequestBody, readCompletion } = require("../src/prompt.js");

const order = {
  orderNumber: "#1042",
  placedAt: "2026-08-30T10:00:00Z",
  financialStatus: "PAID",
  fulfillmentStatus: "FULFILLED",
  cancelled: false,
  customerName: "Jane Doe",
  items: [{ title: "Blue jacket", quantity: 1 }],
  tracking: [{ number: "AB123456789GB", url: "https://track/AB", company: "Royal Mail" }],
  shippingAddress: { name: "Jane Doe", line1: "1 High Street", city: "Leeds", country: "UK" },
};

test("the order description carries the facts a reply needs", () => {
  const text = describeOrder(order);
  assert.match(text, /#1042/);
  assert.match(text, /FULFILLED/);
  assert.match(text, /AB123456789GB/);
  assert.match(text, /Blue jacket/);
  assert.match(text, /1 High Street/);
});

test("an order with no tracking says so rather than leaving it out", () => {
  const text = describeOrder({ ...order, tracking: [] });
  assert.match(text, /Tracking: none/);
});

test("no order at all is stated plainly", () => {
  assert.match(describeOrder(null), /No order was found/);
});

test("the store's own return policy is put in the prompt word for word", () => {
  const policy = "Returns accepted within 14 days, unworn, buyer pays postage.";
  const [system] = buildMessages({
    category: "return_request",
    order,
    customerMessage: "can I send this back",
    settings: { storeName: "Test Shop", returnPolicy: policy },
  });
  assert.strictEqual(system.role, "system");
  assert.ok(system.content.includes(policy));
});

test("a store with no policy set is told to defer to the owner", () => {
  const [system] = buildMessages({
    category: "return_request",
    order,
    customerMessage: "can I send this back",
    settings: { storeName: "Test Shop" },
  });
  assert.match(system.content, /No return policy has been set/);
});

test("the rules against inventing facts and leaving placeholders are always present", () => {
  const [system] = buildMessages({
    category: "order_status",
    order,
    customerMessage: "where is it",
    settings: {},
  });
  assert.match(system.content, /Never invent a tracking number/);
  assert.match(system.content, /\[Customer Name\]/);
});

test("the customer's own words are passed through, capped in length", () => {
  const long = "x".repeat(9000);
  const [, user] = buildMessages({
    category: "order_status",
    order,
    customerMessage: long,
    settings: {},
  });
  assert.ok(user.content.length < 6000);
});

test("the request body is a one-shot low-temperature call", () => {
  const body = buildRequestBody({ model: "gpt-4o-mini", messages: [] });
  assert.strictEqual(body.model, "gpt-4o-mini");
  assert.strictEqual(body.temperature, 0.2);
  assert.ok(body.max_tokens > 0);
});

test("a normal completion is read out", () => {
  const result = readCompletion({ choices: [{ message: { content: " Hello there " } }] });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.text, "Hello there");
});

test("an OpenAI error is reported, not turned into an empty reply", () => {
  const result = readCompletion({ error: { message: "Rate limit reached" } });
  assert.strictEqual(result.ok, false);
  assert.match(result.problem, /Rate limit/);
});

test("an empty completion is a failure", () => {
  assert.strictEqual(readCompletion({ choices: [{ message: { content: "" } }] }).ok, false);
  assert.strictEqual(readCompletion({}).ok, false);
  assert.strictEqual(readCompletion(null).ok, false);
});
