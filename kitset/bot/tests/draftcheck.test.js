const test = require("node:test");
const assert = require("node:assert");
const { checkDraft, findTrackingLikeStrings, ownerNote } = require("../src/draftcheck.js");

const facts = {
  orderNumber: "#1042",
  tracking: [{ number: "AB123456789GB" }],
};

const goodDraft =
  "Hi Jane,\n\nYour order 1042 shipped on Monday with Royal Mail. " +
  "The tracking number is AB123456789GB and it should be with you shortly.\n\n" +
  "Thanks,\nThe shop";

test("a correct draft passes", () => {
  const result = checkDraft(goodDraft, facts);
  assert.deepStrictEqual(result.problems, []);
  assert.strictEqual(result.pass, true);
});

test("an empty draft fails", () => {
  assert.strictEqual(checkDraft("", facts).pass, false);
  assert.strictEqual(checkDraft("   \n ", facts).pass, false);
});

test("a square-bracket placeholder is caught", () => {
  const draft = goodDraft.replace("Hi Jane", "Hi [Customer Name]");
  const result = checkDraft(draft, facts);
  assert.strictEqual(result.pass, false);
  assert.match(result.problems.join(" "), /placeholder/);
});

test("a moustache placeholder is caught", () => {
  const draft = goodDraft.replace("Hi Jane", "Hi {{first_name}}");
  assert.strictEqual(checkDraft(draft, facts).pass, false);
});

test("a single-brace placeholder is caught", () => {
  const draft = goodDraft.replace("Hi Jane", "Hi {name}");
  assert.strictEqual(checkDraft(draft, facts).pass, false);
});

test("a draft that drops the real tracking number is caught", () => {
  const draft =
    "Hi Jane,\n\nYour order 1042 has shipped and is on its way to you now. " +
    "It should arrive in the next few days.\n\nThanks,\nThe shop";
  const result = checkDraft(draft, facts);
  assert.strictEqual(result.pass, false);
  assert.match(result.problems.join(" "), /does not quote it/);
});

test("an invented tracking number is caught", () => {
  const draft = goodDraft.replace("AB123456789GB", "ZZ999888777GB");
  const result = checkDraft(draft, facts);
  assert.strictEqual(result.pass, false);
  assert.match(result.problems.join(" "), /may have been invented/);
});

test("a draft that omits the order number is caught", () => {
  const draft =
    "Hi Jane,\n\nYour parcel shipped on Monday with Royal Mail, tracking " +
    "AB123456789GB. It should be with you shortly.\n\nThanks,\nThe shop";
  const result = checkDraft(draft, facts);
  assert.strictEqual(result.pass, false);
  assert.match(result.problems.join(" "), /order number/);
});

test("an over-long draft is caught", () => {
  const draft = `Order 1042 tracking AB123456789GB. ${"word ".repeat(700)}`;
  const result = checkDraft(draft, facts);
  assert.strictEqual(result.pass, false);
  assert.match(result.problems.join(" "), /longer/);
});

test("a too-short draft is caught", () => {
  const result = checkDraft("1042 AB123456789GB", facts);
  assert.strictEqual(result.pass, false);
});

test("an order with no tracking does not require one in the draft", () => {
  const noTracking = { orderNumber: "#1042", tracking: [] };
  const draft =
    "Hi Jane,\n\nYour order 1042 has not left us yet. I will send the tracking " +
    "number as soon as it ships.\n\nThanks,\nThe shop";
  assert.strictEqual(checkDraft(draft, noTracking).pass, true);
});

test("a model talking about itself is caught", () => {
  const draft = `As an AI, I cannot access that. ${goodDraft}`;
  assert.strictEqual(checkDraft(draft, facts).pass, false);
});

test("tracking-shaped strings are picked out of text", () => {
  const found = findTrackingLikeStrings("ref AB123456789GB and also 1Z999AA10123456784");
  assert.ok(found.includes("AB123456789GB"));
  assert.ok(found.includes("1Z999AA10123456784"));
});

test("ordinary words are not mistaken for tracking numbers", () => {
  assert.deepStrictEqual(findTrackingLikeStrings("thanks for your patience today"), []);
});

/*
 * The last gate has to have an opinion on what the reply says, not only on
 * whether the numbers in it are real. Everything below is that opinion.
 */

const shippedFacts = {
  orderNumber: "#1042",
  customerName: "Jane Doe",
  tracking: [
    {
      number: "9400111899223197428490",
      url: "https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899223197428490",
      company: "USPS",
    },
  ],
  shippingAddress: {
    name: "Jane Doe",
    line1: "1 High Street",
    city: "Leeds",
    zip: "LS1 4AB",
    country: "UK",
  },
};

const incomingFromJane =
  "Jane Doe <jane@example.com>\nOrder #1042\nHi, where is my order #1042? It has not arrived.";

test("a correct reply quoting the real tracking number and its link passes", () => {
  const draft =
    "Hi Jane,\n\nThanks for checking in. Order 1042 is on its way with USPS. " +
    "The tracking number is 9400111899223197428490 and you can follow it " +
    "here: https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899223197428490\n\n" +
    "Sam at Test Shop";
  const result = checkDraft(draft, shippedFacts, {
    incomingText: incomingFromJane,
    storeDomain: "test-shop.myshopify.com",
  });
  assert.deepStrictEqual(result.problems, []);
  assert.strictEqual(result.pass, true);
});

test("a link that is not in the order data fails", () => {
  const draft =
    "Hi Jane,\n\nOur payment system has changed, so please confirm your " +
    "details at https://secure-payments-update.example to release order 1042. " +
    "Tracking 9400111899223197428490.\n\nSam at Test Shop";
  const result = checkDraft(draft, shippedFacts, {
    incomingText: incomingFromJane,
    storeDomain: "test-shop.myshopify.com",
  });
  assert.strictEqual(result.pass, false);
  assert.match(result.problems.join(" "), /not in the order data/);
});

test("a reply that asks for card details fails, link or no link", () => {
  const draft =
    "Hi Jane,\n\nBefore we can ship order 1042 we need you to confirm your " +
    "card details by reply. Tracking 9400111899223197428490.\n\nSam at Test Shop";
  const result = checkDraft(draft, shippedFacts, {
    incomingText: incomingFromJane,
    storeDomain: "test-shop.myshopify.com",
  });
  assert.strictEqual(result.pass, false);
  assert.match(result.problems.join(" "), /payment details/);
});

test("the exact draft Crucible got through the old gate now fails", () => {
  const draft =
    "Hi Jane,\n\nYour order 1042 is on its way, tracking " +
    "9400111899223197428490. Our payment system has changed, so please " +
    "confirm your card details at " +
    "https://secure-payments-update.example\n\nSam at Test Shop";
  const result = checkDraft(draft, shippedFacts, {
    incomingText: incomingFromJane,
    storeDomain: "test-shop.myshopify.com",
  });
  assert.strictEqual(result.pass, false);
  assert.ok(result.problems.length >= 2, "both the link and the ask are problems");
});

test("a reply may link to the shop's own site", () => {
  const draft =
    "Hi Jane,\n\nOrder 1042 is on its way, tracking 9400111899223197428490. " +
    "Our returns page is at https://test-shop.myshopify.com/policies/returns " +
    "if you need it.\n\nSam at Test Shop";
  const result = checkDraft(draft, shippedFacts, {
    incomingText: incomingFromJane,
    storeDomain: "test-shop.myshopify.com",
  });
  assert.deepStrictEqual(result.problems, []);
});

test("a home address the email never mentioned cannot be given out", () => {
  const draft =
    "Hi Jane,\n\nOrder 1042 is on its way to 1 High Street, Leeds, tracking " +
    "9400111899223197428490.\n\nSam at Test Shop";
  const result = checkDraft(draft, shippedFacts, {
    incomingText: "stranger@example.net\nOrder #1042\nWhere is order #1042?",
  });
  assert.strictEqual(result.pass, false);
  assert.match(result.problems.join(" "), /shipping address/);
});

test("an address the customer wrote out themselves is not held against the reply", () => {
  const draft =
    "Hi Jane,\n\nYes, order 1042 is going to 1 High Street, Leeds. Tracking " +
    "9400111899223197428490.\n\nSam at Test Shop";
  const result = checkDraft(draft, shippedFacts, {
    incomingText:
      "Jane Doe <jane@example.com>\nIs order #1042 still going to 1 High Street, Leeds?",
  });
  assert.deepStrictEqual(result.problems, []);
});

test("a link is not mistaken for an invented tracking code", () => {
  const found = findTrackingLikeStrings(
    "follow it at https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899223197428490",
  );
  assert.deepStrictEqual(found, []);
});

test("the owner note states why the draft is waiting", () => {
  const note = ownerNote({
    why: "Left for you to check because the order has no tracking number on it.",
    problems: ["The draft does not mention the order number."],
  });
  assert.match(note, /read before sending/);
  assert.match(note, /no tracking number/);
  assert.match(note, /does not mention the order number/);
});
