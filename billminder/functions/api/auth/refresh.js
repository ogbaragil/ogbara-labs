export async function onRequestPost({ request, env }) {
  const payload = await request.json().catch(() => null);
  const refreshToken = String(payload?.refreshToken || "").trim();

  if (!refreshToken) {
    return jsonResponse({ error: "Missing refresh token." }, 400);
  }

  const response = await supabaseAuthFetch(env, "/auth/v1/token?grant_type=refresh_token", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken })
  });
  const result = await response.json().catch(() => null);

  if (!response.ok || !result?.access_token) {
    return jsonResponse({ error: result?.error_description || result?.msg || result?.message || "Session refresh failed." }, response.status || 401);
  }

  return jsonResponse(toSession(result));
}

function supabaseAuthFetch(env, path, options = {}) {
  const supabaseUrl = (env.VITE_SUPABASE_URL || env.SUPABASE_URL || "https://qfjudxzxyvqraogwskwc.supabase.co").replace(/\/+$/, "");
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || "";
  return fetch(`${supabaseUrl}${path}`, {
    ...options,
    headers: {
      apikey: supabaseAnonKey,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
}

function toSession(result) {
  return {
    accessToken: result.access_token,
    refreshToken: result.refresh_token || "",
    expiresAt: Date.now() + Number(result.expires_in || 3600) * 1000,
    email: result.user?.email || "",
    userId: result.user?.id || ""
  };
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}
