import type { Metadata } from "next";
import { getBots, formatPrice } from "@/lib/catalog";
import { CatalogSearch, type CatalogEntry } from "./catalog-search";

export const metadata: Metadata = { title: "Catalog" };

export default function CatalogPage() {
  const entries: CatalogEntry[] = getBots().map((bot) => ({
    slug: bot.slug,
    name: bot.name,
    shortDescription: bot.shortDescription,
    category: bot.category,
    priceLabel: formatPrice(bot),
    haystack: [
      bot.name,
      bot.shortDescription,
      bot.longDescription,
      bot.category,
      bot.whoItIsFor,
      bot.requirements.join(" "),
    ].join(" "),
  }));

  return (
    <div>
      <h1 className="text-3xl font-bold">Catalog</h1>
      <p className="mt-4 text-ink">
        Every bot here is a one-time purchase. You install it on your own
        accounts.
      </p>
      <div className="mt-6">
        <CatalogSearch entries={entries} />
      </div>
    </div>
  );
}
