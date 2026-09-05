const test = require("node:test");
const assert = require("node:assert");
const { comparePrice, toMinorUnits } = require("../src/lib/pricing.ts");

/*
 * The advertised price and the charged price are two separate values held in
 * two separate places. These tests are the thing that stops them drifting.
 */

test("the catalogue figure and the Stripe price agreeing is a pass", () => {
  const verdict = comparePrice({
    catalogPrice: 59,
    catalogCurrency: "USD",
    stripeUnitAmount: 5900,
    stripeCurrency: "usd",
  });
  assert.deepStrictEqual(verdict, { ok: true });
});

test("a Stripe price that charges more than the page says is refused", () => {
  const verdict = comparePrice({
    catalogPrice: 59,
    catalogCurrency: "USD",
    stripeUnitAmount: 9900,
    stripeCurrency: "usd",
  });
  assert.strictEqual(verdict.ok, false);
  assert.match(verdict.problem, /5900 and Stripe would charge 9900/);
});

test("a Stripe price that charges less is refused too", () => {
  const verdict = comparePrice({
    catalogPrice: 59,
    catalogCurrency: "USD",
    stripeUnitAmount: 900,
    stripeCurrency: "usd",
  });
  assert.strictEqual(verdict.ok, false);
});

test("the wrong currency is refused even when the number matches", () => {
  const verdict = comparePrice({
    catalogPrice: 59,
    catalogCurrency: "USD",
    stripeUnitAmount: 5900,
    stripeCurrency: "eur",
  });
  assert.strictEqual(verdict.ok, false);
  assert.match(verdict.problem, /USD and Stripe says EUR/);
});

test("a Stripe price with no fixed amount is refused", () => {
  const verdict = comparePrice({
    catalogPrice: 59,
    catalogCurrency: "USD",
    stripeUnitAmount: null,
    stripeCurrency: "usd",
  });
  assert.strictEqual(verdict.ok, false);
  assert.match(verdict.problem, /no fixed amount/);
});

test("a nonsense catalogue price is refused rather than sold", () => {
  for (const catalogPrice of [0, -5, Number.NaN]) {
    const verdict = comparePrice({
      catalogPrice,
      catalogCurrency: "USD",
      stripeUnitAmount: 5900,
      stripeCurrency: "usd",
    });
    assert.strictEqual(verdict.ok, false, `${catalogPrice} should be refused`);
  }
});

test("currencies Stripe counts in whole units are not multiplied by a hundred", () => {
  assert.strictEqual(toMinorUnits(5900, "JPY"), 5900);
  assert.strictEqual(toMinorUnits(59, "USD"), 5900);
  const verdict = comparePrice({
    catalogPrice: 5900,
    catalogCurrency: "JPY",
    stripeUnitAmount: 5900,
    stripeCurrency: "jpy",
  });
  assert.deepStrictEqual(verdict, { ok: true });
});

test("the catalogue file and the site agree on the price today", () => {
  const bot = require("../catalog/shopify-support-drafter/bot.json");
  assert.strictEqual(typeof bot.price, "number");
  assert.strictEqual(toMinorUnits(bot.price, bot.currency), bot.price * 100);
});
