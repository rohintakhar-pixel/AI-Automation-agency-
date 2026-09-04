const test = require("node:test");
const assert = require("node:assert");
const {
  escapeSearchValue,
  buildOrderSearch,
  buildRequestBody,
  adminApiUrl,
  parseOrderResponse,
  chooseOrder,
} = require("../src/shopify.js");

test("quotes and backslashes in a search value are escaped", () => {
  assert.strictEqual(escapeSearchValue('a"b'), 'a\\"b');
  assert.strictEqual(escapeSearchValue("a\\b"), "a\\\\b");
  assert.strictEqual(escapeSearchValue('" OR name:"'), '\\" OR name:\\"');
});

test("a crafted email address cannot break out of the search string", () => {
  const search = buildOrderSearch({ customerEmail: 'x" OR name:"#1001' }).search;
  assert.strictEqual(search, 'email:"x\\" OR name:\\"#1001"');
});

test("an order number is preferred over an email address", () => {
  const result = buildOrderSearch({ orderNumber: "#1042", customerEmail: "a@b.com" });
  assert.strictEqual(result.by, "order_number");
  assert.strictEqual(result.search, 'name:"#1042"');
});

test("with neither, the search says so instead of returning something empty", () => {
  const result = buildOrderSearch({});
  assert.strictEqual(result.found, false);
  assert.strictEqual(result.search, null);
});

test("the request body carries the query and the search variable", () => {
  const body = buildRequestBody('name:"#1042"');
  assert.match(body.query, /orders\(first: 5, query: \$search/);
  assert.deepStrictEqual(body.variables, { search: 'name:"#1042"' });
});

test("the admin address is built from the store domain and a pinned version", () => {
  assert.strictEqual(
    adminApiUrl("my-shop.myshopify.com", "2024-10"),
    "https://my-shop.myshopify.com/admin/api/2024-10/graphql.json",
  );
  assert.strictEqual(
    adminApiUrl("https://my-shop.myshopify.com/", "2024-10"),
    "https://my-shop.myshopify.com/admin/api/2024-10/graphql.json",
  );
});

const ORDER_NODE = {
  id: "gid://shopify/Order/1",
  name: "#1042",
  createdAt: "2026-08-30T10:00:00Z",
  displayFinancialStatus: "PAID",
  displayFulfillmentStatus: "FULFILLED",
  cancelledAt: null,
  email: "jane@example.com",
  customer: { firstName: "Jane", lastName: "Doe", email: "jane@example.com" },
  shippingAddress: {
    name: "Jane Doe",
    address1: "1 High Street",
    address2: null,
    city: "Leeds",
    province: null,
    zip: "LS1 1AA",
    country: "United Kingdom",
  },
  lineItems: { edges: [{ node: { title: "Blue jacket", quantity: 1 } }] },
  fulfillments: [
    {
      status: "SUCCESS",
      trackingInfo: [{ number: "AB123456789GB", url: "https://track/AB123456789GB", company: "Royal Mail" }],
    },
  ],
};

test("a normal answer is flattened into the facts a reply needs", () => {
  const parsed = parseOrderResponse({ data: { orders: { edges: [{ node: ORDER_NODE }] } } });
  assert.strictEqual(parsed.ok, true);
  assert.strictEqual(parsed.orders.length, 1);
  const order = parsed.orders[0];
  assert.strictEqual(order.orderNumber, "#1042");
  assert.strictEqual(order.fulfillmentStatus, "FULFILLED");
  assert.strictEqual(order.customerName, "Jane Doe");
  assert.strictEqual(order.tracking[0].number, "AB123456789GB");
  assert.strictEqual(order.shippingAddress.city, "Leeds");
  assert.strictEqual(order.items[0].title, "Blue jacket");
});

test("a GraphQL error is a failure even though the HTTP status was fine", () => {
  const parsed = parseOrderResponse({ errors: [{ message: "Internal error" }] });
  assert.strictEqual(parsed.ok, false);
  assert.strictEqual(parsed.problem, "api_error");
});

test("a missing scope is reported as a permission problem, not as no orders", () => {
  const parsed = parseOrderResponse({
    errors: [{ message: "Access denied for orders field. Required access: read_orders." }],
  });
  assert.strictEqual(parsed.ok, false);
  assert.strictEqual(parsed.problem, "permission_denied");
});

test("a bad access token, which Shopify reports as a plain string, is a failure", () => {
  // Shopify answers an invalid token with {"errors": "[API] Invalid API key
  // or access token"}, a string rather than the usual list. Read as anything
  // else, this would look like a store with no orders in it.
  const parsed = parseOrderResponse({
    errors: "[API] Invalid API key or access token (unrecognized login or wrong password)",
  });
  assert.strictEqual(parsed.ok, false);
  assert.strictEqual(parsed.problem, "api_error");
  assert.match(parsed.message, /Invalid API key/);
});

test("an access-denied string is recognised as a permission problem", () => {
  const parsed = parseOrderResponse({ errors: "Access denied for orders field" });
  assert.strictEqual(parsed.problem, "permission_denied");
});

test("an empty result is a clean not-found", () => {
  const parsed = parseOrderResponse({ data: { orders: { edges: [] } } });
  assert.strictEqual(parsed.ok, true);
  assert.strictEqual(parsed.problem, "not_found");
});

test("an answer in an unexpected shape is not treated as an empty result", () => {
  assert.strictEqual(parseOrderResponse({ data: {} }).problem, "unexpected_shape");
  assert.strictEqual(parseOrderResponse(null).problem, "no_response");
});

test("a search by order number takes the single match", () => {
  const parsed = parseOrderResponse({ data: { orders: { edges: [{ node: ORDER_NODE }] } } });
  const chosen = chooseOrder(parsed, "order_number");
  assert.strictEqual(chosen.order.orderNumber, "#1042");
  assert.strictEqual(chosen.ambiguous, false);
});

test("two recent orders found by email is marked ambiguous", () => {
  const recent = { ...ORDER_NODE, createdAt: new Date().toISOString() };
  const alsoRecent = { ...ORDER_NODE, name: "#1043", createdAt: new Date().toISOString() };
  const parsed = parseOrderResponse({
    data: { orders: { edges: [{ node: recent }, { node: alsoRecent }] } },
  });
  const chosen = chooseOrder(parsed, "customer_email");
  assert.strictEqual(chosen.ambiguous, true);
});

test("one recent order and one old one found by email is not ambiguous", () => {
  const recent = { ...ORDER_NODE, createdAt: new Date().toISOString() };
  const old = { ...ORDER_NODE, name: "#900", createdAt: "2025-01-01T00:00:00Z" };
  const parsed = parseOrderResponse({
    data: { orders: { edges: [{ node: recent }, { node: old }] } },
  });
  const chosen = chooseOrder(parsed, "customer_email");
  assert.strictEqual(chosen.ambiguous, false);
  assert.strictEqual(chosen.order.orderNumber, "#1042");
});

test("a cancelled order is skipped when an open one exists", () => {
  const cancelled = { ...ORDER_NODE, name: "#1050", cancelledAt: "2026-09-01T00:00:00Z" };
  const parsed = parseOrderResponse({
    data: { orders: { edges: [{ node: cancelled }, { node: ORDER_NODE }] } },
  });
  const chosen = chooseOrder(parsed, "customer_email");
  assert.strictEqual(chosen.order.orderNumber, "#1042");
});

test("nothing found gives no order rather than an exception", () => {
  const parsed = parseOrderResponse({ data: { orders: { edges: [] } } });
  assert.strictEqual(chooseOrder(parsed, "order_number").order, null);
});
