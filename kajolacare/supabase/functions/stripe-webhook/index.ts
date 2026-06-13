// Supabase Edge Function: stripe-webhook
// Deploy:  supabase functions deploy stripe-webhook --no-verify-jwt
// Secrets needed (supabase secrets set ...):
//   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
//   PRICE_STARTER, PRICE_PRO, PRICE_PRACTICE,
//   SB_URL (your Supabase project URL), SB_SERVICE_ROLE_KEY (service role key)
//
// This is the ONLY writer to public.subscriptions. It uses the service-role key
// so it can bypass RLS. Set the endpoint URL in the Stripe Dashboard → Webhooks
// and subscribe to: checkout.session.completed, customer.subscription.updated,
// customer.subscription.deleted.

import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-06-20',
});

const admin = createClient(
  Deno.env.get('SB_URL') ?? '',
  Deno.env.get('SB_SERVICE_ROLE_KEY') ?? '',
);

const PLAN_BY_PRICE: Record<string, string> = {
  [Deno.env.get('PRICE_PRO')             ?? '_p']:  'pro',
  [Deno.env.get('PRICE_PRO_ANNUAL')      ?? '_pa']: 'pro',
  [Deno.env.get('PRICE_PRACTICE')        ?? '_x']:  'practice',
  [Deno.env.get('PRICE_PRACTICE_ANNUAL') ?? '_xa']: 'practice',
};

Deno.serve(async (req) => {
  const sig = req.headers.get('stripe-signature') ?? '';
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body, sig, Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '');
  } catch (e) {
    return new Response(`Bad signature: ${e?.message}`, { status: 400 });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const s = event.data.object as Stripe.Checkout.Session;
      const userId = s.client_reference_id;
      // Fetch the subscription to learn the price + period end.
      const sub = await stripe.subscriptions.retrieve(s.subscription as string);
      await upsert(userId, sub);
    } else if (event.type === 'customer.subscription.updated'
            || event.type === 'customer.subscription.deleted') {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.user_id
        ?? (await stripe.customers.retrieve(sub.customer as string) as any)?.metadata?.user_id;
      await upsert(userId, sub, event.type === 'customer.subscription.deleted');
    }
  } catch (e) {
    return new Response(`Handler error: ${e?.message}`, { status: 500 });
  }
  return new Response('ok');
});

async function upsert(userId: string | null | undefined, sub: Stripe.Subscription, deleted = false) {
  if (!userId) { console.error('No userId on event — checkout created without client_reference_id'); return; }
  const priceId = sub.items?.data?.[0]?.price?.id ?? '';
  const { error } = await admin.from('subscriptions').upsert({
    user_id: userId,
    plan: deleted ? 'expired' : (PLAN_BY_PRICE[priceId] ?? 'starter'),
    status: deleted ? 'canceled' : sub.status,
    stripe_customer_id: sub.customer as string,
    stripe_subscription_id: sub.id,
    current_period_end: sub.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString() : null,
    updated_at: new Date().toISOString(),
  });
  if (error) console.error('subscriptions upsert failed:', error.message, (error as any).details);
}
