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

/** Things shaped like a tracking number: long runs of letters and digits. */
function findTrackingLikeStrings(text) {
  const found = new Set();
  const pattern = /\b(?=[A-Z0-9-]{10,35}\b)(?=[^\s]*\d)[A-Z0-9][A-Z0-9-]{9,34}\b/g;
  let match;
  while ((match = pattern.exec(String(text || "").toUpperCase())) !== null) {
    found.add(match[0].replace(/-/g, ""));
  }
  return [...found];
}

/**
 * Checks a drafted reply against the facts it is supposed to be built from.
 *
 * Returns { pass, problems }. An empty problems list is the only pass.
 */
function checkDraft(draft, facts) {
  const problems = [];
  const text = String(draft == null ? "" : draft).trim();

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

module.exports = { checkDraft, findTrackingLikeStrings, ownerNote };
