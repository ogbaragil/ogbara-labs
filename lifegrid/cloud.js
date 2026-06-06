/* =====================================================================
   Ogbara Labs · cloud.js — shared Supabase auth + sync layer
   Local-first: every app works fully offline with no account.
   When supabase-config.js is filled in, a ☁️ account button appears.
   Signed-in users get: state backup/sync (table public.app_state) and
   photo/avatar storage (bucket "photos", path {uid}/{app}/{id}.jpg).
   Sync model: debounced push on change, pull on sign-in/open/focus.
   If the app supplies a merge(local, remote) hook, sync is merge-aware
   (read-merge-write with optimistic concurrency); otherwise last-write-wins.
   ===================================================================== */
(function () {
  "use strict";

  const Cloud = {};
  let client = null, user = null, appKey = "", hooks = {};
  let pushTimer = null, applying = false, status = "off"; // off|out|idle|sync|err

  const cfgOk = () => !!(window.SUPABASE_URL && window.SUPABASE_ANON_KEY && window.supabase);
  const touchKey = () => `cloud.touched.${appKey}`;
  const now = () => new Date().toISOString();

  /* ---------------- UI (injected, theme-neutral) ---------------- */
  function injectStyles() {
    const css = `
      #cloudChip{position:fixed;left:14px;bottom:16px;z-index:90;width:44px;height:44px;border-radius:50%;
        background:rgba(20,22,28,.85);backdrop-filter:blur(6px);border:1px solid rgba(255,255,255,.18);
        color:#fff;font-size:19px;display:grid;place-items:center;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.35);}
      #cloudChip .dot{position:absolute;right:2px;top:2px;width:11px;height:11px;border-radius:50%;
        border:2px solid rgba(20,22,28,.9);background:#9aa0a6;}
      #cloudChip.idle .dot{background:#34d399;} #cloudChip.sync .dot{background:#fbbf24;}
      #cloudChip.err .dot{background:#f87171;}
      .cloud-back{position:fixed;inset:0;background:rgba(8,10,14,.72);backdrop-filter:blur(4px);
        display:flex;align-items:center;justify-content:center;z-index:95;padding:18px;}
      .cloud-modal{background:#171a21;color:#f1f3f7;border:1px solid rgba(255,255,255,.12);border-radius:22px;
        padding:24px;width:100%;max-width:380px;font-family:system-ui,-apple-system,sans-serif;}
      .cloud-modal h3{margin:0 0 4px;font-size:20px;} .cloud-modal p{margin:0 0 14px;color:#9aa3b2;font-size:13.5px;line-height:1.5;}
      .cloud-modal label{display:block;font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#9aa3b2;margin:12px 0 5px;}
      .cloud-modal input{width:100%;box-sizing:border-box;background:#20242e;border:1px solid rgba(255,255,255,.14);color:#f1f3f7;
        border-radius:11px;padding:11px 13px;font-size:15px;outline:none;}
      .cloud-modal input:focus{border-color:#7aa7ff;}
      .cloud-btn{width:100%;margin-top:14px;padding:12px;border:none;border-radius:12px;font-weight:700;font-size:15px;cursor:pointer;}
      .cloud-btn.pri{background:#7aa7ff;color:#0d1220;}
      .cloud-btn.soft{background:#20242e;color:#f1f3f7;border:1px solid rgba(255,255,255,.14);margin-top:8px;}
      .cloud-btn.danger{background:transparent;color:#f87171;border:1px solid rgba(248,113,113,.4);margin-top:8px;}
      .cloud-msg{margin-top:12px;font-size:13px;color:#9aa3b2;min-height:18px;}
      .cloud-msg.err{color:#f87171;} .cloud-msg.ok{color:#34d399;}
      .cloud-acct{background:#20242e;border-radius:12px;padding:11px 13px;font-size:14px;word-break:break-all;border:1px solid rgba(255,255,255,.1);}
      .cloud-close{margin-top:10px;background:none;border:none;color:#9aa3b2;font-weight:700;width:100%;padding:8px;cursor:pointer;font-size:13.5px;}`;
    const s = document.createElement("style"); s.textContent = css; document.head.appendChild(s);
  }
  function chip() { return document.getElementById("cloudChip"); }
  function paintChip() {
    const c = chip(); if (!c) return;
    c.className = status === "out" ? "" : status;
    c.title = { out: "Sign in to sync", idle: "Synced", sync: "Syncing…", err: "Sync error — tap for details" }[status] || "Cloud";
  }
  function setStatus(s) { status = s; paintChip(); }

  function injectUI() {
    injectStyles();
    const c = document.createElement("button");
    c.id = "cloudChip"; c.innerHTML = `☁️<span class="dot"></span>`;
    c.setAttribute("aria-label", "Account & cloud sync");
    c.onclick = openModal;
    document.body.appendChild(c);
    paintChip();
  }

  function openModal() {
    const back = document.createElement("div"); back.className = "cloud-back";
    const box = document.createElement("div"); box.className = "cloud-modal";
    back.appendChild(box); document.body.appendChild(back);
    back.addEventListener("click", (e) => { if (e.target === back) back.remove(); });

    const msg = () => box.querySelector(".cloud-msg");
    const say = (t, cls) => { const m = msg(); m.textContent = t; m.className = "cloud-msg " + (cls || ""); };

    if (!user) {
      box.innerHTML = `
        <h3>Ogbara Labs account ☁️</h3>
        <p>One free account works in every Ogbara Labs app. Sign in to back up your progress and pick it up on any device. Playing without an account keeps everything on this device.</p>
        <label>Email</label><input type="email" id="clEmail" autocomplete="email" placeholder="you@example.com">
        <label>Password</label><input type="password" id="clPass" autocomplete="current-password" placeholder="••••••••">
        <button class="cloud-btn pri" id="clIn">Sign in</button>
        <button class="cloud-btn soft" id="clUp">Create account</button>
        <div class="cloud-msg"></div>
        <button class="cloud-close" id="clClose">Close</button>`;
      const email = () => box.querySelector("#clEmail").value.trim();
      const pass = () => box.querySelector("#clPass").value;
      box.querySelector("#clIn").onclick = async () => {
        if (!email() || !pass()) return say("Enter email and password.", "err");
        say("Signing in…");
        const { error } = await client.auth.signInWithPassword({ email: email(), password: pass() });
        if (error) return say(error.message, "err");
        say("Signed in!", "ok"); setTimeout(() => back.remove(), 500);
      };
      box.querySelector("#clUp").onclick = async () => {
        if (!email() || pass().length < 6) return say("Enter an email and a password of 6+ characters.", "err");
        say("Creating account…");
        const { data, error } = await client.auth.signUp({ email: email(), password: pass() });
        if (error) return say(error.message, "err");
        if (!data.session) return say("Account created — check your email to confirm, then sign in.", "ok");
        say("Account created and signed in!", "ok"); setTimeout(() => back.remove(), 600);
      };
      box.querySelector("#clClose").onclick = () => back.remove();
    } else {
      box.innerHTML = `
        <h3>Your account ☁️</h3>
        <p>Changes sync automatically while you're signed in. <b>Back up</b> sends this device's data to the cloud now; <b>Restore</b> replaces this device's data with the cloud copy.</p>
        <div class="cloud-acct">${user.email || user.id}</div>
        <button class="cloud-btn pri" id="clBackup">⬆ Back up now</button>
        <button class="cloud-btn soft" id="clRestore">⬇ Restore from cloud</button>
        <button class="cloud-btn danger" id="clOut">Sign out</button>
        <div class="cloud-msg"></div>
        <button class="cloud-close" id="clClose">Close</button>`;
      box.querySelector("#clBackup").onclick = async () => {
        say("Backing up…");
        try { await pushNow(); say("Backed up — your cloud copy is current.", "ok"); }
        catch (e) { say("Backup failed: " + (e.message || e), "err"); }
      };
      let restoreArmed = false;
      box.querySelector("#clRestore").onclick = async () => {
        if (!restoreArmed) {
          restoreArmed = true;
          say("This replaces the data on THIS device with the cloud copy. Tap Restore again to confirm.", "err");
          return;
        }
        restoreArmed = false;
        say("Restoring…");
        try { await pull(true); say("Restored from the cloud copy.", "ok"); }
        catch (e) { say("Restore failed: " + (e.message || e), "err"); }
      };
      box.querySelector("#clOut").onclick = async () => {
        await client.auth.signOut();
        say("Signed out. Your data stays on this device.", "ok");
        setTimeout(() => back.remove(), 600);
      };
      box.querySelector("#clClose").onclick = () => back.remove();
    }
  }

  /* ---------------- Sync core ---------------- */
  let lastPullAt = 0;

  async function fetchRemote() {
    const { data, error } = await client.from("app_state")
      .select("state, updated_at").eq("user_id", user.id).eq("app", appKey).maybeSingle();
    if (error) throw error;
    return data || null;
  }
  async function applyState(st) {
    applying = true;
    try { await hooks.apply(st); } finally { applying = false; }
  }

  async function pull(force) {
    if (!client || !user || !hooks.collect || !hooks.apply) return;
    setStatus("sync"); lastPullAt = Date.now();
    try {
      const data = await fetchRemote();
      if (hooks.merge) {
        if (force) {
          // Explicit restore: the cloud copy wins wholesale (the escape hatch from bad local state).
          if (!data || !data.state) throw new Error("No cloud copy yet — back up first.");
          await applyState(data.state);
          localStorage.setItem(touchKey(), data.updated_at);
          setStatus("idle");
          if (hooks.onSynced) setTimeout(() => { try { hooks.onSynced(); } catch {} }, 0);
          return;
        }
        // Merge-aware: reconcile field-by-field; never blindly replace either side.
        if (!data || !data.state) { await pushNow(); setStatus("idle"); return; }
        const m = hooks.merge(hooks.collect(), data.state);
        if (m.needsApply) await applyState(m.state);
        localStorage.setItem(touchKey(), data.updated_at);
        if (m.needsPush) await pushNow();
        setStatus("idle");
        if (hooks.onSynced) setTimeout(() => { try { hooks.onSynced(); } catch {} }, 0);
        return;
      }
      // Legacy whole-document behaviour for apps without a merge hook
      if (data && data.state) {
        const localTouched = localStorage.getItem(touchKey()) || "1970-01-01";
        if (force || data.updated_at > localTouched) {
          await applyState(data.state);
          localStorage.setItem(touchKey(), data.updated_at);
        } else {
          await pushNow(); // local is newer → publish it
        }
      } else {
        await pushNow(); // nothing remote yet → seed it
      }
      setStatus("idle");
    } catch (e) { console.warn("Cloud pull failed:", e); setStatus("err"); throw e; }
  }

  async function pushNow() {
    if (!client || !user || !hooks.collect || applying) return;
    setStatus("sync");
    try {
      if (!hooks.merge) {  // legacy: unconditional upsert
        const stamp = now();
        const { error } = await client.from("app_state").upsert(
          { user_id: user.id, app: appKey, state: hooks.collect(), updated_at: stamp },
          { onConflict: "user_id,app" });
        if (error) throw error;
        localStorage.setItem(touchKey(), stamp);
        setStatus("idle"); return;
      }
      // Merge-aware: read → merge → conditional write. If another device pushed
      // between our read and write, the conditional update misses and we retry
      // against the fresh remote, so no edit is ever silently dropped.
      let merged = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const data = await fetchRemote();
        const stamp = now();
        if (!data || !data.state) {
          const { error } = await client.from("app_state").upsert(
            { user_id: user.id, app: appKey, state: hooks.collect(), updated_at: stamp },
            { onConflict: "user_id,app" });
          if (error) throw error;
          localStorage.setItem(touchKey(), stamp);
          setStatus("idle"); return;
        }
        const m = hooks.merge(hooks.collect(), data.state);
        merged = m.state;
        if (m.needsApply) await applyState(m.state);
        const { data: upd, error } = await client.from("app_state")
          .update({ state: merged, updated_at: stamp })
          .eq("user_id", user.id).eq("app", appKey).eq("updated_at", data.updated_at)
          .select("updated_at");
        if (error) throw error;
        if (upd && upd.length) {   // our write landed on the version we merged against
          localStorage.setItem(touchKey(), stamp);
          setStatus("idle"); return;
        }
        // someone else won the race — loop: re-fetch, re-merge, try again
      }
      // three races in a row is vanishingly unlikely; land the last merge unconditionally
      const stamp = now();
      const { error } = await client.from("app_state").upsert(
        { user_id: user.id, app: appKey, state: merged || hooks.collect(), updated_at: stamp },
        { onConflict: "user_id,app" });
      if (error) throw error;
      localStorage.setItem(touchKey(), stamp);
      setStatus("idle");
    } catch (e) { console.warn("Cloud push failed:", e); setStatus("err"); throw e; }
  }

  Cloud.schedulePush = function () {
    if (applying) return;
    try { localStorage.setItem(touchKey(), now()); } catch {}
    if (!client || !user) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => pushNow().catch(() => {}), 2000);
  };

  /* ---------------- Photo / avatar storage ---------------- */
  const photoPath = (id) => `${user.id}/${appKey}/${id}.jpg`;
  Cloud.uploadPhoto = async function (id, blob) {
    if (!client || !user) return false;
    try {
      const { error } = await client.storage.from("photos").upload(photoPath(id), blob, { upsert: true, contentType: "image/jpeg" });
      if (error) throw error;
      return true;
    } catch (e) { console.warn("Photo upload failed:", e); return false; }
  };
  Cloud.getPhoto = async function (id) {
    if (!client || !user) return null;
    try {
      const { data, error } = await client.storage.from("photos").download(photoPath(id));
      if (error) throw error;
      return data;
    } catch { return null; }
  };
  Cloud.deletePhoto = async function (id) {
    if (!client || !user) return;
    try { await client.storage.from("photos").remove([photoPath(id)]); } catch {}
  };
  Cloud.isSignedIn = () => !!user;

  /* ---------------- Init ---------------- */
  Cloud.init = async function (app, h) {
    appKey = app; hooks = h || {};
    if (!cfgOk()) return; // config not filled in → apps behave exactly as before, no UI
    try {
      client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    } catch (e) { console.warn("Supabase init failed:", e); return; }
    injectUI();
    setStatus("out");
    const { data: { session } } = await client.auth.getSession();
    user = session?.user || null;
    client.auth.onAuthStateChange((_evt, s) => {
      const was = !!user; user = s?.user || null;
      setStatus(user ? "idle" : "out");
      if (user && !was) pull().catch(() => {});
    });
    if (user) { setStatus("idle"); pull().catch(() => {}); }
    // Re-pull when the app comes back to the foreground, so a tab that sat in
    // the background all day doesn't push stale state tonight. Throttled.
    const onWake = () => {
      if (!user) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      if (Date.now() - lastPullAt < 15000) return;
      pull().catch(() => {});
    };
    try {
      document.addEventListener("visibilitychange", onWake);
      window.addEventListener("focus", onWake);
    } catch {}
  };

  Cloud._pull = (f) => pull(f);   // test hooks
  Cloud._push = () => pushNow();
  window.Cloud = Cloud;
})();
