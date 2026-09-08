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

/*
 * Bare links.
 *
 * A model writes a web address without "https://" more often than with it, and
 * every mail client turns a bare one into something the customer can click.
 * The old pattern did not see them as links at all, so they never reached the
 * allow-list and went out unread.
 */

const shopContext = {
  incomingText: incomingFromJane,
  storeDomain: "test-shop.myshopify.com",
};

function shippedDraft(line) {
  return (
    `Hi Jane,\n\nOrder 1042 is on its way, tracking 9400111899223197428490. ` +
    `${line}\n\nSam at Test Shop`
  );
}

test("a bare-domain link that is not in the order data fails", () => {
  const result = checkDraft(
    shippedDraft("Please confirm your details at secure-payments-update.example/verify"),
    shippedFacts,
    shopContext,
  );
  assert.strictEqual(result.pass, false);
  assert.match(result.problems.join(" "), /not in the order data/);
});

test("a bare subdomain link fails", () => {
  const result = checkDraft(
    shippedDraft("Claim your refund at evil-refunds.example.com/claim"),
    shippedFacts,
    shopContext,
  );
  assert.strictEqual(result.pass, false);
  assert.match(result.problems.join(" "), /not in the order data/);
});

test("a bare domain with no path at all still fails", () => {
  const result = checkDraft(
    shippedDraft("More at secure-payments-update.example"),
    shippedFacts,
    shopContext,
  );
  assert.strictEqual(result.pass, false);
});

test("an uppercase scheme and a bare www. both fail", () => {
  assert.strictEqual(
    checkDraft(shippedDraft("Go to HTTPS://EVIL.EXAMPLE/x"), shippedFacts, shopContext)
      .pass,
    false,
  );
  assert.strictEqual(
    checkDraft(shippedDraft("Go to www.evil.example/x"), shippedFacts, shopContext).pass,
    false,
  );
});

test("a bare link written inside markdown fails", () => {
  const result = checkDraft(
    shippedDraft("[click here](secure-payments-update.example/verify)"),
    shippedFacts,
    shopContext,
  );
  assert.strictEqual(result.pass, false);
});

test("a look-alike of the shop's own domain fails", () => {
  assert.strictEqual(
    checkDraft(shippedDraft("See nottest-shop.myshopify.com/x"), shippedFacts, shopContext)
      .pass,
    false,
  );
  assert.strictEqual(
    checkDraft(
      shippedDraft("See test-shop.myshopify.com.evil.net/x"),
      shippedFacts,
      shopContext,
    ).pass,
    false,
  );
});

test("the shop's own site is still allowed written bare", () => {
  const result = checkDraft(
    shippedDraft("Our returns page is at test-shop.myshopify.com/policies/returns"),
    shippedFacts,
    shopContext,
  );
  assert.deepStrictEqual(result.problems, []);
});

/*
 * The other half of the same change: ordinary support English must not start
 * failing. A false alarm only costs the owner a glance, but a checker that
 * cries wolf on every reply is a checker nobody reads.
 */
test("ordinary support English is not mistaken for a link", () => {
  const ordinary = [
    "Thanks for writing in. Best wishes.",
    "It should arrive in 3.5 days, i.e. by Friday.",
    "We are open Mon.-Fri., 9 a.m. to 4 p.m.",
    "Your order no. 1042 was refunded in full on Mon., 4 p.m.",
    "The instructions are in READ-ME-FIRST.txt and manual.md.",
    "Your receipt.pdf is attached to this email.",
    "That is version 1.2 of the workflow, e.g. the current one.",
  ];
  for (const line of ordinary) {
    const result = checkDraft(shippedDraft(line), shippedFacts, shopContext);
    assert.deepStrictEqual(result.problems, [], `flagged wrongly: ${line}`);
  }
});

test("a file name behind a hostile host is still a link", () => {
  assert.strictEqual(
    checkDraft(shippedDraft("Open evil.example/receipt.pdf"), shippedFacts, shopContext)
      .pass,
    false,
  );
});

test("shortener and look-alike spellings are all caught", () => {
  const hostile = [
    "bit.ly/xyz",
    "tinyurl.com/abc",
    "my-shop.zip/invoice",
    "secure-payments-update.example/verify",
    "https://secure-payments-update.example/verify",
    "www.secure-payments-update.example",
  ];
  for (const line of hostile) {
    const result = checkDraft(shippedDraft(`Go to ${line}`), shippedFacts, shopContext);
    assert.strictEqual(result.pass, false, `missed: ${line}`);
  }
});

test("the real tracking number survives the link strip", () => {
  // The reason this matters: the strip feeds the invented-code scan, and a
  // pattern that ate the tracking number would accuse a correct reply.
  const draft =
    "Hi Jane,\n\nTracking 9400111899223197428490, follow it at " +
    "https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899223197428490 " +
    "for order 1042.\n\nSam at Test Shop";
  assert.ok(findTrackingLikeStrings(draft).includes("9400111899223197428490"));
  const result = checkDraft(draft, shippedFacts, shopContext);
  assert.deepStrictEqual(result.problems, []);
});

test("the link pattern does not blow up on hostile input", () => {
  const nasty = `${"a-".repeat(2000)}.${"b".repeat(2000)}`;
  const started = Date.now();
  for (let i = 0; i < 200; i++) checkDraft(shippedDraft(nasty), shippedFacts, shopContext);
  assert.ok(Date.now() - started < 3000, "the scan took too long on hostile input");
});

/*
 * A reply can send a customer somewhere else without using a link at all.
 * "Write to refunds@evil.example" is the same lever, so it gets the same rule.
 */
test("a contact address the shop does not control is reported", () => {
  const result = checkDraft(
    shippedDraft("For a refund please write to refunds@evil.example instead."),
    shippedFacts,
    shopContext,
  );
  assert.strictEqual(result.pass, false);
  assert.match(result.problems.join(" "), /write to refunds@evil\.example/);
});

test("the shop's own address and the customer's own are both fine", () => {
  assert.deepStrictEqual(
    checkDraft(
      shippedDraft("Reply to help@test-shop.myshopify.com if anything changes."),
      shippedFacts,
      shopContext,
    ).problems,
    [],
  );
  assert.deepStrictEqual(
    checkDraft(
      shippedDraft("We have you down as jane@example.com."),
      shippedFacts,
      shopContext,
    ).problems,
    [],
  );
});

/*
 * A link with a sign-in name in front of the host.
 *
 * A browser reads everything between "https://" and the "@" as a sign-in name
 * and throws it away, so this sends the customer to
 * secure-payments-update.example. The email scan used to read the same run as
 * an address, and addresses are blanked out before the link scan runs, so the
 * link scan never saw a link here at all.
 *
 * The case that matters is the customer forwarding the scam and asking "is this
 * you?", because the check used to waive any address that appeared in their
 * message — and there it is, in their message.
 */
const USERINFO_LINK = "https://x@secure-payments-update.example/verify";

function customerForwarded(line) {
  return {
    incomingText:
      `Jane Doe <jane@example.com>\nOrder #1042\n` +
      `I got an email saying to go to ${line} — is that really you?`,
    storeDomain: "test-shop.myshopify.com",
  };
}

test("a sign-in-name link fails even when the customer's own email quotes it", () => {
  const result = checkDraft(
    shippedDraft(`Yes, that is us. Please confirm at ${USERINFO_LINK}`),
    shippedFacts,
    customerForwarded(USERINFO_LINK),
  );
  assert.strictEqual(result.pass, false);
  assert.match(result.problems.join(" "), /secure-payments-update\.example/);
});

test("a sign-in-name link fails when the customer never mentioned it", () => {
  const result = checkDraft(
    shippedDraft(`Please confirm your order at ${USERINFO_LINK}`),
    shippedFacts,
    shopContext,
  );
  assert.strictEqual(result.pass, false);
  assert.match(result.problems.join(" "), /secure-payments-update\.example/);
});

/*
 * The general rule underneath both of the above: what the customer's message
 * happens to contain is not a permission. Anyone can write anything into an
 * email to the shop, so letting a quoted string widen the allow-list hands the
 * decision to whoever sent the email.
 */
test("quoting the customer's message does not widen what a link may be", () => {
  const scam = "https://secure-payments-update.example/verify";
  const result = checkDraft(
    shippedDraft(`Yes, please go to ${scam} as they asked.`),
    shippedFacts,
    customerForwarded(scam),
  );
  assert.strictEqual(result.pass, false);
  assert.match(result.problems.join(" "), /not in the order data/);
});

test("quoting the customer's message does not widen what an address may be", () => {
  const scam = "refunds@secure-payments-update.example";
  const result = checkDraft(
    shippedDraft(`Yes, that is us. Write to ${scam} for the refund.`),
    shippedFacts,
    customerForwarded(scam),
  );
  assert.strictEqual(result.pass, false);
  assert.match(result.problems.join(" "), /write to refunds@secure-payments-update\.example/);
});

/*
 * The same address written without a scheme. "x@host/path" is an address as far
 * as the email scan is concerned, so closing the link route alone would have
 * left this one open.
 */
test("a bare sign-in-name link is refused as an address, quoted or not", () => {
  const bare = "x@secure-payments-update.example/verify";
  assert.strictEqual(
    checkDraft(shippedDraft(`Confirm at ${bare}`), shippedFacts, customerForwarded(bare)).pass,
    false,
  );
  assert.strictEqual(
    checkDraft(shippedDraft(`Confirm at ${bare}`), shippedFacts, shopContext).pass,
    false,
  );
});

/*
 * The From line still decides. A customer writing in from their own address may
 * be told what the shop has on file for them, which is the case above at
 * "the shop's own address and the customer's own are both fine" — and a From
 * line naming two candidates decides nothing, so nothing is waived.
 */
test("an ambiguous From line waives no address", () => {
  const result = checkDraft(
    shippedDraft("We have you down as jane@example.com."),
    shippedFacts,
    {
      incomingText:
        `"Jane <jane@example.com>" <stranger@evil.net>\nOrder #1042\n` +
        `Where is my order #1042?`,
      storeDomain: "test-shop.myshopify.com",
    },
  );
  assert.strictEqual(result.pass, false);
  assert.match(result.problems.join(" "), /write to jane@example\.com/);
});
