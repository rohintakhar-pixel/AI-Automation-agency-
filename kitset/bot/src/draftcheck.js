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
 * Two shapes, and both matter. One carries "http://", "https://" or "www." and
 * is unmistakable. The other is a bare host — secure-payments-update.example
 * /verify — which is how a model writes a link at least as often, and which
 * every mail client turns into something the customer can click. Only the
 * first shape used to be recognised, so a bare one was never treated as a link
 * at all: it never reached the allow-list below, and the reply went out clean.
 *
 * Used twice, for two different jobs: to take links out of the text before
 * looking for invented tracking codes, and to check the links themselves. Both
 * jobs read this one pattern on purpose, so the two cannot drift apart.
 *
 * A bare host has to start at a boundary. That is not fussiness: without it the
 * scanner starts again at every character inside a long hyphenated run, which
 * is slow enough on a deliberately awkward draft to be worth avoiding.
 */
const URL_PATTERN =
  /(?:https?:\/\/|www\.)[^\s<>()[\]{}"'`]+|(?<![a-z0-9.@-])(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}\b(?:\/[^\s<>()[\]{}"'`]*)?/gi;

/*
 * Email addresses. Blanked out before the link scan, so that a contact address
 * is not reported as a link to the domain after its "@", and checked on their
 * own terms further down.
 *
 * It has to start at a boundary and both halves are length-capped. An unbounded
 * run that can start anywhere re-reads the rest of the draft from every
 * character in it, which on a long reply is slow enough to notice.
 */
const EMAIL_PATTERN =
  /(?<![^\s<>@,;:"'()[\]])[^\s<>@,;:"'()[\]]{1,64}@[^\s<>@,;:"'()[\]]{1,255}\.[a-z]{2,24}/gi;

/*
 * Endings that are file extensions in ordinary support English rather than
 * top-level domains. Only ever applied to a bare match: "receipt.pdf" is a
 * file, but "evil.example/receipt.pdf" is still a link, because its host is
 * evil.example.
 *
 * Endings that are also real top-level domains stay off the list, however
 * file-like they look: ".zip" and ".mov" can be bought and are used for exactly
 * this.
 *
 * The list is short on purpose. Recognising a bare host is deliberately
 * generous, because the two mistakes do not cost the same. Treating a stray
 * word as a link costs the owner ten seconds reading a draft. Missing a real
 * one costs a customer who clicked what their shop sent them.
 */
const NOT_A_DOMAIN_ENDING = new Set([
  "md", "txt", "pdf", "png", "jpg", "jpeg", "gif", "svg", "webp", "csv", "tsv",
  "json", "xml", "yml", "yaml", "xls", "xlsx", "doc", "docx", "ppt", "pptx",
  "html", "htm", "css", "js", "mjs", "cjs", "ts", "log", "gz", "tar",
]);

/** Blanks out email addresses, keeping the length so nothing else shifts. */
function withoutEmailAddresses(text) {
  return String(text == null ? "" : text).replace(EMAIL_PATTERN, (match) =>
    " ".repeat(match.length),
  );
}

function findUrls(text) {
  const scanned = withoutEmailAddresses(text);
  const found = scanned.match(URL_PATTERN) || [];
  return found.filter((raw) => {
    if (/^(?:https?:\/\/|www\.)/i.test(raw)) return true;
    const host = urlHost(raw);
    return !NOT_A_DOMAIN_ENDING.has(host.slice(host.lastIndexOf(".") + 1));
  });
}

/** Every contact address a draft hands over, lower-cased and de-duplicated. */
function findContactAddresses(text) {
  const found = String(text == null ? "" : text).match(EMAIL_PATTERN) || [];
  return [...new Set(found.map((address) => address.trim().toLowerCase()))];
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
  // "Has a digit in it" is asked of the candidate itself, and only as far as the
  // candidate can reach — a match is 35 characters at most, so a digit beyond
  // that was never part of it anyway. Same answer on any real draft, and it
  // stops the scan re-reading the rest of a long unbroken string from every
  // character in it.
  const pattern = /\b(?=[A-Z0-9-]{10,35}\b)(?=[A-Z0-9-]{0,34}\d)[A-Z0-9][A-Z0-9-]{9,34}\b/g;
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
  const flatIncomingText = incoming.toLowerCase();
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

  // A reply can send a customer somewhere else without using a link at all:
  // "please write to refunds@evil.example". Same lever, so the same rule. The
  // shop's own addresses are fine, and so is an address the customer put in
  // the email themselves.
  for (const address of findContactAddresses(text)) {
    const host = address.slice(address.lastIndexOf("@") + 1);
    const known =
      flatIncomingText.includes(address) ||
      orderHosts.has(host) ||
      [...orderHosts].some((allowed) => allowed && host.endsWith(`.${allowed}`));
    if (!known) {
      problems.push(
        `The draft tells the customer to write to ${address}, which is not ` +
          `an address the shop controls. A reply only ever points back at ` +
          `the shop.`,
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

module.exports = {
  checkDraft,
  findTrackingLikeStrings,
  findUrls,
  findContactAddresses,
  ownerNote,
};
