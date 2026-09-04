// ==== BEGIN SHARED ====
/*
 * Talking to Shopify.
 *
 * One GraphQL query against the Admin API, asked either by order name or by
 * customer email. Read-only: the scopes this bot asks for are read_orders and
 * read_customers, and nothing here writes anything back.
 */

/**
 * Escapes a value going into Shopify's search syntax.
 *
 * Shopify's query strings are quoted, so an unescaped quote or backslash in a
 * customer's own text would change the meaning of the search. This is the
 * same class of problem as SQL injection, on a smaller stage.
 */
function escapeSearchValue(value) {
  return String(value == null ? "" : value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
}

const ORDER_FIELDS = `
  id
  name
  createdAt
  displayFinancialStatus
  displayFulfillmentStatus
  cancelledAt
  email
  customer { firstName lastName email }
  shippingAddress {
    name address1 address2 city province zip country
  }
  lineItems(first: 20) {
    edges { node { title quantity } }
  }
  fulfillments(first: 10) {
    status
    trackingInfo { number url company }
  }
`;

const ORDER_QUERY = `query FindOrders($search: String!) {
  orders(first: 5, query: $search, sortKey: CREATED_AT, reverse: true) {
    edges { node {${ORDER_FIELDS}} }
  }
}`;

/**
 * Builds the search.
 *
 * By order number when we have one, because that is exact. By email address
 * otherwise, taking the most recent order, because that is what someone
 * asking "where is my order" almost always means.
 */
function buildOrderSearch({ orderNumber, customerEmail }) {
  if (orderNumber) {
    return {
      found: true,
      by: "order_number",
      search: `name:"${escapeSearchValue(orderNumber)}"`,
    };
  }
  if (customerEmail) {
    return {
      found: true,
      by: "customer_email",
      search: `email:"${escapeSearchValue(customerEmail)}"`,
    };
  }
  return { found: false, by: null, search: null };
}

/** The request body to POST at the Admin GraphQL endpoint. */
function buildRequestBody(searchString) {
  return { query: ORDER_QUERY, variables: { search: searchString } };
}

/** The Admin API address for a store, at a pinned API version. */
function adminApiUrl(storeDomain, apiVersion) {
  const domain = String(storeDomain || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
  const version = String(apiVersion || "").trim() || "2024-10";
  return `https://${domain}/admin/api/${version}/graphql.json`;
}

/** Flattens one order into the handful of facts a reply actually needs. */
function summariseOrder(order) {
  const fulfillments = Array.isArray(order.fulfillments) ? order.fulfillments : [];
  const tracking = [];
  for (const fulfillment of fulfillments) {
    for (const info of fulfillment.trackingInfo || []) {
      if (info && info.number) {
        tracking.push({
          number: String(info.number),
          url: info.url ? String(info.url) : null,
          company: info.company ? String(info.company) : null,
        });
      }
    }
  }

  const address = order.shippingAddress || null;
  const items = ((order.lineItems || {}).edges || []).map((edge) => ({
    title: edge.node.title,
    quantity: edge.node.quantity,
  }));

  const customer = order.customer || {};
  const customerName = [customer.firstName, customer.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();

  return {
    id: order.id,
    orderNumber: order.name,
    placedAt: order.createdAt,
    financialStatus: order.displayFinancialStatus || null,
    fulfillmentStatus: order.displayFulfillmentStatus || null,
    cancelled: Boolean(order.cancelledAt),
    cancelledAt: order.cancelledAt || null,
    email: order.email || customer.email || null,
    customerName: customerName || null,
    items,
    tracking,
    shippingAddress: address
      ? {
          name: address.name || null,
          line1: address.address1 || null,
          line2: address.address2 || null,
          city: address.city || null,
          province: address.province || null,
          zip: address.zip || null,
          country: address.country || null,
        }
      : null,
  };
}

/**
 * Reads Shopify's answer, including the ways it says no.
 *
 * GraphQL answers with HTTP 200 and an "errors" list, so a naive check on the
 * status code would treat a permissions failure as a successful empty search.
 * That would tell a customer their order does not exist when the real problem
 * is a missing scope.
 */
function parseOrderResponse(response) {
  if (!response || typeof response !== "object") {
    return { ok: false, problem: "no_response", orders: [] };
  }

  // Shopify answers a bad token with a plain string in "errors", and a bad
  // query with a list of objects. Both are failures and both must be read.
  const hasErrors =
    (Array.isArray(response.errors) && response.errors.length > 0) ||
    (typeof response.errors === "string" && response.errors.trim() !== "");

  if (hasErrors) {
    const messages = Array.isArray(response.errors)
      ? response.errors
          .map((error) => (error && error.message ? String(error.message) : "unknown error"))
          .join("; ")
      : String(response.errors);
    const permissionProblem = /access denied|not approved|required access scope|unauthorized/i.test(
      messages,
    );
    return {
      ok: false,
      problem: permissionProblem ? "permission_denied" : "api_error",
      message: messages,
      orders: [],
    };
  }

  const edges =
    response.data && response.data.orders && Array.isArray(response.data.orders.edges)
      ? response.data.orders.edges
      : null;

  if (!edges) {
    return { ok: false, problem: "unexpected_shape", orders: [] };
  }

  const orders = edges
    .filter((edge) => edge && edge.node)
    .map((edge) => summariseOrder(edge.node));

  if (orders.length === 0) {
    return { ok: true, problem: "not_found", orders: [] };
  }

  return { ok: true, problem: null, orders };
}

/**
 * Picks the order to reply about.
 *
 * Searching by order number should give exactly one. Searching by email can
 * give several, and the newest is the one being asked about. If an email
 * search turns up several recent orders, say so, because a reply about the
 * wrong one is worse than a question.
 */
function chooseOrder(parsed, searchedBy) {
  if (!parsed.ok || parsed.orders.length === 0) {
    return { order: null, ambiguous: false };
  }
  if (searchedBy === "order_number") {
    return { order: parsed.orders[0], ambiguous: parsed.orders.length > 1 };
  }
  const openOrders = parsed.orders.filter((order) => !order.cancelled);
  const pool = openOrders.length > 0 ? openOrders : parsed.orders;
  // Two orders in the last week, by email, with no order number given: a
  // person should decide which one they meant.
  const recent = pool.filter((order) => {
    const placed = Date.parse(order.placedAt);
    if (Number.isNaN(placed)) return false;
    return Date.now() - placed < 7 * 24 * 60 * 60 * 1000;
  });
  return { order: pool[0], ambiguous: recent.length > 1 };
}
// ==== END SHARED ====

module.exports = {
  escapeSearchValue,
  buildOrderSearch,
  buildRequestBody,
  adminApiUrl,
  summariseOrder,
  parseOrderResponse,
  chooseOrder,
  ORDER_QUERY,
};
