/**
 * Catalog search.
 *
 * Deliberately simple. Lowercase, split on anything that is not a letter or a
 * number, and forgive a trailing "s" so that someone typing "returns" finds a
 * bot whose page says "return". Every word in the query has to match, so
 * adding a word narrows the list rather than widening it.
 */

export function normalize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 0)
    .map((word) => (word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word));
}

export function matches(haystack: string, query: string): boolean {
  const words = normalize(query);
  if (words.length === 0) return true;
  const text = ` ${normalize(haystack).join(" ")} `;
  return words.every((word) => text.includes(word));
}
