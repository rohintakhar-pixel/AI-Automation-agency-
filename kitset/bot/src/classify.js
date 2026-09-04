// ==== BEGIN SHARED ====
/*
 * Reading a support email.
 *
 * Three jobs: throw away mail no human wrote, throw away the quoted history
 * underneath the reply, and work out which of the three questions is being
 * asked. When it is not clearly one of them, say so and let a person read it.
 * Guessing is what produces the wrong reply to a customer.
 */

/** Markers that begin the quoted history under a reply. */
const QUOTE_MARKERS = [
  /^\s*>/,
  /^\s*On .{5,120}\bwrote:\s*$/i,
  /^\s*-{2,}\s*Original Message\s*-{2,}\s*$/i,
  /^\s*_{10,}\s*$/,
  /^\s*From:\s*.+$/i,
  /^\s*Sent from my /i,
  /^\s*Begin forwarded message:\s*$/i,
];

/**
 * Keeps only what the person wrote this time.
 *
 * Without this, an old thread about a return keeps voting on every new
 * message in the same conversation.
 */
function stripQuotedHistory(body) {
  const lines = String(body || "").split(/\r?\n/);
  const kept = [];
  for (const line of lines) {
    if (QUOTE_MARKERS.some((marker) => marker.test(line))) break;
    kept.push(line);
  }
  // A reply that is nothing but quoted text leaves us with nothing. In that
  // case keep the original, so a human still sees something.
  const text = kept.join("\n").trim();
  return text.length > 0 ? text : String(body || "").trim();
}

const AUTOMATED_SENDERS = [
  "noreply",
  "no-reply",
  "no_reply",
  "donotreply",
  "do-not-reply",
  "mailer-daemon",
  "postmaster",
  "bounce",
  "notifications@shopify.com",
  "mailchimp",
  "newsletter",
];

const AUTOMATED_SUBJECTS = [
  /out of office/i,
  /automatic reply/i,
  /auto[- ]?reply/i,
  /delivery status notification/i,
  /undeliverable/i,
  /returned mail/i,
  /mail delivery (failed|subsystem)/i,
  /your order .* (is on the way|has shipped|confirmation)/i,
];

/**
 * True for machine mail: bounces, newsletters, out-of-office, Shopify's own
 * order confirmations. Answering any of these is at best noise and at worst
 * a loop of two robots emailing each other.
 */
function isAutomated(email) {
  const headers = {};
  for (const [rawKey, rawValue] of Object.entries(email.headers || {})) {
    const key = String(rawKey).toLowerCase();
    // Some mail parsers hand back the whole header line, name included, so
    // "Auto-Submitted: no" arrives where "no" was expected. Left alone, that
    // would mark ordinary human mail as automatic and answer nobody.
    const value = String(rawValue)
      .replace(new RegExp(`^\\s*${key.replace(/[^a-z0-9-]/g, "")}\\s*:\\s*`, "i"), "")
      .trim();
    headers[key] = value;
  }

  if (headers["auto-submitted"] && headers["auto-submitted"] !== "no") return true;
  if (headers["x-autoreply"]) return true;
  if (headers["x-autorespond"]) return true;
  if (headers["list-unsubscribe"]) return true;
  const precedence = (headers["precedence"] || "").toLowerCase();
  if (["bulk", "junk", "list", "auto_reply"].includes(precedence)) return true;

  const from = String(email.from || "").toLowerCase();
  if (AUTOMATED_SENDERS.some((needle) => from.includes(needle))) return true;

  const subject = String(email.subject || "");
  if (AUTOMATED_SUBJECTS.some((pattern) => pattern.test(subject))) return true;

  return false;
}

/*
 * Category scoring. Phrases are worth 3 because "delivery address" tells you
 * far more than "delivery" and "address" separately. Single words are worth 1.
 */
const SIGNALS = {
  order_status: {
    phrases: [
      "where is my order",
      "where's my order",
      "wheres my order",
      "where is my parcel",
      "where is my package",
      "track my order",
      "tracking number",
      "tracking info",
      "order status",
      "status of my order",
      "when will it arrive",
      "when will my order",
      "has it shipped",
      "has my order shipped",
      "not arrived",
      "hasn't arrived",
      "hasnt arrived",
      "still waiting",
      "no sign of",
      "any update on my order",
    ],
    words: [
      "tracking",
      "track",
      "shipped",
      "shipping",
      "dispatch",
      "dispatched",
      "delivery",
      "delivered",
      "arrive",
      "arrival",
      "eta",
      "late",
      "delayed",
      "waiting",
    ],
  },
  return_request: {
    phrases: [
      "want to return",
      "like to return",
      "can i return",
      "send it back",
      "send them back",
      "return this",
      "return it",
      "return label",
      "return policy",
      "refund me",
      "money back",
      "doesn't fit",
      "does not fit",
      "wrong item",
      "wrong size",
      "arrived damaged",
      "arrived broken",
      "start a return",
    ],
    words: [
      "return",
      "returning",
      "refund",
      "refunded",
      "exchange",
      "rma",
      "faulty",
      "damaged",
      "broken",
      "defective",
    ],
  },
  address_change: {
    phrases: [
      "change my address",
      "change the address",
      "wrong address",
      "update my address",
      "update the address",
      "new address",
      "different address",
      "delivery address",
      "shipping address",
      "i have moved",
      "i've moved",
      "ive moved",
      "deliver to a different",
      "send it to a different",
    ],
    words: ["address", "moved", "relocate", "relocated"],
  },
};

function scoreCategory(text, signals) {
  let score = 0;
  const hits = [];
  for (const phrase of signals.phrases) {
    if (text.includes(phrase)) {
      score += 3;
      hits.push(phrase);
    }
  }
  const words = text.split(/[^a-z0-9']+/).filter(Boolean);
  const wordSet = new Set(words);
  for (const word of signals.words) {
    if (wordSet.has(word)) {
      score += 1;
      hits.push(word);
    }
  }
  return { score, hits };
}

/**
 * Which of the three questions is this?
 *
 * Returns one of: order_status, return_request, address_change, unclear.
 * "unclear" covers both "no idea" and "two of them at once", because both
 * need the same thing: a person.
 */
function categorise(text) {
  const lower = String(text || "").toLowerCase();
  const scores = {};
  const hits = {};
  for (const [name, signals] of Object.entries(SIGNALS)) {
    const result = scoreCategory(lower, signals);
    scores[name] = result.score;
    hits[name] = result.hits;
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [bestName, bestScore] = ranked[0];
  const secondScore = ranked[1][1];

  if (bestScore === 0) {
    return { category: "unclear", reason: "no_signal", scores, hits: [] };
  }
  // Two categories both asked about means the customer asked two things. A
  // reply that answers one of them and ignores the other reads worse than no
  // reply at all.
  //
  // The runner-up has to clear two bars: an absolute one, so that a single
  // stray word like "delivery" in an address question is not treated as a
  // second question; and a relative one, so a passing mention next to a much
  // stronger signal does not stop a routine reply.
  const RUNNER_UP_FLOOR = 3; // one whole phrase, or three separate words
  if (secondScore >= RUNNER_UP_FLOOR && secondScore >= bestScore * 0.25) {
    return { category: "unclear", reason: "mixed_signals", scores, hits: [] };
  }

  return { category: bestName, reason: "clear", scores, hits: hits[bestName] };
}

/**
 * Pulls an order number out of the text.
 *
 * Shopify order names normally look like #1001, and stores often add a
 * prefix or suffix. Anything found is returned with the # kept, because that
 * is the form Shopify's own search expects.
 */
function extractOrderNumber(text) {
  const source = String(text || "");
  const patterns = [
    /#\s?([A-Z]{0,6}\d{3,10}[A-Z]{0,3})\b/i,
    /\border\s*(?:number|no\.?|#|id)?\s*[:\-]?\s*([A-Z]{0,6}\d{3,10}[A-Z]{0,3})\b/i,
    /\b(?:order|confirmation)\s+([A-Z]{1,6}[-_]?\d{3,10})\b/i,
  ];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match && match[1]) {
      return `#${match[1].toUpperCase().replace(/^#/, "")}`;
    }
  }
  return null;
}

/** The sender's address, taken from the From header rather than the body. */
function extractSenderEmail(from) {
  const source = String(from || "");
  const angled = source.match(/<([^<>@\s]+@[^<>@\s]+\.[a-z]{2,})>/i);
  if (angled) return angled[1].toLowerCase();
  const bare = source.match(/([^<>@\s]+@[^<>@\s]+\.[a-z]{2,})/i);
  return bare ? bare[1].toLowerCase() : null;
}

/**
 * The whole read, in one call.
 *
 * Input:  { from, subject, body, headers }
 * Output: { handle, category, reason, orderNumber, customerEmail, cleanBody }
 */
function readEmail(email) {
  const cleanBody = stripQuotedHistory(email.body);

  if (isAutomated(email)) {
    return {
      handle: false,
      category: "ignored",
      reason: "automated_mail",
      orderNumber: null,
      customerEmail: extractSenderEmail(email.from),
      cleanBody,
    };
  }

  if (cleanBody.replace(/\s+/g, "").length < 10) {
    return {
      handle: false,
      category: "unclear",
      reason: "empty_message",
      orderNumber: null,
      customerEmail: extractSenderEmail(email.from),
      cleanBody,
    };
  }

  // The subject line is part of the question, but only this message's subject.
  const searchText = `${email.subject || ""}\n${cleanBody}`;
  const verdict = categorise(searchText);

  return {
    handle: verdict.category !== "unclear",
    category: verdict.category,
    reason: verdict.reason,
    orderNumber: extractOrderNumber(searchText),
    customerEmail: extractSenderEmail(email.from),
    cleanBody,
  };
}
// ==== END SHARED ====

module.exports = {
  stripQuotedHistory,
  isAutomated,
  categorise,
  extractOrderNumber,
  extractSenderEmail,
  readEmail,
};
