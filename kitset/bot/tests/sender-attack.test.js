const test = require("node:test");
const assert = require("node:assert");
const { simpleParser } = require("mailparser");

const { readEmail } = require("../src/classify.js");
const { buildOrderSearch, parseOrderResponse, chooseOrder } = require("../src/shopify.js");
const { decide, mayAutoSend } = require("../src/decide.js");
const { buildMessages } = require("../src/prompt.js");

/*
 * The impersonation attack, end to end, against the real mail parser.
 *
 * The Gmail node in the shipped workflow has Simplify switched off, so it
 * hands over a message parsed by mailparser. That is the package used here, so
 * the shapes below are what really arrives rather than what one would expect
 * to arrive. The difference matters: the two spellings of this attack are
 * parsed in opposite directions, and only running it shows that.
 *
 * The attacker forges nothing. Their From address is genuinely theirs, so the
 * message passes SPF, DKIM and every spam filter clean. All they do is type an
 * address into the "your name" box of their own mail program.
 *
 * Not covered here: n8n itself. Everything from the Gmail node inwards is
 * tested; the node's own behaviour needs a running n8n and is out of scope,
 * as it has been for every pass.
 */

const QUOTED = '"Jane <real.customer@example.com>" <stranger@evil.net>';
const UNQUOTED = "Jane <real.customer@example.com> <stranger@evil.net>";
const HONEST = '"Jane Doe" <real.customer@example.com>';

function rawMessage(fromHeader) {
  return (
    `From: ${fromHeader}\r\n` +
    "To: shop@test-shop.example\r\n" +
    "Subject: Order #1042\r\n" +
    "Date: Sun, 06 Sep 2026 12:00:00 +0000\r\n" +
    "\r\n" +
    "Hi, where is my order #1042? It has not arrived.\r\n"
  );
}

/*
 * What bot/adapters/read-email.js builds out of the parsed message. Mirrored
 * rather than imported, because the adapter is n8n Code-node source and needs
 * $input to run. Keep the two in step.
 */
function emailFromParsed(parsed) {
  const fromParsed = parsed.from && typeof parsed.from === "object" ? parsed.from : null;
  return {
    from: String((fromParsed && fromParsed.text) || ""),
    fromParsed,
    subject: String(parsed.subject || ""),
    body: String(parsed.text || ""),
    headers: {},
  };
}

/** The reader as it shipped in da20d06: the first bracketed address wins. */
function shippedReader(fromText) {
  const match = String(fromText || "").match(/<([^<>@\s]+@[^<>@\s]+\.[a-z]{2,})>/i);
  return match ? match[1].toLowerCase() : null;
}

const SETTINGS = {
  storeName: "Test Shop",
  signOffName: "Sam at Test Shop",
  autoSend: true,
  returnPolicy: "Returns accepted within 30 days if unworn.",
};

const janesOrder = {
  id: "gid://shopify/Order/1",
  name: "#1042",
  createdAt: "2026-08-30T10:00:00Z",
  displayFinancialStatus: "PAID",
  displayFulfillmentStatus: "FULFILLED",
  cancelledAt: null,
  email: "real.customer@example.com",
  customer: {
    firstName: "Jane",
    lastName: "Doe",
    email: "real.customer@example.com",
  },
  shippingAddress: {
    name: "Jane Doe",
    address1: "1 High Street",
    city: "Leeds",
    country: "UK",
  },
  lineItems: { edges: [{ node: { title: "Blue jacket", quantity: 1 } }] },
  fulfillments: [
    {
      status: "SUCCESS",
      trackingInfo: [
        { number: "AB123456789GB", url: "https://track/AB", company: "Royal Mail" },
      ],
    },
  ],
};

const shopifyAnswer = {
  data: { orders: { edges: [{ node: janesOrder }] } },
};

/** The whole chain, from a raw message to what the bot would do about it. */
async function runRaw(fromHeader) {
  const parsed = await simpleParser(rawMessage(fromHeader));
  const read = readEmail(emailFromParsed(parsed));
  const search = buildOrderSearch({
    orderNumber: read.orderNumber,
    customerEmail: read.customerEmail,
  });
  const orders = parseOrderResponse(shopifyAnswer);
  const chosen = { ...chooseOrder(orders, search.by), searchedBy: search.by };
  const decision = decide({ settings: SETTINGS, read, chosen, parsed: orders });
  return { parsed, read, chosen, decision };
}

test("the attack really did work against the shipped reader", async () => {
  const parsed = await simpleParser(rawMessage(QUOTED));
  // The mailbox is the attacker's. The customer's address is only a display
  // name. The shipped reader took the first bracketed address it saw.
  assert.strictEqual(parsed.from.value[0].address, "stranger@evil.net");
  assert.strictEqual(shippedReader(parsed.from.text), "real.customer@example.com");
});

test("done-condition 1: the display-name attack gets no send and no draft", async () => {
  const result = await runRaw(QUOTED);
  assert.strictEqual(result.read.customerEmail, null);
  assert.strictEqual(result.chosen.order.orderNumber, "#1042");
  assert.strictEqual(result.decision.action, "escalate");
  assert.strictEqual(result.decision.requesterIsNotTheCustomer, true);
});

test("done-condition 1: the unquoted spelling is refused too", async () => {
  // mailparser resolves this one the other way round: the customer's address
  // becomes the mailbox and the attacker's lands in the display name. Trusting
  // the parsed address alone would have handed this spelling straight through.
  const parsed = await simpleParser(rawMessage(UNQUOTED));
  assert.strictEqual(parsed.from.value[0].address, "real.customer@example.com");

  const result = await runRaw(UNQUOTED);
  assert.strictEqual(result.read.customerEmail, null);
  assert.strictEqual(result.decision.action, "escalate");
  assert.strictEqual(result.decision.requesterIsNotTheCustomer, true);
});

test("done-condition 2: no name or address reaches the model's context", async () => {
  for (const spelling of [QUOTED, UNQUOTED]) {
    const result = await runRaw(spelling);
    // The prompt is where the leak would happen, so the prompt is what is
    // checked. requesterConfirmed is the flag that decides whether the
    // customer's details are put in front of the model at all, and it is
    // reached only through the ownership check.
    const [, user] = buildMessages({
      category: result.read.category,
      order: result.chosen.order,
      customerMessage: result.read.cleanBody,
      settings: SETTINGS,
      requesterConfirmed: result.decision.requesterConfirmed === true,
    });
    assert.ok(!user.content.includes("Jane Doe"), "the customer's name leaked");
    assert.ok(!user.content.includes("1 High Street"), "the address leaked");
  }
  // Worth knowing, and deliberately not asserted: the tracking number is NOT
  // gated on requesterConfirmed, so it would be in the prompt if a prompt were
  // ever built for an unconfirmed requester. One is not. decide() returns
  // escalate, and the workflow's IF node on decision.action routes escalate
  // away from the model. Nothing reaches a stranger. But the only thing
  // stopping it is that routing, not the prompt builder.
});

test("that check is not vacuous: the confirmed customer does get the facts", async () => {
  const result = await runRaw(HONEST);
  const [, user] = buildMessages({
    category: result.read.category,
    order: result.chosen.order,
    customerMessage: result.read.cleanBody,
    settings: SETTINGS,
    requesterConfirmed: result.decision.requesterConfirmed === true,
  });
  assert.ok(user.content.includes("AB123456789GB"), "the real customer got nothing");
});

test("done-condition 3: the owner is told the requester is not the customer", async () => {
  const result = await runRaw(QUOTED);
  assert.match(result.decision.why, /NOT confirmed as the customer/);
  // And the note does not repeat the real customer's address back into a draft.
  assert.ok(!result.decision.why.includes("real.customer@example.com"));
});

test("auto-send refuses the attack on its own account as well", async () => {
  const parsed = await simpleParser(rawMessage(QUOTED));
  const read = readEmail(emailFromParsed(parsed));
  const orders = parseOrderResponse(shopifyAnswer);
  const verdict = mayAutoSend({
    settings: SETTINGS,
    read,
    chosen: { ...chooseOrder(orders, "order_number"), searchedBy: "order_number" },
    parsed: orders,
  });
  assert.strictEqual(verdict.allowed, false);
});

test("the real customer is still answered", async () => {
  const result = await runRaw(HONEST);
  assert.strictEqual(result.read.customerEmail, "real.customer@example.com");
  assert.strictEqual(result.decision.action, "send");
  assert.notStrictEqual(result.decision.requesterIsNotTheCustomer, true);
});
