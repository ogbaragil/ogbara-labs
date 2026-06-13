# Kajola Care — Monetization Setup (v3: Starter dropped)

The operational app is **free**. Compliance is the Pro paywall; unlimited workers
is Practice. Everything stays dormant until you flip `ENFORCE_BILLING` in
`src/App.jsx`.

## The tier model

| Plan | App access | Compliance | Workers | Price (mo / yr) |
|---|---|---|---|---|
| **Trial** (30 days) | ✓ | ✓ | 10 | free |
| **Free** (after trial) | ✓ | 🔒 | 10 | $0 |
| **Pro** | ✓ | ✓ | 10 | $39.99 / $399.99 |
| **Practice** | ✓ | ✓ | unlimited | $59.99 / $599.99 |

A free/expired user keeps the operational app (10-worker cap) with Compliance
locked. Pro unlocks Compliance; Practice adds unlimited workers.

## The switches (top of `src/App.jsx`)

```js
const ENFORCE_BILLING = false;          // master: compliance gate + worker cap + billing
const GATE_OPERATIONS_ON_EXPIRY = false;// keep operations free (Starter dropped)
```

- `ENFORCE_BILLING = false` → app behaves as before, nothing locked.
- `ENFORCE_BILLING = true` → Compliance gated to trial/pro/practice; 10-worker cap below Practice; operations stay free.
- `GATE_OPERATIONS_ON_EXPIRY` stays `false` for this model. Only set it `true` if you later decide to force Pro as the minimum to use the app at all.

> ⚠️ Run `cd kajolacare && npm install && npm run build` once before deploying —
> I can't run your build here.

## Stripe — only Pro & Practice now

You do **not** need Starter prices anymore. You can ignore or delete the
`PRICE_STARTER` / `PRICE_STARTER_ANNUAL` secrets — nothing reads them.

Prices required (4 total):

| Secret | What |
|---|---|
| `PRICE_PRO` | Pro monthly — $39.99 |
| `PRICE_PRO_ANNUAL` | Pro yearly — $399.99 |
| `PRICE_PRACTICE` | Practice monthly — $59.99 |
| `PRICE_PRACTICE_ANNUAL` | Practice yearly — $599.99 |

If your existing monthly Prices aren't those exact amounts, create new ones
(Stripe Prices are immutable) and point the secrets at the new IDs. Set any new
annual ones:
```sh
supabase secrets set PRICE_PRO_ANNUAL=price_xxx PRICE_PRACTICE_ANNUAL=price_xxx
```
Unchanged: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SB_URL`,
`SB_SERVICE_ROLE_KEY`, `SITE_URL`.

## Supabase
- Re-run `supabase/subscriptions.sql` (idempotent) for the 30-day trial default.
- Redeploy both edge functions (they no longer reference Starter):
  ```sh
  supabase functions deploy create-checkout --no-verify-jwt
  supabase functions deploy stripe-webhook  --no-verify-jwt
  ```
  `--no-verify-jwt` is required on `stripe-webhook`.

## Test matrix (test mode, card 4242 4242 4242 4242)
- `plan='expired'` (or no row) → operations work, Compliance shows the wall (Pro/Practice).
- `plan='pro'` → Compliance unlocked; adding an 11th worker is blocked.
- `plan='practice'` → Compliance unlocked; unlimited workers.

Force a state to test:
```sql
update public.subscriptions set plan='pro', status='active',
  current_period_end=now()+interval '1 month'
where user_id in (select id from auth.users where email='you@example.com');
```

## Still worth doing before real customers
- Auto-backup fix (admin edits don't auto-sync) — the real launch blocker.
- "Activating your plan…" re-check on the `?upgraded=1` return (webhook/redirect race).
- "Manage billing" → Stripe Customer Portal.
- If you add bulk worker import later, enforce the 10-worker cap there too.
