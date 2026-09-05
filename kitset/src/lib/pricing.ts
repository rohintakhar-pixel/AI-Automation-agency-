/**
 * Does the price the site advertises match the price Stripe will charge?
 *
 * They are two independent values. The page shows the figure in the catalogue
 * file; Stripe charges whatever the price ID in the environment points at.
 * Nothing keeps them in step, so a mistyped price ID or an edited price in the
 * Stripe dashboard charges a buyer something other than what they agreed to.
 * That is not a rounding error, it is the wrong amount taken off a card.
 *
 * So the two are compared before a checkout starts, and a disagreement stops
 * the sale rather than completing it.
 */

export type PriceVerdict = { ok: true } | { ok: false; problem: string };

/*
 * Currencies Stripe holds in whole units rather than hundredths.
 * Everything else is charged in hundredths: 5900 for $59.00.
 */
const ZERO_DECIMAL_CURRENCIES = new Set([
  "bif",
  "clp",
  "djf",
  "gnf",
  "jpy",
  "kmf",
  "krw",
  "mga",
  "pyg",
  "rwf",
  "ugx",
  "vnd",
  "vuv",
  "xaf",
  "xof",
  "xpf",
]);

/** The catalogue figure, in the units Stripe counts in. */
export function toMinorUnits(amount: number, currency: string): number {
  const code = String(currency ?? "").toLowerCase();
  return ZERO_DECIMAL_CURRENCIES.has(code)
    ? Math.round(amount)
    : Math.round(amount * 100);
}

export function comparePrice(args: {
  catalogPrice: number;
  catalogCurrency: string;
  stripeUnitAmount: number | null | undefined;
  stripeCurrency: string | null | undefined;
}): PriceVerdict {
  const { catalogPrice, catalogCurrency, stripeUnitAmount, stripeCurrency } = args;

  if (!Number.isFinite(catalogPrice) || catalogPrice <= 0) {
    return {
      ok: false,
      problem: `the catalogue price "${catalogPrice}" is not a real amount`,
    };
  }

  // A price with no fixed amount on it is one Stripe works out at checkout,
  // which is exactly the thing this check exists to refuse.
  if (typeof stripeUnitAmount !== "number") {
    return {
      ok: false,
      problem: "the Stripe price has no fixed amount on it",
    };
  }

  const wantCurrency = String(catalogCurrency ?? "").toLowerCase();
  const gotCurrency = String(stripeCurrency ?? "").toLowerCase();
  if (!wantCurrency || wantCurrency !== gotCurrency) {
    return {
      ok: false,
      problem:
        `the page says ${wantCurrency.toUpperCase() || "no currency"} and ` +
        `Stripe says ${gotCurrency.toUpperCase() || "no currency"}`,
    };
  }

  const want = toMinorUnits(catalogPrice, wantCurrency);
  if (want !== stripeUnitAmount) {
    return {
      ok: false,
      problem:
        `the page says ${want} and Stripe would charge ${stripeUnitAmount} ` +
        `(both in the smallest unit of ${wantCurrency.toUpperCase()})`,
    };
  }

  return { ok: true };
}
