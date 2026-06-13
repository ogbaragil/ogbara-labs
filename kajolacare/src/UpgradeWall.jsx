import React, { useState } from 'react';
import { supabase, supabaseUrl } from './supabaseClient';

const TIERS = [
  { id: 'starter',  name: 'Starter',  price: '$49',  blurb: 'Invoicing, scheduling, participants and the worker portal.' },
  { id: 'pro',      name: 'Pro',      price: '$99',  blurb: 'Everything in Starter plus the full compliance suite — incidents, audits, registers and your evidence library.', featured: true },
  { id: 'practice', name: 'Practice', price: '$199', blurb: 'Unlimited workers, priority support, full reports.' },
];

/**
 * Kicks off Stripe Checkout for a tier. Redirects the browser to Stripe's
 * hosted page. Requires the `create-checkout` edge function to be deployed.
 */
export async function startCheckout(plan, user) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const base = supabaseUrl || '';
    const res = await fetch(`${base}/functions/v1/create-checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token || ''}`,
      },
      body: JSON.stringify({ plan, userId: user?.id, email: user?.email }),
    });
    const { url, error } = await res.json();
    if (url) { window.location.href = url; return; }
    alert(error || 'Could not start checkout. Please try again.');
  } catch (e) {
    alert('Could not reach the billing service. Please try again.');
  }
}

/**
 * Shown in place of a Pro-only workspace when the current plan does not include
 * it. Lists the tiers and starts checkout on click.
 */
export function UpgradeWall({ feature = 'This feature', plan, user }) {
  const [busy, setBusy] = useState(null);
  const go = async (tier) => { setBusy(tier); await startCheckout(tier, user); setBusy(null); };
  return (
    <section className="card">
      <div className="card-head"><h3>{feature} is a Pro feature</h3></div>
      <p>
        {plan === 'expired'
          ? 'Your trial has ended. Choose a plan to keep using the compliance suite and your saved records.'
          : `Unlock ${feature.toLowerCase()} — incident & risk registers, audit schedules, worker screening and your evidence library — with a Kajola Care plan.`}
      </p>
      <div className="upgrade-tiers" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '12px' }}>
        {TIERS.map(t => (
          <div key={t.id} className={`upgrade-tier${t.featured ? ' featured' : ''}`}
               style={{ flex: '1 1 180px', border: '1px solid var(--border, #e2e2e2)', borderRadius: '12px', padding: '16px' }}>
            <strong style={{ fontSize: '1.05rem' }}>{t.name}</strong>
            <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>{t.price}<small style={{ fontWeight: 400 }}>/mo</small></div>
            <p style={{ fontSize: '.85rem', opacity: .8 }}>{t.blurb}</p>
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
