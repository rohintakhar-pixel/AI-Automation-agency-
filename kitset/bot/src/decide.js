// ==== BEGIN SHARED ====
/*
 * Send it, or put it in front of the owner?
 *
 * The bias is deliberate and one-directional. A draft the owner glances at
 * costs ten seconds. A wrong reply sent to a customer costs the customer, the
 * refund, and the review. So auto-send is narrow on purpose, and everything
 * that is not plainly routine waits for a person.
 */

/** Lower-cased and trimmed, so two spellings of one address compare equal. */
function normaliseAddress(value) {
  return String(value == null ? "" : value)
    .trim()
    .toLowerCase();
}

/**
 * Is the person asking the person this order belongs to?
 *
 * An order number is not a secret. Customers forward them, they are printed on
 * packing slips and receipts, and consecutive numbers are easy to guess. So a
 * number quoted in an email is not permission to be told what is in the parcel,
 * where it is going, or whose name is on it. The address the email came from is
 * compared with the address on the order, and nothing about the order goes any
 * further unless the two match.
 *
 * Returns { confirmed, reason }. Only confirmed true is permission.
 */
function ownsOrder({ read, order }) {
  const sender = normaliseAddress(read && read.customerEmail);
  const onOrder = normaliseAddress(order && order.email);
  if (!sender) return { confirmed: false, reason: "no_sender_address" };
  if (!onOrder) return { confirmed: false, reason: "no_address_on_order" };
  if (sender !== onOrder) return { confirmed: false, reason: "different_address" };
  return { confirmed: true, reason: null };
}

/*
 * What the owner is told when the person asking is not the customer.
 *
 * None of these repeat the customer's own address back. The note goes into a
 * draft, and a draft can be sent by accident.
 */
const NOT_THE_CUSTOMER = {
  no_sender_address:
    "The person who sent this email is NOT confirmed as the customer this " +
    "order belongs to: their email address could not be read, so there was " +
    "nothing to compare with the address on the order. No reply was written " +
    "and nothing was sent.",
  no_address_on_order:
    "The person who sent this email is NOT confirmed as the customer this " +
    "order belongs to: the order in Shopify has no email address on it, so " +
    "there was nothing to compare. No reply was written and nothing was sent.",
  different_address:
    "The person who sent this email is NOT the customer this order belongs " +
    "to. They wrote from a different address to the one on the order. No " +
    "reply was written and nothing was sent. Anyone can quote an order " +
    "number, so check who is asking before you tell them anything about it.",
};

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
  // Belt and braces. decide() has already refused this case, but auto-send is
  // the one path with no human on it, so it checks for itself.
  if (!ownsOrder({ read, order }).confirmed) {
    reasons.push(
      "the person who asked is not confirmed as the customer this order " +
        "belongs to",
    );
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

  // Nothing about the order is written down, quoted, or handed to the model
  // until the person asking has been shown to be the person it belongs to.
  const owner = ownsOrder({ read, order: chosen.order });
  if (!owner.confirmed) {
    return {
      action: "escalate",
      why: NOT_THE_CUSTOMER[owner.reason],
      requesterConfirmed: false,
      requesterIsNotTheCustomer: true,
    };
  }

  const verdict = mayAutoSend({ settings, read, chosen, parsed });
  if (verdict.allowed) {
    return {
      action: "send",
      why: "Routine order-status question on a shipped order.",
      requesterConfirmed: true,
    };
  }

  return {
    action: "draft",
    why: `Left for you to check because ${verdict.reasons[0]}.`,
    allReasons: verdict.reasons,
    requesterConfirmed: true,
  };
}
// ==== END SHARED ====

module.exports = { mayAutoSend, decide, ownsOrder };
