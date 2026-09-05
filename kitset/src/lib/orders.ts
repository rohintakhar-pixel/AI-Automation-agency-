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
  /*
   * The Stripe event that caused this record. Stripe retries a webhook on any
   * answer that is not a 2xx, and a retry carries the same event id, so this is
   * what makes one sale one line instead of two.
   */
  eventId: string;
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

/*
 * Event ids already written down, held in memory for the life of the process.
 *
 * The file is the record that survives a restart; this is only a shortcut past
 * re-reading it. Both are needed: the file because memory does not last, the
 * memory because two retries can arrive close together.
 */
const recordedEvents = new Set<string>();

/**
 * Has this Stripe event already been written down?
 *
 * The file is read rather than trusted from memory, because the process that
 * handled the first delivery may not be the process handling the retry.
 *
 * The honest limit: on a host that gives each instance its own disk, an
 * instance that has never seen the file cannot find a record in it. Two
 * deliveries landing on two cold instances can still produce two lines. What
 * this closes is the case Stripe actually causes, which is a retry to a warm
 * instance after a non-2xx answer.
 */
function alreadyRecorded(file: string, eventId: string): boolean {
  if (!eventId) return false;
  if (recordedEvents.has(eventId)) return true;

  let contents: string;
  try {
    contents = fs.readFileSync(file, "utf8");
  } catch {
    // No file yet, or it cannot be read. Neither is evidence of a duplicate.
    return false;
  }

  for (const line of contents.split("\n")) {
    if (line.trim() === "") continue;
    try {
      const parsed = JSON.parse(line) as { eventId?: unknown };
      if (typeof parsed.eventId === "string" && parsed.eventId !== "") {
        recordedEvents.add(parsed.eventId);
      }
    } catch {
      // A half-written line is not a match. Skip it and keep reading.
    }
  }

  return recordedEvents.has(eventId);
}

/**
 * Writes the sale down and prints it to the log.
 *
 * The log line is the copy that always survives. On Vercel it lands in the
 * project's runtime logs, which Rohin can read without a terminal.
 *
 * The same Stripe event delivered twice is written once. Stripe retries on any
 * answer that is not a 2xx, so a repeat is normal traffic, not an oddity.
 */
export function recordOrder(order: OrderRecord): {
  written: string | null;
  duplicate: boolean;
} {
  const file = path.join(orderDir(), "orders.jsonl");

  if (alreadyRecorded(file, order.eventId)) {
    console.log(
      `[kitset] Stripe delivered event ${order.eventId} again. That sale is ` +
        `already recorded, so nothing was written twice.`,
    );
    return { written: null, duplicate: true };
  }
  console.log(
    `[kitset] sale recorded: event=${order.eventId} session=${order.sessionId} ` +
      `bot=${order.slug} amount=${order.amountTotal ?? "unknown"} ` +
      `${order.currency ?? ""} email=${order.email ?? "not given"} ` +
      `livemode=${order.livemode}`,
  );

  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${JSON.stringify(order)}\n`, "utf8");
    // Remembered only once it is really on disk. If the write failed, a retry
    // should try again rather than be waved through as already done.
    if (order.eventId) recordedEvents.add(order.eventId);
    return { written: file, duplicate: false };
  } catch (error) {
    // Loud, but not fatal. Stripe already has the money and the record, and
    // delivery does not depend on this file.
    console.error(
      `[kitset] could not write the order file: ${(error as Error).message}. ` +
        `The sale is still recorded in Stripe and in the log line above.`,
    );
    return { written: null, duplicate: false };
  }
}
