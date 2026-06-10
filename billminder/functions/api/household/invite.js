const DEFAULT_SUPABASE_URL = "https://qfjudxzxyvqraogwskwc.supabase.co";

export async function onRequestPost({ request, env }) {
  if (!serviceKey(env)) {
    return json({ error: "Household sync is not configured. Add SUPABASE_SERVICE_ROLE_KEY as a Cloudflare Pages secret." }, 500);
  }
  const token = getBearer(request);
  const user = token ? await getUser(env, token) : null;
  if (!user) return json({ error: "Sign in to invite a partner." }, 401);

  const payload = await request.json().catch(() => null);
  const email = String(payload?.email || "").trim().toLowerCase();
  if (!isEmail(email)) return json({ error: "Enter a valid email address." }, 400);
  if (email === String(user.email || "").toLowerCase()) return json({ error: "That's your own email address." }, 400);

  // Get or create the inviter's household.
  let householdId = (await membershipOf(env, user.id))?.household_id || null;
  if (!householdId) {
    const created = await svc(env, "/rest/v1/households", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ created_by: user.id })
    });
    if (!created.ok) return json({ error: await created.text() }, created.status);
    householdId = (await created.json())[0].id;
    await svc(env, "/rest/v1/household_members", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ household_id: householdId, user_id: user.id, email: user.email || null, role: "owner" })
    });
  }

  const membersResp = await svc(env, `/rest/v1/household_members?household_id=eq.${encodeURIComponent(householdId)}&select=user_id`);
  const members = membersResp.ok ? await membersResp.json() : [];
  if (members.length >= 2) return json({ error: "Your household already has two members." }, 400);

  // Replace any earlier pending invite, then create a fresh one.
  await svc(env, `/rest/v1/household_invites?household_id=eq.${encodeURIComponent(householdId)}&status=eq.pending`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ status: "revoked" })
  });

  const inviteToken = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
  const created = await svc(env, "/rest/v1/household_invites", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ household_id: householdId, inviter_id: user.id, invite_email: email, token: inviteToken, status: "pending" })
  });
  if (!created.ok) return json({ error: await created.text() }, created.status);

  const link = new URL(`/?invite=${inviteToken}`, request.url).toString();
  return json({ ok: true, email, token: inviteToken, link });
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

function isEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}
