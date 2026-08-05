// Stores bill scans in a private Supabase Storage bucket instead of the
// browser's IndexedDB, so the document is visible from any device or
// household member, and is deleted server-side the moment a bill is paid
// (see the deletion call from bills.js's onRequestPost).
//
// Storage is accessed with the service-role key only, from here — the
// browser never sees it. Access is scoped by computing the same "scope key"
// bills.js uses (household id, or user id, or the anon app-instance id) and
// using it as the object's path prefix, so a request can only ever reach
// documents that belong to its own scope.
const DEFAULT_SUPABASE_URL = "https://qfjudxzxyvqraogwskwc.supabase.co";
const BUCKET = "bill-documents";
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const SIGNED_URL_TTL_SECONDS = 300;

const jsonHeaders = { "Content-Type": "application/json", "Cache-Control": "no-store" };

export async function onRequestPost({ request, env }) {
  const guard = requireConfig(env);
  if (guard) return guard;

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse("The upload could not be read.", 400);
  }

  const clientBillId = sanitizeId(formData.get("clientBillId"));
  const appInstanceId = String(formData.get("appInstanceId") || "").trim();
  const syncSecret = String(formData.get("syncSecret") || "").trim();
  const file = formData.get("file");

  if (!clientBillId) return errorResponse("Missing or invalid clientBillId.", 400);
  if (!file || typeof file.arrayBuffer !== "function") return errorResponse("Upload a PDF or photo.", 400);
  if (!file.size) return errorResponse("The uploaded file is empty.", 400);
  if (file.size > MAX_FILE_BYTES) {
    return errorResponse(`File is larger than the ${Math.round(MAX_FILE_BYTES / (1024 * 1024))} MB limit.`, 400);
  }

  const mime = String(file.type || "").toLowerCase();
  const isImage = mime.startsWith("image/");
  const isPdf = mime === "application/pdf";
  if (!isImage && !isPdf) return errorResponse("Only PDF files and bill photos can be stored.", 400);

  const scope = await resolveScope(request, env, appInstanceId, syncSecret);
  if (scope.error) return scope.error;

  const path = `${scope.key}/${clientBillId}`;
  const bytes = await file.arrayBuffer();

  const upload = await storageFetch(env, `/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": mime,
      "x-upsert": "true"
    },
    body: bytes
  });

  if (!upload.ok) return errorResponse(await safeText(upload), upload.status);

  return jsonResponse({
    ok: true,
    path,
    mime,
    size: file.size,
    fileName: sanitizeFilename(file.name)
  });
}

export async function onRequestGet({ request, env }) {
  const guard = requireConfig(env);
  if (guard) return guard;

  const url = new URL(request.url);
  const clientBillId = sanitizeId(url.searchParams.get("clientBillId"));
  const appInstanceId = url.searchParams.get("appInstanceId") || "";
  const syncSecret = url.searchParams.get("syncSecret") || "";
  if (!clientBillId) return errorResponse("Missing or invalid clientBillId.", 400);

  const scope = await resolveScope(request, env, appInstanceId, syncSecret);
  if (scope.error) return scope.error;

  const path = `${scope.key}/${clientBillId}`;
  const signed = await storageFetch(env, `/object/sign/${BUCKET}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: SIGNED_URL_TTL_SECONDS })
  });

  if (signed.status === 400 || signed.status === 404) {
    return errorResponse("This document isn't stored, or was already removed.", 404);
  }
  if (!signed.ok) return errorResponse(await safeText(signed), signed.status);

  const payload = await signed.json().catch(() => null);
  if (!payload?.signedURL) return errorResponse("Could not create a viewing link.", 502);

  return jsonResponse({
    ok: true,
    url: `${supabaseUrl(env)}/storage/v1${payload.signedURL}`
  });
}

export async function onRequestDelete({ request, env }) {
  const guard = requireConfig(env);
  if (guard) return guard;

  const payload = await request.json().catch(() => null);
  const clientBillId = sanitizeId(payload?.clientBillId);
  const appInstanceId = payload?.appInstanceId || "";
  const syncSecret = payload?.syncSecret || "";
  if (!clientBillId) return jsonResponse({ ok: true, deleted: 0 });

  const scope = await resolveScope(request, env, appInstanceId, syncSecret);
  if (scope.error) return scope.error;

  const path = `${scope.key}/${clientBillId}`;
  const response = await storageFetch(env, `/object/${BUCKET}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes: [path] })
  });

  if (!response.ok) return errorResponse(await safeText(response), response.status);
  return jsonResponse({ ok: true, deleted: 1 });
}

/* ---- scoping (mirrors functions/api/bills.js's identity rules) ---- */
async function resolveScope(request, env, appInstanceId, syncSecret) {
  const authToken = getBearer(request);
  const user = authToken ? await getUser(env, authToken) : null;

  if (user) {
    const householdId = await getUserHouseholdId(env, user.id, authToken);
    return { key: householdId || user.id };
  }

  if (!isUuid(appInstanceId) || !isUuid(syncSecret)) {
    return { error: errorResponse("Missing or invalid sync identity.", 400) };
  }
  return { key: appInstanceId };
}

async function getUserHouseholdId(env, userId, authToken) {
  const response = await fetch(
    `${supabaseUrl(env)}/rest/v1/household_members?user_id=eq.${encodeURIComponent(userId)}&select=household_id&limit=1`,
    { headers: { apikey: anonKey(env), Authorization: `Bearer ${authToken}` } }
  );
  if (!response.ok) return null;
  const rows = await response.json().catch(() => []);
  return rows[0]?.household_id || null;
}

async function getUser(env, token) {
  const response = await fetch(`${supabaseUrl(env)}/auth/v1/user`, {
    headers: { apikey: anonKey(env), Authorization: `Bearer ${token}` }
  });
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

/* ---- storage access (service role only, never sent to the browser) ---- */
function storageFetch(env, path, options = {}) {
  const key = serviceKey(env);
  return fetch(`${supabaseUrl(env)}/storage/v1${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...(options.headers || {})
    }
  });
}

/* ---- shared helpers ---- */
function requireConfig(env) {
  if (!serviceKey(env)) {
    return errorResponse("Document storage is not configured. Add SUPABASE_SERVICE_ROLE_KEY as a Cloudflare Pages secret.", 500);
  }
  return null;
}

function supabaseUrl(env) {
  return (env.VITE_SUPABASE_URL || env.SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/+$/, "");
}
function anonKey(env) { return env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || ""; }
function serviceKey(env) { return env.SUPABASE_SERVICE_ROLE_KEY || ""; }

function getBearer(request) {
  const header = request.headers.get("Authorization") || "";
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || "");
}

function sanitizeId(value) {
  return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 100);
}

function sanitizeFilename(value) {
  return String(value || "document")
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, "-")
    .slice(0, 160) || "document";
}

async function safeText(response) {
  try { return await response.text(); } catch { return `Storage request failed with status ${response.status}.`; }
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: jsonHeaders });
}

function errorResponse(message, status) {
  return jsonResponse({ error: message }, status);
}
