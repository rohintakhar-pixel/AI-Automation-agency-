import { getStripe } from "./stripe";
import { getBot, type Bot } from "./catalog";

/**
 * Answers one question: has this checkout actually been paid for?
 *
 * Stripe is asked directly, every time, in both the delivery page and the
 * file route. Nothing is trusted from the address bar except the session id,
 * and a session id on its own proves nothing until Stripe confirms it.
 */

export type Verified =
  | { ok: true; bot: Bot; sessionId: string; email: string | null }
  | { ok: false; reason: string };

export async function verifyPurchase(
  sessionId: string | null | undefined,
): Promise<Verified> {
  if (!sessionId || !/^cs_[A-Za-z0-9_]{10,}$/.test(sessionId)) {
    return { ok: false, reason: "No payment found." };
  }

  let session;
  try {
    session = await getStripe().checkout.sessions.retrieve(sessionId);
  } catch (error) {
    console.error(
      `[kitset] could not check session ${sessionId}: ${(error as Error).message}`,
    );
    return { ok: false, reason: "No payment found." };
  }

  if (session.payment_status !== "paid") {
    return { ok: false, reason: "This checkout has not been paid." };
  }

  const slug = session.metadata?.slug;
  const bot = slug ? getBot(slug) : undefined;
  if (!bot) {
    // Paid, but we cannot tell what for. Loud, because a paying customer is
    // waiting on the other end of it.
    console.error(
      `[kitset] session ${sessionId} is paid but its metadata slug ` +
        `"${slug ?? "missing"}" matches no bot in the catalog.`,
    );
    return {
      ok: false,
      reason:
        "Your payment went through, but we could not work out which bot it " +
        "was for. Keep this page open and get in touch with your receipt.",
    };
  }

  return {
    ok: true,
    bot,
    sessionId,
    email: session.customer_details?.email ?? null,
  };
}
