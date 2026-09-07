# Kitset

A storefront that sells pre-built AI bots as a one-time purchase. The buyer
pays once through Stripe, gets the bot files and a written setup manual, and
installs the bot on their own accounts with their own keys. Kitset hosts
nothing for the buyer. There is no licence check, no phone-home, and no expiry.

**If you are Rohin and you want to run this, read
[`docs/OPERATOR-MANUAL.md`](docs/OPERATOR-MANUAL.md) instead of this file.** It
covers deploying, Stripe, and adding the next bot, in plain words.

---

## What is here

```
kitset/
  src/app/          the site: pages and the three API routes
  src/lib/          catalogue reading, search, Stripe, delivery checks
  catalog/          one folder per bot. Adding a folder adds a bot.
  bot/              the Shopify support drafter: logic, tests, build script
  docs/             the operator manual
```

## Running it locally

```bash
npm install
cp .env.example .env.local     # then fill in the values
npm run dev
```

The site runs at http://localhost:3000. Without Stripe keys everything works
except checkout, which sends you back to the bot page with a plain "you have
not been charged" message rather than an error screen.

## Checking everything

```bash
npm run check
```

That builds the bot's n8n workflow from its source files, runs the bot's tests,
checks the built workflow, and then runs a production build of the site. It is
the one command to run before pushing anything.

Individually:

| Command | What it does |
| --- | --- |
| `npm run bot:build` | Rebuilds the n8n workflow from `bot/src` |
| `npm run bot:test` | Runs the bot's logic tests |
| `npm run bot:verify` | Structural checks on the built workflow |
| `npm run build` | Production build of the site |

## The catalogue

Each bot is a folder under `catalog/` containing `bot.json`, `manual.md`, and a
`downloads/` folder. The build reads them and fails with a plain error naming
the file and the field if anything required is missing or empty, so a
half-finished bot cannot reach the site. Bots with `published: false` are
dropped from a production build entirely.

The price a buyer sees comes from `price` and `currency` in `bot.json`. The
price Stripe charges comes from the environment variable named in
`stripePriceIdEnv`. Both are set in that one file.

## Payments

Stripe Checkout in one-time payment mode, on Stripe's own hosted page. There is
no subscription code anywhere in this project: no subscription objects, no
customer portal, no cancel path, no trial logic.

Delivery is guarded in two places. The `/download` page and the `/api/download`
file route each ask Stripe directly whether that checkout session was paid,
on every request. A copied file link is worth nothing without a paid session
behind it, and an unguarded visit to `/download` shows no files and no links.

The webhook at `/api/webhook` verifies Stripe's signature and refuses anything
unsigned. Its job is to record the sale, not to gate delivery, so a webhook
that never arrives cannot leave a paying customer empty-handed.

## The bot

`bot/` holds the Shopify support-email drafter that the one catalogue entry
sells.

- `bot/src/` — the logic, in plain readable modules: reading an email,
  querying Shopify, deciding whether to send or draft, and checking the drafted
  reply before it goes anywhere.
- `bot/tests/` — the tests for all of it, including an end-to-end pass over
  fixtures. `sender-attack.test.js` is the one exception to fixtures: it parses
  real raw email with `mailparser`, the same parser n8n's Gmail node uses, so
  that the way a From line is really split is checked rather than assumed. That
  is the only reason `mailparser` is a development dependency; nothing the
  buyer downloads uses it.
- `bot/workflow.template.json` — the n8n workflow with empty Code nodes.
- `bot/build-workflow.mjs` — pastes the logic files into those Code nodes,
  byte for byte, and writes the file the buyer downloads.
- `bot/verify-workflow.mjs` — checks the built file: node types and versions
  against n8n's own definitions, no orphan nodes, every node named in an
  expression exists, the shipped code matches the tested code exactly, the
  workflow ships inactive, no credentials, no key-shaped strings.

The point of the build step is that there is only one copy of the logic. The
code that is tested is the code that ships.

**Never edit the built workflow by hand.** Edit `bot/src`, run
`npm run bot:build`, and the checker will confirm the two are still the same.

## Secrets

`.gitignore` covers `.env` and `.env.local` and was the first file written in
this project. `.env.example` is committed and has empty values. No key, token,
or password belongs anywhere in this repository.
