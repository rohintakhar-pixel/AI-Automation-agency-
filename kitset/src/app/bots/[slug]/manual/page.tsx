import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { marked } from "marked";
import { getBot, getBots, getManual } from "@/lib/catalog";

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
  return { title: `${bot.name}: setup manual` };
}

export default async function ManualPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const bot = getBot(slug);
  if (!bot) notFound();

  // The manual is a file in this repository, written by us. It is not user
  // input, so rendering it as HTML is safe.
  const html = await marked.parse(getManual(slug));

  return (
    <article>
      <p className="text-sm">
        <Link href={`/bots/${bot.slug}`} className="text-link underline">
          Back to {bot.name}
        </Link>
      </p>
      <div
        className="prose mt-4"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </article>
  );
}
