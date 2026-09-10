import type { Metadata } from "next";

export const metadata: Metadata = { title: "Refund" };

export default function RefundPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold">Refund Policy</h1>
      <p className="mt-2 text-sm italic text-muted">
        Effective September 10, 2026
      </p>

      <p className="mt-4 text-ink leading-relaxed">
        <strong>All sales are final.</strong> Bots are digital products — the
        moment you buy, you get instant access to download your files. There's
        no way to "return" a download, so we don't offer refunds once a purchase
        is complete.
      </p>

      <h2 className="mt-8 text-xl font-bold text-ink">Before you buy</h2>
      <p className="mt-2 text-ink leading-relaxed">
        Every Bot's page lists exactly what you need to run it. Check that list
        first. Not sure if a Bot fits your setup? Email
        rohintbusiness@gmail.com before buying.
      </p>

      <h2 className="mt-8 text-xl font-bold text-ink">
        If something's actually wrong
      </h2>
      <p className="mt-2 text-ink leading-relaxed">
        "All sales final" covers change-of-mind and setup issues on your end,
        not being left stuck. Two things we'll always make right:{" "}
        <strong>you were charged twice for the same purchase</strong>, or{" "}
        <strong>your download never arrived</strong>. Outside those two, if your
        Bot isn't working as the manual describes, email us — we'll help you
        troubleshoot. That's support, not a refund, but we'd rather fix it than
        leave you stuck.
      </p>

      <h2 className="mt-8 text-xl font-bold text-ink">Contact</h2>
      <p className="mt-2 text-ink leading-relaxed">rohintbusiness@gmail.com</p>
    </div>
  );
}
