import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * A record of a completed sale.
 *
 * This is a business record, not a gate. The delivery page and the file route
 * ask Stripe directly whether a checkout was paid, on every request. That is
 * deliberate: on a serverless host there is no promise that the machine which
 * handled the webhook is the machine which handles the buyer's next click, so
 * anything that depended on a file written here would eventually hand a paying
 * customer an error.
 */

export type OrderRecord = {
  recordedAt: string;
  sessionId: string;
  slug: string;
  email: string | null;
  amountTotal: number | null;
  currency: string | null;
  livemode: boolean;
};

function orderDir(): string {
  const configured = process.env.KITSET_ORDER_DIR;
  if (configured && configured.trim() !== "") return configured.trim();
  return path.join(os.tmpdir(), "kitset-orders");
}

/**
 * Writes the sale down and prints it to the log.
 *
 * The log line is the copy that always survives. On Vercel it lands in the
 * project's runtime logs, which Rohin can read without a terminal.
 */
export function recordOrder(order: OrderRecord): { written: string | null } {
  console.log(
    `[kitset] sale recorded: session=${order.sessionId} bot=${order.slug} ` +
      `amount=${order.amountTotal ?? "unknown"} ${order.currency ?? ""} ` +
      `email=${order.email ?? "not given"} livemode=${order.livemode}`,
  );

  try {
    const dir = orderDir();
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "orders.jsonl");
    fs.appendFileSync(file, `${JSON.stringify(order)}\n`, "utf8");
    return { written: file };
  } catch (error) {
    // Loud, but not fatal. Stripe already has the money and the record, and
    // delivery does not depend on this file.
    console.error(
      `[kitset] could not write the order file: ${(error as Error).message}. ` +
        `The sale is still recorded in Stripe and in the log line above.`,
    );
    return { written: null };
  }
}
