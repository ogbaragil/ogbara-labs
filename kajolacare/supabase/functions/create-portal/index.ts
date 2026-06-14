// Supabase Edge Function: create-portal
// Deploy:  supabase functions deploy create-portal --no-verify-jwt
// Secrets needed (already set for the other functions):
//   STRIPE_SECRET_KEY, SB_URL, SB_SERVICE_ROLE_KEY, SITE_URL
//
// Opens the Stripe Customer Portal for the signed-in user. Looks up the
// stored stripe_customer_id (service role), then creates a portal session.

import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-06-20',
});

const SITE = Deno.env.get('SITE_URL') ?? 'https://kajolacare.ogbara.com.au';

const admin = createClient(
  Deno.env.get('SB_URL') ?? '',
  Deno.env.get('SB_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false } },
);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  // 1) Read the user id.
  let userId = '';
  try {
    const body = await req.json();
    userId = body?.userId ?? '';
  } catch (_) { /* ignore */ }
  if (!userId) return json({ error: 'Missing userId.' }, 400);

  // 2) Look up the stored Stripe customer id.
  let customer = '';
  try {
    const { data, error } = await admin
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      console.error('DB lookup error:', error.message);
      return json({ error: `Database error: ${error.message}` }, 500);
    }
    customer = data?.stripe_customer_id ?? '';
  } catch (e) {
    console.error('DB lookup threw:', e?.message ?? e);
    return json({ error: `Database error: ${String(e?.message ?? e)}` }, 500);
  }
  if (!customer) {
    return json({ error: 'No billing account on file yet. Start a subscription first.' }, 404);
  }

  // 3) Create the portal session.
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer,
      return_url: `${SITE}/?tab=settings`,
    });
    return json({ url: session.url });
  } catch (e) {
    const msg = String(e?.message ?? e);
    console.error('Stripe portal error:', msg, '| customer:', customer);
    if (/No configuration provided|customer portal settings/i.test(msg)) {
      return json({ error: 'Stripe Customer Portal is not saved in this mode. Open dashboard.stripe.com/test/settings/billing/portal and click Save.' }, 500);
    }
    if (/No such customer/i.test(msg)) {
      return json({ error: 'The stored Stripe customer is not valid for this Stripe key/mode. Re-subscribe in test mode or clear the placeholder stripe_customer_id.' }, 500);
    }
    return json({ error: msg }, 500);
  }
});
