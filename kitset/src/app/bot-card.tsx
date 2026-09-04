import Link from "next/link";
import type { Bot } from "@/lib/catalog";
import { formatPrice } from "@/lib/catalog";

/** One bot in a list. Used on the home page and in the catalog. */
export function BotCard({ bot }: { bot: Bot }) {
  return (
    <Link
      href={`/bots/${bot.slug}`}
      className="block rounded-lg border border-edge bg-surface p-4 no-underline hover:border-link"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold text-ink">{bot.name}</h3>
        <span className="text-sm text-muted">{formatPrice(bot)}, one time</span>
      </div>
      <p className="mt-2 text-muted">{bot.shortDescription}</p>
      <p className="mt-2 text-sm text-muted">{bot.category}</p>
    </Link>
  );
}
