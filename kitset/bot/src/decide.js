// ==== BEGIN SHARED ====
/*
 * Send it, or put it in front of the owner?
 *
 * The bias is deliberate and one-directional. A draft the owner glances at
 * costs ten seconds. A wrong reply sent to a customer costs the customer, the
 * refund, and the review. So auto-send is narrow on purpose, and everything
 * that is not plainly routine waits for a person.
 */

/** The only case that may ever be sent without a human looking at it. */
function mayAutoSend({ settings, read, chosen, parsed }) {
  const reasons = [];

  if (!settings || settings.autoSend !== true) {
    reasons.push("auto-send is switched off in the settings");
  }
  if (read.category !== "order_status") {
    reasons.push(
      "auto-send only ever covers a plain 'where is my order' question",
    );
  }
  if (read.reason !== "clear") {
    reasons.push("the message did not read as one clear question");
  }
  // An email-address match is a guess about which order is meant. An order
  // number is not.
  if (chosen.searchedBy !== "order_number") {
    reasons.push("the order was found by email address, not by order number");
  }
  if (chosen.ambiguous) {
    reasons.push("more than one recent order could be the one meant");
  }

  const order = chosen.order;
  if (!order) {
    reasons.push("no order was found");
    return { allowed: false, reasons };
  }
  if (order.cancelled) {
    reasons.push("the order is cancelled");
  }
  if (/refund/i.test(String(order.financialStatus || ""))) {
    reasons.push("the order has been refunded");
  }
  const status = String(order.fulfillmentStatus || "").toUpperCase();
  if (status !== "FULFILLED") {
    reasons.push(
      `the order is not shipped yet (Shopify says ${status || "nothing"})`,
    );
  }
  if (!order.tracking || order.tracking.length === 0) {
    reasons.push("the order has no tracking number on it");
  }
  if (parsed && parsed.problem) {
    reasons.push(`Shopify reported ${parsed.problem}`);
  }

  return { allowed: reasons.length === 0, reasons };
}

/**
 * The whole decision, including what to do when there is nothing to reply
 * about.
 *
 * Returns an action, always one of:
 *   ignore  - machine mail, nothing happens
 *   draft   - write a reply and leave it for the owner
 *   send    - write a reply and send it
 *   escalate- do not write a reply, tell the owner what went wrong
 */
function decide({ settings, read, chosen, parsed }) {
  if (!read.handle && read.category === "ignored") {
    return { action: "ignore", why: "The message was not written by a person." };
  }

  if (!read.handle) {
    return {
      action: "escalate",
      why:
        read.reason === "mixed_signals"
          ? "The message asks about more than one thing at once."
          : "The message is not a clear order-status, return, or address question.",
    };
  }

  if (parsed && parsed.problem === "permission_denied") {
    return {
      action: "escalate",
      why:
        "Shopify refused the request. The access token is probably missing " +
        "the read_orders or read_customers scope.",
    };
  }
  if (parsed && (parsed.problem === "api_error" || parsed.problem === "unexpected_shape")) {
    return {
      action: "escalate",
      why: `Shopify did not answer as expected (${parsed.problem}). No reply was written.`,
    };
  }
  if (!chosen.order) {
    return {
      action: "escalate",
      why:
        "No matching order was found in Shopify, so anything written would " +
        "be a guess.",
    };
  }

  const verdict = mayAutoSend({ settings, read, chosen, parsed });
  if (verdict.allowed) {
    return { action: "send", why: "Routine order-status question on a shipped order." };
  }

  return {
    action: "draft",
    why: `Left for you to check because ${verdict.reasons[0]}.`,
    allReasons: verdict.reasons,
  };
}
// ==== END SHARED ====

module.exports = { mayAutoSend, decide };
