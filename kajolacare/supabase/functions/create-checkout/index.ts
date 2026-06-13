// Supabase Edge Function: create-checkout
// Deploy:  supabase functions deploy create-checkout --no-verify-jwt
// Secrets needed (supabase secrets set ...):
//   STRIPE_SECRET_KEY, PRICE_STARTER, PRICE_PRO, PRICE_PRACTICE
//
// Creates a Stripe Checkout session for the chosen plan and returns its URL.
// The React app redirects the browser to that URL.

import Stripe from 'https://esm.sh/stripe@14?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-06-20',
});

const PRICE: Record<string, string> = {
  pro_month:      Deno.env.get('PRICE_PRO')              ?? '',
  pro_year:       Deno.env.get('PRICE_PRO_ANNUAL')       ?? '',
  practice_month: Deno.env.get('PRICE_PRACTICE')         ?? '',
  practice_year:  Deno.env.get('PRICE_PRACTICE_ANNUAL')  ?? '',
};

const SITE = Deno.env.get('SITE_URL') ?? 'https://kajolacare.ogbara.com.au';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { plan, interval, userId, email } = await req.json();
    const price = PRICE[`${plan}_${interval === 'year' ? 'year' : 'month'}`];
    if (!price) {
      return new Response(JSON.stringify({ error: 'Unknown plan' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price, quantity: 1 }],
      customer_email: email,
      client_reference_id: userId,          // ties Stripe back to auth.uid()
      subscription_data: { metadata: { user_id: userId } },
      allow_promotion_codes: true,
      success_url: `${SITE}/?upgraded=1`,
      cancel_url:  `${SITE}/?upgrade=cancelled`,
    });
    return new Response(JSON.stringify({ url: session.url }),
      { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
