/* =====================================================================
   Ogbara Labs · cloud.js — shared Supabase auth + sync layer
   Local-first: every app works fully offline with no account.
   When supabase-config.js is filled in, a ☁️ account button appears.
   Signed-in users get: state backup/sync (table public.app_state) and
   photo/avatar storage (bucket "photos", path {uid}/{app}/{id}.jpg).
   Sync model: debounced push on change, pull on sign-in, last-write-wins.
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
      .cloud-close{margin-top:10px;background:none;border:none;color:#9aa3b2;font-weight:700;width:100%;padding:8px;cursor:pointer;font-size:13.5px;}

      /* ---- full-screen auth gate (shown before the app when sign-in is required) ---- */
      body.cloud-gated{overflow:hidden;}
      #cloudGate{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;
        padding:22px;background:var(--bg,#f7f4ef);
        font-family:ui-rounded,"SF Pro Rounded","Hiragino Maru Gothic ProN","Arial Rounded MT Bold",system-ui,-apple-system,sans-serif;
        padding-top:max(22px,env(safe-area-inset-top));padding-bottom:max(22px,env(safe-area-inset-bottom));
        overflow-y:auto;-webkit-overflow-scrolling:touch;}
      #cloudGate .gate-card{width:100%;max-width:380px;background:var(--panel,#fff);color:var(--ink,#2e2456);
        border:1.5px solid var(--line,#e7e1f2);border-radius:28px;padding:26px 24px 22px;
        box-shadow:0 22px 60px rgba(46,36,86,.18);animation:gateIn .35s cubic-bezier(.2,.9,.3,1.2) both;}
      @keyframes gateIn{from{opacity:0;transform:translateY(14px) scale(.97);}to{opacity:1;transform:none;}}
      #cloudGate .gate-logo{font-size:34px;text-align:center;line-height:1;margin-bottom:6px;}
      #cloudGate h2{font-size:23px;font-weight:900;text-align:center;margin:0 0 4px;}
      #cloudGate h2 .hl{color:var(--violet,#7c4dff);}
      #cloudGate .gate-sub{text-align:center;color:var(--muted,#685e95);font-size:14px;line-height:1.5;margin:0 0 18px;}
      #cloudGate label{display:block;font-size:11px;font-weight:800;letter-spacing:1.1px;text-transform:uppercase;
        color:var(--muted,#685e95);margin:12px 2px 6px;}
      #cloudGate input{width:100%;box-sizing:border-box;background:#faf8f4;border:1.5px solid var(--line,#e7e1f2);
        color:var(--ink,#2e2456);border-radius:14px;padding:13px 14px;font-size:16px;outline:none;font-family:inherit;}
      #cloudGate input:focus{border-color:var(--violet,#7c4dff);background:#fff;}
      #cloudGate .gate-pri{width:100%;margin-top:18px;padding:14px;border:none;border-radius:16px;font-weight:900;
        font-size:16px;cursor:pointer;background:var(--violet,#7c4dff);color:#fff;font-family:inherit;
        box-shadow:0 8px 20px rgba(124,77,255,.30);transition:transform .12s,box-shadow .12s;}
      #cloudGate .gate-pri:active{transform:translateY(1px) scale(.99);}
      #cloudGate .gate-pri:disabled{opacity:.6;cursor:default;box-shadow:none;}
      #cloudGate .gate-msg{margin-top:14px;font-size:13.5px;line-height:1.45;text-align:center;color:var(--muted,#685e95);min-height:18px;}
      #cloudGate .gate-msg.err{color:var(--coral,#f43f5e);}
      #cloudGate .gate-msg.ok{color:var(--mint,#10b981);}
      #cloudGate .gate-toggle{margin-top:16px;text-align:center;font-size:14px;color:var(--muted,#685e95);}
      #cloudGate .gate-toggle button{background:none;border:none;color:var(--violet,#7c4dff);font-weight:900;
        cursor:pointer;font-size:14px;font-family:inherit;padding:4px;}
      #cloudGate .gate-foot{margin-top:18px;text-align:center;font-size:11.5px;color:var(--muted,#685e95);opacity:.85;line-height:1.5;}
      #cloudGate .gate-spin{width:34px;height:34px;border-radius:50%;border:3px solid var(--line,#e7e1f2);
        border-top-color:var(--violet,#7c4dff);animation:gateSpin .8s linear infinite;margin:8px auto;}
      @keyframes gateSpin{to{transform:rotate(360deg);}}`;
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
        <p>Progress backs up automatically while you're signed in — or do it by hand below. The same login works in every Ogbara Labs app.</p>
        <div class="cloud-acct">${user.email || user.id}</div>
        <button class="cloud-btn pri" id="clBackup">⬆️ Back up now</button>
        <button class="cloud-btn soft" id="clRestore">⬇️ Restore from cloud</button>
        <button class="cloud-btn danger" id="clOut">Sign out</button>
        <div class="cloud-msg"></div>
        <button class="cloud-close" id="clClose">Close</button>`;
      box.querySelector("#clBackup").onclick = async () => {
        say("Backing up…");
        try { await pushNow(); say("Backed up to the cloud ✓", "ok"); }
        catch (e) { say("Back-up failed: " + (e.message || e), "err"); }
      };
      let armedRestore = false;
      const rb = box.querySelector("#clRestore");
      rb.onclick = async () => {
        if (!armedRestore) {
          armedRestore = true;
          rb.textContent = "⬇️ Tap again to overwrite this device";
          say("Restoring replaces this device's progress with the cloud copy.");
          return;
        }
        armedRestore = false; rb.textContent = "⬇️ Restore from cloud";
        say("Restoring…");
        try { await pull(true); say("Restored the latest cloud backup ✓", "ok"); }
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

  /* ---------------- Auth gate (sign-in required before the app) ---------------- */
  let gateReq = false;     // is sign-in enforced on this build?
  let gateMode = "in";     // "in" | "up"

  function gateEl() { return document.getElementById("cloudGate"); }

  // Inject an opaque cover immediately so the app never flashes behind it.
  function ensureGate() {
    let g = gateEl();
    if (g) return g;
    g = document.createElement("div");
    g.id = "cloudGate";
    g.setAttribute("role", "dialog");
    g.setAttribute("aria-modal", "true");
    g.setAttribute("aria-label", "Sign in to Brainy Trails");
    g.innerHTML = `<div class="gate-card"><div class="gate-spin"></div></div>`;
    document.body.appendChild(g);
    document.body.classList.add("cloud-gated");
    return g;
  }

  function hideGate() {
    const g = gateEl();
    if (g) g.remove();
    document.body.classList.remove("cloud-gated");
  }

  function renderGateForm() {
    const g = ensureGate();
    const box = g.querySelector(".gate-card");
    const signup = gateMode === "up";
    box.innerHTML = `
      <div class="gate-logo">🧠</div>
      <h2>Brainy <span class="hl">Trails</span></h2>
      <p class="gate-sub">${signup
        ? "Create a free account to start the adventure. Your progress is saved and follows you to any device."
        : "Sign in to pick up your trail. One free account works across every Ogbara Labs app."}</p>
      <label for="gateEmail">Email</label>
      <input id="gateEmail" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" placeholder="you@example.com">
      <label for="gatePass">Password</label>
      <input id="gatePass" type="password" autocomplete="${signup ? "new-password" : "current-password"}" placeholder="${signup ? "At least 6 characters" : "••••••••"}">
      <button class="gate-pri" id="gateGo">${signup ? "Create account & start" : "Sign in"}</button>
      <div class="gate-msg" id="gateMsg" role="status" aria-live="polite"></div>
      <div class="gate-toggle">${signup
        ? `Already have an account? <button id="gateSwap">Sign in</button>`
        : `New here? <button id="gateSwap">Create a free account</button>`}</div>
      <p class="gate-foot">Saving progress requires a free account.<br>One login works in every Ogbara Labs app.</p>`;

    const email = () => box.querySelector("#gateEmail").value.trim();
    const pass = () => box.querySelector("#gatePass").value;
    const msgEl = box.querySelector("#gateMsg");
    const goBtn = box.querySelector("#gateGo");
    const say = (t, cls) => { msgEl.textContent = t || ""; msgEl.className = "gate-msg " + (cls || ""); };
    const busy = (b) => { goBtn.disabled = b; };

    async function submit() {
      if (!email()) return say("Please enter your email.", "err");
      if (gateMode === "up" && pass().length < 6) return say("Password needs at least 6 characters.", "err");
      if (!pass()) return say("Please enter your password.", "err");
      busy(true);
      try {
        if (gateMode === "up") {
          say("Creating your account…");
          const { data, error } = await client.auth.signUp({ email: email(), password: pass() });
          if (error) { busy(false); return say(error.message, "err"); }
          if (!data.session) { busy(false); return say("Almost there — check your email to confirm, then sign in.", "ok"); }
          say("Welcome! Setting up…", "ok"); // onAuthStateChange will dismiss the gate
        } else {
          say("Signing in…");
          const { error } = await client.auth.signInWithPassword({ email: email(), password: pass() });
          if (error) { busy(false); return say(error.message, "err"); }
          say("Welcome back!", "ok"); // onAuthStateChange will dismiss the gate
        }
      } catch (e) { busy(false); say((e && e.message) || "Something went wrong. Please try again.", "err"); }
    }

    goBtn.onclick = submit;
    box.querySelector("#gateEmail").addEventListener("keydown", (e) => { if (e.key === "Enter") box.querySelector("#gatePass").focus(); });
    box.querySelector("#gatePass").addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
    box.querySelector("#gateSwap").onclick = () => { gateMode = signup ? "in" : "up"; renderGateForm(); };
    try { box.querySelector("#gateEmail").focus(); } catch {}
  }

  function showGate() { gateMode = "in"; renderGateForm(); }


  async function pull(force) {
    if (!client || !user || !hooks.collect || !hooks.apply) return;
    setStatus("sync");
    try {
      const { data, error } = await client.from("app_state")
        .select("state, updated_at").eq("user_id", user.id).eq("app", appKey).maybeSingle();
      if (error) throw error;
      if (data && data.state) {
        const localTouched = localStorage.getItem(touchKey()) || "1970-01-01";
        if (force || data.updated_at > localTouched) {
          applying = true;
          try { await hooks.apply(data.state); } finally { applying = false; }
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
      const stamp = now();
      const { error } = await client.from("app_state").upsert(
        { user_id: user.id, app: appKey, state: hooks.collect(), updated_at: stamp },
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
  Cloud.init = async function (app, h, opts) {
    appKey = app; hooks = h || {};
    gateReq = !!(opts && opts.requireAuth);
    if (!cfgOk()) {
      // No Supabase config on this build → can't authenticate at all.
      // Fail open rather than brick the app behind an un-passable gate.
      if (gateReq) console.warn("Cloud: requireAuth set but Supabase config is missing — gate disabled.");
      return;
    }
    // Show an opaque cover up-front so the app never flashes before we know
    // whether the user is signed in.
    if (gateReq) ensureGate();
    try {
      client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    } catch (e) {
      console.warn("Supabase init failed:", e);
      if (gateReq) hideGate(); // don't trap the user behind a broken gate
      return;
    }
    injectUI();
    setStatus("out");
    const { data: { session } } = await client.auth.getSession();
    user = session?.user || null;
    client.auth.onAuthStateChange((_evt, s) => {
      const was = !!user; user = s?.user || null;
      setStatus(user ? "idle" : "out");
      if (gateReq) { user ? hideGate() : showGate(); }
      if (user && !was) pull().catch(() => {});
    });
    if (user) {
      setStatus("idle");
      if (gateReq) hideGate();
      pull().catch(() => {});
    } else if (gateReq) {
      showGate();
    }
  };

  window.Cloud = Cloud;
})();
