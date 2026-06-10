const DEFAULT_SUPABASE_URL = "https://qfjudxzxyvqraogwskwc.supabase.co";

export async function onRequestPost({ request, env }) {
  if (!serviceKey(env)) {
    return json({ error: "Household sync is not configured. Add SUPABASE_SERVICE_ROLE_KEY as a Cloudflare Pages secret." }, 500);
  }
  const token = getBearer(request);
  const user = token ? await getUser(env, token) : null;
  if (!user) return json({ error: "Sign in to accept an invitation." }, 401);

  const payload = await request.json().catch(() => null);
  const inviteToken = String(payload?.token || "").trim();
  if (!inviteToken) return json({ error: "Missing invite token." }, 400);

  const inviteResp = await svc(env, `/rest/v1/household_invites?token=eq.${encodeURIComponent(inviteToken)}&select=*&limit=1`);
  const invite = inviteResp.ok ? (await inviteResp.json())[0] : null;
  if (!invite || invite.status !== "pending") {
    return json({ error: "This invitation is no longer valid." }, 400);
  }
  if (String(invite.invite_email || "").toLowerCase() !== String(user.email || "").toLowerCase()) {
    return json({ error: "This invitation was sent to a different email address." }, 403);
  }

  const existing = await membershipOf(env, user.id);
  if (existing && existing.household_id !== invite.household_id) {
    return json({ error: "You're already linked to a household. Leave it first to join another." }, 400);
  }

  await svc(env, "/rest/v1/household_members", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ household_id: invite.household_id, user_id: user.id, email: user.email || null, role: "member" })
  });

  // Pool both members' existing personal bills into the shared household.
  await svc(env, `/rest/v1/bills?user_id=eq.${encodeURIComponent(invite.inviter_id)}&household_id=is.null`, {
    method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ household_id: invite.household_id })
  });
  await svc(env, `/rest/v1/bills?user_id=eq.${encodeURIComponent(user.id)}&household_id=is.null`, {
    method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ household_id: invite.household_id })
  });

  await svc(env, `/rest/v1/household_invites?id=eq.${encodeURIComponent(invite.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ status: "accepted", accepted_by: user.id, accepted_at: new Date().toISOString() })
  });

  const household = await currentHousehold(env, user.id);
  return json({ ok: true, household });
}

async function currentHousehold(env, userId) {
  const membership = await membershipOf(env, userId);
  if (!membership) return null;
  const response = await svc(env, `/rest/v1/household_members?household_id=eq.${encodeURIComponent(membership.household_id)}&select=user_id,email,role`);
  const members = response.ok ? await response.json() : [];
  return { id: membership.household_id, members: members.map((m) => ({ userId: m.user_id, email: m.email, role: m.role })) };
}

async function membershipOf(env, userId) {
  const response = await svc(env, `/rest/v1/household_members?user_id=eq.${encodeURIComponent(userId)}&select=household_id&limit=1`);
  if (!response.ok) return null;
  const rows = await response.json().catch(() => []);
  return rows[0] || null;
}

function supabaseUrl(env) {
  return (env.VITE_SUPABASE_URL || env.SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/+$/, "");
}
function anonKey(env) { return env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || ""; }
function serviceKey(env) { return env.SUPABASE_SERVICE_ROLE_KEY || ""; }

async function getUser(env, token) {
  const response = await fetch(`${supabaseUrl(env)}/auth/v1/user`, {
    headers: { apikey: anonKey(env), Authorization: `Bearer ${token}` }
  });
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

function svc(env, path, options = {}) {
  const key = serviceKey(env);
  return fetch(`${supabaseUrl(env)}${path}`, {
    ...options,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(options.headers || {}) }
  });
}

function getBearer(request) {
  const header = request.headers.get("Authorization") || "";
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}
