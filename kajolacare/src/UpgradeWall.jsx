import React, { useState } from 'react';
import { supabase, supabaseUrl } from './supabaseClient';

// Monthly + annual pricing. Annual maps to a separate Stripe Price (see
// create-checkout / the *_ANNUAL secrets).
const TIERS = [
  {
    id: 'pro', name: 'Pro', monthly: '$39.99', annual: '$399.99', featured: true,
    blurb: 'The full operational app plus the compliance suite — incidents, audits, registers and your evidence library.',
  },
  {
    id: 'practice', name: 'Practice', monthly: '$59.99', annual: '$599.99',
    blurb: 'Everything in Pro, plus unlimited workers and priority support.',
  },
];

// Which tiers to offer for each context.
const TIERS_FOR = {
  app: ['pro', 'practice'],                   // (unused while operations are free)
  compliance: ['pro', 'practice'],            // free/expired user wants Compliance
  workers: ['practice'],                      // hit the 10-worker cap
};

/**
 * Launches Stripe Checkout. interval is 'month' or 'year'.
 * Requires the create-checkout edge function.
 */
export async function startCheckout(plan, user, interval = 'month') {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const base = supabaseUrl || '';
    const res = await fetch(`${base}/functions/v1/create-checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token || ''}`,
      },
      body: JSON.stringify({ plan, interval, userId: user?.id, email: user?.email }),
    });
    const { url, error } = await res.json();
    if (url) { window.location.href = url; return; }
    alert(error || 'Could not start checkout. Please try again.');
  } catch (e) {
    alert('Could not reach the billing service. Please try again.');
  }
}

function headline(reason, plan) {
  if (reason === 'workers') return "You've reached your worker limit";
  if (reason === 'compliance') return 'Compliance is a Pro feature';
  if (plan === 'expired') return 'Your trial has ended';
  return 'Choose a plan to continue';
}

function subcopy(reason, plan) {
  if (reason === 'workers') return 'Your plan includes up to 10 workers. Upgrade to Practice for unlimited workers.';
  if (reason === 'compliance') {
    return plan === 'expired'
      ? 'Your trial has ended. Pick Pro or Practice to keep using the compliance suite and your saved records.'
      : 'The compliance suite — incidents, audits, registers and your evidence library — is on the Pro and Practice plans.';
  }
  if (plan === 'expired') return 'Your free trial has ended. Choose a plan to keep using Kajola Care and your saved records.';
  return 'Choose a plan to keep using Kajola Care.';
}

/**
 * Paywall card. `reason` is 'app' | 'compliance' | 'workers'.
 */
export function UpgradeWall({ feature = 'This feature', plan, user, reason = 'compliance' }) {
  const [busy, setBusy] = useState(null);
  const [billingInterval, setBillingInterval] = useState('month');
  const annual = billingInterval === 'year';
  const ids = TIERS_FOR[reason] || TIERS_FOR.compliance;
  const tiers = TIERS.filter(t => ids.includes(t.id));

  const go = async (tier) => { setBusy(tier); await startCheckout(tier, user, billingInterval); setBusy(null); };

  return (
    <section className="card">
      <div className="card-head"><h3>{headline(reason, plan)}</h3></div>
      <p>{subcopy(reason, plan)}</p>

      <div style={{ display: 'inline-flex', gap: '4px', margin: '8px 0 16px', padding: '4px', border: '1px solid var(--border, #e2e2e2)', borderRadius: '999px' }}>
        <button className={!annual ? 'primary' : 'ghost'} style={{ borderRadius: '999px' }} onClick={() => setBillingInterval('month')}>Monthly</button>
        <button className={annual ? 'primary' : 'ghost'} style={{ borderRadius: '999px' }} onClick={() => setBillingInterval('year')}>Yearly · save ~17%</button>
      </div>

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        {tiers.map(t => (
          <div key={t.id} className={t.featured ? 'featured' : ''}
               style={{ flex: '1 1 200px', border: t.featured ? '2px solid var(--accent, #2563eb)' : '1px solid var(--border, #e2e2e2)', borderRadius: '12px', padding: '16px' }}>
            <strong style={{ fontSize: '1.05rem' }}>{t.name}</strong>
            <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>
              {annual ? t.annual : t.monthly}
              <small style={{ fontWeight: 400 }}>/{annual ? 'yr' : 'mo'}</small>
            </div>
            <p style={{ fontSize: '.85rem', opacity: .8, minHeight: '3.6em' }}>{t.blurb}</p>
            <button className="primary" disabled={busy === t.id} onClick={() => go(t.id)}>
              {busy === t.id ? 'Redirecting…' : `Choose ${t.name}`}
            </button>
          </div>
        ))}
      </div>

      <p style={{ fontSize: '.8rem', opacity: .6, marginTop: '12px' }}>
        Secure checkout by Stripe. Cancel anytime. Your data exports whenever you ask.
      </p>
    </section>
  );
}
