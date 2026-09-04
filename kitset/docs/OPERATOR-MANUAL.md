# Kitset: the operator manual

This is for you, Rohin. It covers the four things you actually have to do:
put the site online, connect Stripe, take the first test payment, and add the
next bot.

No jargon, and nothing here needs a terminal.

---

## 1. What Kitset is, in one paragraph

Kitset is a shop that sells pre-built bots. Someone pays once through Stripe,
and straight after paying they get a page with the bot files and a link to the
setup manual. They install the bot on their own accounts with their own keys.
We host nothing for them and the bot never phones home. There is no
subscription, nothing renews, and nothing expires.

---

## 2. Putting it online

The site is built to run on Vercel with default settings. You do not have to
configure a build command or an output directory.

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub.
2. Click **Add New… → Project**.
3. Pick the repository this project is in.
4. Vercel will notice it is a Next.js project. Where it asks for the **Root
   Directory**, set it to `kitset`, because the project lives in a subfolder of
   the repository rather than at the top.
5. Do not click Deploy yet. Open **Environment Variables** first and add the
   four in section 3 below.
6. Then click Deploy.

**You should see** a deployment that finishes in a couple of minutes and gives
you an address ending in `.vercel.app`.

---

## 3. The four environment variables

An environment variable is a setting that lives in Vercel rather than in the
code. Secrets go here, so they never end up in the repository.

Add all four in Vercel under **Settings → Environment Variables**.

| Name | What it is | Where it comes from |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | The key that lets the site talk to Stripe on your behalf. Starts `sk_test_` while testing. | Stripe dashboard → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | Proves a message really came from Stripe and not from someone pretending. Starts `whsec_`. | Created in section 5 below |
| `STRIPE_PRICE_SHOPIFY_SUPPORT_DRAFTER` | The ID of the $59 price in your Stripe account. Starts `price_`. | Created in section 4 below |
| `NEXT_PUBLIC_SITE_URL` | The full address of the site, no slash on the end. | Your Vercel address, e.g. `https://kitset.vercel.app` |

After changing any of these, Vercel needs to redeploy before the change takes
effect. Open the **Deployments** tab and use **Redeploy** on the latest one.

---

## 4. Creating the product and price in Stripe

You do this, not the site. The site never creates products.

1. Sign in to [dashboard.stripe.com](https://dashboard.stripe.com).
2. Make sure the **Test mode** toggle at the top right is **on**. Everything
   below happens in test mode until you deliberately switch.
3. Go to **Product catalogue → Add product**.
4. Name it `Shopify support-email order-status and return-request drafter`.
5. Under Pricing, choose **One off**. Not recurring. This matters: the site is
   built for one-time payments and a recurring price will make checkout fail.
6. Set the price to **59.00 USD**.
7. Save the product.
8. On the product's page, find the price you just created and copy its **price
   ID**. It starts with `price_`.
9. Paste that into the `STRIPE_PRICE_SHOPIFY_SUPPORT_DRAFTER` variable in
   Vercel, and redeploy.

**You should see** a product in your Stripe test catalogue with a one-off price
of $59.00, and a price ID copied into Vercel.

> The $59 that customers see on the site comes from a different place: the
> `price` field in `catalog/shopify-support-drafter/bot.json`. If you change
> the price, change it in both places, or the page will advertise one number
> and Stripe will charge another.

---

## 5. Setting up the webhook

The webhook is how Stripe tells the site that a payment went through, so the
sale gets written down.

1. In Stripe, still in test mode, go to **Developers → Webhooks → Add
   endpoint**.
2. For the endpoint URL, use your site address with `/api/webhook` on the end,
   for example `https://kitset.vercel.app/api/webhook`.
3. Under events to send, choose **checkout.session.completed**. That is the
   only one the site uses.
4. Save, then reveal the **Signing secret** and copy it. It starts with
   `whsec_`.
5. Paste it into the `STRIPE_WEBHOOK_SECRET` variable in Vercel, and redeploy.

**You should see** the endpoint listed in Stripe with a green status once it
has received its first event.

Delivery does not depend on this webhook. The download page asks Stripe
directly whether the payment went through, every time it is opened. The webhook
is the record, not the gate, so a missed webhook never leaves a paying customer
without their files.

---

## 6. Taking the first test payment

Do this once before you tell anyone about the site. It takes two minutes.

1. Open your site and go to the bot's page.
2. Click **Buy for $59 USD**. You should land on Stripe's own checkout page.
3. Pay with Stripe's test card: card number `4242 4242 4242 4242`, any future
   expiry date, any three-digit code, any postcode. No real money moves.
4. You should be sent back to the site, to a page headed **Payment received.
   Here is your bot.**
5. Click one of the file links and check the file downloads.
6. Open the setup manual link and check it renders.
7. Go back to Stripe and check the payment is listed under **Payments**, and
   that the webhook shows a successful delivery under **Developers →
   Webhooks**.

Then try the other half, which matters more:

8. Copy the download page address, strip off everything from `?session_id=`
   onwards, and open the bare `/download` address.

**You should see** a page saying **No payment found**, with no files and no
links on it. That is the check that stops the product being handed out to
anyone who guesses the address.

---

## 7. Going live, when you are ready

Do this only when you are happy with everything in test mode.

1. In Stripe, switch **Test mode** off.
2. Create the product and the $59 one-off price again, in live mode. Test-mode
   products do not carry across.
3. Copy the new live price ID. It also starts with `price_`.
4. Create a new webhook endpoint in live mode, pointing at the same
   `/api/webhook` address, listening for `checkout.session.completed`. Copy its
   signing secret.
5. In Stripe, go to **Developers → API keys** and copy the live secret key. It
   starts with `sk_live_`.
6. In Vercel, replace all three values: `STRIPE_SECRET_KEY`,
   `STRIPE_WEBHOOK_SECRET`, and `STRIPE_PRICE_SHOPIFY_SUPPORT_DRAFTER`.
7. Redeploy.
8. Buy the bot yourself with a real card, check the whole flow works, and refund
   yourself from the Stripe dashboard.

That last step is worth the $59 of friction. It is the only way to know the
live path works.

---

## 8. Adding the next bot

The site reads its catalogue from the `catalog` folder. One folder per bot.
Adding a folder adds a bot; there is no list to update anywhere else.

1. Copy the folder `catalog/shopify-support-drafter` and rename the copy to the
   new bot's short name, using hyphens and no spaces, for example
   `gmail-invoice-chaser`.
2. Open `bot.json` inside the new folder and change every field. In particular:
   - `slug` must be exactly the same as the folder name, or the build stops.
   - `stripePriceIdEnv` is the *name* of an environment variable, not a price
     ID. Use the same pattern: `STRIPE_PRICE_` then the bot's name in capitals
     with underscores.
   - `published` should be `false` while you are still working on it.
3. Replace `manual.md` with the new bot's setup manual.
4. Replace everything in the `downloads` folder with the new bot's files, and
   list them under `downloads` in `bot.json`.
5. Create the product and price in Stripe (section 4), and add the new
   environment variable in Vercel with the new price ID.
6. When it is ready to sell, set `published` to `true` and redeploy.

The build checks the catalogue before it publishes anything. If a field is
missing, the build fails and tells you which file and which field. Nothing
half-finished can reach the site.

An unpublished bot is invisible in a production build: no card, no page, no
manual page. You can still see it when running the site locally.

---

## 9. When something looks wrong

**The buy button sends you back to the bot page with "you have not been
charged".** The Stripe price ID is missing or wrong. Check
`STRIPE_PRICE_SHOPIFY_SUPPORT_DRAFTER` in Vercel, then redeploy.

**Checkout opens but says the price is recurring.** The price in Stripe was
created as a subscription. Create a new one-off price and use its ID.

**A customer says they paid but got nothing.** Ask them for the Stripe receipt.
The receipt carries the payment reference. Their download page address is your
site plus `/download?session_id=` plus that reference, and it will work as long
as the payment really completed. Nothing about delivery depends on the webhook
having arrived.

**The webhook shows failures in Stripe.** Almost always `STRIPE_WEBHOOK_SECRET`
is wrong or was changed without a redeploy. Copy it again from the endpoint's
page in Stripe, paste it into Vercel, redeploy, then use Stripe's **Resend**
button on a failed event.

**The build fails after you added a bot.** Read the error. It names the file
and the missing field in plain words. Fix that one thing and push again.

**You want to see the sales the site recorded.** In Vercel, open the project and
go to the **Logs** tab. Every completed sale writes a line beginning
`[kitset] sale recorded`. Stripe's own dashboard is the authoritative record;
this is just a convenient copy.
