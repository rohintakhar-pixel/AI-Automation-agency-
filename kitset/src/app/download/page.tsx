import type { Metadata } from "next";
import Link from "next/link";
import { verifyPurchase } from "@/lib/fulfilment";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Your download" };

/**
 * The page a buyer lands on after paying.
 *
 * It shows nothing at all until Stripe confirms the payment. Visiting this
 * address without a paid session gets a refusal and no links.
 */
export default async function DownloadPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const sessionId = typeof params.session_id === "string" ? params.session_id : null;
  const result = await verifyPurchase(sessionId);

  if (!result.ok) {
    return (
      <div>
        <h1 className="text-3xl font-bold">{result.reason}</h1>
        <p className="mt-4 text-ink">
          This page only shows files after a payment has gone through. If you
          have just paid, use the link on your Stripe receipt, which carries the
          payment reference with it.
        </p>
        <p className="mt-4">
          <Link href="/catalog" className="text-link underline">
            Back to the catalog
          </Link>
        </p>
      </div>
    );
  }

  const { bot, sessionId: id } = result;

  return (
    <div>
      <h1 className="text-3xl font-bold">Payment received. Here is your bot.</h1>
      <p className="mt-4 text-ink">
        You bought <strong>{bot.name}</strong>. It is yours. There is no licence
        check, nothing expires, and the bot never contacts Kitset.
      </p>

      <h2 className="mt-8 text-xl font-semibold">Your files</h2>
      <ul className="mt-3 grid gap-3">
        {bot.downloads.map((download) => (
          <li
            key={download.file}
            className="rounded-lg border border-edge bg-surface p-4"
          >
            <a
              className="font-semibold text-link underline"
              href={`/api/download?session_id=${encodeURIComponent(id)}&file=${encodeURIComponent(download.file)}`}
            >
              {download.file}
            </a>
            <p className="mt-1 text-muted">{download.label}</p>
          </li>
        ))}
      </ul>

      <h2 className="mt-8 text-xl font-semibold">The setup manual</h2>
      <p className="mt-3">
        <Link href={`/bots/${bot.slug}/manual`} className="text-link underline">
          Open the setup manual
        </Link>
      </p>
      <p className="mt-2 text-muted">
        Start at step 1 and work down. Setup takes {bot.setupTime.toLowerCase()}
      </p>

      <h2 className="mt-8 text-xl font-semibold">Keep this link</h2>
      <p className="mt-3 text-ink">
        Bookmark this page. The address carries your payment reference, so it
        will bring your files back whenever you need them. Your Stripe receipt
        has the same reference on it.
      </p>
    </div>
  );
}
