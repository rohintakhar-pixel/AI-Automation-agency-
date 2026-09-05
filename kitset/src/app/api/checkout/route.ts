import { NextResponse } from "next/server";
import { getBot } from "@/lib/catalog";
import { getStripe } from "@/lib/stripe";
import { comparePrice } from "@/lib/pricing";
import { siteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * Starts a Stripe Checkout session and sends the buyer to Stripe's own hosted
 * page. One-time payment. There is no subscription anywhere in this product,
 * so mode is always "payment".
 *
 * This is a plain form POST, so it works with or without JavaScript.
 */
export async function POST(request: Request) {
  // A request with no form body at all reaches this route from crawlers and
  // from anyone poking at it by hand. Reading it without a guard throws, and a
  // 500 is the wrong answer to "you sent nothing".
  let slug = "";
  try {
    const form = await request.formData();
    slug = String(form.get("slug") ?? "");
  } catch {
    return NextResponse.redirect(new URL("/catalog", siteUrl()), 303);
  }

  const bot = getBot(slug);
  if (!bot || !bot.published) {
    return NextResponse.redirect(new URL("/catalog", siteUrl()), 303);
  }

  const priceId = process.env[bot.stripePriceIdEnv];
  if (!priceId || priceId.trim() === "") {
    console.error(
      `[kitset] ${bot.stripePriceIdEnv} is not set, so "${bot.name}" cannot ` +
        `be sold. Set it in the project's Environment Variables.`,
    );
    return NextResponse.redirect(
      new URL(`/bots/${bot.slug}?checkout=failed`, siteUrl()),
      303,
    );
  }

  try {
    // The page and Stripe hold the price separately, so they are compared
    // before anyone is sent to pay. A buyer agrees to the figure on the page;
    // charging them anything else is not a bug to notice afterwards.
    const price = await getStripe().prices.retrieve(priceId.trim());
    const verdict = comparePrice({
      catalogPrice: bot.price,
      catalogCurrency: bot.currency,
      stripeUnitAmount: price.unit_amount,
      stripeCurrency: price.currency,
    });
    if (!verdict.ok) {
      console.error(
        `[kitset] refusing to sell "${bot.slug}": the advertised price and ` +
          `the Stripe price disagree — ${verdict.problem}. Fix the price in ` +
          `Stripe or the figure in catalog/${bot.slug}/bot.json, whichever is ` +
          `wrong. No checkout was started.`,
      );
      return NextResponse.redirect(
        new URL(`/bots/${bot.slug}?checkout=failed`, siteUrl()),
        303,
      );
    }

    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId.trim(), quantity: 1 }],
      // The bot is identified on the session itself, so the delivery page can
      // work out what was bought without trusting anything in the URL.
      metadata: { slug: bot.slug },
      success_url: `${siteUrl()}/download?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl()}/bots/${bot.slug}`,
    });

    if (!session.url) {
      throw new Error("Stripe did not return a checkout address.");
    }

    return NextResponse.redirect(session.url, 303);
  } catch (error) {
    console.error(
      `[kitset] could not start checkout for "${bot.slug}": ` +
        `${(error as Error).message}`,
    );
    return NextResponse.redirect(
      new URL(`/bots/${bot.slug}?checkout=failed`, siteUrl()),
      303,
    );
  }
}
