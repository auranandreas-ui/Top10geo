  # Deploying Top 10 Geo as a real, payable product

This folder (`webapp/`) is a self-contained Vercel project: `index.html` (the game),
`api/*.js` (serverless functions), and `lib/*.js` (server-only code, including the
real question/answer database — it's never sent to the browser).

Nothing here requires you to write code. It's four account-setup steps, then filling
in a handful of settings. Do these in order — each one unlocks the next.

## 1. Create a Supabase project (accounts + database)

1. Go to supabase.com, create a free project.
2. In the project, open the SQL Editor and run the contents of `supabase/schema.sql`
   (paste the whole file, click Run). This creates the `profiles` and `round_history`
   tables, security rules, and the trigger that auto-creates a profile when someone
   signs up.
3. Go to Project Settings → API. You'll need three values later:
   - **Project URL** (`SUPABASE_URL`)
   - **anon public** key (`SUPABASE_ANON_KEY`) — safe to expose in the browser
   - **service_role** key (`SUPABASE_SERVICE_ROLE_KEY`) — secret, server-only, never
     put this in `index.html`
4. Go to Authentication → Providers and make sure **Email** is enabled (it is by
   default). This project uses passwordless "magic link" sign-in, so no extra setup
   is needed. Optionally, under Authentication → URL Configuration, add your future
   site URL once you have it (step 3 below) so redirect links work cleanly.

## 2. Create a Stripe account (real payments)

1. Go to stripe.com and create an account. You can build and test everything in
   **Test mode** first — flip to Live mode only when you're ready to take real money.
2. Go to Product Catalog → Add Product. Create three products, each with one price:
   - **Monthly** — recurring, $3.99/month
   - **Annual** — recurring, $24.99/year
   - **Lifetime** — one-time, $39.99
3. For each price, copy its **Price ID** (looks like `price_1AbC...`). You'll need
   all three (`STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_ANNUAL`, `STRIPE_PRICE_LIFETIME`).
4. Go to Developers → API keys and copy the **Secret key** (`STRIPE_SECRET_KEY`).
5. You'll set up the webhook (step 4 below) *after* you have a live URL — Stripe
   needs a real endpoint to send events to.

## 3. Deploy to Vercel

1. Push this `webapp/` folder to a GitHub repo (simplest path), or install the
   Vercel CLI (`npm i -g vercel`) and run `vercel` from inside this folder.
2. In the Vercel dashboard, import the project. Set the **root directory** to
   `webapp` if you pushed the whole outputs folder rather than just `webapp/`.
3. Before the first deploy finishes setting up, add these Environment Variables
   (Project Settings → Environment Variables):

   | Variable | Value |
   |---|---|
   | `SUPABASE_URL` | from step 1 |
   | `SUPABASE_SERVICE_ROLE_KEY` | from step 1 (secret) |
   | `STRIPE_SECRET_KEY` | from step 2 |
   | `STRIPE_PRICE_MONTHLY` | from step 2 |
   | `STRIPE_PRICE_ANNUAL` | from step 2 |
   | `STRIPE_PRICE_LIFETIME` | from step 2 |
   | `PUBLIC_SITE_URL` | your Vercel URL, e.g. `https://top10geo.vercel.app` (add after first deploy gives you a URL, then redeploy) |
   | `STRIPE_WEBHOOK_SECRET` | added in step 4 below |

4. Deploy. You'll get a live URL like `https://your-project.vercel.app`.

## 4. Connect the webhook (makes payments actually grant Premium)

1. In Stripe, go to Developers → Webhooks → Add endpoint.
2. Endpoint URL: `https://your-project.vercel.app/api/webhook`
3. Select these events: `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted`.
4. Save, then copy the **Signing secret** (`whsec_...`) into the
   `STRIPE_WEBHOOK_SECRET` environment variable in Vercel, and redeploy.

## 5. Point the frontend at your backend

Open `webapp/index.html`, find this block near the top of the `<script>` (search for
`BACKEND`):

```js
const BACKEND = {
  supabaseUrl: "",
  supabaseAnonKey: ""
};
```

Fill in your Supabase Project URL and anon key from step 1, commit/redeploy. That's
the only code edit required. Once both fields are filled in, the site automatically
switches from local demo mode (fake "Simulate Subscribe") to real accounts and real
Stripe Checkout — no other flag to flip.

## 6. Test it end to end

With Stripe still in Test mode:

1. Visit your live URL, go to the Premium screen, sign in with your email — you'll
   get a magic link (check spam if it's slow).
2. Click the link, confirm the page shows "Signed in as...".
3. Try "Start Free Trial" — should instantly show Premium active, and a row should
   appear in Supabase's `profiles` table with `premium = true`.
4. Try "Subscribe" on the Monthly plan — you'll land on a real Stripe Checkout page.
   Use Stripe's test card `4242 4242 4242 4242`, any future expiry, any CVC.
5. After payment, you're redirected back with a success message. Check Supabase:
   `profiles.premium` should be `true` and `stripe_customer_id` should be filled in
   — confirming the webhook fired correctly.
6. Try "Manage billing / cancel" — should open the real Stripe Billing Portal.

## 7. Go live

When you're ready to accept real payments: in Stripe, switch from Test to Live mode,
recreate the three Products/Prices in Live mode (test and live are separate), update
the three `STRIPE_PRICE_*` env vars and `STRIPE_SECRET_KEY` with the live versions,
add a second webhook endpoint pointed at the same URL under Live mode, and update
`STRIPE_WEBHOOK_SECRET` with the live signing secret. Redeploy.

## What's still local-only

Duel Mode, collectible badges, and "Personal Bests" remain device-local (no account
sync) — they're not security- or revenue-sensitive, so they were kept simple. Everything
that touches money or a real answer key (accounts, subscriptions, scoring, payments)
is server-authoritative as described above.
