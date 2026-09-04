/** Site-wide text and addresses. Change them here, nowhere else. */
export const site = {
  name: "Kitset",
  tagline: "Pre-built AI bots. Buy once, they are yours.",
  description:
    "Kitset sells pre-built AI bots as a one-time purchase. You get the bot files and a written setup manual, you install it on your own accounts with your own keys, and it keeps running.",
};

/**
 * The public address of the site.
 *
 * Stripe needs an absolute address to send the buyer back to after payment,
 * so this has to be right in production. On Vercel, VERCEL_URL is filled in
 * automatically, which covers preview deployments.
 */
export function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured && configured.trim() !== "") {
    return configured.trim().replace(/\/+$/, "");
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "http://localhost:3000";
}
