import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { recordOrder } from "@/lib/orders";

export const dynamic = "force-dynamic";

/**
 * Stripe's webhook.
 *
 * Its only job is fulfilment: a checkout completed, so write the sale down.
 * There is no lifecycle here because there is no subscription. No renewals,
 * no cancellations, no lapses.
 *
 * An unsigned request is refused. Anyone can find this address; only Stripe
 * can sign for it.
 */
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return new NextResponse("Missing Stripe signature.", { status: 400 });
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || secret.trim() === "") {
    console.error(
      "[kitset] STRIPE_WEBHOOK_SECRET is not set, so no webhook can be " +
        "trusted. Refusing every request until it is set.",
    );
    return new NextResponse("Webhook is not configured.", { status: 500 });
  }

  const body = await request.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, secret.trim());
  } catch (error) {
    console.error(
      `[kitset] rejected a webhook: ${(error as Error).message}`,
    );
    return new NextResponse("Invalid Stripe signature.", { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.payment_status === "paid") {
      recordOrder({
        recordedAt: new Date().toISOString(),
        // Stripe retries on any answer that is not a 2xx, and the retry
        // carries this same id. It is what keeps one sale to one line.
        eventId: event.id,
        sessionId: session.id,
        slug: session.metadata?.slug ?? "unknown",
        email: session.customer_details?.email ?? null,
        amountTotal: session.amount_total ?? null,
        currency: session.currency ?? null,
        livemode: event.livemode,
      });
    } else {
      console.log(
        `[kitset] checkout ${session.id} completed but is not paid ` +
          `(payment_status=${session.payment_status}). Nothing recorded.`,
      );
    }
  }

  // Everything else is acknowledged and ignored, so Stripe stops retrying.
  return new NextResponse("received", { status: 200 });
}
