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

test("the owner note states why the draft is waiting", () => {
  const note = ownerNote({
    why: "Left for you to check because the order has no tracking number on it.",
    problems: ["The draft does not mention the order number."],
  });
  assert.match(note, /read before sending/);
  assert.match(note, /no tracking number/);
  assert.match(note, /does not mention the order number/);
});
