// ==== BEGIN SHARED ====
/*
 * The last gate before anything reaches a customer.
 *
 * A language model will occasionally leave a placeholder in, drop the real
 * tracking number, or invent one that looks convincing. Every one of those is
 * cheap to catch here and expensive to catch in a customer's inbox. A draft
 * that fails is never sent; it goes to the owner with the reason on top.
 */

const PLACEHOLDER_PATTERNS = [
  /\[[^\]\n]{2,40}\]/, // [Customer Name]
  /\{\{[^}\n]{1,40}\}\}/, // {{name}}
  /\{[A-Za-z_][A-Za-z0-9_ ]{1,30}\}/, // {name}
  /\bXXXX+\b/,
  /\bTBD\b/,
  /\bYOUR[_ ]NAME\b/i,
  /\bINSERT [A-Z ]{3,}\b/i,
  /\bas an AI\b/i,
  /\bI'?m an AI language model\b/i,
];

/*
 * Web addresses, in the forms a model actually writes them.
 *
 * Used twice, for two different jobs: to take links out of the text before
 * looking for invented tracking codes, and to check the links themselves.
 */
const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<>()[\]{}"'`]+/gi;

function findUrls(text) {
  return String(text || "").match(URL_PATTERN) || [];
}

/** Drops the punctuation a sentence leaves stuck to the end of a link. */
function tidyUrl(url) {
  return String(url || "").replace(/[.,;:!?)\]}>'"]+$/, "");
}

/** The host part of a link, without the scheme, the www, or the path. */
function urlHost(url) {
  return tidyUrl(url)
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split(/[/?#]/)[0]
    .toLowerCase();
}

/*
 * The fixed allow-list of hosts a reply may link to.
 *
 * Deliberately empty. A reply's links come from the order Shopify handed over,
 * plus the store's own domain, which arrives from the settings. Every host
 * added here is somewhere a reply nobody read can send a customer, so it stays
 * empty unless there is a reason it cannot.
 */
const ALLOWED_LINK_HOSTS = [];

/*
 * Asking a customer for payment details, in the shapes a phishing line takes.
 *
 * A support reply never needs any of these. The store already has the money.
 */
const PAYMENT_REQUEST_PATTERNS = [
  /\bcard\s+(?:details|number|numbers|info|information)\b/i,
  /\b(?:credit|debit)\s+card\b/i,
  /\bcvv\b/i,
  /\bcvc\b/i,
  /\bsecurity\s+code\b/i,
  /\bexpiry\s+date\b/i,
  /\bbank\s+(?:details|account|transfer)\b/i,
  /\bsort\s+code\b/i,
  /\biban\b/i,
  /\brouting\s+number\b/i,
  /\bpayment\s+(?:details|information)\b/i,
  /\bbilling\s+(?:details|information)\b/i,
  /\b(?:confirm|verify|update|re-?enter|enter)\s+your\s+(?:payment|billing|card|bank)\b/i,
];

/** Lower case, letters and digits only, so two spellings compare equal. */
function flatten(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/*
 * Names and addresses that came out of Shopify rather than out of the email.
 *
 * The reply is only ever read by whoever sent the message. Their own details
 * are theirs to have; a stranger's are not. Anything the order carried that
 * the incoming email did not is refused here, whatever the model's reason for
 * including it.
 *
 * Only values worth protecting are listed: the full name, the street lines and
 * the postcode. A given name on its own is not an address and turns up in every
 * ordinary greeting, so it is not treated as a disclosure.
 */
function privateValues(facts) {
  const values = [];
  const add = (label, value) => {
    const text = String(value == null ? "" : value).trim();
    if (text.length >= 4) values.push({ label, value: text });
  };

  add("the customer's name", facts && facts.customerName);
  const address = (facts && facts.shippingAddress) || null;
  if (address) {
    add("the name on the shipping address", address.name);
    add("the shipping address", address.line1);
    add("the shipping address", address.line2);
    add("the postcode on the shipping address", address.zip);
  }
  return values;
}

/** Things shaped like a tracking number: long runs of letters and digits. */
function findTrackingLikeStrings(text) {
  const found = new Set();
  // Links are taken out first. A web address ends in a long run of letters and
  // digits often enough that leaving them in made the checker accuse a correct
  // reply of inventing a code, purely for quoting the tracking link it was
  // told to quote.
  const withoutLinks = String(text || "").replace(URL_PATTERN, " ");
  const pattern = /\b(?=[A-Z0-9-]{10,35}\b)(?=[^\s]*\d)[A-Z0-9][A-Z0-9-]{9,34}\b/g;
  let match;
  while ((match = pattern.exec(withoutLinks.toUpperCase())) !== null) {
    found.add(match[0].replace(/-/g, ""));
  }
  return [...found];
}

/**
 * Checks a drafted reply against the facts it is supposed to be built from.
 *
 * `context` carries what the draft is allowed to have come from:
 *   incomingText - the email as it arrived, headers and body. Any name or
 *                  address in the draft that is not in the order data or in
 *                  here has no business being there.
 *   storeDomain  - the shop's own domain, so a link to the shop is allowed.
 *
 * Returns { pass, problems }. An empty problems list is the only pass.
 */
function checkDraft(draft, facts, context) {
  const problems = [];
  const text = String(draft == null ? "" : draft).trim();
  const incoming = String((context && context.incomingText) || "");
  const storeDomain = urlHost(String((context && context.storeDomain) || ""));

  if (text.length === 0) {
    return { pass: false, problems: ["The draft is empty."] };
  }
  if (text.length < 40) {
    problems.push("The draft is too short to be a real reply.");
  }
  if (text.length > 2500) {
    problems.push("The draft is far longer than a support reply should be.");
  }

  for (const pattern of PLACEHOLDER_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      problems.push(`The draft still contains a placeholder: ${match[0]}`);
      break;
    }
  }

  const realTracking = (facts && facts.tracking ? facts.tracking : [])
    .map((entry) => String(entry.number || "").toUpperCase().replace(/-/g, ""))
    .filter(Boolean);

  const mentioned = findTrackingLikeStrings(text);

  if (realTracking.length > 0) {
    const includesReal = realTracking.some((number) =>
      text.toUpperCase().replace(/-/g, "").includes(number),
    );
    if (!includesReal) {
      problems.push(
        "The order has a tracking number but the draft does not quote it.",
      );
    }
  }

  const invented = mentioned.filter((candidate) => {
    if (realTracking.includes(candidate)) return false;
    // The order number itself is allowed to appear, and so is anything else
    // we handed the model on purpose.
    const allowed = [
      String((facts && facts.orderNumber) || "").toUpperCase().replace(/[#-]/g, ""),
    ].filter(Boolean);
    return !allowed.some((value) => candidate.includes(value));
  });

  if (invented.length > 0) {
    problems.push(
      `The draft contains a code that is not in the order data: ${invented[0]}. ` +
        `It may have been invented.`,
    );
  }

  if (facts && facts.orderNumber) {
    const bare = String(facts.orderNumber).replace(/^#/, "");
    if (!text.includes(bare)) {
      problems.push("The draft does not mention the order number.");
    }
  }

  // Links. A reply may point at the tracking link Shopify handed over and at
  // the shop's own site. Anywhere else is somewhere the customer's message
  // asked to send them, and no reply goes out carrying that.
  const orderUrls = new Set();
  const orderHosts = new Set(ALLOWED_LINK_HOSTS);
  if (storeDomain) orderHosts.add(storeDomain);
  for (const entry of (facts && facts.tracking) || []) {
    if (entry && entry.url) {
      orderUrls.add(tidyUrl(entry.url).toLowerCase());
      orderHosts.add(urlHost(entry.url));
    }
  }

  for (const raw of findUrls(text)) {
    const url = tidyUrl(raw);
    const known =
      orderUrls.has(url.toLowerCase()) ||
      orderHosts.has(urlHost(url)) ||
      [...orderHosts].some((host) => host && urlHost(url).endsWith(`.${host}`));
    if (!known) {
      problems.push(
        `The draft links to ${url}, which is not in the order data. ` +
          `A reply only ever links to the tracking link on the order or to ` +
          `the shop's own site.`,
      );
      break;
    }
  }

  // Asking a customer for card or bank details. The shop already has the
  // money, so there is no version of this that is the bot doing its job.
  for (const pattern of PAYMENT_REQUEST_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      problems.push(
        `The draft asks the customer about payment details ("${match[0]}"). ` +
          `A support reply never does that.`,
      );
      break;
    }
  }

  // Names and addresses out of Shopify that the person asking never gave.
  const flatDraft = flatten(text);
  const flatIncoming = flatten(incoming);
  for (const entry of privateValues(facts)) {
    const needle = flatten(entry.value);
    if (!needle) continue;
    if (flatDraft.includes(needle) && !flatIncoming.includes(needle)) {
      problems.push(
        `The draft gives out ${entry.label}, which was not in the email it ` +
          `is replying to.`,
      );
      break;
    }
  }

  return { pass: problems.length === 0, problems };
}

/** The note that goes on top of a draft the owner has to look at. */
function ownerNote({ why, problems }) {
  const lines = ["--- Kitset: read before sending ---"];
  if (why) lines.push(why);
  if (problems && problems.length > 0) {
    lines.push("Automatic checks that failed:");
    for (const problem of problems) lines.push(`  - ${problem}`);
  }
  lines.push("--- end of note, the drafted reply follows ---", "");
  return lines.join("\n");
}
// ==== END SHARED ====

module.exports = { checkDraft, findTrackingLikeStrings, findUrls, ownerNote };
