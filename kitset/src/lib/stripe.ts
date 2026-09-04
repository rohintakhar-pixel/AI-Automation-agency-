import Stripe from "stripe";

/**
 * One Stripe client, built when it is first needed.
 *
 * It is deliberately not built at import time. If it were, a missing key
 * would break the build instead of breaking one request, and the site would
 * not deploy until Stripe was configured.
 */
let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (client) return client;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.trim() === "") {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Set it in .env.local locally, or in the " +
        "project's Environment Variables on Vercel.",
    );
  }

  client = new Stripe(key.trim());
  return client;
}

/** True when the key in use is a test-mode key. */
export function isTestMode(): boolean {
  return (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_");
}
