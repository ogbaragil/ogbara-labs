/* =====================================================================
   Cleared — personal bill & statement tracker
   Scan statements, store due dates + amounts, get reminders, and see
   history, forecast and insights. Local-first PWA with optional cloud
   sync (Cloudflare Pages Functions + Supabase) and AI PDF extraction.
   The data/auth/sync/PDF engine is preserved from the original app;
   this file rebuilds the UI and adds category + recurrence + analytics.
   ===================================================================== */
"use strict";

const STORE_KEY = "cleared:bills";
const SETTINGS_KEY = "cleared:settings";
const AUTH_KEY = "cleared:auth";
const TOMB_KEY = "cleared:tombstones";
const DIRTY_KEY = "cleared:dirty";
const DELQ_KEY = "cleared:delqueue";
const REMEMBER_KEY = "cleared:remember";
const TOMBSTONE_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const LEGACY = { bills: "bill-minder:bills", settings: "bill-minder:settings", auth: "bill-minder:auth" };

const CURRENCY = "AUD";

const CATEGORIES = {
  utilities:     { label: "Utilities",     color: "#f59e0b", glyph: "\u26A1" },
  telecom:       { label: "Telecom",       color: "#0ea5e9", glyph: "\uD83D\uDCF6" },
  insurance:     { label: "Insurance",     color: "#6366f1", glyph: "\uD83D\uDEE1\uFE0F" },
  subscriptions: { label: "Subscriptions", color: "#8b5cf6", glyph: "\u25B6\uFE0F" },
  housing:       { label: "Housing",       color: "#10b981", glyph: "\uD83C\uDFE0" },
  health:        { label: "Health",        color: "#f43f5e", glyph: "\u2795" },
  other:         { label: "Other",         color: "#64748b", glyph: "\u2022" }
};
const CATEGORY_ORDER = ["utilities", "telecom", "insurance", "subscriptions", "housing", "health", "other"];

const RECURRENCE = {
  once:        { label: "One-off",     months: 0 },
  weekly:      { label: "Weekly",      months: 0, days: 7 },
  fortnightly: { label: "Fortnightly", months: 0, days: 14 },
  monthly:     { label: "Monthly",     months: 1 },
  quarterly:   { label: "Quarterly",   months: 3 },
  yearly:      { label: "Yearly",      months: 12 }
};

const DEFAULT_SETTINGS = {
  reminderLeadDays: 3,
  emailReminders: false,
  firstName: "",
  namePrompted: false,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Australia/Melbourne",
  appInstanceId: crypto.randomUUID(),
  syncSecret: crypto.randomUUID()
};

const state = {
  bills: [],
  tombstones: [],
  dirtyBills: [],
  pendingDeletes: [],
  household: null,
  inviteToken: "",
  settings: {},
  auth: null,
  view: "dashboard",
  filter: "unpaid",
  calendarMonth: startOfDay(new Date()),
  currentPdfFile: null,
  editingBillId: null,
  paidBillId: null,
  deleteBillId: null,
  deleteSeriesId: null,
  rescheduleBillId: null,
  detailBillId: null,
  recoveryToken: "",
  deferredInstallPrompt: null
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ---------------- boot ---------------- */
function init() {
  migrateLegacyKeys();
  state.bills = readJson(STORE_KEY, []).map(normalizeBill);
  state.tombstones = pruneTombstones(readJson(TOMB_KEY, []));
  saveTombstones();
  state.dirtyBills = readJson(DIRTY_KEY, []).map(String);
  state.pendingDeletes = readJson(DELQ_KEY, []).map(String);
  // First run on this version: make sure existing local bills get pushed once.
  if (localStorage.getItem(DIRTY_KEY) === null && state.bills.length) {
    state.dirtyBills = state.bills.map((b) => String(b.clientBillId || b.id));
  }
  saveSyncQueues();
  state.settings = { ...DEFAULT_SETTINGS, ...readJson(SETTINGS_KEY, {}) };
  state.auth = readAuth();
  state.view = "overview";
  state.billsTab = "all";
  state.selectedDate = null;
  state.calendarMonth = startOfDay(new Date());
  state.collapsed = {};
  state.expanded = {};
  saveSettings();

  setupNavigation();
  setupHeader();
  setupBillsTabs();
  setupBillSheet();
  setupDetailSheet();
  setupModals();
  setupSettings();
  setupAuth();
  setupInstall();

  handleRecoveryRedirect();
  handleInviteRedirect();
  updateAuthGate();
  render();

  bootSession();
}

async function bootSession() {
  await ensureFreshSession();
  updateAuthGate();
  if (hasSyncConnection()) {
    await restoreReminderSettings();
    await loadHousehold();
    restoreSupabase().catch(() => {});
    maybeAcceptInvite();
    maybeAskName();
  }
  window.addEventListener("focus", async () => {
    await ensureFreshSession();
    if (hasSyncConnection()) runSync();
  });
  window.addEventListener("online", () => { if (hasSyncConnection()) runSync(); });
}

function migrateLegacyKeys() {
  for (const [now, old] of [[STORE_KEY, LEGACY.bills], [SETTINGS_KEY, LEGACY.settings], [AUTH_KEY, LEGACY.auth]]) {
    if (localStorage.getItem(now) == null && localStorage.getItem(old) != null) {
      localStorage.setItem(now, localStorage.getItem(old));
    }
  }
}

function setupNavigation() {
  $$("[data-view]").forEach((btn) => btn.addEventListener("click", () => showView(btn.dataset.view)));
}

function showView(view) {
  state.view = view;
  $$(".screen").forEach((sec) => sec.classList.toggle("is-visible", sec.id === `${view}Screen`));
  $$("[data-view]").forEach((b) => {
    const active = b.dataset.view === view;
    b.classList.toggle("is-active", active);
    b.setAttribute("aria-current", active ? "page" : "false");
  });
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setupHeader() {
  $("#fabAdd")?.addEventListener("click", () => openBillSheet());
  $("#backupBtn")?.addEventListener("click", () => backupNow());
  $("#accountBtn")?.addEventListener("click", () => showView("more"));
}

async function backupNow() {
  const btn = $("#backupBtn");
  const badge = $("#backupBadge");
  if (!hasSyncConnection()) {
    updateSyncStatus(hasActiveSession() ? "Backup runs on the hosted app." : "Sign in to back up.", "err");
    flashBackup(btn, badge, "err");
    return;
  }
  if (btn) { btn.disabled = true; btn.classList.add("busy"); }
  updateSyncStatus("Backing up\u2026", "sync");
  await syncSupabase();
  const ok = state.syncState !== "err";
  if (btn) { btn.disabled = false; btn.classList.remove("busy"); }
  flashBackup(btn, badge, ok ? "ok" : "err");
}

function flashBackup(btn, badge, kind) {
  if (!btn || !badge) return;
  badge.hidden = false;
  badge.textContent = kind === "ok" ? "\u2713" : "!";
  badge.className = `badge-dot ${kind === "ok" ? "ok" : "err"}`;
  clearTimeout(btn._flashTimer);
  btn._flashTimer = setTimeout(() => { badge.hidden = true; }, 2200);
}

function setupBillsTabs() {
  $$("#billsTabs button").forEach((b) => b.addEventListener("click", () => {
    state.billsTab = b.dataset.tab;
    $$("#billsTabs button").forEach((x) => x.classList.toggle("is-selected", x === b));
    renderBills();
  }));
}

/* ---------------- formatting ---------------- */
const moneyFmt = new Intl.NumberFormat(undefined, { style: "currency", currency: CURRENCY, minimumFractionDigits: 2 });
const money0Fmt = new Intl.NumberFormat(undefined, { style: "currency", currency: CURRENCY, maximumFractionDigits: 0 });
function money(n) { return moneyFmt.format(Number(n) || 0); }
function money0(n) { return money0Fmt.format(Number(n) || 0); }

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function firstName() {
  const saved = String(state.settings?.firstName || "").trim();
  if (saved) return saved.split(/\s+/)[0];
  const email = state.auth?.email || "";
  const handle = email.split("@")[0] || "there";
  return handle.charAt(0).toUpperCase() + handle.slice(1).replace(/[._-].*$/, "");
}

function accountLabel() {
  if (!hasActiveSession()) return "Not signed in.";
  const name = String(state.settings?.firstName || "").trim();
  return name ? `Signed in as ${name}` : `Signed in as ${state.auth.email}`;
}

function relativeDue(bill) {
  const today = startOfDay(new Date());
  const due = dateFromInput(bill.dueDate);
  const diff = Math.round((due - today) / 86400000);
  if (bill.status === "paid") return "Paid";
  if (diff < 0) return `${Math.abs(diff)} day${Math.abs(diff) === 1 ? "" : "s"} overdue`;
  if (diff === 0) return "Due today";
  if (diff === 1) return "Due tomorrow";
  if (diff <= 30) return `Due in ${diff} days`;
  return `Due ${formatDisplayDate(bill.dueDate)}`;
}

/* ---------------- bill model ---------------- */
function normalizeBill(bill) {
  const clientBillId = String(bill.clientBillId || bill.id || crypto.randomUUID());
  return {
    id: bill.id || crypto.randomUUID(),
    clientBillId,
    seriesId: bill.seriesId || clientBillId,
    remoteId: bill.remoteId,
    biller: bill.biller || "Untitled bill",
    amount: Number(bill.amount) || 0,
    dueDate: bill.dueDate || formatDatePartsFromDate(new Date()),
    category: CATEGORIES[bill.category] ? bill.category : "other",
    recurrence: RECURRENCE[bill.recurrence] ? bill.recurrence : "once",
    anchorDay: normalizeAnchorDay(bill.anchorDay, bill.dueDate),
    reference: bill.reference || "",
    notes: bill.notes || "",
    fileName: bill.fileName || "",
    status: bill.status === "paid" ? "paid" : "unpaid",
    paidAt: bill.paidAt || "",
    paymentNotes: bill.paymentNotes || "",
    rescheduleNotes: bill.rescheduleNotes || "",
    createdAt: bill.createdAt || new Date().toISOString(),
    updatedAt: bill.updatedAt || bill.createdAt || new Date().toISOString(),
    remindedFor: Array.isArray(bill.remindedFor) ? bill.remindedFor : []
  };
}

function billStatus(bill) {
  if (bill.status === "paid") return "paid";
  const today = startOfDay(new Date());
  const due = dateFromInput(bill.dueDate);
  const lead = Number(state.settings.reminderLeadDays) || 0;
  if (due < today) return "overdue";
  if (due.getTime() === today.getTime()) return "due-today";
  const diff = Math.round((due - today) / 86400000);
  if (diff <= Math.max(lead, 7)) return "due-soon";
  return "upcoming";
}

const STATUS_META = {
  overdue:    { label: "Overdue",    color: "#dc2626" },
  "due-today":{ label: "Due today",  color: "#f59e0b" },
  "due-soon": { label: "Due soon",   color: "#6366f1" },
  upcoming:   { label: "Upcoming",   color: "#3b82f6" },
  paid:       { label: "Paid",       color: "#16a34a" }
};

/* ---------------- analytics ---------------- */
function sumUnpaid() {
  return state.bills.filter((b) => b.status === "unpaid").reduce((t, b) => t + b.amount, 0);
}

function billsDueWithin(days) {
  const today = startOfDay(new Date());
  const limit = addDays(today, days);
  return state.bills.filter((b) => b.status === "unpaid" && dateFromInput(b.dueDate) >= today && dateFromInput(b.dueDate) <= limit);
}

function overdueBills() {
  const today = startOfDay(new Date());
  return state.bills.filter((b) => b.status === "unpaid" && dateFromInput(b.dueDate) < today);
}

function dueOn(bill, target) { return dateFromInput(bill.dueDate).getTime() === target.getTime(); }

function clearedRatio() {
  // Of this calendar month's bills (paid + unpaid), how many are cleared?
  const now = new Date();
  const inMonth = (b) => {
    const d = dateFromInput(b.status === "paid" && b.paidAt ? b.paidAt : b.dueDate);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  };
  const month = state.bills.filter(inMonth);
  if (!month.length) return 1;
  const cleared = month.filter((b) => b.status === "paid").length;
  return cleared / month.length;
}

// Project unpaid + recurring bills forward into N calendar months from current month.
function forecastMonths(count = 4) {
  const today = startOfDay(new Date());
  const out = [];
  for (let i = 0; i < count; i++) {
    const ref = new Date(today.getFullYear(), today.getMonth() + i, 1);
    out.push({ key: `${ref.getFullYear()}-${ref.getMonth()}`, date: ref, total: 0, byCategory: {} });
  }
  const horizon = new Date(today.getFullYear(), today.getMonth() + count, 1);

  state.bills.forEach((bill) => {
    const occurrences = projectOccurrences(bill, today, horizon);
    occurrences.forEach((d) => {
      const bucket = out.find((m) => m.date.getFullYear() === d.getFullYear() && m.date.getMonth() === d.getMonth());
      if (!bucket) return;
      bucket.total += bill.amount;
      bucket.byCategory[bill.category] = (bucket.byCategory[bill.category] || 0) + bill.amount;
    });
  });
  return out;
}

function projectOccurrences(bill, from, to) {
  const dates = [];
  const rec = RECURRENCE[bill.recurrence] || RECURRENCE.once;
  const anchorDay = normalizeAnchorDay(bill.anchorDay, bill.dueDate);
  let cursor = dateFromInput(bill.dueDate);
  // Skip already-paid one-offs from forecast; recurring keep projecting future copies.
  if (bill.recurrence === "once") {
    if (bill.status === "unpaid" && cursor >= startOfDay(from) && cursor < to) dates.push(cursor);
    return dates;
  }
  // Advance cursor to >= from
  let guard = 0;
  while (cursor < startOfDay(from) && guard < 500) { cursor = advance(cursor, rec, anchorDay); guard++; }
  guard = 0;
  while (cursor < to && guard < 500) { dates.push(cursor); cursor = advance(cursor, rec, anchorDay); guard++; }
  return dates;
}

// Advance a due date by one recurrence step. For month-based cadences the
// series stays anchored to its original day-of-month and is clamped to the last
// valid day of short months, so a "31st" bill goes 31 Jan -> 28 Feb -> 31 Mar
// instead of overflowing into March and permanently drifting.
function advance(date, rec, anchorDay) {
  if (rec.days) return addDays(date, rec.days);
  const anchor = clampDay(anchorDay) || date.getDate();
  const target = new Date(date.getFullYear(), date.getMonth() + rec.months, 1);
  const daysInMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return startOfDay(new Date(target.getFullYear(), target.getMonth(), Math.min(anchor, daysInMonth)));
}

function clampDay(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 31 ? n : 0;
}

function normalizeAnchorDay(value, dueDate) {
  const clamped = clampDay(value);
  if (clamped) return clamped;
  if (dueDate) {
    const parts = String(dueDate).split("-").map(Number);
    if (parts.length === 3 && clampDay(parts[2])) return parts[2];
  }
  return startOfDay(new Date()).getDate();
}

function categoryBreakdown(months = 3) {
  const forecast = forecastMonths(months);
  const totals = {};
  forecast.forEach((m) => {
    Object.entries(m.byCategory).forEach(([cat, val]) => { totals[cat] = (totals[cat] || 0) + val; });
  });
  const grand = Object.values(totals).reduce((a, b) => a + b, 0);
  const rows = CATEGORY_ORDER.filter((c) => totals[c]).map((c) => ({ cat: c, value: totals[c], pct: grand ? totals[c] / grand : 0 }));
  return { rows: rows.sort((a, b) => b.value - a.value), total: grand };
}

function recentActivity(limit = 5) {
  const items = [];
  state.bills.forEach((b) => {
    if (b.status === "paid" && b.paidAt) items.push({ ts: b.paidAt, kind: "paid", bill: b, text: `${b.biller} paid`, sub: `${formatDisplayDate(b.paidAt)} \u2022 ${money(b.amount)}` });
    if (b.rescheduleNotes) items.push({ ts: b.dueDate, kind: "rescheduled", bill: b, text: `${b.biller} rescheduled`, sub: `New date: ${formatDisplayDate(b.dueDate)}` });
    items.push({ ts: b.createdAt?.slice(0, 10) || b.dueDate, kind: "added", bill: b, text: `${b.biller} added`, sub: `${money(b.amount)} \u2022 ${relativeDue(b)}` });
  });
  return items.sort((a, b) => String(b.ts).localeCompare(String(a.ts))).slice(0, limit);
}

function insights() {
  const out = [];
  const overdue = overdueBills();
  const soon = billsDueWithin(7);
  if (!overdue.length) out.push({ tone: "good", title: "You're on track", body: "No overdue bills \u2014 nicely cleared." });
  else out.push({ tone: "bad", title: `${overdue.length} overdue bill${overdue.length === 1 ? "" : "s"}`, body: `${money(overdue.reduce((t, b) => t + b.amount, 0))} needs attention.` });
  if (soon.length) out.push({ tone: "warn", title: `${soon.length} bill${soon.length === 1 ? "" : "s"} due within 7 days`, body: `${money(soon.reduce((t, b) => t + b.amount, 0))} coming up soon.` });
  const breakdown = categoryBreakdown(3);
  if (breakdown.rows.length) {
    const top = breakdown.rows[0];
    out.push({ tone: "info", title: `${CATEGORIES[top.cat].label} is your biggest category`, body: `${money(top.value)} projected over 3 months.` });
  }
  return out.slice(0, 3);
}

/* ---------------- render ---------------- */
function render() {
  const signedIn = hasActiveSession();
  $("#authScreen").hidden = signedIn;
  $("#appShell").hidden = !signedIn;
  if (!signedIn) return;
  const v = state.view;
  const heads = {
    overview: [`${greeting()}, ${firstName()} \u{1F44B}`, "Here's what's happening with your bills."],
    bills: ["Bills", "Manage and track all your bills in one place."],
    calendar: ["Calendar", "Tap a day to open its bills."],
    more: ["More", "Settings, data, and your account."]
  };
  const head = heads[v] || heads.overview;
  $("#greetingName").textContent = head[0];
  const subEl = $(".appbar-sub"); if (subEl) subEl.textContent = head[1];
  updateReminderBadge();
  if (v === "overview") renderOverview();
  else if (v === "bills") renderBills();
  else if (v === "calendar") renderCalendarScreen();
  else if (v === "more") renderMore();
  updateSyncChip();
}

/* ---------------- shared helpers ---------------- */
function sumAmt(list) { return list.reduce((t, b) => t + (Number(b.amount) || 0), 0); }
function byDue(a, b) { return dateFromInput(a.dueDate) - dateFromInput(b.dueDate); }
function dueTodayBills() { const t = startOfDay(new Date()); return state.bills.filter((b) => b.status === "unpaid" && dueOn(b, t)); }
function paidThisMonth() {
  const n = new Date();
  return state.bills.filter((b) => {
    if (b.status !== "paid" || !b.paidAt) return false;
    const d = dateFromInput(b.paidAt);
    return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth();
  });
}
function billsThisMonthUnpaid() {
  const t = startOfDay(new Date());
  const end = new Date(t.getFullYear(), t.getMonth() + 1, 0);
  return state.bills.filter((b) => b.status === "unpaid" && dateFromInput(b.dueDate) >= t && dateFromInput(b.dueDate) <= end).sort(byDue);
}
function billsLaterThanMonth() {
  const t = startOfDay(new Date());
  const end = new Date(t.getFullYear(), t.getMonth() + 1, 0);
  return state.bills.filter((b) => b.status === "unpaid" && dateFromInput(b.dueDate) > end).sort(byDue);
}
function unpaidSorted() { return state.bills.filter((b) => b.status === "unpaid").sort(byDue); }
function updateReminderBadge() {
  const n = overdueBills().length + dueTodayBills().length;
  const b = $("#reminderBadge");
  if (b) { b.hidden = n === 0; b.textContent = n > 9 ? "9+" : String(n); }
}
function billInitial(bill) { return (String(bill.biller).trim()[0] || "?").toUpperCase(); }
function catOf(bill) { return CATEGORIES[bill.category] || CATEGORIES.other; }
function billIcon(bill) { return `<span class="bill-ic" style="background:${catOf(bill).color}">${escapeHtml(billInitial(bill))}</span>`; }
const CHEV = '<span class="chev"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 6 6 6-6 6"/></svg></span>';
const IC_CAL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></svg>';
const IC_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/></svg>';

function statusPill(bill) {
  const st = billStatus(bill);
  const txt = relativeDue(bill);
  let cls = "pill-blue";
  if (st === "overdue" || st === "due-today") cls = "pill-red";
  else if (st === "paid") cls = "pill-green";
  else if (st === "due-soon") cls = (txt === "Due tomorrow") ? "pill-orange" : "pill-blue";
  return `<span class="bill-pill ${cls}">${escapeHtml(txt)}</span>`;
}

function billRow(bill) {
  return `<button class="bill-row" data-bill-open="${bill.id}" type="button">
    ${billIcon(bill)}
    <span class="bill-main">
      <span class="bill-name">${escapeHtml(bill.biller)}</span>
      <span class="bill-sub">${escapeHtml(catOf(bill).label)} \u00b7 ${escapeHtml(RECURRENCE[bill.recurrence].label)}</span>
      ${statusPill(bill)}
    </span>
    <span class="bill-right"><span class="bill-amt">${money(bill.amount)}</span>${CHEV}</span>
  </button>`;
}

function bindRows(root) {
  $$("[data-bill-open]", root).forEach((r) => r.addEventListener("click", () => openDetailSheet(r.dataset.billOpen)));
}

/* extraction spinner */
function setExtracting(on) {
  const s = $("#extractSpin");
  if (s) { s.hidden = !on; s.classList.toggle("spinning", on); }
}

/* ===================== OVERVIEW ===================== */
function renderOverview() {
  renderHero();
  renderTiles();
  renderOvUpcoming();
  renderMonthOverview();
  renderForecast();
}

function renderForecast() {
  const el = $("#ovForecast");
  if (!el) return;
  el.className = "panel forecast-card";
  const now = new Date();
  const months = forecastMonths(6);
  const max = Math.max(1, ...months.map((m) => m.total));
  const total = months.reduce((s, m) => s + m.total, 0);
  const shortMonth = new Intl.DateTimeFormat(undefined, { month: "short" });
  const fullMonth = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });

  if (total <= 0) {
    el.innerHTML = `<div class="panel-head"><h2>Cash-flow forecast</h2></div>
      <div class="empty-inline">Add bills with a due date and your projected spend for the next 6 months will appear here. Recurring bills are projected forward automatically.</div>`;
    return;
  }

  const bars = months.map((m) => {
    const isNow = m.date.getFullYear() === now.getFullYear() && m.date.getMonth() === now.getMonth();
    const h = m.total ? Math.max(Math.round((m.total / max) * 100), 6) : 2;
    return `<button class="fc-col" data-fc="${m.key}" type="button" aria-label="${escapeHtml(fullMonth.format(m.date))}: ${money(m.total)}">
      <span class="fc-amt">${m.total ? money0(m.total) : ""}</span>
      <span class="fc-bar-wrap"><span class="fc-bar ${isNow ? "now" : ""}" style="height:${h}%"></span></span>
      <span class="fc-month">${escapeHtml(shortMonth.format(m.date))}</span>
    </button>`;
  }).join("");

  const breakdown = categoryBreakdown(6);
  const legend = breakdown.rows.slice(0, 3).map((r) =>
    `<span class="fc-leg"><i style="background:${(CATEGORIES[r.cat] || CATEGORIES.other).color}"></i>${escapeHtml((CATEGORIES[r.cat] || CATEGORIES.other).label)} ${Math.round(r.pct * 100)}%</span>`
  ).join("");

  el.innerHTML = `<div class="panel-head"><h2>Cash-flow forecast</h2><span class="fc-total">${money0(total)} <small>next 6 mo</small></span></div>
    <div class="fc-chart">${bars}</div>
    ${legend ? `<div class="fc-legend">${legend}</div>` : ""}
    <div class="fc-detail" id="fcDetail"></div>`;

  $$("[data-fc]", el).forEach((btn) => btn.addEventListener("click", () => {
    const m = months.find((x) => x.key === btn.dataset.fc);
    const detail = $("#fcDetail", el);
    if (!m || !detail) return;
    const cats = Object.entries(m.byCategory).sort((a, b) => b[1] - a[1]);
    detail.innerHTML = cats.length
      ? `<div class="fc-detail-head">${escapeHtml(fullMonth.format(m.date))} \u00b7 ${money(m.total)}</div>` +
        cats.map(([c, v]) => `<div class="fc-detail-row"><span><i style="background:${(CATEGORIES[c] || CATEGORIES.other).color}"></i>${escapeHtml((CATEGORIES[c] || CATEGORIES.other).label)}</span><strong>${money(v)}</strong></div>`).join("")
      : `<div class="fc-detail-head">${escapeHtml(fullMonth.format(m.date))} \u00b7 nothing projected</div>`;
    $$(".fc-col", el).forEach((c) => c.classList.toggle("sel", c === btn));
  }));
}

function renderHero() {
  const el = $("#ovHero");
  const hero = unpaidSorted()[0];
  if (!hero) {
    el.innerHTML = `<div class="hero ok"><div class="hero-top">
      <span class="hero-ring">\u2713</span>
      <div class="hero-body"><p class="hero-eyebrow">ALL CLEAR</p>
      <div class="hero-biller">You're all caught up</div>
      <p class="hero-meta">No unpaid bills right now. Nicely cleared.</p></div></div></div>`;
    return;
  }
  const st = billStatus(hero);
  const urgent = st === "overdue" || st === "due-today";
  const cls = urgent ? "danger" : "calm";
  const eyebrow = st === "overdue" ? "OVERDUE" : st === "due-today" ? "DUE TODAY" : "NEXT DUE";
  el.innerHTML = `<div class="hero ${cls}">
    <div class="hero-top">
      <span class="hero-ring">${urgent ? "!" : "\u2022"}</span>
      <div class="hero-body">
        <p class="hero-eyebrow">${eyebrow}</p>
        <div class="hero-biller">${escapeHtml(hero.biller)}</div>
        <div class="hero-amount">${money(hero.amount)}</div>
        <p class="hero-meta">${escapeHtml(RECURRENCE[hero.recurrence].label)} bill \u00b7 <b>${escapeHtml(relativeDue(hero))}</b></p>
      </div>
      <span class="hero-chip" style="background:${catOf(hero).color}">${escapeHtml(billInitial(hero))}</span>
    </div>
    <div class="hero-actions">
      <button class="btn ${urgent ? "danger" : "primary"}" data-hero-pay="${hero.id}" type="button">Mark paid</button>
      <button class="btn outline" data-hero-view="${hero.id}" type="button">View bill</button>
    </div>
  </div>`;
  $("[data-hero-pay]", el)?.addEventListener("click", () => markBillPaidNow(hero.id));
  $("[data-hero-view]", el)?.addEventListener("click", () => openDetailSheet(hero.id));
}

function renderTiles() {
  const t = startOfDay(new Date());
  const dt = dueTodayBills();
  const wk = state.bills.filter((b) => b.status === "unpaid" && dateFromInput(b.dueDate) > t && dateFromInput(b.dueDate) <= addDays(t, 7));
  const mo = billsThisMonthUnpaid(), pd = paidThisMonth();
  const tiles = [
    { label: "Due today", amt: sumAmt(dt), n: dt.length, tone: "red", ic: IC_CAL },
    { label: "Due this week", amt: sumAmt(wk), n: wk.length, tone: "orange", ic: IC_CAL },
    { label: "Due this month", amt: sumAmt(mo), n: mo.length, tone: "blue", ic: IC_CAL },
    { label: "Paid this month", amt: sumAmt(pd), n: pd.length, tone: "green", ic: IC_CHECK }
  ];
  const wrap = $("#ovStats");
  wrap.className = "tiles";
  wrap.innerHTML = tiles.map((t) => `<div class="tile tone-${t.tone}">
    <span class="tile-ic">${t.ic}</span>
    <span class="tile-label">${t.label}</span>
    <span class="tile-amt">${money(t.amt)}</span>
    <span class="tile-n">${t.n} bill${t.n === 1 ? "" : "s"}</span>
  </div>`).join("");
}

function renderOvUpcoming() {
  const el = $("#ovUpcoming");
  el.className = "panel";
  const unpaid = unpaidSorted();
  const top = unpaid.slice(0, 3);
  const body = top.length ? top.map(billRow).join("") : `<div class="empty-inline">No unpaid bills. You're all cleared.</div>`;
  el.innerHTML = `<div class="panel-head"><h2>Upcoming bills</h2><button class="link" data-go="calendar" type="button">See calendar</button></div>
    <div class="list">${body}</div>
    ${unpaid.length > 3 ? `<div class="list-foot"><button class="link" data-go="bills" type="button">See all upcoming bills (${unpaid.length})</button></div>` : ""}`;
  bindRows(el);
  $$("[data-go]", el).forEach((b) => b.addEventListener("click", () => showView(b.dataset.go)));
}

function renderMonthOverview() {
  const el = $("#ovMonth");
  const ratio = clearedRatio();
  const pct = Math.round(ratio * 100);
  const remain = billsThisMonthUnpaid();
  const onTrack = overdueBills().length === 0;
  const C = 2 * Math.PI * 33;
  const dash = (C * Math.max(0, Math.min(1, ratio)));
  el.innerHTML = `<div class="panel-head" style="padding:0 2px 8px;margin:0"><h2>This month overview</h2></div>
  <div class="month-card ${onTrack ? "" : "behind"}">
    <div class="month-gauge">
      <svg viewBox="0 0 76 76"><circle class="gtrack" cx="38" cy="38" r="33"/>
      <circle class="gfill" cx="38" cy="38" r="33" stroke-dasharray="${dash.toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 38 38)"/></svg>
      <span>${pct}%</span>
    </div>
    <div class="month-copy">
      <h3>${onTrack ? "You're on track!" : "Action needed"}</h3>
      <p>${onTrack ? `You've paid ${pct}% of your bills this month.` : `${overdueBills().length} overdue \u2014 clear them to get back on track.`}</p>
    </div>
    <div class="month-remain">
      <div class="rl">Remaining</div>
      <div class="rv">${money(sumAmt(remain))}</div>
      <div class="rn">${remain.length} bill${remain.length === 1 ? "" : "s"} left</div>
    </div>
  </div>`;
}

function renderQuickActions() {
  const el = $("#ovActions");
  el.className = "actions";
  const histIc = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 4v4h4"/><path d="M12 8v4l2.5 1.5"/></svg>';
  const bellIc = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>';
  const acts = [
    { ic: IC_CAL, title: "Calendar", sub: "View due dates", go: "calendar" },
    { ic: histIc, title: "Bill history", sub: "Past payments", tab: "paid" },
    { ic: bellIc, title: "Reminders", sub: "Manage alerts", go: "more" }
  ];
  el.innerHTML = acts.map((a, i) => `<button class="action-tile" data-act="${i}" type="button">
    <span class="action-ic">${a.ic}</span>
    <span class="action-title">${a.title}</span>
    <span class="action-sub">${a.sub}</span>
  </button>`).join("");
  $$("[data-act]", el).forEach((btn, i) => btn.addEventListener("click", () => {
    const a = acts[i];
    if (a.tab) { state.billsTab = a.tab; showView("bills"); } else { showView(a.go); }
  }));
}

/* ===================== BILLS ===================== */
function renderBills() {
  $$("#billsTabs button").forEach((b) => b.classList.toggle("is-selected", b.dataset.tab === state.billsTab));
  const due = billsDueWithin(7);
  const overdue = overdueBills().slice().sort(byDue);
  const badge = $("#dueSoonBadge"); if (badge) { const n = overdue.length + due.length; badge.textContent = n ? String(n) : ""; }
  renderBillsSummary();
  const wrap = $("#billsGroups");
  const tab = state.billsTab;

  if (tab === "due") {
    wrap.innerHTML = listOrEmpty([...overdue, ...due.slice().sort(byDue)], "Nothing overdue or due soon.");
  } else if (tab === "paid") {
    const paid = state.bills.filter((b) => b.status === "paid").sort((a, b) => String(b.paidAt || "").localeCompare(String(a.paidAt || "")));
    wrap.innerHTML = listOrEmpty(paid, "No paid bills yet.");
  } else if (tab === "upcoming") {
    wrap.innerHTML = listOrEmpty(billsLaterThanMonth(), "Nothing further out.");
  } else {
    const t = startOfDay(new Date());
    const today = dueTodayBills();
    const week = state.bills.filter((b) => b.status === "unpaid" && dateFromInput(b.dueDate) > t && dateFromInput(b.dueDate) <= addDays(t, 7)).sort(byDue);
    const monthEnd = new Date(t.getFullYear(), t.getMonth() + 1, 0);
    const month = state.bills.filter((b) => b.status === "unpaid" && dateFromInput(b.dueDate) > addDays(t, 7) && dateFromInput(b.dueDate) <= monthEnd).sort(byDue);
    const later = billsLaterThanMonth();
    let html = "";
    html += renderGroup("overdue", "Overdue", overdue, "gh-red");
    html += renderGroup("today", "Due today", today, "gh-red");
    html += renderGroup("week", "Due this week", week, "gh-orange");
    html += renderGroup("month", "Due this month", month, "gh-blue");
    html += renderGroup("later", "Upcoming (later)", later, "gh-gray");
    wrap.innerHTML = html || `<div class="empty-state"><h3>No bills yet</h3><p>Add a statement or bill and Cleared will track it.</p><button class="btn primary" id="emptyAdd" type="button">Add a bill</button></div>`;
    bindGroups(wrap);
  }
  bindRows(wrap);
  $("#emptyAdd", wrap)?.addEventListener("click", () => openBillSheet());
}

function listOrEmpty(bills, emptyMsg) {
  if (!bills.length) return `<div class="empty-state"><h3>Nothing here</h3><p>${escapeHtml(emptyMsg)}</p></div>`;
  return `<div class="group-body" style="margin-bottom:18px">${bills.map(billRow).join("")}</div>`;
}

function renderBillsSummary() {
  const mo = billsThisMonthUnpaid(), pd = paidThisMonth(), due = billsDueWithin(7), od = overdueBills();
  const chips = `${od.length ? `<span class="sum-over">${od.length} overdue</span>` : ""}${due.length ? `<span class="sum-soon">${due.length} due soon</span>` : ""}`;
  $("#billsSummary").innerHTML = `<div class="summary-card">
    <div class="sum-col"><span class="sum-label">This month</span>
      <span class="sum-amt blue">${money(sumAmt(mo))}</span>
      <span class="sum-sub">${mo.length} bills ${chips}</span></div>
    <div class="sum-col"><span class="sum-label">Paid this month</span>
      <span class="sum-amt green">${money(sumAmt(pd))}</span>
      <span class="sum-sub">${pd.length} bills</span></div>
  </div>`;
}

function renderGroup(key, label, bills, toneClass) {
  if (!bills.length) return "";
  const collapsed = !!state.collapsed[key];
  const expanded = !!state.expanded[key];
  const shown = expanded ? bills : bills.slice(0, 3);
  const more = (bills.length > 3 && !expanded)
    ? `<div class="group-more"><button class="link" data-expand="${key}" type="button">View all ${bills.length} bills</button></div>` : "";
  return `<section class="group ${collapsed ? "collapsed" : ""}" data-group="${key}">
    <div class="group-head" data-toggle="${key}">
      <span class="gh-left ${toneClass}">${label} (${bills.length})</span>
      <span class="gh-right"><span class="group-total">${money(sumAmt(bills))}</span>
      <span class="gtoggle"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg></span></span>
    </div>
    <div class="group-body">${shown.map(billRow).join("")}${more}</div>
  </section>`;
}

function bindGroups(wrap) {
  $$("[data-toggle]", wrap).forEach((h) => h.addEventListener("click", () => {
    const k = h.dataset.toggle; state.collapsed[k] = !state.collapsed[k]; renderBills();
  }));
  $$("[data-expand]", wrap).forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation(); state.expanded[b.dataset.expand] = true; renderBills();
  }));
}

/* ===================== CALENDAR ===================== */
function renderCalendarScreen() {
  renderCalendar("#calendarFull", state.calendarMonth);
  renderCalendarDay();
}

function renderCalendar(target, monthDate) {
  const el = $(target); if (!el) return;
  const year = monthDate.getFullYear(), month = monthDate.getMonth();
  const first = new Date(year, month, 1);
  const startDow = (first.getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const today = startOfDay(new Date());
  const title = first.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const dows = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => `<span class="cal-dow">${d}</span>`).join("");
  let cells = "";
  for (let i = 0; i < startDow; i++) cells += `<span class="cal-cell empty"></span>`;
  for (let d = 1; d <= days; d++) {
    const cd = startOfDay(new Date(year, month, d));
    const dayBills = state.bills.filter((b) => dueOn(b, cd));
    const isToday = cd.getTime() === today.getTime();
    const isSel = state.selectedDate && cd.getTime() === state.selectedDate.getTime();
    let dot = "";
    if (dayBills.length) {
      const ref = dayBills.find((b) => b.status === "unpaid") || dayBills[0];
      dot = `<span class="cal-dot" style="background:${STATUS_META[billStatus(ref)].color}"></span>`;
    }
    const cls = `cal-cell ${dayBills.length ? "has" : ""} ${isToday ? "today" : ""} ${isSel ? "selected" : ""}`;
    cells += `<button class="${cls}" ${dayBills.length ? `data-cal-day="${cd.getTime()}"` : ""} type="button"><span class="cal-num">${d}</span>${dot}</button>`;
  }
  el.className = "cal";
  el.innerHTML = `<div class="cal-head"><h3>${title}</h3><div class="cal-nav"><button class="icon-btn" id="calPrev" type="button" aria-label="Previous month">\u2039</button><button class="icon-btn" id="calNext" type="button" aria-label="Next month">\u203a</button></div></div>
    <div class="cal-grid">${dows}${cells}</div>
    <div class="cal-legend"><span><i style="background:#dc2626"></i>Overdue</span><span><i style="background:#f59e0b"></i>Due today</span><span><i style="background:#3b82f6"></i>Upcoming</span><span><i style="background:#16a34a"></i>Paid</span></div>`;
  $("#calPrev", el)?.addEventListener("click", () => { state.calendarMonth = new Date(year, month - 1, 1); renderCalendarScreen(); });
  $("#calNext", el)?.addEventListener("click", () => { state.calendarMonth = new Date(year, month + 1, 1); renderCalendarScreen(); });
  $$("[data-cal-day]", el).forEach((c) => c.addEventListener("click", () => onDateClick(new Date(Number(c.dataset.calDay)))));
}

function onDateClick(date) {
  state.selectedDate = startOfDay(date);
  const dayBills = state.bills.filter((b) => dueOn(b, state.selectedDate)).sort(byDue);
  renderCalendar("#calendarFull", state.calendarMonth);
  renderCalendarDay();
  if (!dayBills.length) return;
  if (dayBills.length === 1) {
    openDetailSheet(dayBills[0].id);
  } else {
    $("#calendarDay")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

function renderCalendarDay() {
  const el = $("#calendarDay"); if (!el) return;
  if (!state.selectedDate) { el.innerHTML = ""; return; }
  const label = formatDisplayDate(formatDatePartsFromDate(state.selectedDate));
  const dayBills = state.bills.filter((b) => dueOn(b, state.selectedDate)).sort(byDue);
  if (!dayBills.length) {
    el.innerHTML = `<div class="day-card"><h3>${label}</h3><div class="empty-inline">Nothing due on this day.</div></div>`;
    return;
  }
  el.innerHTML = `<div class="day-card"><h3>${label}</h3><div class="list">${dayBills.map(billRow).join("")}</div></div>`;
  bindRows(el);
}

/* ===================== MORE ===================== */
function renderMore() {
  const acct = $("#accountStatus");
  if (acct) acct.textContent = accountLabel();
  const nameInput = $("#accountNameInput");
  if (nameInput && document.activeElement !== nameInput) nameInput.value = state.settings.firstName || "";
  updateEmailReminderHint();
  renderHousehold();
}

/* ---------------- household / partner sharing ---------------- */
function handleInviteRedirect() {
  const params = new URLSearchParams(location.search);
  const token = params.get("invite");
  if (token) {
    state.inviteToken = token;
    const url = new URL(location.href);
    url.searchParams.delete("invite");
    history.replaceState({}, document.title, url.pathname + url.search + url.hash);
  }
}

async function loadHousehold() {
  if (!hasSyncConnection()) { state.household = null; return; }
  try {
    const response = await cloudflareSyncRequest("/api/household");
    if (!response.ok) return;
    const payload = await response.json();
    state.household = payload.household || null;
    state.sentInvites = payload.sentInvites || [];
    if (state.view === "more") renderHousehold();
  } catch { /* ignore */ }
}

function maybeAcceptInvite() {
  if (state.inviteToken && hasActiveSession()) promptAcceptInvite();
}

function promptAcceptInvite() {
  const token = state.inviteToken;
  if (!token) return;
  const go = confirm("Accept this invitation to share bills with your partner? Your existing bills will be merged into the shared household.");
  if (!go) { state.inviteToken = ""; return; }
  acceptInvite(token);
}

async function acceptInvite(token) {
  if (!hasSyncConnection()) { alert("Sign in first, then open the invite link again."); return; }
  try {
    const response = await cloudflareSyncRequest("/api/household/accept", { method: "POST", body: JSON.stringify({ token }) });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || "Could not accept the invitation.");
    state.inviteToken = "";
    state.household = payload.household || null;
    await restoreSupabase().catch(() => {});
    showView("more");
    alert("You're linked. Bills are now shared with your partner.");
  } catch (err) {
    state.inviteToken = "";
    alert(err.message || "Could not accept the invitation.");
  }
}

async function sendHouseholdInvite() {
  const email = ($("#inviteEmailInput")?.value || "").trim();
  const status = $("#householdStatus");
  if (!email) { if (status) status.textContent = "Enter your partner's email."; return; }
  const btn = $("#sendInviteButton");
  if (btn) btn.disabled = true;
  if (status) status.textContent = "Creating invitation\u2026";
  try {
    const response = await cloudflareSyncRequest("/api/household/invite", { method: "POST", body: JSON.stringify({ email }) });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || "Could not create the invitation.");
    state.lastInvite = { email: payload.email, link: payload.link };
    await loadHousehold();
    renderHousehold();
  } catch (err) {
    if (status) status.textContent = err.message || "Could not create the invitation.";
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function leaveHousehold() {
  if (!confirm("Leave this shared household? Bills you added return to your account; shared bills stay with your partner.")) return;
  try {
    const response = await cloudflareSyncRequest("/api/household", { method: "DELETE", body: JSON.stringify({}) });
    if (!response.ok) { const p = await response.json().catch(() => null); throw new Error(p?.error || "Could not leave the household."); }
    state.household = null; state.lastInvite = null; state.sentInvites = [];
    await restoreSupabase().catch(() => {});
    renderHousehold();
  } catch (err) {
    const status = $("#householdStatus"); if (status) status.textContent = err.message || "Could not leave the household.";
  }
}

function renderHousehold() {
  const body = $("#householdBody");
  if (!body) return;
  if (!hasSyncConnection()) { body.innerHTML = `<p class="muted">Sign in to invite a partner.</p>`; return; }

  const hh = state.household;
  const myEmail = (state.auth?.email || "").toLowerCase();

  if (hh && Array.isArray(hh.members) && hh.members.length >= 2) {
    const partner = hh.members.find((m) => (m.email || "").toLowerCase() !== myEmail) || hh.members[0];
    body.innerHTML = `<div class="hh-linked"><span class="hh-ic" aria-hidden="true">\u{1F46B}</span>
        <div><div class="hh-title">Shared with ${escapeHtml(partner?.email || "your partner")}</div>
        <div class="muted">Bills, edits and reminders are shared between you both.</div></div></div>
      <button class="btn danger-text" id="leaveHouseholdButton" type="button">Leave household</button>
      <p class="muted sync-status" id="householdStatus"></p>`;
    $("#leaveHouseholdButton")?.addEventListener("click", leaveHousehold);
    return;
  }

  const pending = (state.sentInvites && state.sentInvites[0]) || state.lastInvite;
  const link = state.lastInvite?.link || "";
  if (pending) {
    body.innerHTML = `<div class="hh-pending">Invitation pending for <strong>${escapeHtml(pending.email || pending.invite_email || "")}</strong></div>
      ${link
        ? `<label class="field">Share this link with your partner
            <input id="inviteLinkInput" type="text" readonly value="${escapeHtml(link)}"></label>
          <div class="btn-row"><button class="btn ghost" id="copyInviteButton" type="button">Copy link</button>
          <button class="btn ghost" id="newInviteButton" type="button">Cancel / start over</button></div>`
        : `<p class="muted">They need to sign in with that email and open your invite link to join.</p>
          <button class="btn ghost" id="newInviteButton" type="button">Send a new invite</button>`}
      <p class="muted sync-status" id="householdStatus"></p>`;
    $("#copyInviteButton")?.addEventListener("click", () => {
      const el = $("#inviteLinkInput"); if (!el) return;
      el.select();
      navigator.clipboard?.writeText(el.value).then(() => { const s = $("#householdStatus"); if (s) s.textContent = "Link copied."; }).catch(() => {});
    });
    $("#newInviteButton")?.addEventListener("click", () => { state.lastInvite = null; state.sentInvites = []; renderHousehold(); });
    return;
  }

  body.innerHTML = `<label class="field">Partner's email
      <input id="inviteEmailInput" type="email" placeholder="partner@example.com" autocomplete="off"></label>
    <button class="btn primary" id="sendInviteButton" type="button">Send invite</button>
    <p class="muted sync-status" id="householdStatus"></p>`;
  $("#sendInviteButton")?.addEventListener("click", sendHouseholdInvite);
}

function setupBillSheet() {
  const sheet = $("#billSheet");
  $("#closeBillSheet")?.addEventListener("click", closeBillSheet);
  $("#billSheetBackdrop")?.addEventListener("click", closeBillSheet);
  $("#billForm")?.addEventListener("submit", saveBillFromForm);
  $("#clearFormButton")?.addEventListener("click", () => { resetBillForm(); });
  $("#aiExtractButton")?.addEventListener("click", extractWithAi);

  const drop = $("#dropZone");
  const input = $("#pdfInput");
  input?.addEventListener("change", () => input.files[0] && handlePdf(input.files[0]));
  ["dragover", "dragenter"].forEach((e) => drop?.addEventListener(e, (ev) => { ev.preventDefault(); drop.classList.add("drag"); }));
  ["dragleave", "drop"].forEach((e) => drop?.addEventListener(e, (ev) => { ev.preventDefault(); drop.classList.remove("drag"); }));
  drop?.addEventListener("drop", (ev) => { const f = ev.dataTransfer?.files?.[0]; if (f) handlePdf(f); });

  const catSel = $("#categoryInput");
  if (catSel && !catSel.children.length) {
    catSel.innerHTML = CATEGORY_ORDER.map((c) => `<option value="${c}">${CATEGORIES[c].label}</option>`).join("");
  }
}

function openBillSheet(billId) {
  state.editingBillId = billId || null;
  state.currentPdfFile = null;
  resetBillForm();
  if (billId) {
    const bill = state.bills.find((b) => b.id === billId);
    if (bill) {
      $("#billSheetTitle").textContent = "Edit bill";
      $("#billerInput").value = bill.biller;
      $("#amountInput").value = bill.amount;
      $("#dueDateInput").value = bill.dueDate;
      $("#categoryInput").value = bill.category;
      $("#recurrenceInput").value = bill.recurrence;
      $("#referenceInput").value = bill.reference;
      $("#notesInput").value = bill.notes;
    }
  } else {
    $("#billSheetTitle").textContent = "Add bill";
    $("#dueDateInput").value = formatDatePartsFromDate(new Date());
  }
  $("#billSheet").classList.add("open");
  $("#billSheet").setAttribute("aria-hidden", "false");
}

function closeBillSheet() {
  $("#billSheet").classList.remove("open");
  $("#billSheet").setAttribute("aria-hidden", "true");
}

function resetBillForm() {
  $("#billForm").reset();
  $("#categoryInput").value = "other";
  $("#recurrenceInput").value = "once";
  $("#extractStatus").textContent = "Upload a statement or bill PDF and Cleared will pull out the amount, due date, biller and reference.";
  $("#extractPreview").textContent = "";
  $("#confidenceBadge").textContent = "Waiting";
  $("#aiExtractButton").disabled = true;
}

function saveBillFromForm(event) {
  event.preventDefault();
  const amount = Number($("#amountInput").value);
  const dueDate = $("#dueDateInput").value;
  if (!$("#billerInput").value.trim() || !amount || !dueDate) return;

  let changed = null;
  if (state.editingBillId) {
    const bill = state.bills.find((b) => b.id === state.editingBillId);
    if (bill) {
      Object.assign(bill, {
        biller: $("#billerInput").value.trim(),
        amount, dueDate,
        category: $("#categoryInput").value,
        recurrence: $("#recurrenceInput").value,
        anchorDay: normalizeAnchorDay(null, dueDate),
        reference: $("#referenceInput").value.trim(),
        notes: $("#notesInput").value.trim()
      });
      changed = bill;
    }
  } else {
    changed = normalizeBill({
      biller: $("#billerInput").value.trim(),
      amount, dueDate,
      category: $("#categoryInput").value,
      recurrence: $("#recurrenceInput").value,
      reference: $("#referenceInput").value.trim(),
      notes: $("#notesInput").value.trim(),
      fileName: state.currentPdfFile?.name || ""
    });
    state.bills.push(changed);
  }
  markBillDirty(changed);
  closeBillSheet();
  if (state.view !== "overview" && state.view !== "bills") showView("overview"); else render();
  scheduleSync();
}

async function handlePdf(file) {
  state.currentPdfFile = file;
  $("#aiExtractButton").disabled = false;
  $("#extractStatus").textContent = `Reading ${file.name}\u2026`;
  $("#confidenceBadge").textContent = "Reading";
  $("#extractPreview").textContent = "";
  setExtracting(true);
  try {
    const buffer = await file.arrayBuffer();
    const readable = await decodePdfText(buffer);
    const details = extractBillDetails(readable, file.name);
    fillIfFound($("#billerInput"), details.biller);
    fillIfFound($("#amountInput"), details.amount);
    fillIfFound($("#dueDateInput"), details.dueDate);
    fillIfFound($("#referenceInput"), details.reference);
    const found = ["biller", "amount", "dueDate", "reference"].filter((k) => details[k]).length;
    $("#confidenceBadge").textContent = found >= 3 ? "Good" : found >= 2 ? "Partial" : "Manual";
    $("#extractStatus").textContent = found
      ? "Found a few likely details. Check them before saving."
      : "This looks scanned or compressed. Try AI extract, or enter details manually.";
    $("#extractPreview").textContent = readable.slice(0, 3000) || "No readable text found.";
  } catch (err) {
    $("#extractStatus").textContent = "Could not read this PDF. Enter the details manually or try AI extract.";
  } finally {
    setExtracting(false);
  }
}

async function extractWithAi() {
  if (!state.currentPdfFile) return;
  if (!useCloudflareSync()) { $("#extractStatus").textContent = "AI extract runs on the hosted Cleared app."; return; }
  $("#aiExtractButton").disabled = true;
  $("#extractStatus").textContent = "AI is reading the statement\u2026";
  $("#confidenceBadge").textContent = "AI";
  setExtracting(true);
  try {
    const formData = new FormData();
    formData.append("pdf", state.currentPdfFile, state.currentPdfFile.name);
    const response = await fetch("/api/extract-bill", { method: "POST", body: formData });
    if (!response.ok) throw new Error(await response.text());
    const result = await response.json();
    fillIfFound($("#billerInput"), result.biller);
    fillIfFound($("#amountInput"), result.amountDue);
    fillIfFound($("#dueDateInput"), result.dueDate);
    fillIfFound($("#referenceInput"), result.reference || result.invoiceNumber);
    if (result.notes) $("#notesInput").value = result.notes;
    $("#extractStatus").textContent = "AI found likely details. Check them before saving.";
    $("#confidenceBadge").textContent = `${Math.round(Number(result.confidence || 0) * 100)}%`;
  } catch (err) {
    $("#extractStatus").textContent = "AI extract failed. You can still enter details manually.";
  } finally {
    $("#aiExtractButton").disabled = false;
    setExtracting(false);
  }
}

function fillIfFound(input, value) {
  if (!input || value === undefined || value === null || value === "") return;
  if (!input.value) input.value = value;
}

/* ---------------- Bill detail sheet ---------------- */
function setupDetailSheet() {
  $("#closeDetailSheet")?.addEventListener("click", closeDetailSheet);
  $("#detailSheetBackdrop")?.addEventListener("click", closeDetailSheet);
}

function openDetailSheet(billId) {
  const bill = state.bills.find((b) => b.id === billId);
  if (!bill) return;
  state.detailBillId = billId;
  const cat = CATEGORIES[bill.category];
  const st = billStatus(bill);
  const meta = STATUS_META[st];
  const body = $("#detailBody");
  const historyRows = [];
  if (bill.status === "paid" && bill.paidAt) historyRows.push(`<div class="dt-hist"><span>${formatDisplayDate(bill.paidAt)}</span><span class="paid-tag">Paid \u2713</span><strong>${money(bill.amount)}</strong></div>`);
  if (bill.rescheduleNotes) historyRows.push(`<div class="dt-hist"><span>Rescheduled</span><span class="muted">${escapeHtml(bill.rescheduleNotes)}</span><strong></strong></div>`);
  body.innerHTML = `
    <div class="dt-hero">
      <span class="dt-icon" style="background:${cat.color};">${cat.glyph}</span>
      <h2>${escapeHtml(bill.biller)}</h2>
      <p class="dt-amount">${money(bill.amount)}</p>
      <span class="dt-status" style="color:${meta.color};background:${meta.color}1a">${escapeHtml(relativeDue(bill))}</span>
    </div>
    <div class="dt-grid">
      <div><span class="muted">Category</span><strong>${cat.label}</strong></div>
      <div><span class="muted">Due date</span><strong>${formatDisplayDate(bill.dueDate)}</strong></div>
      <div><span class="muted">Repeats</span><strong>${RECURRENCE[bill.recurrence].label}</strong></div>
      <div><span class="muted">Reminder</span><strong>${state.settings.reminderLeadDays === 0 ? "On due date" : state.settings.reminderLeadDays + " day(s) before"}</strong></div>
      ${bill.reference ? `<div class="dt-wide"><span class="muted">Reference</span><strong>${escapeHtml(bill.reference)}</strong></div>` : ""}
      ${bill.notes ? `<div class="dt-wide"><span class="muted">Notes</span><strong>${escapeHtml(bill.notes)}</strong></div>` : ""}
    </div>
    <div class="dt-actions">
      ${bill.status === "unpaid"
        ? `<button class="btn primary" id="dtMarkPaid" type="button">Mark as paid</button>
           <button class="btn ghost" id="dtMarkPaidDate" type="button">Paid on another date…</button>
           <button class="btn ghost" id="dtReschedule" type="button">Reschedule</button>`
        : `<button class="btn ghost" id="dtMarkUnpaid" type="button">Mark as unpaid</button>`}
      <button class="btn ghost" id="dtEdit" type="button">Edit</button>
      <button class="btn danger-text" id="dtDelete" type="button">Delete</button>
    </div>
    ${historyRows.length ? `<div class="dt-history"><h4>History</h4>${historyRows.join("")}</div>` : ""}`;
  $("#dtMarkPaid")?.addEventListener("click", () => { closeDetailSheet(); markBillPaidNow(bill.id); });
  $("#dtMarkPaidDate")?.addEventListener("click", () => { closeDetailSheet(); openPaidModal(bill); });
  $("#dtReschedule")?.addEventListener("click", () => { closeDetailSheet(); openRescheduleModal(bill); });
  $("#dtMarkUnpaid")?.addEventListener("click", () => { bill.status = "unpaid"; bill.paidAt = ""; markBillDirty(bill); closeDetailSheet(); render(); scheduleSync(); });
  $("#dtEdit")?.addEventListener("click", () => { closeDetailSheet(); openBillSheet(bill.id); });
  $("#dtDelete")?.addEventListener("click", () => {
    closeDetailSheet();
    openDeleteModal(bill);
  });
  $("#detailSheet").classList.add("open");
  $("#detailSheet").setAttribute("aria-hidden", "false");
}

function closeDetailSheet() {
  $("#detailSheet").classList.remove("open");
  $("#detailSheet").setAttribute("aria-hidden", "true");
  state.detailBillId = null;
}

function deleteBill(id) {
  const bill = state.bills.find((b) => b.id === id);
  state.bills = state.bills.filter((b) => b.id !== id);
  if (bill) { addTombstone(bill.clientBillId || bill.id); queueDelete(bill.clientBillId || bill.id); }
  saveBills();
  closeDetailSheet();
  render();
  scheduleSync();
}

function relatedSeriesBills(bill) {
  if (!bill?.seriesId) return [bill].filter(Boolean);
  return state.bills.filter((b) => b.seriesId === bill.seriesId);
}

function deleteSeries(seriesId) {
  const doomed = state.bills.filter((b) => b.seriesId === seriesId);
  doomed.forEach((b) => { addTombstone(b.clientBillId || b.id); queueDelete(b.clientBillId || b.id); });
  state.bills = state.bills.filter((b) => b.seriesId !== seriesId);
  saveBills();
  closeDetailSheet();
  render();
  scheduleSync();
}

function openDeleteModal(bill) {
  state.deleteBillId = bill.id;
  state.deleteSeriesId = bill.seriesId || null;
  const related = relatedSeriesBills(bill);
  const others = related.filter((b) => b.id !== bill.id);
  const pastPaid = others.filter((b) => b.status === "paid").length;
  const isRecurring = bill.recurrence !== "once";
  const hasSeries = others.length > 0;

  let message;
  if (isRecurring && hasSeries) {
    message = `${escapeHtml(bill.biller)} repeats ${escapeHtml(RECURRENCE[bill.recurrence].label.toLowerCase())}. You can delete just this upcoming bill (which stops it repeating) or remove the whole series including ${others.length} past record${others.length === 1 ? "" : "s"}.`;
  } else if (isRecurring) {
    message = `${escapeHtml(bill.biller)} repeats ${escapeHtml(RECURRENCE[bill.recurrence].label.toLowerCase())}. Deleting it stops future ${escapeHtml(RECURRENCE[bill.recurrence].label.toLowerCase())} bills. This can't be undone.`;
  } else if (hasSeries) {
    message = `This is one of ${related.length} bills in the ${escapeHtml(bill.biller)} series. Delete just this one, or the whole series.`;
  } else {
    message = `Delete ${escapeHtml(bill.biller)}? This removes it from this device and your account. This can't be undone.`;
  }

  const primaryLabel = isRecurring ? "Delete & stop repeating" : "Delete this one";
  const seriesLabel = pastPaid > 0
    ? `Delete all, incl. ${pastPaid} past payment${pastPaid === 1 ? "" : "s"}`
    : `Delete entire series (${related.length})`;

  $("#deleteModalText").innerHTML = message;
  const seriesBtn = $("#deleteSeriesButton");
  if (seriesBtn) {
    seriesBtn.hidden = !hasSeries;
    seriesBtn.textContent = seriesLabel;
  }
  $("#deleteOneButton").textContent = primaryLabel;
  $("#deleteModal").hidden = false;
}

function closeDeleteModal() {
  $("#deleteModal").hidden = true;
  state.deleteBillId = null;
  state.deleteSeriesId = null;
}

function addTombstone(clientBillId) {
  if (!clientBillId) return;
  const key = String(clientBillId);
  state.tombstones = pruneTombstones(state.tombstones.filter((t) => t.clientBillId !== key));
  state.tombstones.push({ clientBillId: key, deletedAt: Date.now() });
  saveTombstones();
}

function pruneTombstones(list) {
  const now = Date.now();
  return (Array.isArray(list) ? list : [])
    .filter((t) => t && t.clientBillId && (!t.deletedAt || now - Number(t.deletedAt) < TOMBSTONE_TTL_MS));
}

function tombstonedIds() {
  return new Set(state.tombstones.map((t) => t.clientBillId));
}

function saveTombstones() { localStorage.setItem(TOMB_KEY, JSON.stringify(state.tombstones)); }

/* ---------------- modals (paid / reschedule / reset) ---------------- */
/* ---------------- first-name prompt ---------------- */
function maybeAskName() {
  if (!hasActiveSession()) return;
  const name = String(state.settings?.firstName || "").trim();
  if (name || state.settings?.namePrompted) return;
  openNameModal();
}

function openNameModal() {
  const modal = $("#nameModal");
  if (!modal) return;
  const input = $("#firstNameInput");
  if (input) input.value = state.settings.firstName || "";
  modal.hidden = false;
  setTimeout(() => input?.focus(), 60);
}

function closeNameModal() {
  const modal = $("#nameModal");
  if (modal) modal.hidden = true;
}

function saveFirstName(skip) {
  if (!skip) {
    const value = ($("#firstNameInput")?.value || "").trim().slice(0, 40);
    if (value) state.settings.firstName = value;
  }
  state.settings.namePrompted = true;
  saveSettings();
  closeNameModal();
  render();
  syncReminderSettingsQuietly();
}

function setupModals() {
  $("#paidForm")?.addEventListener("submit", (e) => { e.preventDefault(); savePaidBill(); });
  $("#closePaidButton")?.addEventListener("click", closePaidModal);
  $("#cancelPaidButton")?.addEventListener("click", closePaidModal);
  $("#rescheduleForm")?.addEventListener("submit", (e) => { e.preventDefault(); saveRescheduledBill(); });
  $("#closeRescheduleButton")?.addEventListener("click", closeRescheduleModal);
  $("#cancelRescheduleButton")?.addEventListener("click", closeRescheduleModal);
  $("#resetPasswordForm")?.addEventListener("submit", (e) => { e.preventDefault(); updatePassword(); });
  $("#closeResetPasswordButton")?.addEventListener("click", closeResetPasswordModal);
  $("#cancelResetPasswordButton")?.addEventListener("click", closeResetPasswordModal);
  $("#nameForm")?.addEventListener("submit", (e) => { e.preventDefault(); saveFirstName(false); });
  $("#skipNameButton")?.addEventListener("click", () => saveFirstName(true));
  $("#deleteOneButton")?.addEventListener("click", () => { const id = state.deleteBillId; closeDeleteModal(); if (id) deleteBill(id); });
  $("#deleteSeriesButton")?.addEventListener("click", () => { const sid = state.deleteSeriesId; closeDeleteModal(); if (sid) deleteSeries(sid); });
  $("#cancelDeleteButton")?.addEventListener("click", closeDeleteModal);
  $("#closeDeleteButton")?.addEventListener("click", closeDeleteModal);
}

function openPaidModal(bill) {
  state.paidBillId = bill.id;
  $("#paidDateInput").value = formatDatePartsFromDate(new Date());
  $("#paymentNotesInput").value = "";
  $("#paidStatus").textContent = `Mark ${bill.biller} as paid.`;
  $("#paidModal").hidden = false;
}
function closePaidModal() { $("#paidModal").hidden = true; state.paidBillId = null; }

// One-tap: mark paid with today's date and no notes.
function markBillPaidNow(id) {
  const bill = state.bills.find((b) => b.id === id);
  if (!bill || bill.status === "paid") return;
  applyPaid(bill, formatDatePartsFromDate(new Date()), "");
}

function savePaidBill() {
  const bill = state.bills.find((b) => b.id === state.paidBillId);
  if (!bill) return;
  applyPaid(bill, $("#paidDateInput").value, $("#paymentNotesInput").value.trim());
  closePaidModal();
}

function applyPaid(bill, paidDate, notes) {
  bill.status = "paid";
  bill.paidAt = paidDate || formatDatePartsFromDate(new Date());
  bill.paymentNotes = notes || "";
  markBillDirty(bill);
  // Recurring bills: spawn the next occurrence as unpaid so the schedule
  // continues, and demote this paid one to a one-off so it isn't projected twice.
  if (bill.recurrence !== "once") {
    const anchorDay = normalizeAnchorDay(bill.anchorDay, bill.dueDate);
    const next = advance(dateFromInput(bill.dueDate), RECURRENCE[bill.recurrence], anchorDay);
    const spawned = normalizeBill({
      biller: bill.biller, amount: bill.amount, dueDate: formatDatePartsFromDate(next),
      category: bill.category, recurrence: bill.recurrence, anchorDay,
      seriesId: bill.seriesId, reference: bill.reference, notes: bill.notes
    });
    state.bills.push(spawned);
    bill.recurrence = "once";
    markBillDirty(bill);
    markBillDirty(spawned);
  }
  render();
  scheduleSync();
}

function openRescheduleModal(bill) {
  state.rescheduleBillId = bill.id;
  $("#rescheduleDateInput").value = bill.dueDate;
  $("#rescheduleNotesInput").value = "";
  $("#rescheduleStatus").textContent = `Choose a new due date for ${bill.biller}.`;
  $("#rescheduleModal").hidden = false;
}
function closeRescheduleModal() { $("#rescheduleModal").hidden = true; state.rescheduleBillId = null; }
function saveRescheduledBill() {
  const bill = state.bills.find((b) => b.id === state.rescheduleBillId);
  if (!bill) return;
  bill.dueDate = $("#rescheduleDateInput").value || bill.dueDate;
  bill.rescheduleNotes = $("#rescheduleNotesInput").value.trim();
  bill.remindedFor = [];
  markBillDirty(bill);
  closeRescheduleModal();
  render();
  scheduleSync();
}

/* ---------------- settings ---------------- */
function setupSettings() {
  $("#reminderLeadSelect")?.addEventListener("change", (e) => {
    state.settings.reminderLeadDays = Number(e.target.value);
    saveSettings(); render(); scheduleSync(200);
  });
  $("#emailReminderToggle")?.addEventListener("change", (e) => {
    state.settings.emailReminders = e.target.checked;
    saveSettings(); updateEmailReminderHint(); scheduleSync(200);
  });
  $("#exportButton")?.addEventListener("click", exportBills);
  $("#importButton")?.addEventListener("click", () => $("#importInput").click());
  $("#importInput")?.addEventListener("change", importBills);
  $("#clearBillsButton")?.addEventListener("click", () => {
    if (!confirm("Clear all bills? This removes them from this device and, once synced, your account.")) return;
    state.bills.forEach((b) => { addTombstone(b.clientBillId || b.id); queueDelete(b.clientBillId || b.id); });
    state.bills = []; saveBills(); render(); scheduleSync(200);
  });
  $("#logoutButton")?.addEventListener("click", logout);
  $("#accountNameInput")?.addEventListener("change", (e) => {
    state.settings.firstName = e.target.value.trim().slice(0, 40);
    state.settings.namePrompted = true;
    saveSettings(); render(); scheduleSync(200);
  });
  $("#syncSupabaseButton")?.addEventListener("click", () => syncSupabase());
  $("#restoreSupabaseButton")?.addEventListener("click", () => restoreSupabase());

  $("#reminderLeadSelect").value = String(state.settings.reminderLeadDays);
  $("#emailReminderToggle").checked = !!state.settings.emailReminders;
  updateEmailReminderHint();
}

function updateEmailReminderHint() {
  const hint = $("#emailReminderHint");
  if (hint) hint.textContent = state.settings.emailReminders
    ? `Reminders email ${state.auth?.email || "your account"} ${state.settings.reminderLeadDays || 0} day(s) before each due date.`
    : "Turn on to get an email before each bill is due.";
}

function exportBills() {
  const blob = new Blob([JSON.stringify({ bills: state.bills, settings: { reminderLeadDays: state.settings.reminderLeadDays, emailReminders: state.settings.emailReminders } }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `cleared-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function importBills(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const incoming = Array.isArray(data) ? data : data.bills || [];
    const byId = new Map(state.bills.map((b) => [b.clientBillId, b]));
    incoming.map(normalizeBill).forEach((b) => { b.updatedAt = new Date().toISOString(); byId.set(b.clientBillId, b); if (!state.dirtyBills.includes(String(b.clientBillId))) state.dirtyBills.push(String(b.clientBillId)); });
    state.bills = Array.from(byId.values());
    if (data.settings) {
      if (data.settings.reminderLeadDays != null) state.settings.reminderLeadDays = Number(data.settings.reminderLeadDays);
      if (data.settings.emailReminders != null) state.settings.emailReminders = !!data.settings.emailReminders;
      saveSettings();
    }
    saveBills(); saveSyncQueues(); render(); scheduleSync();
    updateSyncStatus(`Imported ${incoming.length} bill(s).`);
  } catch (err) {
    updateSyncStatus("Import failed. Check the JSON file and try again.");
  } finally {
    event.target.value = "";
  }
}

/* ---------------- auth UI ---------------- */
function setupAuth() {
  $("#authLoginButton")?.addEventListener("click", () => authenticate("login"));
  $("#authForm")?.addEventListener("submit", (e) => { e.preventDefault(); state.signupMode ? createAccount() : authenticate("login"); });
  $("#authToggleSignup")?.addEventListener("click", toggleSignup);
  $("#authForgotButton")?.addEventListener("click", () => recoverPassword());
  const remember = $("#authRemember");
  if (remember) remember.checked = localStorage.getItem(REMEMBER_KEY) === null ? true : rememberMe();
  updateAuthStatus();
}

function toggleSignup() {
  state.signupMode = !state.signupMode;
  $("#authConfirmRow").hidden = !state.signupMode;
  $("#authPrimary").textContent = state.signupMode ? "Create account" : "Log in";
  $("#authHeadline").textContent = state.signupMode ? "Create your Cleared account." : "Welcome back to Cleared.";
  $("#authToggleSignup").textContent = state.signupMode ? "Have an account? Log in" : "New here? Create account";
  $("#authForgotButton").hidden = state.signupMode;
  updateAuthStatus(state.signupMode ? "Pick an email and a password to get started." : "Sign in to load your bills.");
}

function authStatusEl() { return $("#authStatus"); }
function updateAuthStatus(message) {
  const el = authStatusEl();
  if (!el) return;
  el.textContent = message || (state.auth?.email && hasActiveSession() ? `Signed in as ${state.auth.email}.` : "Sign in to load your bills.");
}

async function authenticate(mode) {
  if (!useCloudflareSync()) { updateAuthStatus("Sign in runs on the hosted Cleared app."); return; }
  const email = $("#authEmail").value.trim();
  const password = $("#authPassword").value;
  if (!email || !password) { updateAuthStatus("Enter your email and password."); return; }
  const btn = $("#authPrimary");
  btn.disabled = true;
  updateAuthStatus("Logging in\u2026");
  try {
    const response = await fetch(`/api/auth/${mode}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || "Sign in failed.");
    if (!payload?.accessToken) { updateAuthStatus(payload?.message || "Check your email to confirm your account, then log in."); return; }
    setRememberMe($("#authRemember")?.checked !== false);
    state.auth = payload; saveAuth();
    $("#authPassword").value = "";
    updateAuthGate(); render();
    await restoreReminderSettings();
    await loadHousehold();
    await restoreSupabase().catch(() => {});
    maybeAcceptInvite();
    maybeAskName();
  } catch (err) {
    updateAuthStatus(err.message || "Sign in failed.");
  } finally {
    btn.disabled = false;
  }
}

async function createAccount() {
  if (!useCloudflareSync()) { updateAuthStatus("Sign up runs on the hosted Cleared app."); return; }
  const email = $("#authEmail").value.trim();
  const password = $("#authPassword").value;
  const confirm = $("#authConfirm").value;
  if (!email || password.length < 6) { updateAuthStatus("Use an email and a password of at least 6 characters."); return; }
  if (password !== confirm) { updateAuthStatus("Passwords do not match."); return; }
  const btn = $("#authPrimary");
  btn.disabled = true;
  updateAuthStatus("Creating your account\u2026");
  try {
    const response = await fetch("/api/auth/signup", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || "Sign up failed.");
    if (!payload?.accessToken) { updateAuthStatus(payload?.message || "Check your email to confirm your account, then log in."); toggleSignup(); return; }
    setRememberMe($("#authRemember")?.checked !== false);
    state.auth = payload; saveAuth();
    updateAuthGate(); render();
    await syncReminderSettings().catch(() => {});
    maybeAskName();
  } catch (err) {
    updateAuthStatus(err.message || "Sign up failed.");
  } finally {
    btn.disabled = false;
  }
}

async function recoverPassword() {
  if (!useCloudflareSync()) { updateAuthStatus("Password reset runs on the hosted Cleared app."); return; }
  const email = $("#authEmail").value.trim();
  if (!email) { updateAuthStatus("Enter your email, then choose Forgot password."); return; }
  const btn = $("#authForgotButton");
  btn.disabled = true;
  updateAuthStatus("Sending a reset link\u2026");
  try {
    const response = await fetch("/api/auth/recover", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || "Reset failed.");
    updateAuthStatus(payload?.message || "Password reset email sent.");
  } catch (err) {
    updateAuthStatus(err.message || "Reset failed.");
  } finally {
    btn.disabled = false;
  }
}

function handleRecoveryRedirect() {
  const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(location.search);
  const token = hash.get("access_token") || query.get("access_token") || "";
  const type = hash.get("type") || query.get("type") || "";
  if (token && type === "recovery") {
    state.recoveryToken = token;
    $("#resetPasswordModal").hidden = false;
    $("#newPasswordInput").focus();
    history.replaceState({}, document.title, location.pathname);
  }
}

function closeResetPasswordModal() {
  state.recoveryToken = "";
  $("#resetPasswordModal").hidden = true;
  $("#newPasswordInput").value = "";
  $("#confirmNewPasswordInput").value = "";
}

async function updatePassword() {
  if (!state.recoveryToken) { $("#resetPasswordStatus").textContent = "Use the reset link from your email first."; return; }
  const password = $("#newPasswordInput").value;
  const confirm = $("#confirmNewPasswordInput").value;
  if (password.length < 6) { $("#resetPasswordStatus").textContent = "Use a password of at least 6 characters."; return; }
  if (password !== confirm) { $("#resetPasswordStatus").textContent = "Passwords do not match."; return; }
  $("#saveNewPasswordButton").disabled = true;
  $("#resetPasswordStatus").textContent = "Saving\u2026";
  try {
    const response = await fetch("/api/auth/update-password", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessToken: state.recoveryToken, password })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || "Update failed.");
    closeResetPasswordModal();
    updateAuthStatus("Password updated. Please log in.");
  } catch (err) {
    $("#resetPasswordStatus").textContent = err.message || "Update failed.";
  } finally {
    $("#saveNewPasswordButton").disabled = false;
  }
}

function logout() {
  state.auth = null;
  state.household = null;
  state.lastInvite = null;
  state.sentInvites = [];
  localStorage.removeItem(AUTH_KEY);
  localStorage.removeItem(REMEMBER_KEY);
  try { sessionStorage.removeItem(AUTH_KEY); } catch { /* ignore */ }
  updateAuthGate();
  render();
}

// "Stay signed in": when checked, the session lives in localStorage (survives
// browser restarts). When unchecked, it lives in sessionStorage and is dropped
// when the tab/window closes.
function rememberMe() { return localStorage.getItem(REMEMBER_KEY) === "1"; }

function setRememberMe(remember) {
  if (remember) localStorage.setItem(REMEMBER_KEY, "1");
  else localStorage.removeItem(REMEMBER_KEY);
}

function readAuth() {
  const fromLocal = readJson(AUTH_KEY, null);
  if (fromLocal) return fromLocal;
  try {
    const raw = sessionStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveAuth() {
  const value = JSON.stringify(state.auth);
  if (rememberMe()) {
    localStorage.setItem(AUTH_KEY, value);
    try { sessionStorage.removeItem(AUTH_KEY); } catch { /* ignore */ }
  } else {
    try { sessionStorage.setItem(AUTH_KEY, value); } catch { localStorage.setItem(AUTH_KEY, value); }
    localStorage.removeItem(AUTH_KEY);
  }
}

// Refresh the access token when it is missing/expired but we still hold a
// refresh token, so sessions no longer silently die after ~1 hour.
async function ensureFreshSession(force = false) {
  if (!state.auth?.refreshToken) return hasActiveSession();
  if (!force && hasActiveSession()) return true;
  if (!useCloudflareSync()) return false;
  try {
    const response = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: state.auth.refreshToken })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.accessToken) { logout(); return false; }
    state.auth = payload;
    saveAuth();
    return true;
  } catch {
    return false;
  }
}

function updateAuthGate() {
  const signedIn = hasActiveSession();
  $("#authScreen").hidden = signedIn;
  $("#appShell").hidden = !signedIn;
  const acct = $("#accountStatus");
  if (acct) acct.textContent = accountLabel();
  updateAuthStatus();
}

/* ---------------- install ---------------- */
function setupInstall() {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    state.deferredInstallPrompt = e;
    const b = $("#installButton"); if (b) b.hidden = false;
  });
  $("#installButton")?.addEventListener("click", async () => {
    if (!state.deferredInstallPrompt) return;
    state.deferredInstallPrompt.prompt();
    await state.deferredInstallPrompt.userChoice;
    state.deferredInstallPrompt = null;
    $("#installButton").hidden = true;
  });
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
}

/* ---------------- storage ---------------- */
function readJson(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
  catch { return fallback; }
}
function saveBills() { localStorage.setItem(STORE_KEY, JSON.stringify(state.bills)); }
function saveSettings() { localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings)); }

/* ---------------- sync ---------------- */
function useCloudflareSync() {
  return location.protocol.startsWith("http") && !["localhost", "127.0.0.1", "::1"].includes(location.hostname);
}
function hasActiveSession() {
  if (!state.auth?.accessToken) return false;
  if (!state.auth.expiresAt) return true;
  return Number(state.auth.expiresAt) > Date.now() + 30000;
}
function hasSyncConnection() { return useCloudflareSync() && hasActiveSession(); }

async function cloudflareSyncRequest(path, options = {}) {
  const send = () => fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-sync-secret": state.settings.syncSecret,
      ...(state.auth?.accessToken ? { Authorization: `Bearer ${state.auth.accessToken}` } : {}),
      ...(options.headers || {})
    }
  });

  let response = await send();
  if (response.status === 401 && state.auth?.refreshToken) {
    const refreshed = await ensureFreshSession(true);
    if (refreshed) response = await send();
  }
  return response;
}

/* ---- sync engine: single-flight, debounced, retrying ---- */
let _syncing = false;
let _syncAgain = false;
let _syncTimer = null;

function saveSyncQueues() {
  localStorage.setItem(DIRTY_KEY, JSON.stringify(state.dirtyBills));
  localStorage.setItem(DELQ_KEY, JSON.stringify(state.pendingDeletes));
}

// Mark a bill as locally changed so the next sync pushes just that bill
// (pushing only changed rows is what stops a partner's edits being clobbered).
function markBillDirty(bill) {
  if (bill) {
    bill.updatedAt = new Date().toISOString();
    const id = String(bill.clientBillId || bill.id);
    if (!state.dirtyBills.includes(id)) state.dirtyBills.push(id);
  }
  saveBills();
  saveSyncQueues();
}

function queueDelete(clientBillId) {
  const id = String(clientBillId);
  if (!state.pendingDeletes.includes(id)) state.pendingDeletes.push(id);
  state.dirtyBills = state.dirtyBills.filter((x) => x !== id);
  saveSyncQueues();
}

// Debounced trigger used after local edits.
function scheduleSync(delay = 700) {
  if (!useCloudflareSync()) { updateSyncStatus("Saved on this device", "off"); return; }
  if (!hasActiveSession()) { updateSyncStatus("Sign in to back up", "off"); return; }
  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(() => runSync(), delay);
}

// The one place that talks to the cloud. Only one runs at a time; overlapping
// requests coalesce into a single follow-up run.
async function runSync() {
  if (!hasSyncConnection()) return;
  if (_syncing) { _syncAgain = true; return; }
  _syncing = true;
  clearTimeout(_syncTimer);
  updateSyncStatus("Syncing\u2026", "sync");
  try {
    await ensureFreshSession();

    if (state.pendingDeletes.length) {
      const ids = state.pendingDeletes.slice();
      const res = await cloudflareSyncRequest("/api/bills", {
        method: "DELETE",
        body: JSON.stringify({ appInstanceId: state.settings.appInstanceId, clientBillIds: ids })
      });
      if (!res.ok) throw new Error(await res.text());
      state.pendingDeletes = state.pendingDeletes.filter((id) => !ids.includes(id));
      state.tombstones = state.tombstones.filter((t) => !ids.includes(t.clientBillId));
      saveTombstones();
      saveSyncQueues();
    }

    if (state.dirtyBills.length) {
      const ids = new Set(state.dirtyBills.map(String));
      const dirty = state.bills.filter((b) => ids.has(String(b.clientBillId || b.id)));
      if (dirty.length) {
        const res = await cloudflareSyncRequest("/api/bills", {
          method: "POST",
          body: JSON.stringify({ appInstanceId: state.settings.appInstanceId, bills: dirty })
        });
        if (!res.ok) throw new Error(await res.text());
      }
      state.dirtyBills = [];
      saveSyncQueues();
    }

    await syncReminderSettings();

    const remote = await fetchRemoteBills();
    const remoteSettings = await fetchRemoteSettings();
    if (remoteSettings) applyRemoteSettings(remoteSettings);
    state.bills = mergeBills(state.bills, remote.map(normalizeBill));
    saveBills(); saveSettings();
    render();
    updateSyncStatus("All data synced", "idle");
  } catch (err) {
    updateSyncStatus("Will sync when online", "err");
  } finally {
    _syncing = false;
    if (_syncAgain) { _syncAgain = false; scheduleSync(200); }
  }
}

// Public wrappers kept so existing call sites keep working.
async function syncSupabase() { await runSync(); }
async function restoreSupabase() { await runSync(); }
function pushBillsQuietly() { scheduleSync(); }

async function fetchRemoteBills() {
  const appId = encodeURIComponent(state.settings.appInstanceId);
  const response = await cloudflareSyncRequest(`/api/bills?appInstanceId=${appId}`);
  if (!response.ok) throw new Error(await response.text());
  const payload = await response.json();
  return payload.bills || [];
}

async function syncReminderSettings() {
  if (!hasSyncConnection()) return;
  state.settings.timezone = getBrowserTimezone();
  const response = await cloudflareSyncRequest("/api/settings", {
    method: "POST",
    body: JSON.stringify({
      email: state.auth?.email || "",
      reminderLeadDays: state.settings.reminderLeadDays,
      emailReminders: state.settings.emailReminders,
      firstName: state.settings.firstName || "",
      timezone: state.settings.timezone
    })
  });
  if (!response.ok) throw new Error(await response.text());
}

async function syncReminderSettingsQuietly() {
  try { await syncReminderSettings(); } catch (err) { /* retried on next change */ }
}

async function fetchRemoteSettings() {
  if (!hasSyncConnection()) return null;
  const response = await cloudflareSyncRequest("/api/settings");
  if (!response.ok) throw new Error(await response.text());
  const payload = await response.json();
  return payload.settings || null;
}

async function restoreReminderSettings() {
  try {
    const remote = await fetchRemoteSettings();
    if (remote) { applyRemoteSettings(remote); saveSettings(); updateEmailReminderHint(); return; }
    await syncReminderSettings();
  } catch (err) { /* will sync later */ }
}

function applyRemoteSettings(settings) {
  if (!settings) return;
  state.settings.reminderLeadDays = Number(settings.reminderLeadDays ?? state.settings.reminderLeadDays);
  state.settings.emailReminders = Boolean(settings.emailReminders);
  if (typeof settings.firstName === "string" && settings.firstName.trim()) {
    state.settings.firstName = settings.firstName.trim();
    state.settings.namePrompted = true;
  }
  state.settings.timezone = settings.timezone || state.settings.timezone || getBrowserTimezone();
  if ($("#reminderLeadSelect")) $("#reminderLeadSelect").value = String(state.settings.reminderLeadDays);
  if ($("#emailReminderToggle")) $("#emailReminderToggle").checked = state.settings.emailReminders;
  updateEmailReminderHint();
}

function mergeBills(localBills, remoteBills) {
  const dead = tombstonedIds();
  const dirty = new Set(state.dirtyBills.map(String));
  const byKey = new Map(); // key -> { bill, fromLocal }

  const put = (bill, fromLocal) => {
    const key = String(bill.clientBillId || bill.id);
    if (dead.has(key)) return; // deleted on this device; don't resurrect
    const norm = normalizeBill(bill);
    const cur = byKey.get(key);
    if (!cur) { byKey.set(key, { bill: norm, fromLocal }); return; }
    // An unsynced local edit always wins over the remote copy.
    const curDirtyLocal = cur.fromLocal && dirty.has(key);
    const newDirtyLocal = fromLocal && dirty.has(key);
    if (newDirtyLocal && !curDirtyLocal) { byKey.set(key, { bill: norm, fromLocal }); return; }
    if (curDirtyLocal && !newDirtyLocal) return;
    // Otherwise the most recently updated copy wins.
    if (new Date(norm.updatedAt || 0) >= new Date(cur.bill.updatedAt || 0)) byKey.set(key, { bill: norm, fromLocal });
  };

  remoteBills.forEach((b) => put(b, false));
  localBills.forEach((b) => put(b, true));
  return Array.from(byKey.values()).map((e) => e.bill);
}

function updateSyncStatus(message, statusClass) {
  const el = $("#syncStatus");
  if (el) el.textContent = message;
  if (statusClass) state.syncState = statusClass;
  updateSyncChip(message, statusClass);
}

function updateSyncChip(message, statusClass) {
  const chip = $("#syncChip");
  if (!chip) return;
  const cls = statusClass || (hasSyncConnection() ? "idle" : "off");
  chip.className = `sync-chip ${cls}`;
  $("#syncChipText").textContent = hasSyncConnection()
    ? (cls === "sync" ? "Syncing\u2026" : cls === "err" ? "Sync issue" : "All data synced")
    : "Local only";
  $("#syncChipSub").textContent = hasSyncConnection() ? (message && cls === "idle" ? "Just now" : "") : "Sign in to back up";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

/* ============ preserved PDF text engine ============ */
async function decodePdfText(buffer) {
  const rawText = new TextDecoder("latin1").decode(buffer);
  const streamText = await decodeCompressedPdfStreams(buffer, rawText);
  return streamText || decodePdfLikeText(rawText);
}

async function decodeCompressedPdfStreams(buffer, rawText) {
  if (!("DecompressionStream" in window)) return "";

  const fontMaps = await buildToUnicodeFontMaps(buffer, rawText);
  const chunks = [];
  let position = 0;

  while ((position = rawText.indexOf("stream", position)) !== -1) {
    const dictionary = rawText.slice(Math.max(0, rawText.lastIndexOf("<<", position)), position);
    let start = position + "stream".length;
    if (rawText[start] === "\r" && rawText[start + 1] === "\n") {
      start += 2;
    } else if (rawText[start] === "\n") {
      start += 1;
    }

    const end = rawText.indexOf("endstream", start);
    if (end === -1) break;

    if (/FlateDecode/.test(dictionary)) {
      let streamBytes = new Uint8Array(buffer.slice(start, end));
      while (streamBytes.length && (streamBytes[streamBytes.length - 1] === 10 || streamBytes[streamBytes.length - 1] === 13)) {
        streamBytes = streamBytes.slice(0, -1);
      }

      try {
        const inflated = await inflateDeflateStream(streamBytes);
        const text = new TextDecoder("latin1").decode(inflated);
        if (/\bBT\b/.test(text)) {
          chunks.push(extractPdfTextFromContentStream(text, fontMaps));
        }
      } catch {
        // Some streams are images or use unsupported filters; ignore them.
      }
    }

    position = end + "endstream".length;
  }

  return normalizeExtractedText(chunks.join("\n"));
}

async function buildToUnicodeFontMaps(buffer, rawText) {
  const maps = new Map();
  const resourceFontPattern = /\/(F[A-Za-z0-9]+)\s+(\d+)\s+0\s+R/g;
  let resourceMatch = resourceFontPattern.exec(rawText);

  while (resourceMatch) {
    const fontName = resourceMatch[1];
    const fontObject = readPdfObject(rawText, resourceMatch[2]);
    const unicodeMatch = fontObject.match(/\/ToUnicode\s+(\d+)\s+0\s+R/);
    if (unicodeMatch && !maps.has(fontName)) {
      const cmap = await readPdfObjectStream(buffer, rawText, unicodeMatch[1]);
      const parsed = parseToUnicodeCMap(cmap);
      if (parsed.entries.size) {
        maps.set(fontName, parsed);
      }
    }
    resourceMatch = resourceFontPattern.exec(rawText);
  }

  const fontPattern = /\/Name\s*\/([A-Za-z0-9]+)[\s\S]{0,700}?\/ToUnicode\s+(\d+)\s+0\s+R/g;
  let match = fontPattern.exec(rawText);

  while (match) {
    const fontName = match[1];
    const objectNumber = match[2];
    const cmap = await readPdfObjectStream(buffer, rawText, objectNumber);
    const parsed = parseToUnicodeCMap(cmap);
    if (parsed.entries.size) {
      maps.set(fontName, parsed);
    }
    match = fontPattern.exec(rawText);
  }

  return maps;
}

function readPdfObject(rawText, objectNumber) {
  const marker = `${objectNumber} 0 obj`;
  const objectStart = rawText.indexOf(marker);
  if (objectStart === -1) return "";

  const objectEnd = rawText.indexOf("endobj", objectStart);
  if (objectEnd === -1) return "";

  return rawText.slice(objectStart, objectEnd);
}

async function readPdfObjectStream(buffer, rawText, objectNumber) {
  const marker = `${objectNumber} 0 obj`;
  const objectStart = rawText.indexOf(marker);
  if (objectStart === -1) return "";

  const streamStart = rawText.indexOf("stream", objectStart);
  const objectEnd = rawText.indexOf("endobj", objectStart);
  if (streamStart === -1 || streamStart > objectEnd) return "";

  let dataStart = streamStart + "stream".length;
  if (rawText[dataStart] === "\r" && rawText[dataStart + 1] === "\n") {
    dataStart += 2;
  } else if (rawText[dataStart] === "\n") {
    dataStart += 1;
  }

  const streamEnd = rawText.indexOf("endstream", dataStart);
  if (streamEnd === -1) return "";

  const dictionary = rawText.slice(objectStart, streamStart);
  let streamBytes = new Uint8Array(buffer.slice(dataStart, streamEnd));
  while (streamBytes.length && (streamBytes[streamBytes.length - 1] === 10 || streamBytes[streamBytes.length - 1] === 13)) {
    streamBytes = streamBytes.slice(0, -1);
  }

  if (/FlateDecode/.test(dictionary)) {
    streamBytes = await inflateDeflateStream(streamBytes);
  }

  return new TextDecoder("latin1").decode(streamBytes);
}

function parseToUnicodeCMap(cmap) {
  const entries = new Map();
  const pairPattern = /<([0-9A-Fa-f]+)>\s+<([0-9A-Fa-f]+)>/g;
  let match = pairPattern.exec(cmap);

  while (match) {
    entries.set(match[1].toUpperCase(), decodeUnicodeHex(match[2]));
    match = pairPattern.exec(cmap);
  }

  const lengths = Array.from(new Set(Array.from(entries.keys()).map((key) => key.length))).sort((a, b) => b - a);
  return { entries, lengths };
}

async function inflateDeflateStream(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function extractPdfTextFromContentStream(contentStream, fontMaps) {
  const strings = [];
  let activeFont = "";
  const tokenPattern = /\/([A-Za-z0-9]+)\s+[\d.]+\s+Tf|<([0-9A-Fa-f\s]+)>\s*Tj|(\((?:\\.|[^\\()])*\))\s*Tj|\[([\s\S]*?)\]\s*TJ/g;
  let match = tokenPattern.exec(contentStream);

  while (match) {
    if (match[1]) {
      activeFont = match[1];
    } else if (match[2]) {
      strings.push(decodePdfHexString(match[2], fontMaps.get(activeFont)));
    } else if (match[3]) {
      strings.push(decodePdfLiteralString(match[3].slice(1, -1)));
    } else if (match[4]) {
      strings.push(decodePdfTextArray(match[4], fontMaps.get(activeFont)));
    }
    match = tokenPattern.exec(contentStream);
  }

  return strings.join("\n");
}

function decodePdfTextArray(value, fontMap) {
  const parts = [];
  const arrayPattern = /<([0-9A-Fa-f\s]+)>|\((?:\\.|[^\\()])*\)/g;
  let match = arrayPattern.exec(value);

  while (match) {
    if (match[1]) {
      parts.push(decodePdfHexString(match[1], fontMap));
    } else {
      parts.push(decodePdfLiteralString(match[0].slice(1, -1)));
    }
    match = arrayPattern.exec(value);
  }

  return parts.join("");
}

function decodePdfHexString(value, fontMap) {
  const hex = value.replace(/\s+/g, "").toUpperCase();
  if (!hex) return "";

  if (fontMap?.entries?.size) {
    let output = "";
    let index = 0;
    while (index < hex.length) {
      const length = fontMap.lengths.find((size) => fontMap.entries.has(hex.slice(index, index + size)));
      if (length) {
        output += fontMap.entries.get(hex.slice(index, index + length));
        index += length;
      } else {
        index += 2;
      }
    }
    return output;
  }

  if (/^(00[2-7][0-9A-F])/.test(hex) || hex.includes("00")) {
    return decodeUnicodeHex(hex);
  }

  let output = "";
  for (let index = 0; index < hex.length; index += 2) {
    output += String.fromCharCode(parseInt(hex.slice(index, index + 2), 16));
  }
  return output;
}

function decodePdfLiteralString(value) {
  const unescaped = unescapePdfString(value);
  if (!unescaped.includes("\u0000")) return unescaped;

  return unescaped
    .split("")
    .filter((char) => char !== "\u0000")
    .join("");
}

function decodeUnicodeHex(hex) {
  let output = "";
  const clean = hex.replace(/\s+/g, "");
  for (let index = 0; index < clean.length; index += 4) {
    const code = parseInt(clean.slice(index, index + 4), 16);
    if (Number.isFinite(code)) {
      output += String.fromCharCode(code);
    }
  }
  return output;
}

function unescapePdfString(value) {
  return value
    .replace(/\\([nrtbf()\\])/g, (_match, char) => {
      const escapes = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\" };
      return escapes[char] || char;
    })
    .replace(/\\([0-7]{1,3})/g, (_match, octal) => String.fromCharCode(parseInt(octal, 8)));
}

function decodePdfLikeText(rawText) {
  const literalStrings = [];
  const stringPattern = /\(([^()]{2,})\)/g;
  let match = stringPattern.exec(rawText);

  while (match) {
    literalStrings.push(
      match[1]
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\n")
        .replace(/\\t/g, " ")
        .replace(/\\([()\\])/g, "$1")
    );
    match = stringPattern.exec(rawText);
  }

  const fallback = rawText
    .replace(/[^\x20-\x7E\n\r\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalizeExtractedText(literalStrings.join("\n") || fallback);
}

function normalizeExtractedText(text) {
  return text
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function extractBillDetails(text, fileName) {
  const normalized = text.replace(/\s+/g, " ");
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const amountMatch = normalized.match(/(?:amount due|total due|balance due|payable|total)\D{0,20}([$]?\s?\d{1,4}(?:,\d{3})*(?:\.\d{2})?)/i);
  const dateMatch = normalized.match(/(?:due date|payment due|pay by|due)\D{0,24}(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{1,2}-\d{1,2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{4})/i);
  const referenceMatch = normalized.match(/(?:account|reference|invoice|bill)\s*(?:number|no|#)?\D{0,12}([A-Z0-9][A-Z0-9 -]{4,24})/i);

  return {
    biller: findBiller(lines) || cleanupBiller(fileName.replace(/\.pdf$/i, "")),
    amount: findAmount(lines) || (amountMatch ? amountMatch[1].replace(/[$,\s]/g, "") : ""),
    dueDate: findDueDate(lines) || (dateMatch ? toDateInputValue(dateMatch[1]) : ""),
    reference: findReference(lines) || (referenceMatch ? referenceMatch[1].trim() : "")
  };
}

function findBiller(lines) {
  const companyLine = lines.find((line) => /\b(Pty\.?\s*Ltd|Limited|Ltd|Inc|LLC|Services)\b/i.test(line));
  if (companyLine) return cleanupBiller(companyLine);

  const skip = /^(page|tax invoice|invoice no|issue date|account number|total|amount|date)$/i;
  const candidate = lines.find((line) => /[a-z]/i.test(line) && !skip.test(line) && !/\d{4,}/.test(line));
  return cleanupBiller(candidate);
}

function findAmount(lines) {
  const amountLineIndex = lines.findIndex((line) => /total amount due|amount due|balance due/i.test(line));
  if (amountLineIndex !== -1) {
    const nearby = [
      lines[amountLineIndex - 2],
      lines[amountLineIndex - 1],
      lines[amountLineIndex + 1],
      lines[amountLineIndex + 2]
    ].filter(Boolean);
    const amount = nearby.map(extractMoney).find(Boolean);
    if (amount) return amount;
  }

  const totalLine = lines.find((line) => /total.*\$\d/i.test(line));
  return extractMoney(totalLine || "");
}

function findDueDate(lines) {
  const dueLineIndex = lines.findIndex((line) => /bill due date|due date|pay by|payment due/i.test(line));
  if (dueLineIndex !== -1) {
    const nearby = [
      lines[dueLineIndex - 2],
      lines[dueLineIndex - 1],
      lines[dueLineIndex + 1],
      lines[dueLineIndex + 2]
    ].filter(Boolean);
    const date = nearby.map(extractDate).find(Boolean);
    if (date) return date;
  }

  const dueText = lines.find((line) => /due/i.test(line)) || "";
  return extractDate(dueText);
}

function findReference(lines) {
  return valueNearLabel(lines, /account number/i) || valueNearLabel(lines, /cust ref/i) || valueNearLabel(lines, /invoice number/i);
}

function valueNearLabel(lines, labelPattern) {
  const index = lines.findIndex((line) => labelPattern.test(line));
  if (index === -1) return "";

  const inline = lines[index].replace(labelPattern, "").replace(/[:#]/g, "").trim();
  if (/^[A-Z0-9][A-Z0-9 -]{4,24}$/i.test(inline)) return inline;

  return (lines[index + 1] || "").trim();
}

function extractMoney(value) {
  const match = value.match(/\$?\s?(\d{1,4}(?:,\d{3})*\.\d{2})/);
  return match ? match[1].replace(/,/g, "") : "";
}

function extractDate(value) {
  const match = value.match(/(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{1,2}-\d{1,2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{2,4})/i);
  return match ? toDateInputValue(match[1]) : "";
}

function cleanupBiller(value) {
  if (!value) return "";
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b(invoice|bill|statement|pdf)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 60);
}

function toDateInputValue(value) {
  const clean = value.replace(/(\d)(st|nd|rd|th)\b/i, "$1");
  const namedDateMatch = clean.match(/^(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{2,4})$/i);
  if (namedDateMatch) {
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const month = months.indexOf(namedDateMatch[2].toLowerCase().slice(0, 3)) + 1;
    return formatDateParts(normalizeYear(namedDateMatch[3]), month, Number(namedDateMatch[1]));
  }

  const slashMatch = clean.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slashMatch) {
    const first = Number(slashMatch[1]);
    const second = Number(slashMatch[2]);
    const year = normalizeYear(slashMatch[3]);
    const dayFirst = first > 12 || navigator.language.toLowerCase().includes("au");
    const day = dayFirst ? first : second;
    const month = dayFirst ? second : first;
    return formatDateParts(year, month, day);
  }

  const parsed = new Date(clean);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return "";
}

function normalizeYear(year) {
  const number = Number(year);
  return number < 100 ? 2000 + number : number;
}

function formatDateParts(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}


/* ============ preserved date helpers ============ */
function dateFromInput(value) {
  const [year, month, day] = value.split("-").map(Number);
  return startOfDay(new Date(year, month - 1, day));
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return startOfDay(next);
}

function formatDatePartsFromDate(date) {
  return formatDateParts(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function getBrowserTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "Australia/Melbourne";
}

function formatDisplayDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(dateFromInput(value));
}

/* ============ bootstrap ============ */
if (document.readyState !== "loading") init();
else document.addEventListener("DOMContentLoaded", init);
