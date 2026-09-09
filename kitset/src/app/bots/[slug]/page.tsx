import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getBot, getBots, formatPrice } from "@/lib/catalog";

export function generateStaticParams() {
  return getBots().map((bot) => ({ slug: bot.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const bot = getBot(slug);
  if (!bot) return { title: "Not found" };
  return { title: bot.name, description: bot.shortDescription };
}

export default async function BotPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { slug } = await params;
  const bot = getBot(slug);
  if (!bot) notFound();

  const { checkout } = await searchParams;

  return (
    <article>
      {checkout === "failed" ? (
        <p className="mb-6 rounded-md border border-edge bg-surface p-4 text-ink">
          Checkout could not be started, so you have not been charged. Nothing
          has left your account. Try again in a moment.
        </p>
      ) : null}

      <h1 className="text-3xl font-bold">{bot.name}</h1>
      <p className="mt-3 text-muted">{bot.category}</p>

      <p className="mt-6 text-2xl font-semibold">
        {formatPrice(bot)}, one time
      </p>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">What it does</h2>
        {bot.longDescription.split("\n\n").map((paragraph, index) => (
          <p key={index} className="mt-3 leading-relaxed text-ink">
            {paragraph}
          </p>
        ))}
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Who it is for</h2>
        <p className="mt-3 text-ink">{bot.whoItIsFor}</p>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">
          Before you buy: what you need and what it costs to run
        </h2>
        <p className="mt-3 text-ink">
          Read this part. There is nothing here you will find out afterwards
          that you could not read now.
        </p>

        <h3 className="mt-6 font-semibold">Setup time</h3>
        <p className="mt-2 text-ink">{bot.setupTime}</p>

        <h3 className="mt-6 font-semibold">
          Accounts and keys you get yourself
        </h3>
        <ul className="mt-2 list-disc pl-6 text-ink">
          {bot.requirements.map((requirement) => (
            <li key={requirement} className="mt-1">
              {requirement}
            </li>
          ))}
        </ul>

        <h3 className="mt-6 font-semibold">
          What you pay other companies each month
        </h3>
        <p className="mt-2 text-ink">{bot.buyerMonthlyRunningCost}</p>
        <p className="mt-2 text-ink">
          The {formatPrice(bot)} you pay Kitset is once, and only once. The
          monthly figure above is what you pay OpenAI and n8n directly for
          running the bot. Kitset never bills you again.
        </p>
      </section>

      {/* The buy button sits after the requirements above, not before them. A
          buyer who pays and then reads that they need a particular plan comes
          back as a refund request. */}
      <form action="/api/checkout" method="POST" className="mt-10">
        <input type="hidden" name="slug" value={bot.slug} />
        <button
          type="submit"
          className="rounded-md bg-gradient-to-r from-accent-a to-accent-b px-5 py-3 font-semibold text-white"
        >
          Buy for {formatPrice(bot)}
        </button>
      </form>

      <p className="mt-3 text-sm text-muted">
        Payment is handled by Stripe. After paying you get the bot files and the
        setup manual straight away.
      </p>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">What you get</h2>
        <ul className="mt-2 list-disc pl-6 text-ink">
          {bot.downloads.map((download) => (
            <li key={download.file} className="mt-1">
              {download.label}
            </li>
          ))}
          <li className="mt-1">
            The setup manual, which you can read in full before you buy.
          </li>
        </ul>
        <p className="mt-4">
          <Link href={`/bots/${bot.slug}/manual`} className="text-link underline">
            Read the setup manual
          </Link>
        </p>
      </section>

      <p className="mt-10 text-sm text-muted">
        Version {bot.version}. Last updated {bot.lastUpdated}.
      </p>
    </article>
  );
}
