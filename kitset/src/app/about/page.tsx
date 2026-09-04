import type { Metadata } from "next";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold">About</h1>
      <p className="mt-4 text-ink leading-relaxed">
        {site.name} sells pre-built AI bots as a one-time purchase, each with a
        written setup manual. You install the bot on your own accounts, using
        your own keys, so it runs on your infrastructure and not ours. Once you
        have paid, the bot is yours: there is no licence check, no expiry, and
        nothing to renew.
      </p>
    </div>
  );
}
