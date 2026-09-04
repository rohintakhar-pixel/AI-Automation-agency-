import type { Metadata } from "next";

export const metadata: Metadata = { title: "Refund", robots: { index: false } };

// Deliberately empty. Real text has not been written yet, and inventing legal
// wording would be worse than saying nothing. This page is not linked from the
// navigation until it has real content.
export default function RefundPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold">Refund</h1>
      <p className="mt-4 text-ink">Content pending</p>
    </div>
  );
}
