# Setup manual: Shopify support-email drafter

This takes an estimated 2 to 4 hours the first time. That is an estimate from
how long each step takes, not a promise. Most of the time goes on getting keys
from Shopify and Google, not on the bot itself.

You do not need to write any code. You will copy and paste a lot of long
strings, and you will click "Save" often.

Work through the steps in order. Each step is one action, and each one ends
with **You should see** so you can tell whether it worked before you carry on.
If what you see does not match, stop there and look at the troubleshooting
section at the bottom before going further.

---

## Before you start

You need six things. You get all of them yourself, and the bot uses your
accounts, not ours.

1. Admin access to your Shopify store.
2. A support inbox. The workflow ships wired for **Gmail** (a personal Gmail
   account or Google Workspace). If yours is Microsoft 365 or plain IMAP, it
   still works, but you swap the first node and the last two. The section
   "If your inbox is not Gmail", near the end, tells you how.
3. A Google account you can create a free Google Cloud project on. This can be
   the same account as the inbox.
4. An OpenAI account with a payment card on it.
5. An n8n account: n8n Cloud, or n8n running on your own machine or server.
6. Your own return policy, written out in plain words. The bot only ever
   repeats what you write here, so have it ready.

**Your Shopify plan decides how much of this works.** The bot finds an order in
two ways: by the order number in the email, or by the customer's email address
when there is no order number. Looking an order up by customer email address
needs a Shopify plan of **Grow or higher**. On a **Basic** plan that lookup does
not work at all, and the bot can only use the order-number path; emails that do
not quote an order number will come to you as a draft with a note saying no
order could be found.

The reason is Shopify's own rule, not ours. A customer's email address counts as
protected customer data at what Shopify calls Level 2, and Shopify's help pages
say: "To access Custom Level 2 PII apps, your store must be on the Grow plan or
higher." On Basic: "you won't have access to Custom Level 2 Personally
Identifiable Information (PII) apps."

- Sources:
  [shopify.dev/docs/apps/launch/protected-customer-data](https://shopify.dev/docs/apps/launch/protected-customer-data)
  and
  [help.shopify.com/en/manual/apps/app-types/custom-apps](https://help.shopify.com/en/manual/apps/app-types/custom-apps)
- Check your plan before you start: Shopify admin → **Settings → Plan**.

**A second thing to know now, before you spend time on this.** The bot ships
with sending switched off. Everything it writes lands in your Gmail drafts for
you to read and send. That is on purpose. When you have watched it for a week
and you trust it, the end of step 13 turns on automatic sending for the one case
where it is safe.

**And a third.** The bot only answers the person the order belongs to. It
compares the address an email came from with the address on the order, and if
they are not the same it writes nothing and puts a note in your drafts instead.
An order number is not a password, and anyone who has seen a packing slip or a
forwarded confirmation has one.

The address it compares is the real sending mailbox, not the name on the email.
Anyone can type anything into the "your name" box of their mail program,
including somebody else's email address, and some mail programs then show that
name where you would expect the address. If the name on an email disagrees with
the mailbox it was actually sent from, the bot treats the sender as unknown,
writes nothing, and puts it in front of you.

---

## Step 1. Get an n8n account

Go to [n8n.io](https://n8n.io) and either start a Cloud account or install n8n
on your own machine.

- **n8n Cloud** is the quicker route. It costs about $20 per month after the
  free trial. Nothing to install.
- **Self-hosted** is free but you have to keep it running. Only pick this if
  you are comfortable leaving software running on a computer or a server.

**You should see** an n8n workspace with an empty canvas and a button that says
something like "Create Workflow" or "Add workflow".

---

## Step 2. Note down your n8n address

Look at the address bar in your browser while n8n is open. Copy the part up to
the first single slash after the domain. It will look like one of these:

```
https://yourname.app.n8n.cloud
http://localhost:5678
```

Write it down. You need it in step 6, and getting it wrong is the single most
common reason the Google sign-in fails.

**You should see** an address you have written down that starts with `http`
and has no trailing slash.

---

## Step 3. Create the Shopify app and get the access token

This is the step most online tutorials get wrong. Read the warning first.

> **Older tutorials will send you the wrong way.** They tell you to go to your
> Shopify admin, open **Settings → Apps and sales channels → Develop apps**,
> and click **Create an app**. That route is deprecated and no longer creates
> new apps. If a video or blog post tells you to use it, that post is out of
> date. Use the Dev Dashboard below instead.

1. Go to [shopify.dev/dashboard](https://shopify.dev/dashboard) and sign in
   with the same account you use for your store.
2. Create a new app. Give it a name you will recognise, such as
   `Support drafter`.
3. Open the app's configuration and find the Admin API access scopes.
4. Tick exactly two scopes: **read_orders** and **read_customers**. Nothing
   else. The bot only reads; it never changes anything in your store, and
   giving it write access would be handing it the ability to do damage it has
   no reason to do.
   If you also want the bot to answer about orders older than 60 days, you have
   to request **read_all_orders** as well, on this same screen. Read the note at
   the end of this step before you decide.
5. Save, then install the app on your store when it offers to.
6. Reveal the **Admin API access token** and copy it. It starts with `shpat_`.

Paste it somewhere safe for the next few minutes. Shopify shows this token
once. If you lose it you have to make a new one.

**You should see** a long string beginning `shpat_`, and your app listed as
installed on your store.

> **The 60-day limit, and how to lift it.** `read_orders` on its own reaches
> only orders created in the last 60 days. Shopify's own documentation puts it
> plainly: "To access all the orders, you need to request access to the
> `read_all_orders` scope."
> ([shopify.dev/docs/api/usage/access-scopes](https://shopify.dev/docs/api/usage/access-scopes))
>
> So if a customer writes in about an order placed more than 60 days ago, the
> bot will be told the order does not exist, and you will get a draft saying no
> order could be found. That is Shopify answering, not the bot failing.
>
> `read_all_orders` is something you have to ask for and have granted. Do not
> plan on getting it automatically. Older guidance describes an automatic grant,
> but that guidance is about the admin-created custom apps that Shopify no
> longer lets you create, and it is not confirmed for the Dev Dashboard route
> this manual uses. Request or enable it on the scopes screen, and check it is
> actually granted before you rely on it.
>
> Most solo stores never need it. Decide before you finish this step, because
> adding a scope later means reinstalling the app and making a new token.

---

## Step 4. Get an OpenAI API key

1. Go to
   [platform.openai.com/api-keys](https://platform.openai.com/api-keys) and
   sign in.
2. Add a payment card under Billing if you have not already. Without one, every
   request fails with a quota error.
3. Create a new secret key and copy it. It starts with `sk-`.

At a solo store's volume this costs well under $1 per month. Each email the bot
handles is one short request.

**You should see** a key beginning `sk-`, copied somewhere safe. OpenAI also
shows this only once.

---

## Step 5. Turn on the Gmail API in Google Cloud

1. Go to
   [console.cloud.google.com](https://console.cloud.google.com) and sign in
   with the Google account that owns your support inbox.
2. Create a new project. Call it something like `Support drafter`.
3. In the search box at the top, type `Gmail API`, open it, and click
   **Enable**.

**You should see** a Gmail API page that says the API is enabled, with usage
graphs on it (all at zero, which is correct).

---

## Step 6. Create the Google sign-in credentials

1. In the left menu, open **APIs & Services → OAuth consent screen**.
2. Choose **External** and fill in the app name, your email as the user support
   email, and your email again as the developer contact. Leave everything else
   alone.
3. On the **Test users** step, add your own email address. This matters: while
   the app is in Testing status, only the test users you list can sign in. You
   will move it out of Testing at the end of this step, and you have to.
4. Now open **APIs & Services → Credentials**.
5. Click **Create credentials → OAuth client ID**.
6. Application type: **Web application**.
7. Under **Authorised redirect URIs**, click Add URI and paste your n8n address
   from step 2 with `/rest/oauth2-credential/callback` on the end. For example:

   ```
   https://yourname.app.n8n.cloud/rest/oauth2-credential/callback
   ```

8. Save, then copy the **Client ID** and the **Client secret**.

**You should see** a panel showing a Client ID ending in
`.apps.googleusercontent.com` and a client secret.

> **Do this now, or the bot stops working in seven days.** While a Google Cloud
> app's publishing status is **Testing**, the sign-in it grants expires after
> seven days. This is not a maybe and it is not account-specific. Google's own
> documentation states it: "A Google Cloud Platform project with an OAuth
> consent screen configured for an external user type and a publishing status of
> Testing is issued a refresh token expiring in 7 days, unless the only OAuth
> scopes requested are a subset of name, email address, and user profile."
> ([developers.google.com/identity/protocols/oauth2](https://developers.google.com/identity/protocols/oauth2))
>
> The Gmail scopes this bot uses are not in that exempt subset, so it applies to
> you. Seven days after you connect the credential, the bot will stop and every
> run will fail with a sign-in error.
>
> **What to do:** open **APIs & Services → OAuth consent screen** and change the
> publishing status from **Testing** to **In production**. It is one button,
> marked "Publish app". Because the app only ever signs in as you and requests
> no data from anyone else, there is nothing to submit and nothing to wait for.
> Do it before you go any further.
>
> If you have already been running for a week and it has stopped, publish the
> app and then reconnect the Gmail credential in step 8.

---

## Step 7. Import the bot into n8n

1. In n8n, click **Create Workflow**.
2. Open the **⋯** menu at the top right and choose **Import from File**.
3. Choose `shopify-support-drafter.workflow.json` from your download.

**You should see** sixteen connected boxes on the canvas, starting with **Check
the inbox** on the left. Several will have a red warning triangle, because they
have no credentials yet. That is expected and the next three steps fix it.

---

## Step 8. Connect Gmail

1. Double-click the **Check the inbox** node.
2. Under Credential to connect with, choose **Create new credential**.
3. Paste the Client ID and Client secret from step 6.
4. Click **Sign in with Google**.
5. A Google window opens and asks which account. Choose the support inbox.

Now you will hit a screen that looks alarming.

> **"Google hasn't verified this app"**
>
> This screen is expected and it is not a sign that anything is wrong. It
> appears because you have made an app for yourself and have not put it through
> Google's public verification process, which is only needed if you intend to
> hand the app out to strangers. You made it, it runs in your own n8n, and it
> only touches your own inbox.
>
> To get past it: click **Advanced** at the bottom left, then click **Go to
> (your app name) (unsafe)**. The word "unsafe" is Google saying "we have not
> checked this", not "this is dangerous". Then click **Continue** to grant
> access.

6. Back in n8n, close the credential panel.
7. Open the **Send the reply** node and the **Leave it in your drafts** node,
   and pick the same Gmail credential in both.

**You should see** a green tick or "Connection tested successfully" on the
Gmail credential, and the red triangles gone from those three nodes.

---

## Step 9. Connect Shopify

1. Double-click the **Ask Shopify** node.
2. It is already set to **Generic Credential Type → Header Auth**. Leave that
   alone.
3. Next to Credential for Header Auth, choose **Create new credential**.
4. Fill in exactly this:
   - **Name**: `X-Shopify-Access-Token`
   - **Value**: your `shpat_...` token from step 3
5. Give the credential a name you will recognise, such as
   `Shopify Admin token`, and save.

**You should see** the red triangle gone from the **Ask Shopify** node.

---

## Step 10. Connect OpenAI

1. Double-click the **Ask OpenAI** node.
2. Next to Credential for Header Auth, choose **Create new credential**.
3. Fill in exactly this:
   - **Name**: `Authorization`
   - **Value**: `Bearer ` followed by your `sk-...` key from step 4

   The word `Bearer`, then one space, then the key. For example:
   `Bearer sk-abc123...`. Missing the space is the most common mistake here.
4. Name the credential `OpenAI key` and save.

**You should see** the red triangle gone from the **Ask OpenAI** node. Every
node on the canvas should now be clean.

---

## Step 11. Fill in your settings

1. Double-click the **Your settings** node. It has eight fields.
2. Fill them in:

   - **storeDomain** — your Shopify domain, such as
     `my-shop.myshopify.com`. No `https://`, no trailing slash. This is the
     `.myshopify.com` one even if you have a custom domain.
   - **apiVersion** — leave it as it is unless you have a reason to change it.
   - **storeName** — your shop's name as customers know it.
   - **signOffName** — how replies sign off, for example
     `Sam at Blue Door Books`.
   - **ownerEmail** — your own address.
   - **autoSend** — leave this **false** for now. Step 12 covers turning it on.
   - **model** — leave as `gpt-4o-mini` unless you have a reason to change it.
   - **returnPolicy** — paste your return policy, in full, in your own words.
     The bot quotes only what is written here. If it is vague, the replies will
     be vague. If it is empty, the bot says you will confirm the details
     yourself, which is the right answer but not a useful one.

3. Save the workflow.

**You should see** your own text in all eight fields, and `autoSend` set to
false.

---

## Step 12. Test it on one real email

Do not switch the workflow on yet. Test it by hand first.

1. Send yourself an email, from a different address, to your support inbox.
   Write it the way a customer would, and use a real order number from your
   store. For example:

   > Subject: Order #1042
   >
   > Hi, where is my order? It said shipped last week but nothing has arrived.

2. Leave that email unread.
3. In n8n, click **Test workflow** at the bottom of the canvas.
4. Watch the boxes light up left to right.

**You should see** a green line running through the nodes, and a new draft in
your Gmail drafts folder. Open it. At the top is a short note from the bot
saying why it left the reply for you rather than sending it, and under that is
the drafted reply, quoting your real order number and, if the order has one,
the real tracking number.

Read the draft properly. This is the moment to decide whether you trust it.

If a node turns red, open it and read the message. The troubleshooting section
below covers the failures people actually hit.

---

## Step 13. Switch it on

1. Test it three or four more times with different kinds of message: a return
   request, an address change, and something the bot should not touch, like
   "do you sell gift cards?".
2. When you are happy, use the **Inactive / Active** switch at the top right of
   the canvas to turn the workflow on.

**You should see** the switch turn to Active, and n8n confirm that the workflow
will now run on a schedule. It checks the inbox once a minute.

From here, drafts appear in your Gmail drafts folder on their own. Your job is
to read them and press send.

### Turning on automatic sending, later

When you have read a week of drafts and they have all been right, you can let
the bot send the plainest ones by itself. Set **autoSend** to `true` in the
**Your settings** node.

Be clear about what that does and does not cover. With autoSend on, a reply is
sent without you **only** when every one of these is true:

- The message was plainly a "where is my order" question, and nothing else.
- The order was found by its order number, not guessed from an email address.
- The order is shipped, and has a real tracking number on it.
- The order is neither cancelled nor refunded.
- The drafted reply passed every automatic check, including quoting the real
  tracking number and containing no leftover placeholder.

Return requests and address changes are **never** sent automatically, whatever
this setting says. Neither is anything the bot was unsure about. Those always
wait for you.

---

## If your inbox is not Gmail

The workflow ships wired for Gmail. Everything in the middle — reading the
message, finding the order, writing the reply, checking it — works the same
whatever the inbox is. Only the first node and the last two are Gmail-specific.

**For Microsoft 365 or Outlook:**

1. Delete the **Check the inbox** node and add a **Microsoft Outlook Trigger**
   in its place, connected to **Your settings**.
2. Delete **Send the reply** and add a **Microsoft Outlook** node set to reply
   to a message.
3. Delete **Leave it in your drafts** and add a **Microsoft Outlook** node set
   to create a draft.
4. In each, use `{{ $json.draft }}` or `{{ $json.noteBody }}` for the message
   text, exactly as the Gmail nodes do.

You register a Microsoft Graph app at
[portal.azure.com](https://portal.azure.com) for the credential. Microsoft does
not require an approval process for an app used on your own mailbox.

**For plain IMAP:**

Use the **Email Trigger (IMAP)** node in place of **Check the inbox**, and the
**Send Email** node in place of the two Gmail nodes. Note that plain IMAP has
no concept of a draft queue in the way Gmail does, so the "leave it for you"
path becomes an email to yourself. Set the recipient to your `ownerEmail`.

---

## What this bot will not do

Worth knowing before you rely on it.

- It answers three kinds of question: where is my order, basic return requests,
  and address changes. Anything else it leaves for you.
- It reads your Shopify orders. It cannot change them, refund them, or cancel
  them, and it has no permission to try.
- It cannot create a return label or start a return in Shopify. It answers the
  question using your policy; the actual return is still yours to process.
- It does not learn from your edits. If you rewrite a draft, the next one is
  written the same way as the last. Change the wording by changing your return
  policy or the sign-off name.
- It never contacts Kitset. There is no licence check and nothing expires.

---

## Troubleshooting

**The Ask Shopify node is red, and mentions "Invalid API key or access token".**
The token in the Header Auth credential is wrong, or has a space or a line
break in it. Re-copy it from the Shopify Dev Dashboard. Check the header name
is exactly `X-Shopify-Access-Token`, with the hyphens.

**Everything runs, but the draft says no order was found, and you know the
order exists.** Two usual causes. Either the order number in the email does not
match the order's name in Shopify, including any prefix your store adds; or the
app is missing the `read_orders` scope. Open the app in the Dev Dashboard,
check the scopes, and reinstall it on the store if you changed them.

**The draft says Shopify refused the request.** That is the missing-scope case
above, and the bot names it deliberately rather than telling your customer the
order does not exist.

**The Ask OpenAI node is red with a 401.** The Header Auth value is wrong. It
must be the word `Bearer`, one space, then the key. Not just the key.

**The Ask OpenAI node is red with a 429 or "quota".** No payment card on the
OpenAI account, or you have hit a usage limit. Check Billing at
platform.openai.com.

**Nothing happens at all when a new email arrives.** Check three things, in
order: the workflow is Active, not just saved; the email is unread; and the
email is not in Promotions or Spam. The bot looks at unread mail in the inbox.

**Drafts appear for emails that are not customer questions.** Newsletters and
notifications should already be filtered out. If something gets through, it
arrives as a draft with a note on top, never as a sent reply, so the cost is a
draft you delete.

**The Gmail credential worked and then stopped after about a week.** Your Google
Cloud app is still in Testing status. Google expires the sign-in after seven
days while it is. Publish the app out of Testing on the OAuth consent screen,
then reconnect the credential in step 8. See the note in step 6.

**A draft says no order could be found, and the customer gave no order number.**
Looking an order up by the customer's email address needs a Shopify plan of Grow
or higher. On Basic, that lookup cannot work. See "Before you start".

**A draft says no order could be found, and the order is an old one.** Orders
older than 60 days need the `read_all_orders` scope on your Shopify token. See
the note at the end of step 3.

**A draft says the person who wrote in is not the customer.** The bot compares
the address the email came from with the address on the order, and they did not
match. It writes nothing in that case. Common innocent causes: the customer
wrote from a second address, or someone is asking on their behalf. Answer it
yourself, once you are satisfied who you are talking to.

**A draft says the sender's address could not be read.** The email's From line
named more than one address — usually because the name on it contains an
address of its own. That is sometimes a mail program being odd and sometimes
somebody trying to pass themselves off as one of your customers. Either way the
bot will not guess between two addresses. Look at who really sent it and answer
it yourself.

**A draft has the right facts but the tone is wrong.** Change `signOffName` and
`returnPolicy` in the **Your settings** node. Those two fields do most of the
work in how a reply reads.

**A draft came with a note saying a check failed.** That is the bot doing its
job. The note says which check. Common ones: the reply did not quote the real
tracking number, or it contained a code that was not in the order data. Read
the draft, fix it, send it. Nothing that fails a check is ever sent on its own.

Two of those checks are about where a reply sends people. One fails if the
reply contains a web address that is not the tracking link on the order or your
own shop. The other fails if it tells the customer to write to an email address
you do not control, other than their own. Both are counted whether or not the
address was written out in full — `pay-here.example/verify` is a link as much
as `https://` in front of it is. That matters because the wording of a reply is
partly steered by the customer's own message, and a message can ask for exactly
that.

**You want to see what it did and when.** In n8n, open the workflow and click
**Executions**. Every run is listed, and you can click into any one and see
exactly what each node received and produced.
