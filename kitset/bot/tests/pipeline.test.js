const test = require("node:test");
const assert = require("node:assert");

const { readEmail } = require("../src/classify.js");
const { buildOrderSearch, parseOrderResponse, chooseOrder } = require("../src/shopify.js");
const { decide, mayAutoSend } = require("../src/decide.js");
const { buildMessages } = require("../src/prompt.js");
const { checkDraft } = require("../src/draftcheck.js");

/*
 * The whole chain, end to end, with Shopify and OpenAI replaced by fixtures.
 * This is the test that says the bot thinks correctly. It does not say the
 * bot talks to n8n, Shopify, Gmail or OpenAI correctly, which is a different
 * claim and is not made anywhere in this file.
 */

const SETTINGS = {
  storeName: "Test Shop",
  signOffName: "Sam at Test Shop",
  autoSend: true,
  returnPolicy: "Returns accepted within 30 days if unworn.",
};

function shopifyAnswer(nodes) {
  return { data: { orders: { edges: nodes.map((node) => ({ node })) } } };
}

const shippedOrderNode = {
  id: "gid://shopify/Order/1",
  name: "#1042",
  createdAt: "2026-08-30T10:00:00Z",
  displayFinancialStatus: "PAID",
  displayFulfillmentStatus: "FULFILLED",
  cancelledAt: null,
  email: "jane@example.com",
  customer: { firstName: "Jane", lastName: "Doe", email: "jane@example.com" },
  shippingAddress: { name: "Jane Doe", address1: "1 High Street", city: "Leeds", country: "UK" },
  lineItems: { edges: [{ node: { title: "Blue jacket", quantity: 1 } }] },
  fulfillments: [
    { status: "SUCCESS", trackingInfo: [{ number: "AB123456789GB", url: "https://track/AB", company: "Royal Mail" }] },
  ],
};

const unshippedOrderNode = {
  ...shippedOrderNode,
  name: "#1099",
  displayFulfillmentStatus: "UNFULFILLED",
  fulfillments: [],
};

/** Runs an email through every step and returns what the bot would do. */
function run(email, shopifyResponse) {
  const read = readEmail(email);
  const search = buildOrderSearch({
    orderNumber: read.orderNumber,
    customerEmail: read.customerEmail,
  });
  const parsed = parseOrderResponse(shopifyResponse);
  const chosen = { ...chooseOrder(parsed, search.by), searchedBy: search.by };
  const decision = decide({ settings: SETTINGS, read, chosen, parsed });
  return { read, search, parsed, chosen, decision };
}

test("shipped order, plain status question, order number given: sends", () => {
  const result = run(
    {
      from: "Jane Doe <jane@example.com>",
      subject: "Order #1042",
      body: "Hi, where is my order? The tracking has not updated.",
    },
    shopifyAnswer([shippedOrderNode]),
  );
  assert.strictEqual(result.read.category, "order_status");
  assert.strictEqual(result.search.search, 'name:"#1042"');
  assert.strictEqual(result.decision.action, "send");
});

test("the drafted reply for that case passes the final check", () => {
  const result = run(
    {
      from: "Jane Doe <jane@example.com>",
      subject: "Order #1042",
      body: "Hi, where is my order?",
    },
    shopifyAnswer([shippedOrderNode]),
  );
  const messages = buildMessages({
    category: result.read.category,
    order: result.chosen.order,
    customerMessage: result.read.cleanBody,
    settings: SETTINGS,
  });
  assert.strictEqual(messages.length, 2);

  // Stand-in for the model's answer, built only from facts in the prompt.
  const draft =
    "Hi Jane,\n\nThanks for checking in. Your order 1042 is on its way with " +
    "Royal Mail, tracking number AB123456789GB. You can follow it at " +
    "https://track/AB.\n\nSam at Test Shop";
  assert.strictEqual(
    checkDraft(draft, result.chosen.order).pass,
    true,
  );
});

test("unshipped order, status question: drafts instead of sending", () => {
  const result = run(
    {
      from: "Jane Doe <jane@example.com>",
      subject: "Order #1099",
      body: "Any news on when my order will arrive?",
    },
    shopifyAnswer([unshippedOrderNode]),
  );
  assert.strictEqual(result.decision.action, "draft");
  assert.match(result.decision.why, /not shipped yet/);
});

test("return request on a shipped order: always drafts, never sends", () => {
  const result = run(
    {
      from: "Jane Doe <jane@example.com>",
      subject: "Order #1042",
      body: "The jacket does not fit, can I return it for a refund?",
    },
    shopifyAnswer([shippedOrderNode]),
  );
  assert.strictEqual(result.read.category, "return_request");
  assert.strictEqual(result.decision.action, "draft");
});

test("address change: always drafts, never sends", () => {
  const result = run(
    {
      from: "Jane Doe <jane@example.com>",
      subject: "Order #1099",
      body: "I have moved, can you change my delivery address please?",
    },
    shopifyAnswer([unshippedOrderNode]),
  );
  assert.strictEqual(result.read.category, "address_change");
  assert.strictEqual(result.decision.action, "draft");
});

test("no order number: falls back to the email address and never auto-sends", () => {
  const result = run(
    {
      from: "Jane Doe <jane@example.com>",
      subject: "my order",
      body: "Hi, where is my parcel? It has not arrived yet.",
    },
    shopifyAnswer([shippedOrderNode]),
  );
  assert.strictEqual(result.search.by, "customer_email");
  assert.strictEqual(result.search.search, 'email:"jane@example.com"');
  assert.strictEqual(result.decision.action, "draft");
});

test("order not found: escalates without writing a reply", () => {
  const result = run(
    {
      from: "Jane Doe <jane@example.com>",
      subject: "Order #7777",
      body: "Where is my order #7777?",
    },
    shopifyAnswer([]),
  );
  assert.strictEqual(result.decision.action, "escalate");
});

test("Shopify permission failure: escalates and names the missing scope", () => {
  const result = run(
    {
      from: "Jane Doe <jane@example.com>",
      subject: "Order #1042",
      body: "Where is my order #1042?",
    },
    { errors: [{ message: "Access denied. Required access: read_orders scope." }] },
  );
  assert.strictEqual(result.decision.action, "escalate");
  assert.match(result.decision.why, /read_orders/);
});

test("Shopify's own order confirmation is ignored, not replied to", () => {
  const result = run(
    {
      from: "noreply@shopify.com",
      subject: "Order #1042 confirmed",
      body: "Thanks for your order.",
    },
    shopifyAnswer([shippedOrderNode]),
  );
  assert.strictEqual(result.decision.action, "ignore");
});

test("an out-of-office bounce is ignored", () => {
  const result = run(
    {
      from: "Jane Doe <jane@example.com>",
      subject: "Automatic reply: I am away",
      body: "I am out of the office until Monday.",
    },
    shopifyAnswer([shippedOrderNode]),
  );
  assert.strictEqual(result.decision.action, "ignore");
});

test("two questions in one email: escalates to a person, no reply written", () => {
  const result = run(
    {
      from: "Jane Doe <jane@example.com>",
      subject: "Order #1042",
      body:
        "Where is my order #1042? Also the other jacket does not fit, I want " +
        "to return it and get a refund.",
    },
    shopifyAnswer([shippedOrderNode]),
  );
  assert.strictEqual(result.decision.action, "escalate");
  assert.match(result.decision.why, /more than one thing/);
});

test("a question the bot does not cover: escalates rather than guessing", () => {
  const result = run(
    {
      from: "Jane Doe <jane@example.com>",
      subject: "Question",
      body: "Do you do wholesale pricing for shops?",
    },
    shopifyAnswer([]),
  );
  assert.strictEqual(result.decision.action, "escalate");
});

test("a reply on an old return thread is read on its new question only", () => {
  const result = run(
    {
      from: "Jane Doe <jane@example.com>",
      subject: "Re: your return",
      body:
        "Thanks. Where is my order #1042 now, has it shipped?\n\n" +
        "On 20 August 2026 at 09:00, Support <s@shop.com> wrote:\n" +
        "Your refund for the returned jacket has been processed.",
    },
    shopifyAnswer([shippedOrderNode]),
  );
  assert.strictEqual(result.read.category, "order_status");
  assert.strictEqual(result.decision.action, "send");
});

test("a model that invents a tracking number is stopped before sending", () => {
  const result = run(
    {
      from: "Jane Doe <jane@example.com>",
      subject: "Order #1042",
      body: "Where is my order?",
    },
    shopifyAnswer([shippedOrderNode]),
  );
  assert.strictEqual(result.decision.action, "send");

  const badDraft =
    "Hi Jane,\n\nYour order 1042 is on its way, tracking number " +
    "ZZ111222333GB with Royal Mail.\n\nSam at Test Shop";
  const check = checkDraft(badDraft, result.chosen.order);
  assert.strictEqual(check.pass, false);
});

/*
 * The case that got this build rejected. An order number is not a secret and
 * not a password, so it is not on its own permission to be told anything.
 */
test("a stranger naming a real order number gets no send and no draft", () => {
  const result = run(
    {
      from: "stranger@example.net",
      subject: "Order #1042",
      body: "Where is my order #1042? It has not arrived.",
    },
    shopifyAnswer([shippedOrderNode]),
  );

  assert.strictEqual(result.read.category, "order_status");
  assert.strictEqual(result.chosen.order.orderNumber, "#1042");
  // Not send, and not draft either: escalate is the only outcome.
  assert.strictEqual(result.decision.action, "escalate");
  assert.strictEqual(result.decision.requesterIsNotTheCustomer, true);
  assert.match(result.decision.why, /NOT the customer this order belongs to/);
  // The note must not repeat the real customer's address back.
  assert.ok(!result.decision.why.includes("jane@example.com"));
});

test("auto-send refuses that case on its own, even asked directly", () => {
  const result = run(
    {
      from: "stranger@example.net",
      subject: "Order #1042",
      body: "Where is my order #1042? It has not arrived.",
    },
    shopifyAnswer([shippedOrderNode]),
  );
  const verdict = mayAutoSend({
    settings: SETTINGS,
    read: result.read,
    chosen: result.chosen,
    parsed: result.parsed,
  });
  assert.strictEqual(verdict.allowed, false);
  assert.match(verdict.reasons.join(" "), /not confirmed as the customer/);
});

test("nothing about that order reaches the model", () => {
  const result = run(
    {
      from: "stranger@example.net",
      subject: "Order #1042",
      body: "Where is my order #1042? It has not arrived.",
    },
    shopifyAnswer([shippedOrderNode]),
  );
  // Whatever else happened, the prompt built from this decision carries
  // neither the customer's name nor their home address.
  const [, user] = buildMessages({
    category: result.read.category,
    order: result.chosen.order,
    customerMessage: result.read.cleanBody,
    settings: SETTINGS,
    requesterConfirmed: result.decision.requesterConfirmed === true,
  });
  assert.ok(!user.content.includes("Jane Doe"));
  assert.ok(!user.content.includes("1 High Street"));
});

test("the real customer, same email, is still answered", () => {
  const result = run(
    {
      from: "Jane Doe <JANE@Example.com>",
      subject: "Order #1042",
      body: "Hi, where is my order #1042? The tracking has not updated.",
    },
    shopifyAnswer([shippedOrderNode]),
  );
  assert.strictEqual(result.decision.action, "send");
  assert.strictEqual(result.decision.requesterConfirmed, true);
});

test("an order with no email address on it is escalated, not answered", () => {
  const result = run(
    {
      from: "Jane Doe <jane@example.com>",
      subject: "Order #1042",
      body: "Where is my order #1042?",
    },
    shopifyAnswer([{ ...shippedOrderNode, email: null, customer: null }]),
  );
  assert.strictEqual(result.decision.action, "escalate");
  assert.match(result.decision.why, /nothing to compare/);
});

test("a crafted email address cannot change the Shopify search", () => {
  const result = run(
    {
      from: '"x" <x" OR name:"#9999@evil.com>',
      subject: "where is my parcel",
      body: "Hi, where is my parcel? It has not arrived.",
    },
    shopifyAnswer([]),
  );
  assert.ok(result.search.search.startsWith('email:"'));
  assert.ok(!/[^\\]"\s*OR/.test(result.search.search));
});
