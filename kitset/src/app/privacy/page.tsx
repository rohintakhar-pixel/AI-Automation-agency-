import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold">Privacy Policy</h1>
      <p className="mt-2 text-sm italic text-muted">
        Effective September 10, 2026
      </p>

      <p className="mt-4 text-ink leading-relaxed">
        <strong>The short version:</strong> Kitset is built so we see as little
        of your data as possible. Your Bot runs on your own infrastructure with
        your own accounts and API keys — not ours. We never see your Shopify
        store, your customers' information, or the emails your Bot handles. We
        only collect what's needed to sell you a Bot and run this website.
      </p>

      <h2 className="mt-8 text-xl font-bold text-ink">What we collect</h2>
      <p className="mt-2 text-ink leading-relaxed">
        Purchase info (name, email, payment details) via Stripe, our payment
        processor, so we can deliver your Bot and provide support. We don't
        store your card details — Stripe handles that. We also log standard
        technical data any website generates when you visit (IP address, browser
        type, pages viewed) for basic security. No ad trackers, nothing sold.
      </p>

      <h2 className="mt-8 text-xl font-bold text-ink">What we don't collect</h2>
      <p className="mt-2 text-ink leading-relaxed">
        Your Shopify store data, your customer records, the content of emails
        your Bot processes, or any of your third-party credentials.
      </p>

      <h2 className="mt-8 text-xl font-bold text-ink">How we use it</h2>
      <p className="mt-2 text-ink leading-relaxed">
        To process your purchase, deliver your Bot, provide support, and keep
        the site secure. Not for marketing — we don't maintain an email list.
      </p>

      <h2 className="mt-8 text-xl font-bold text-ink">Who we share it with</h2>
      <p className="mt-2 text-ink leading-relaxed">
        Stripe, to process payment (see stripe.com/privacy). Nobody else.
      </p>

      <h2 className="mt-8 text-xl font-bold text-ink">Your rights</h2>
      <p className="mt-2 text-ink leading-relaxed">
        Email rohintbusiness@gmail.com to see or delete what we have on file,
        except records we're required to keep (e.g. for taxes).
      </p>

      <h2 className="mt-8 text-xl font-bold text-ink">Children's privacy</h2>
      <p className="mt-2 text-ink leading-relaxed">
        Not directed at anyone under 13.
      </p>

      <h2 className="mt-8 text-xl font-bold text-ink">Contact</h2>
      <p className="mt-2 text-ink leading-relaxed">rohintbusiness@gmail.com</p>
    </div>
  );
}
