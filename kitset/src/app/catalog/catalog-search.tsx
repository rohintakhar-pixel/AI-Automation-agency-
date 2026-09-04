"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { matches } from "@/lib/search";

export type CatalogEntry = {
  slug: string;
  name: string;
  shortDescription: string;
  category: string;
  priceLabel: string;
  haystack: string;
};

export function CatalogSearch({ entries }: { entries: CatalogEntry[] }) {
  const [query, setQuery] = useState("");

  const shown = useMemo(
    () => entries.filter((entry) => matches(entry.haystack, query)),
    [entries, query],
  );

  return (
    <div>
      <label htmlFor="catalog-search" className="block text-sm text-muted">
        Search the catalog
      </label>
      <input
        id="catalog-search"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Try: shopify, returns, customer support"
        autoComplete="off"
        className="mt-2 w-full rounded-md border border-edge bg-surface px-3 py-2 text-ink placeholder:text-muted"
      />

      <p className="mt-3 text-sm text-muted" role="status" aria-live="polite">
        Showing {shown.length} of {entries.length}
      </p>

      {shown.length === 0 ? (
        <p className="mt-4 text-ink">
          Nothing in the catalog matches that. Clear the box to see everything.
        </p>
      ) : (
        <div className="mt-4 grid gap-3">
          {shown.map((entry) => (
            <Link
              key={entry.slug}
              href={`/bots/${entry.slug}`}
              className="block rounded-lg border border-edge bg-surface p-4 no-underline hover:border-link"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-semibold text-ink">{entry.name}</h3>
                <span className="text-sm text-muted">
                  {entry.priceLabel}, one time
                </span>
              </div>
              <p className="mt-2 text-muted">{entry.shortDescription}</p>
              <p className="mt-2 text-sm text-muted">{entry.category}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
