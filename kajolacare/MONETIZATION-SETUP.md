# Kajola Care — Monetization Setup (what's done vs. what you do)

This repo now contains the full billing layer, but it is **dormant**. The app
behaves exactly as before until you finish the steps below and flip one switch.

---

## What I've already wired into the code

| File | What it is |
|---|---|
| `kajolacare/supabase/subscriptions.sql` | `subscriptions` table, 21-day-trial trigger, `has_pro()` helper. Idempotent. |
| `kajolacare/src/usePlan.js` | React hook that reads the user's plan. **Fails open** — unlocked until billing is set up. |
| `kajolacare/src/UpgradeWall.jsx` | The paywall card + `startCheckout()` that launches Stripe. |
| `kajolacare/supabase/functions/create-checkout/index.ts` | Edge function: creates a Stripe Checkout session. |
| `kajolacare/supabase/functions/stripe-webhook/index.ts` | Edge function: the only writer to `subscriptions`. |
| `kajolacare/src/App.jsx` | Imports the hook, adds `const ENFORCE_BILLING = false`, gates the Compliance workspace on both desktop and mobile. |

**The master switch:** `ENFORCE_BILLING` at the top of `src/App.jsx`. While
`false`, no subscription queries run and nothing is locked. Set it to `true`
only after the steps below are done.

> ⚠️ **I could not run your build here** (no network to `npm install`). The
> edits are additive and dormant, but before deploying you must run
> `cd kajolacare && npm install && npm run build` once and confirm it builds
> clean. If it complains, it'll point at a line — tell me and I'll fix it.

---

## PART A — Supabase (your shared Ogbara Labs project)

**A1. Run the new SQL.** Supabase → SQL Editor → New query → paste
`kajolacare/supabase/subscriptions.sql` → Run. (Idempotent — safe to re-run.)
This creates the table and gives every existing + future user a trial row.

**A2. Grandfather yourself / early customers (optional).** If you don't want
your own account to hit a paywall when you flip the switch, run the commented
`update ... set plan = 'pro'` block at the bottom of that SQL with your email.

**A3. Deploy the two edge functions.** From the repo root with the Supabase CLI:
```sh
supabase functions deploy create-checkout --no-verify-jwt
supabase functions deploy stripe-webhook  --no-verify-jwt
```
Note the printed URLs — you need the `stripe-webhook` one for Part B.

**A4. Set the function secrets** (values come from Part B):
```sh
supabase secrets set \
  STRIPE_SECRET_KEY=sk_live_xxx \
  STRIPE_WEBHOOK_SECRET=whsec_xxx \
  PRICE_STARTER=price_xxx PRICE_PRO=price_xxx PRICE_PRACTICE=price_xxx \
  SB_URL=https://YOURPROJECT.supabase.co \
  SB_SERVICE_ROLE_KEY=eyJ...service_role... \
  SITE_URL=https://kajolacare.ogbara.com.au
```
The service-role key is in Supabase → Project Settings → API. Keep it secret —
it's only ever used inside the webhook function, never in the browser.

**A5. Confirm your data region is Australia** (Project Settings → General).
You'll want to state "Australian-hosted data" on the site; make sure it's true.

---

## PART B — Stripe

### Do you need new Stripe credentials? — Short answer: mostly no.

Stripe API keys are **per-account, not per-app**. Since you already have another
app on Stripe, you **reuse the same Stripe account and the same secret key**
(`STRIPE_SECRET_KEY`). You do **not** create a second Stripe account.

What you **do** need to create new, specific to Kajola Care:

| Item | New or reused? | Why |
|---|---|---|
| Stripe account | **Reuse** | Keys are account-wide. |
| `STRIPE_SECRET_KEY` | **Reuse** | Same account = same key. |
| Products + Prices (the 3 tiers) | **New** | These are unique to Kajola Care. You get 3 new `price_…` IDs. |
| Webhook endpoint | **New** | Points at *this* app's `stripe-webhook` URL. |
| `STRIPE_WEBHOOK_SECRET` | **New** | Each webhook endpoint has its own `whsec_…`. Your other app's secret will NOT work here. |

So the only genuinely new secrets for this app are the **3 Price IDs** and the
**webhook signing secret**. The API secret key is shared.

> One thing to watch: if your other app's webhook subscribes to
> `customer.subscription.*` events, those fire account-wide. Your new webhook
> only writes rows for users it has a `user_id` for, so it ignores the other
> app's customers safely — but keep the two apps' Stripe **metadata/Price IDs
> distinct** (they already will be) so neither misreads the other's events.

### B1. Create 3 products (Stripe Dashboard → Products)
- **Starter** — recurring, $49 AUD / month
- **Pro** — recurring, $99 AUD / month
- **Practice** — recurring, $199 AUD / month

Copy each one's **Price ID** (`price_…`) → these become `PRICE_STARTER`,
`PRICE_PRO`, `PRICE_PRACTICE` in step A4.

### B2. Create the webhook (Dashboard → Developers → Webhooks → Add endpoint)
- **Endpoint URL:** the `stripe-webhook` function URL from step A3.
- **Events to send:** `checkout.session.completed`,
  `customer.subscription.updated`, `customer.subscription.deleted`.
- After creating it, copy the **Signing secret** (`whsec_…`) → `STRIPE_WEBHOOK_SECRET`.

### B3. Test with Stripe **test mode** first
Use test keys + test Price IDs and a test card (`4242 4242 4242 4242`). Confirm a
checkout writes a `pro` row into `subscriptions`. Then swap to live keys.

---

## PART C — Turn it on

1. Set `ENFORCE_BILLING = true` in `kajolacare/src/App.jsx`.
2. `npm run build` and deploy (Cloudflare rebuilds on push).
3. Sign in with a non-grandfathered account, open **Compliance** → you should
   see the upgrade wall. Complete a test checkout → it unlocks.

---

## PART D — Before you charge a real customer (don't skip)

1. **Auto-backup.** Your README notes admin edits don't auto-sync to the cloud
   unless manually synced. For a paid product holding audit records this is a
   data-loss risk. Add scheduled/auto sync before launch. *(Happy to wire this.)*
2. **Trial-expiry email** around day 17–20 — where most trial conversions happen.
   Needs a scheduled function or an email tool; not built yet.
3. **"Manage billing" link** → Stripe Customer Portal
   (`stripe.billingPortal.sessions.create`) so card updates/cancellations are
   self-service. Not built yet — easy add when you want it.
4. **Privacy policy + terms** covering participant PII. (`home/privacy.html` and
   `home/terms.html` exist — review they cover paid billing + PII.)
5. **NDIS rate-table updates.** The baked-in pricing must stay current with NDIA
   indexation or customers can mis-bill. Add a central update path.

---

## Not yet built (tell me which you want next)
- Auto-backup / auto-sync fix (item D1 — I'd treat this as the real blocker)
- Stripe Customer Portal "Manage billing" button
- Trial-expiry reminder email
- Lock icons on the nav tabs (cosmetic; the workspace gate already enforces)
- Splitting compliance registers into their own RLS tables (true server-side enforcement)
