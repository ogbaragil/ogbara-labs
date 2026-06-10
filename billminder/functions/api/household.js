const DEFAULT_SUPABASE_URL = "https://qfjudxzxyvqraogwskwc.supabase.co";

export async function onRequestGet({ request, env }) {
  const guard = requireConfig(env);
  if (guard) return guard;
  const user = await requireUser(env, request);
  if (!user.ok) return user.response;

  const household = await currentHousehold(env, user.id);
  const sentInvites = await pendingInvitesFrom(env, user.id);
  return json({ household, sentInvites });
}

// Leave the current household: the leaving user's own authored bills revert to
// personal, their membership is removed, and any invites they sent are revoked.
export async function onRequestDelete({ request, env }) {
  const guard = requireConfig(env);
  if (guard) return guard;
  const user = await requireUser(env, request);
  if (!user.ok) return user.response;

  const membership = await membershipOf(env, user.id);
  if (!membership) return json({ ok: true, household: null });

  const hid = encodeURIComponent(membership.household_id);
  await svc(env, `/rest/v1/bills?household_id=eq.${hid}&user_id=eq.${encodeURIComponent(user.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ household_id: null })
  });
  await svc(env, `/rest/v1/household_members?household_id=eq.${hid}&user_id=eq.${encodeURIComponent(user.id)}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" }
  });
  await svc(env, `/rest/v1/household_invites?inviter_id=eq.${encodeURIComponent(user.id)}&status=eq.pending`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ status: "revoked" })
  });

  return json({ ok: true, household: null });
}

async function currentHousehold(env, userId) {
  const membership = await membershipOf(env, userId);
  if (!membership) return null;
  const response = await svc(env, `/rest/v1/household_members?household_id=eq.${encodeURIComponent(membership.household_id)}&select=user_id,email,role`);
  const members = response.ok ? await response.json() : [];
  return {
    id: membership.household_id,
    members: members.map((m) => ({ userId: m.user_id, email: m.email, role: m.role }))
  };
}

async function membershipOf(env, userId) {
  const response = await svc(env, `/rest/v1/household_members?user_id=eq.${encodeURIComponent(userId)}&select=household_id,role&limit=1`);
  if (!response.ok) return null;
  const rows = await response.json().catch(() => []);
  return rows[0] || null;
}

async function pendingInvitesFrom(env, userId) {
  const response = await svc(env, `/rest/v1/household_invites?inviter_id=eq.${encodeURIComponent(userId)}&status=eq.pending&select=invite_email,token,created_at`);
  return response.ok ? await response.json().catch(() => []) : [];
}

/* ---- shared helpers ---- */
function requireConfig(env) {
  if (!serviceKey(env)) {
    return json({ error: "Household sync is not configured. Add SUPABASE_SERVICE_ROLE_KEY as a Cloudflare Pages secret." }, 500);
  }
  return null;
}

async function requireUser(env, request) {
  const token = getBearer(request);
  const user = token ? await getUser(env, token) : null;
  if (!user) return { ok: false, response: json({ error: "Sign in to manage your household." }, 401) };
  return { ok: true, id: user.id, email: user.email || "" };
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
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
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
