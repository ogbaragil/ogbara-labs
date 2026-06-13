import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

// Plans are evaluated below. Trial counts as full (compliance-equivalent) access.

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
  // Pick the date relevant to the subscription's STATE. A paid 'active' sub is
  // governed by current_period_end and is valid even if that's absent (Stripe
  // already says it's active); only a 'trialing' sub is gated by trial_ends_at.
  // This prevents a stale trial_ends_at from locking out an active paid plan.
  const endDate = sub?.status === 'trialing' ? sub?.trial_ends_at : sub?.current_period_end;
  const withinWindow = !endDate || new Date(endDate).getTime() >= now;
  const active = !!sub && ['active', 'trialing'].includes(sub.status) && withinWindow;
  const planId = sub?.plan;

  // Two access axes (both fail OPEN when billing isn't ready):
  //   appAccess        — any active paid plan or trial → use the operational app
  //   complianceAccess — trial / pro / practice        → the Compliance suite
  // and one numeric limit:
  //   workerLimit      — 10 for trial/free/pro, unlimited for practice
  const COMPLIANCE_PLANS = ['trial', 'pro', 'practice'];
  const APP_PLANS = ['trial', 'pro', 'practice'];

  const complianceAccess = !billingReady ? true : (active && COMPLIANCE_PLANS.includes(planId));
  const appAccess        = !billingReady ? true : (active && APP_PLANS.includes(planId));
  const workerLimit      = !billingReady ? Infinity : ((active && planId === 'practice') ? Infinity : 10);
  const plan = !billingReady ? 'unknown' : (active ? planId : 'expired');

  // Days left in trial, for the "X days left" banner. null when N/A.
  const trialDaysLeft = (billingReady && planId === 'trial' && sub?.trial_ends_at)
    ? Math.max(0, Math.ceil((new Date(sub.trial_ends_at).getTime() - now) / 86400000))
    : null;

  // proAccess kept as an alias for backwards compatibility (== complianceAccess).
  return { loading, plan, appAccess, complianceAccess, proAccess: complianceAccess, workerLimit, billingReady, trialDaysLeft, sub };
}
