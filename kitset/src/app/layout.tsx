import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: `${site.name} — ${site.tagline}`,
    template: `%s — ${site.name}`,
  },
  description: site.description,
};

/**
 * The shell. Every page uses it: one nav, one content column, same footer.
 * Nothing here is decorative enough to get in the way of reading.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <header className="border-b border-edge bg-surface">
          <nav
            aria-label="Main"
            className="mx-auto w-full max-w-3xl px-4 py-3 flex items-center gap-5"
          >
            <Link
              href="/"
              className="font-bold text-lg text-ink no-underline hover:underline"
            >
              {site.name}
            </Link>
            <Link href="/catalog" className="text-link hover:underline">
              Catalog
            </Link>
            <Link href="/about" className="text-link hover:underline">
              About
            </Link>
          </nav>
        </header>

        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
          {children}
        </main>

        <footer className="border-t border-edge bg-surface">
          <div className="mx-auto w-full max-w-3xl px-4 py-5 text-sm text-muted">
            {site.name}. Bots are sold as a one-time purchase.
          </div>
        </footer>
      </body>
    </html>
  );
}
