import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold">Terms of Service</h1>
      <p className="mt-2 text-sm italic text-muted">
        Effective September 10, 2026
      </p>

      <p className="mt-4 text-ink leading-relaxed">
        Welcome to Kitset. These Terms govern your purchase and use of the
        pre-built AI automation products ("Bots") sold through this website. By
        purchasing a Bot, you agree to these Terms.
      </p>

      <h2 className="mt-8 text-xl font-bold text-ink">1. What you're buying</h2>
      <p className="mt-2 text-ink leading-relaxed">
        Each Bot is a downloadable automation package: a workflow file and a
        setup manual, built to run on infrastructure you control. Kitset does
        not host, run, or operate your Bot for you. You install it, connect it
        to your own accounts, and operate it. We never have access to your
        store, your customer data, or your API keys.
      </p>

      <h2 className="mt-8 text-xl font-bold text-ink">2. License</h2>
      <p className="mt-2 text-ink leading-relaxed">
        You get a non-exclusive, non-transferable license to use your Bot for
        your own business. You may not resell, redistribute, or represent
        yourself as its creator. Kitset retains all ownership and IP rights.
      </p>

      <h2 className="mt-8 text-xl font-bold text-ink">3. Payment</h2>
      <p className="mt-2 text-ink leading-relaxed">
        Bots are one-time purchases at the price listed at checkout, processed
        through Stripe. You're responsible for any third-party costs needed to
        run your Bot (AI API usage, your automation platform, your Shopify
        subscription).
      </p>

      <h2 className="mt-8 text-xl font-bold text-ink">4. Refunds</h2>
      <p className="mt-2 text-ink leading-relaxed">
        All sales are final. See our Refund Policy for details.
      </p>

      <h2 className="mt-8 text-xl font-bold text-ink">5. No warranty</h2>
      <p className="mt-2 text-ink leading-relaxed">
        Your Bot is provided "as is." We test it against the conditions in its
        manual, but can't guarantee it works with every configuration or
        survives every future change made by Shopify, your AI provider, or your
        automation platform. Test it before relying on it for live customer
        communication.
      </p>

      <h2 className="mt-8 text-xl font-bold text-ink">
        6. Limitation of liability
      </h2>
      <p className="mt-2 text-ink leading-relaxed">
        Our total liability for any claim is limited to what you paid for the
        Bot. We're not liable for indirect, incidental, or consequential
        damages.
      </p>

      <h2 className="mt-8 text-xl font-bold text-ink">
        7. Your responsibilities
      </h2>
      <p className="mt-2 text-ink leading-relaxed">
        You're responsible for how you configure and operate your Bot, the
        accounts you connect to it, and complying with those services' own
        terms.
      </p>

      <h2 className="mt-8 text-xl font-bold text-ink">
        8. Changes to these Terms
      </h2>
      <p className="mt-2 text-ink leading-relaxed">
        We may update these Terms; the effective date above will reflect the
        latest change.
      </p>

      <h2 className="mt-8 text-xl font-bold text-ink">9. Governing law</h2>
      <p className="mt-2 text-ink leading-relaxed">
        These Terms are governed by the laws of{" "}
        <strong>[Your State/Country — needs to be filled in]</strong>.
      </p>

      <h2 className="mt-8 text-xl font-bold text-ink">10. Contact</h2>
      <p className="mt-2 text-ink leading-relaxed">rohintbusiness@gmail.com</p>
    </div>
  );
}
