// Supabase Edge Function: create-portal
// Deploy:  supabase functions deploy create-portal --no-verify-jwt
// Secrets needed (already set for the other functions):
//   STRIPE_SECRET_KEY, SB_URL, SB_SERVICE_ROLE_KEY, SITE_URL
//
// Opens the Stripe Customer Portal so the user can update their card,
// view invoices, or cancel/change their subscription. We look up the
// stored stripe_customer_id for the signed-in user (service role) and
// return a one-time portal URL; the React app redirects to it.

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { userId } = await req.json();
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Missing userId' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // Find the Stripe customer id stored by the webhook.
    const { data, error } = await admin
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    const customer = data?.stripe_customer_id;
    if (!customer) {
      return new Response(JSON.stringify({ error: 'No billing account found. Start a subscription first.' }),
        { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer,
      return_url: `${SITE}/?tab=settings`,
    });

    return new Response(JSON.stringify({ url: session.url }),
      { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
