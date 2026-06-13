import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

// Plans that grant access to Pro-only features (Compliance suite, etc.).
// Trial counts as Pro-equivalent during the trial window.
const PRO_PLANS = ['trial', 'pro', 'practice'];

/**
 * Reads the signed-in user's subscription and derives access flags.
 *
 * IMPORTANT — fail-open design:
 * If billing isn't set up yet (no subscriptions table, no row, any query error,
 * or Supabase not configured) this returns `proAccess: true` and
 * `billingReady: false`. That means dropping this into the app changes NOTHING
 * about who can see what until (a) you've run supabase/subscriptions.sql AND
 * (b) you set ENFORCE_BILLING = true in App.jsx. Nobody gets locked out by
 * accident during rollout.
 */
export function usePlan(user, enabled = true) {
  const [sub, setSub] = useState(null);
  const [billingReady, setBillingReady] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let on = true;
    // When billing isn't being enforced yet, don't even query — stay silent
    // and fully unlocked.
    if (!enabled || !supabase || !user?.id) { setSub(null); setBillingReady(false); setLoading(false); return; }
    setLoading(true);
    supabase
      .from('subscriptions')
      .select('plan,status,trial_ends_at,current_period_end')
      .eq('user_id', user.id)
      .single()
      .then(({ data, error }) => {
        if (!on) return;
        // No table / no row / error => billing not ready => fail open.
        setSub(error ? null : data);
        setBillingReady(!error && !!data);
        setLoading(false);
      });
    return () => { on = false; };
  }, [user?.id, enabled]);

  const now = Date.now();
  const periodEnd = sub?.current_period_end || sub?.trial_ends_at;
  const withinWindow = !periodEnd || new Date(periodEnd).getTime() >= now;
  const active = !!sub && ['active', 'trialing'].includes(sub.status) && withinWindow;

  // When billing isn't ready, everything is unlocked (fail open).
  const proAccess = !billingReady ? true : (active && PRO_PLANS.includes(sub.plan));
  const plan = !billingReady ? 'unknown' : (active ? sub.plan : 'expired');

  // Days left in trial, for the "X days left" banner. null when N/A.
  const trialDaysLeft = (billingReady && sub?.plan === 'trial' && sub?.trial_ends_at)
    ? Math.max(0, Math.ceil((new Date(sub.trial_ends_at).getTime() - now) / 86400000))
    : null;

  return { loading, plan, proAccess, billingReady, trialDaysLeft, sub };
}
