const test = require("node:test");
const assert = require("node:assert");
const {
  stripQuotedHistory,
  isAutomated,
  categorise,
  extractOrderNumber,
  extractSenderEmail,
  readEmail,
} = require("../src/classify.js");

test("quoted history is cut off at a > marker", () => {
  const body = "Where is my order?\n\n> On Monday you said\n> it had shipped";
  assert.strictEqual(stripQuotedHistory(body), "Where is my order?");
});

test("quoted history is cut off at an On ... wrote: line", () => {
  const body =
    "Any update?\n\nOn 1 September 2026 at 10:04, Support <s@shop.com> wrote:\nYour return was approved.";
  assert.strictEqual(stripQuotedHistory(body), "Any update?");
});

test("quoted history is cut off at Original Message", () => {
  const body = "Thanks!\n\n-----Original Message-----\nreturn label attached";
  assert.strictEqual(stripQuotedHistory(body), "Thanks!");
});

test("a reply that is only quoted text keeps the original", () => {
  const body = "> everything here is quoted";
  assert.ok(stripQuotedHistory(body).length > 0);
});

test("an old return thread does not make a new status question look like a return", () => {
  const email = {
    from: "customer@example.com",
    subject: "Re: your return",
    body:
      "Hi, where is my order #1042? It still has not arrived.\n\n" +
      "On 20 August, Support wrote:\nYour refund for the returned jacket is done.",
  };
  const read = readEmail(email);
  assert.strictEqual(read.category, "order_status");
});

test("noreply senders are treated as machine mail", () => {
  assert.ok(isAutomated({ from: "noreply@shopify.com", subject: "hi", body: "x" }));
  assert.ok(isAutomated({ from: "no-reply@x.com", subject: "hi", body: "x" }));
  assert.ok(isAutomated({ from: "MAILER-DAEMON@x.com", subject: "hi", body: "x" }));
});

test("out of office and bounce subjects are machine mail", () => {
  assert.ok(isAutomated({ from: "a@b.com", subject: "Automatic reply: away", body: "x" }));
  assert.ok(
    isAutomated({ from: "a@b.com", subject: "Delivery Status Notification (Failure)", body: "x" }),
  );
});

test("bulk headers are machine mail", () => {
  assert.ok(
    isAutomated({
      from: "a@b.com",
      subject: "Sale",
      body: "x",
      headers: { "List-Unsubscribe": "<mailto:x@y.com>" },
    }),
  );
  assert.ok(
    isAutomated({
      from: "a@b.com",
      subject: "Sale",
      body: "x",
      headers: { Precedence: "bulk" },
    }),
  );
  assert.ok(
    isAutomated({
      from: "a@b.com",
      subject: "Away",
      body: "x",
      headers: { "Auto-Submitted": "auto-replied" },
    }),
  );
});

test("headers that arrive as whole lines are still read correctly", () => {
  // This is the shape n8n's Gmail trigger produces: the value is the full
  // header line, name and all.
  assert.strictEqual(
    isAutomated({
      from: "Jane Doe <jane@example.com>",
      subject: "Where is my order",
      body: "hello",
      headers: { "auto-submitted": "Auto-Submitted: no" },
    }),
    false,
  );
  assert.strictEqual(
    isAutomated({
      from: "Jane Doe <jane@example.com>",
      subject: "Away",
      body: "hello",
      headers: { "auto-submitted": "Auto-Submitted: auto-replied" },
    }),
    true,
  );
  assert.strictEqual(
    isAutomated({
      from: "Jane Doe <jane@example.com>",
      subject: "Sale",
      body: "hello",
      headers: { precedence: "Precedence: bulk" },
    }),
    true,
  );
});

test("a real customer is not machine mail", () => {
  assert.strictEqual(
    isAutomated({
      from: "Jane Doe <jane@example.com>",
      subject: "Where is my order",
      body: "hello",
      headers: { "Auto-Submitted": "no" },
    }),
    false,
  );
});

test("the three categories are recognised", () => {
  assert.strictEqual(categorise("Where is my order? Any tracking?").category, "order_status");
  assert.strictEqual(categorise("I want to return this, it does not fit").category, "return_request");
  assert.strictEqual(
    categorise("Can you change my address, I have moved").category,
    "address_change",
  );
});

test("delivery address goes to address change, not order status", () => {
  const verdict = categorise("Please use a different delivery address for this one");
  assert.strictEqual(verdict.category, "address_change");
});

test("two questions at once is unclear, not a guess", () => {
  const verdict = categorise(
    "Where is my order? Also I want to return the other jacket and get a refund.",
  );
  assert.strictEqual(verdict.category, "unclear");
  assert.strictEqual(verdict.reason, "mixed_signals");
});

test("an unrelated message is unclear", () => {
  const verdict = categorise("Do you have this jumper in green?");
  assert.strictEqual(verdict.category, "unclear");
  assert.strictEqual(verdict.reason, "no_signal");
});

test("order numbers are found in the shapes customers write them", () => {
  assert.strictEqual(extractOrderNumber("my order #1042 please"), "#1042");
  assert.strictEqual(extractOrderNumber("order number 1042"), "#1042");
  assert.strictEqual(extractOrderNumber("Order no. 200315"), "#200315");
  assert.strictEqual(extractOrderNumber("#SHOP1001 has not arrived"), "#SHOP1001");
  assert.strictEqual(extractOrderNumber("order: 9981"), "#9981");
});

test("no order number gives null rather than a guess", () => {
  assert.strictEqual(extractOrderNumber("where is my stuff"), null);
  assert.strictEqual(extractOrderNumber("I ordered 2 jumpers"), null);
});

test("the sender address is read from the From header", () => {
  assert.strictEqual(extractSenderEmail("Jane Doe <jane@example.com>"), "jane@example.com");
  assert.strictEqual(extractSenderEmail("jane@example.com"), "jane@example.com");
  assert.strictEqual(extractSenderEmail("Jane Doe"), null);
});

test("a short or empty message is not handled", () => {
  const read = readEmail({ from: "a@b.com", subject: "", body: "  \n " });
  assert.strictEqual(read.handle, false);
  assert.strictEqual(read.reason, "empty_message");
});

test("machine mail is marked ignored, not unclear", () => {
  const read = readEmail({
    from: "noreply@shopify.com",
    subject: "Order confirmed",
    body: "Thanks for your order",
  });
  assert.strictEqual(read.handle, false);
  assert.strictEqual(read.category, "ignored");
});

test("a full read pulls out everything the next step needs", () => {
  const read = readEmail({
    from: "Jane Doe <jane@example.com>",
    subject: "Order #1042",
    body: "Hi, where is my order? It says shipped but nothing has arrived.",
  });
  assert.strictEqual(read.handle, true);
  assert.strictEqual(read.category, "order_status");
  assert.strictEqual(read.orderNumber, "#1042");
  assert.strictEqual(read.customerEmail, "jane@example.com");
});
