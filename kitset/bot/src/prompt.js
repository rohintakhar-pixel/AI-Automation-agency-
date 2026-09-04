// ==== BEGIN SHARED ====
/*
 * What the model is told.
 *
 * Two rules do the heavy lifting: use only the facts given, and never invent
 * a tracking number or a date. Everything else is tone.
 */

function describeOrder(order) {
  if (!order) return "No order was found.";
  const lines = [];
  lines.push(`Order number: ${order.orderNumber}`);
  lines.push(`Placed: ${order.placedAt}`);
  lines.push(`Payment status: ${order.financialStatus || "unknown"}`);
  lines.push(`Shipping status: ${order.fulfillmentStatus || "unknown"}`);
  if (order.cancelled) lines.push(`Cancelled: yes, on ${order.cancelledAt}`);
  if (order.customerName) lines.push(`Customer name: ${order.customerName}`);

  if (order.items && order.items.length > 0) {
    lines.push("Items:");
    for (const item of order.items) {
      lines.push(`  - ${item.quantity} x ${item.title}`);
    }
  }

  if (order.tracking && order.tracking.length > 0) {
    lines.push("Tracking:");
    for (const entry of order.tracking) {
      const parts = [entry.number];
      if (entry.company) parts.push(`carrier ${entry.company}`);
      if (entry.url) parts.push(entry.url);
      lines.push(`  - ${parts.join(", ")}`);
    }
  } else {
    lines.push("Tracking: none on this order yet.");
  }

  const address = order.shippingAddress;
  if (address) {
    const parts = [
      address.name,
      address.line1,
      address.line2,
      address.city,
      address.province,
      address.zip,
      address.country,
    ].filter(Boolean);
    lines.push(`Shipping address on file: ${parts.join(", ")}`);
  }

  return lines.join("\n");
}

const CATEGORY_GUIDANCE = {
  order_status:
    "Answer where the order is. If there is a tracking number, quote it " +
    "exactly as given and include the tracking link if there is one. If the " +
    "order has not shipped yet, say so plainly and do not promise a date.",
  return_request:
    "Answer using the store's return policy below, and only that policy. If " +
    "the policy does not cover what they asked, say the owner will confirm.",
  address_change:
    "Say whether the order has shipped. If it has not shipped, say the " +
    "address can still be changed and ask them to send the full new address. " +
    "If it has shipped, say so and do not promise a redirect.",
};

function buildMessages({ category, order, customerMessage, settings }) {
  const storeName = (settings && settings.storeName) || "the store";
  const signOff = (settings && settings.signOffName) || storeName;
  const policy =
    (settings && settings.returnPolicy) ||
    "No return policy has been set. Say the owner will confirm the details.";

  const system = [
    `You write customer support replies for ${storeName}, a small online shop.`,
    "",
    "Hard rules:",
    "1. Use only the order facts given below. Never invent a tracking number, a",
    "   carrier, a date, an amount, or a policy.",
    "2. If a fact is not in the order data, do not state it. Say the owner will",
    "   confirm instead.",
    "3. Quote the order number and any tracking number exactly as written.",
    "4. Never leave a placeholder such as [Customer Name] in the reply. If you",
    "   do not know the customer's name, open with 'Hi there'.",
    "5. Plain English. Four short paragraphs at most. No bullet lists.",
    "6. Write only the body of the email. No subject line, no quoted history.",
    `7. Sign off as ${signOff}.`,
    "",
    `For this message: ${CATEGORY_GUIDANCE[category] || CATEGORY_GUIDANCE.order_status}`,
    "",
    "The store's return policy, word for word:",
    policy,
  ].join("\n");

  const user = [
    "Order data from Shopify:",
    describeOrder(order),
    "",
    "The customer wrote:",
    String(customerMessage || "").slice(0, 4000),
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

function buildRequestBody({ model, messages }) {
  return {
    model: model || "gpt-4o-mini",
    messages,
    temperature: 0.2,
    max_tokens: 600,
  };
}

/** Pulls the reply text out of OpenAI's answer, or says why it could not. */
function readCompletion(response) {
  if (!response || typeof response !== "object") {
    return { ok: false, text: "", problem: "no_response" };
  }
  if (response.error) {
    return {
      ok: false,
      text: "",
      problem: `openai_error: ${response.error.message || "unknown"}`,
    };
  }
  const choice =
    Array.isArray(response.choices) && response.choices.length > 0
      ? response.choices[0]
      : null;
  const text = choice && choice.message ? String(choice.message.content || "") : "";
  if (text.trim() === "") {
    return { ok: false, text: "", problem: "empty_completion" };
  }
  return { ok: true, text: text.trim(), problem: null };
}
// ==== END SHARED ====

module.exports = { describeOrder, buildMessages, buildRequestBody, readCompletion };
