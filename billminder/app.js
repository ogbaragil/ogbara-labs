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
  utilities:       { label: "Utility - Electricity", color: "#f59e0b", glyph: "\u26A1" },
  utilities_water: { label: "Utility - Water",       color: "#06b6d4", glyph: "\uD83D\uDCA7" },
  utilities_gas:   { label: "Utility - Gas",         color: "#f97316", glyph: "\uD83D\uDD25" },
  telecom:       { label: "Telecom",       color: "#0ea5e9", glyph: "\uD83D\uDCF6" },
  insurance:     { label: "Insurance",     color: "#6366f1", glyph: "\uD83D\uDEE1\uFE0F" },
  subscriptions: { label: "Subscriptions", color: "#8b5cf6", glyph: "\u25B6\uFE0F" },
  housing:       { label: "Housing",       color: "#10b981", glyph: "\uD83C\uDFE0" },
  health:        { label: "Health",        color: "#f43f5e", glyph: "\u2795" },
  other:         { label: "Other",         color: "#64748b", glyph: "\u2022" }
};
const CATEGORY_ORDER = ["utilities", "utilities_water", "utilities_gas", "telecom", "insurance", "subscriptions", "housing", "health", "other"];
const CUSTOM_CAT_COLORS = ["#0891b2", "#db2777", "#65a30d", "#ca8a04", "#7c3aed", "#dc2626", "#2563eb", "#0d9488"];

function customCategories() { return Array.isArray(state.settings?.customCategories) ? state.settings.customCategories : []; }
function isValidCategory(id) { return !!CATEGORIES[id] || customCategories().some((c) => c.id === id); }
function catMeta(id) {
  if (CATEGORIES[id]) return CATEGORIES[id];
  const c = customCategories().find((x) => x.id === id);
  return c ? { label: c.label, color: c.color || "#64748b", glyph: c.glyph || "\u2022" } : CATEGORIES.other;
}
function categoryIds() { return [...CATEGORY_ORDER.filter((c) => c !== "other"), ...customCategories().map((c) => c.id), "other"]; }
function addCustomCategory(label) {
  const name = String(label || "").trim().slice(0, 30);
  if (!name) return null;
  const existing = [...Object.values(CATEGORIES), ...customCategories()].find((c) => c.label.toLowerCase() === name.toLowerCase());
  if (existing) { const hit = customCategories().find((c) => c.label.toLowerCase() === name.toLowerCase()); return hit ? hit.id : Object.keys(CATEGORIES).find((k) => CATEGORIES[k].label.toLowerCase() === name.toLowerCase()); }
  const list = customCategories();
  const id = "custom_" + crypto.randomUUID().slice(0, 8);
  const color = CUSTOM_CAT_COLORS[list.length % CUSTOM_CAT_COLORS.length];
  list.push({ id, label: name, color, glyph: "\u2022" });
  state.settings.customCategories = list;
  saveSettings();
  scheduleSync(200);
  return id;
}

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
  customCategories: [],
  lastSyncedAt: 0,
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
  deleteMode: "single",
  rescheduleBillId: null,
  detailBillId: null,
  docViewerBillId: null,
  recoveryToken: "",
  deferredInstallPrompt: null,
  heroIndex: 0
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
  state.billsFocus = null;
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
  let heroResizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(heroResizeTimer);
    heroResizeTimer = setTimeout(() => {
      const track = $("#heroTrack");
      if (track) track.scrollLeft = (state.heroIndex || 0) * track.clientWidth;
    }, 150);
  });
}

function migrateLegacyKeys() {
  for (const [now, old] of [[STORE_KEY, LEGACY.bills], [SETTINGS_KEY, LEGACY.settings], [AUTH_KEY, LEGACY.auth]]) {
    if (localStorage.getItem(now) == null && localStorage.getItem(old) != null) {
      localStorage.setItem(now, localStorage.getItem(old));
    }
  }
}

function setupNavigation() {
  $$("[data-view]").forEach((btn) => btn.addEventListener("click", () => { state.billsFocus = null; showView(btn.dataset.view); }));
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
    state.billsFocus = null;
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
    category: isValidCategory(bill.category) ? bill.category : "other",
    recurrence: RECURRENCE[bill.recurrence] ? bill.recurrence : "once",
    anchorDay: normalizeAnchorDay(bill.anchorDay, bill.dueDate),
    reference: bill.reference || "",
    notes: bill.notes || "",
    fileName: bill.fileName || "",
    hasDocument: Boolean(bill.hasDocument),
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

function monthBucketKey(d) { return `${d.getFullYear()}-${d.getMonth()}`; }

// Per-category spend, smoothed evenly across the trailing window. Used only
// as a fallback for categories with no currently-active recurring bill (see
// forecastMonths) — for those we don't know the real future cadence, so
// spreading the historical total across every month gives the best available
// expected-value estimate without assuming it recurs monthly.
function categoryMonthlyRates(windowMonths = 6) {
  const today = startOfDay(new Date());
  const start = new Date(today.getFullYear(), today.getMonth() - (windowMonths - 1), 1);
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const sums = {};
  state.bills.forEach((b) => {
    const d = dateFromInput(b.dueDate);
    if (d < start || d > end) return;
    sums[b.category] = (sums[b.category] || 0) + b.amount;
  });
  const rates = {};
  Object.keys(sums).forEach((c) => { rates[c] = sums[c] / windowMonths; });
  return rates;
}

// Predicted spend for the next `count` months, per category. Known commitments
// (recurring projections + scheduled unpaid bills, plus what's already been paid
// this month) are used where they exist. Categories with no currently-active
// recurring bill fall back to a smoothed historical average; categories that
// DO have one rely entirely on its real schedule — including the months it
// isn't due — so a quarterly bill isn't predicted as if it recurred monthly.
function forecastMonths(count = 6) {
  const today = startOfDay(new Date());
  const rates = categoryMonthlyRates(6);
  const out = [];
  for (let i = 0; i < count; i++) {
    const ref = new Date(today.getFullYear(), today.getMonth() + i, 1);
    out.push({ key: monthBucketKey(ref), date: ref, total: 0, byCategory: {}, predicted: {} });
  }
  const horizon = new Date(today.getFullYear(), today.getMonth() + count, 1);
  const byKey = Object.fromEntries(out.map((m) => [m.key, m]));

  // A category with a live recurring bill has a known future cadence — its
  // real schedule (below) is authoritative, so the averaged fallback must
  // never pad in the months it doesn't recur.
  const recurringCategories = new Set(
    state.bills.filter((b) => b.recurrence !== "once").map((b) => b.category)
  );

  // Known/scheduled amounts from real bills.
  const scheduled = {};
  out.forEach((m) => (scheduled[m.key] = {}));
  state.bills.forEach((bill) => {
    if (bill.recurrence !== "once") {
      projectOccurrences(bill, today, horizon).forEach((d) => {
        const k = monthBucketKey(new Date(d.getFullYear(), d.getMonth(), 1));
        if (scheduled[k]) scheduled[k][bill.category] = (scheduled[k][bill.category] || 0) + bill.amount;
      });
    } else {
      const d = dateFromInput(bill.dueDate);
      const k = monthBucketKey(new Date(d.getFullYear(), d.getMonth(), 1));
      if (!scheduled[k]) return;
      const isCurrent = k === out[0].key;
      if (bill.status === "unpaid" || (bill.status === "paid" && isCurrent)) {
        scheduled[k][bill.category] = (scheduled[k][bill.category] || 0) + bill.amount;
      }
    }
  });

  const cats = new Set(Object.keys(rates));
  out.forEach((m) => Object.keys(scheduled[m.key]).forEach((c) => cats.add(c)));

  out.forEach((m) => {
    const sched = scheduled[m.key] || {};
    cats.forEach((c) => {
      const known = sched[c] || 0;
      const val = known > 0 ? known : (recurringCategories.has(c) ? 0 : (rates[c] || 0));
      if (val > 0) {
        m.byCategory[c] = (m.byCategory[c] || 0) + val;
        m.predicted[c] = known <= 0; // true when this figure is modelled, not scheduled
        m.total += val;
      }
    });
  });
  return out;
}

// Actual (not projected) spend for the `count` calendar months before the
// current one, taken straight from real bills by their due date - the same
// records the app already keeps once a recurring bill is marked paid and
// rolls to its next occurrence. This is what makes past months in the
// cash-flow chart "real" history rather than a guess.
function historyMonths(count = 6) {
  const today = startOfDay(new Date());
  const out = [];
  for (let i = count; i >= 1; i--) {
    const ref = new Date(today.getFullYear(), today.getMonth() - i, 1);
    out.push({ key: monthBucketKey(ref), date: ref, total: 0, byCategory: {}, actual: true });
  }
  const byKey = Object.fromEntries(out.map((m) => [m.key, m]));
  state.bills.forEach((bill) => {
    const d = dateFromInput(bill.dueDate);
    const k = monthBucketKey(new Date(d.getFullYear(), d.getMonth(), 1));
    const m = byKey[k];
    if (!m) return;
    m.byCategory[bill.category] = (m.byCategory[bill.category] || 0) + bill.amount;
    m.total += bill.amount;
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
  const ordered = [...categoryIds(), ...Object.keys(totals)].filter((c, i, a) => a.indexOf(c) === i);
  const rows = ordered.filter((c) => totals[c]).map((c) => ({ cat: c, value: totals[c], pct: grand ? totals[c] / grand : 0 }));
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
    out.push({ tone: "info", title: `${catMeta(top.cat).label} is your biggest category`, body: `${money(top.value)} projected over 3 months.` });
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
    more: ["Settings", ""]
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
function catOf(bill) { return catMeta(bill.category); }
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
  const past = historyMonths(6);
  const future = forecastMonths(6);
  const months = [...past, ...future];
  const max = Math.max(1, ...months.map((m) => m.total));
  const futureTotal = future.reduce((s, m) => s + m.total, 0);
  const pastTotal = past.reduce((s, m) => s + m.total, 0);
  const shortMonth = new Intl.DateTimeFormat(undefined, { month: "short" });
  const fullMonth = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });

  if (futureTotal <= 0 && pastTotal <= 0) {
    el.innerHTML = `<div class="panel-head"><h2>Cash-flow forecast</h2></div>
      <div class="empty-inline">Add a few bills and Cleared will learn your spending per category and predict the next 6 months \u2014 even for months you haven't entered yet.</div>`;
    return;
  }

  const nowIdx = months.findIndex((m) => m.date.getFullYear() === now.getFullYear() && m.date.getMonth() === now.getMonth());

  const bars = months.map((m, idx) => {
    const isNow = idx === nowIdx;
    const h = m.total ? Math.max(Math.round((m.total / max) * 100), 6) : 2;
    const cls = isNow ? "now" : m.actual ? "past" : "";
    return `<button class="fc-col" data-fc-idx="${idx}" type="button" aria-label="${escapeHtml(fullMonth.format(m.date))}: ${money(m.total)}">
      <span class="fc-amt">${m.total ? money0(m.total) : ""}</span>
      <span class="fc-bar-wrap"><span class="fc-bar ${cls}" style="height:${h}%"></span></span>
      <span class="fc-month">${escapeHtml(shortMonth.format(m.date))}</span>
    </button>`;
  }).join("");

  const breakdown = categoryBreakdown(6);
  const legend = breakdown.rows.slice(0, 3).map((r) =>
    `<span class="fc-leg"><i style="background:${catMeta(r.cat).color}"></i>${escapeHtml(catMeta(r.cat).label)} ${Math.round(r.pct * 100)}%</span>`
  ).join("");

  el.innerHTML = `<div class="panel-head"><h2>Cash-flow forecast</h2><span class="fc-total">${money0(futureTotal)} <small>predicted, 6 mo</small></span></div>
    <div class="fc-scroll"><div class="fc-chart" id="fcChart">${bars}</div></div>
    <p class="fc-hint">\u2190 Scroll to browse past and future months \u2192</p>
    ${legend ? `<div class="fc-legend">${legend}</div>` : ""}
    <div class="fc-detail" id="fcDetail"></div>`;

  const chart = $("#fcChart", el);

  $$("[data-fc-idx]", el).forEach((btn) => btn.addEventListener("click", () => {
    const m = months[Number(btn.dataset.fcIdx)];
    const detail = $("#fcDetail", el);
    if (!m || !detail) return;
    const cats = Object.entries(m.byCategory).sort((a, b) => b[1] - a[1]);
    const tag = m.actual ? "actual" : "predicted";
    detail.innerHTML = cats.length
      ? `<div class="fc-detail-head">${escapeHtml(fullMonth.format(m.date))} \u00b7 ${money(m.total)} <small class="fc-detail-tag">${tag}</small></div>` +
        cats.map(([c, v]) => `<div class="fc-detail-row"><span><i style="background:${catMeta(c).color}"></i>${escapeHtml(catMeta(c).label)}</span><strong>${money(v)}</strong></div>`).join("")
      : `<div class="fc-detail-head">${escapeHtml(fullMonth.format(m.date))} \u00b7 nothing ${m.actual ? "recorded" : "projected"}</div>`;
    $$(".fc-col", el).forEach((c) => c.classList.toggle("sel", c === btn));
  }));

  // Land the scroll with "now" a couple of columns in from the left, so both
  // the trailing history and the upcoming forecast are reachable by scrolling.
  requestAnimationFrame(() => {
    if (nowIdx < 0 || !chart.children.length) return;
    const col = chart.children[0].getBoundingClientRect().width + 8;
    chart.parentElement.scrollLeft = Math.max(0, (nowIdx - 1) * col);
  });
}

// Bills that belong on the top dashboard card: anything overdue, due today,
// or due soon (the things that actually need attention right now), soonest
// first. "Upcoming"/far-out bills don't clutter the slider.
function heroBills() {
  return state.bills
    .filter((b) => b.status === "unpaid")
    .filter((b) => { const st = billStatus(b); return st === "overdue" || st === "due-today" || st === "due-soon"; })
    .sort(byDue);
}

function heroCardHtml(bill) {
  const st = billStatus(bill);
  const urgent = st === "overdue" || st === "due-today";
  const cls = urgent ? "danger" : "calm";
  const eyebrow = st === "overdue" ? "OVERDUE" : st === "due-today" ? "DUE TODAY" : "DUE SOON";
  return `<div class="hero ${cls}" data-hero-card>
    <div class="hero-top">
      <span class="hero-ring">${urgent ? "!" : "\u2022"}</span>
      <div class="hero-body">
        <p class="hero-eyebrow">${eyebrow}</p>
        <div class="hero-biller">${escapeHtml(bill.biller)}</div>
        <div class="hero-amount">${money(bill.amount)}</div>
        <p class="hero-meta">${escapeHtml(RECURRENCE[bill.recurrence].label)} bill \u00b7 <b>${escapeHtml(relativeDue(bill))}</b></p>
      </div>
      <span class="hero-chip" style="background:${catOf(bill).color}">${escapeHtml(billInitial(bill))}</span>
    </div>
    <div class="hero-actions">
      <button class="btn ${urgent ? "danger" : "primary"}" data-hero-pay="${bill.id}" type="button">Mark paid</button>
      <button class="btn outline" data-hero-view="${bill.id}" type="button">View bill</button>
    </div>
  </div>`;
}

function renderHero() {
  const el = $("#ovHero");
  const bills = heroBills();

  if (!bills.length) {
    el.className = "hero-wrap";
    el.innerHTML = `<div class="hero ok"><div class="hero-top">
      <span class="hero-ring">\u2713</span>
      <div class="hero-body"><p class="hero-eyebrow">ALL CLEAR</p>
      <div class="hero-biller">You're all caught up</div>
      <p class="hero-meta">No overdue or due-soon bills right now. Nicely cleared.</p></div></div></div>`;
    return;
  }

  if (!Number.isInteger(state.heroIndex) || state.heroIndex >= bills.length) state.heroIndex = 0;

  el.className = "hero-wrap";
  const multi = bills.length > 1;
  const dots = bills.map((_, i) => `<button class="hero-dot" data-hero-dot="${i}" type="button" aria-label="Slide ${i + 1} of ${bills.length}"></button>`).join("");
  el.innerHTML = `<div class="hero-carousel">
      <div class="hero-track" id="heroTrack">${bills.map(heroCardHtml).join("")}</div>
      ${multi ? `<button class="hero-nav prev" data-hero-nav="prev" type="button" aria-label="Previous bill">\u2039</button>
      <button class="hero-nav next" data-hero-nav="next" type="button" aria-label="Next bill">\u203a</button>` : ""}
    </div>
    ${multi ? `<div class="hero-dots"><span class="hero-count">${bills.length} need attention</span><span class="hero-dot-row">${dots}</span></div>` : ""}`;

  const track = $("#heroTrack", el);

  $$("[data-hero-pay]", el).forEach((b) => b.addEventListener("click", () => {
    const bl = state.bills.find((x) => x.id === b.dataset.heroPay);
    if (bl) openPaidModal(bl);
  }));
  $$("[data-hero-view]", el).forEach((b) => b.addEventListener("click", () => openDetailSheet(b.dataset.heroView)));

  if (!multi) return;

  const updateDots = () => $$("[data-hero-dot]", el).forEach((d, i) => d.classList.toggle("active", i === state.heroIndex));
  const goTo = (i) => {
    state.heroIndex = Math.max(0, Math.min(bills.length - 1, i));
    track.scrollTo({ left: state.heroIndex * track.clientWidth, behavior: "smooth" });
    updateDots();
  };

  $$("[data-hero-dot]", el).forEach((d) => d.addEventListener("click", () => goTo(Number(d.dataset.heroDot))));
  $("[data-hero-nav='prev']", el)?.addEventListener("click", () => goTo(state.heroIndex - 1));
  $("[data-hero-nav='next']", el)?.addEventListener("click", () => goTo(state.heroIndex + 1));

  let scrollTimer;
  track.addEventListener("scroll", () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      state.heroIndex = Math.max(0, Math.min(bills.length - 1, Math.round(track.scrollLeft / track.clientWidth)));
      updateDots();
    }, 100);
  });

  requestAnimationFrame(() => { track.scrollLeft = state.heroIndex * track.clientWidth; updateDots(); });
}

function renderTiles() {
  const t = startOfDay(new Date());
  const dt = dueTodayBills();
  const wk = state.bills.filter((b) => b.status === "unpaid" && dateFromInput(b.dueDate) > t && dateFromInput(b.dueDate) <= addDays(t, 7));
  const mo = billsThisMonthUnpaid(), pd = paidThisMonth();
  const tiles = [
    { focus: "today", label: "Due today", amt: sumAmt(dt), n: dt.length, tone: "red", ic: IC_CAL },
    { focus: "week", label: "Due this week", amt: sumAmt(wk), n: wk.length, tone: "orange", ic: IC_CAL },
    { focus: "month", label: "Due this month", amt: sumAmt(mo), n: mo.length, tone: "blue", ic: IC_CAL },
    { focus: "paidmonth", label: "Paid this month", amt: sumAmt(pd), n: pd.length, tone: "green", ic: IC_CHECK }
  ];
  const wrap = $("#ovStats");
  wrap.className = "tiles";
  wrap.innerHTML = tiles.map((t) => `<button class="tile tone-${t.tone}" data-focus="${t.focus}" type="button">
    <span class="tile-ic">${t.ic}</span>
    <span class="tile-label">${t.label}</span>
    <span class="tile-amt">${money(t.amt)}</span>
    <span class="tile-n">${t.n} bill${t.n === 1 ? "" : "s"}</span>
  </button>`).join("");
  $$("[data-focus]", wrap).forEach((b) => b.addEventListener("click", () => {
    state.billsFocus = b.dataset.focus;
    showView("bills");
  }));
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
  $$("[data-go]", el).forEach((b) => b.addEventListener("click", () => { state.billsFocus = null; showView(b.dataset.go); }));
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
function focusCollection(key) {
  const t = startOfDay(new Date());
  if (key === "today") return { title: "Due today", bills: dueTodayBills().slice().sort(byDue) };
  if (key === "week") return { title: "Due this week", bills: state.bills.filter((b) => b.status === "unpaid" && dateFromInput(b.dueDate) > t && dateFromInput(b.dueDate) <= addDays(t, 7)).sort(byDue) };
  if (key === "month") return { title: "Due this month", bills: billsThisMonthUnpaid() };
  if (key === "paidmonth") return { title: "Paid this month", bills: paidThisMonth().slice().sort((a, b) => String(b.paidAt || "").localeCompare(String(a.paidAt || ""))) };
  return null;
}

function renderBills() {
  $$("#billsTabs button").forEach((b) => b.classList.toggle("is-selected", b.dataset.tab === state.billsTab));
  const due = billsDueWithin(7);
  const overdue = overdueBills().slice().sort(byDue);
  const badge = $("#dueSoonBadge"); if (badge) { const n = overdue.length + due.length; badge.textContent = n ? String(n) : ""; }
  renderBillsSummary();
  const wrap = $("#billsGroups");
  const tab = state.billsTab;

  if (state.billsFocus) {
    const coll = focusCollection(state.billsFocus);
    if (coll) {
      const body = coll.bills.length
        ? `<div class="group-body" style="margin-bottom:18px">${coll.bills.map(billRow).join("")}</div>`
        : `<div class="empty-state"><h3>Nothing here</h3><p>No bills in this group right now.</p></div>`;
      wrap.innerHTML = `<div class="focus-head"><div><span class="focus-title">${escapeHtml(coll.title)}</span> <span class="focus-count">${coll.bills.length}</span></div><button class="link" id="focusClear" type="button">Show all bills</button></div>${body}`;
      bindRows(wrap);
      $("#focusClear", wrap)?.addEventListener("click", () => { state.billsFocus = null; state.billsTab = "all"; renderBills(); });
      return;
    }
  }

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
  const name = firstName();
  const avatar = $("#setAvatar"); if (avatar) avatar.textContent = (name[0] || "\u00b7").toUpperCase();
  const greet = $("#setGreetTitle"); if (greet) greet.textContent = `${greeting()}, ${name}`;

  const leadMap = { 0: "On the due date", 1: "1 day before", 3: "3 days before", 7: "7 days before" };
  const rv = $("#reminderValue");
  if (rv) rv.textContent = leadMap[state.settings.reminderLeadDays] || `${state.settings.reminderLeadDays} days before`;
  if ($("#reminderLeadSelect")) $("#reminderLeadSelect").value = String(state.settings.reminderLeadDays);
  if ($("#emailReminderToggle")) $("#emailReminderToggle").checked = !!state.settings.emailReminders;

  const an = $("#accountName"); if (an) an.textContent = hasActiveSession() ? name : "Account";
  const ae = $("#accountEmail"); if (ae) ae.textContent = hasActiveSession() ? `Signed in as ${state.auth.email}` : "Not signed in.";
  const ani = $("#accountNameInput");
  if (ani && document.activeElement !== ani) ani.value = state.settings.firstName || "";

  const hs = $("#householdSub");
  if (hs) {
    const hh = state.household;
    if (hh && Array.isArray(hh.members) && hh.members.length >= 2) {
      const me = (state.auth?.email || "").toLowerCase();
      const partner = hh.members.find((m) => (m.email || "").toLowerCase() !== me) || hh.members[0];
      hs.textContent = `Connected with ${partner?.email || "your partner"}`;
    } else if ((state.sentInvites && state.sentInvites[0]) || state.lastInvite) {
      hs.textContent = "Invitation pending";
    } else {
      hs.textContent = "Invite a partner";
    }
  }

  updateBackupRow();
  updateEmailReminderHint();
}

function updateBackupRow() {
  const timeEl = $("#backupTime");
  const pill = $("#backupPill");
  const line = $("#setSyncLine");
  const ok = $("#setSyncOk");
  if (!timeEl || !pill) return;

  if (!hasSyncConnection()) {
    const localOnly = !useCloudflareSync();
    timeEl.textContent = localOnly ? "Saved on this device" : "Sign in to back up";
    pill.hidden = true;
    if (ok) ok.hidden = true;
    if (line) line.textContent = localOnly ? "Bills are saved on this device." : "Sign in to back up your bills.";
    return;
  }

  const cls = state.syncState || "idle";
  pill.hidden = false;
  pill.className = "set-pill" + (cls === "sync" ? " sync" : cls === "err" ? " err" : "");
  pill.textContent = cls === "sync" ? "Syncing\u2026" : cls === "err" ? "Issue" : "Synced";
  timeEl.textContent = state.settings.lastSyncedAt
    ? `Last synced ${formatSyncTime(state.settings.lastSyncedAt)}`
    : "Not backed up yet";
  if (ok) ok.hidden = cls !== "idle";
  if (line) line.textContent = cls === "idle"
    ? "Everything is synced and up to date."
    : cls === "sync" ? "Syncing your bills\u2026" : "Will sync when online.";
}

function formatSyncTime(ts) {
  const d = new Date(ts);
  const todayMs = startOfDay(new Date()).getTime();
  const dayMs = startOfDay(d).getTime();
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (dayMs === todayMs) return `today at ${time}`;
  if (dayMs === todayMs - 86400000) return `yesterday at ${time}`;
  return `${formatDisplayDate(formatDatePartsFromDate(d))} at ${time}`;
}

function openHouseholdModal() {
  renderHousehold();
  $("#householdModal").hidden = false;
}
function closeHouseholdModal() {
  $("#householdModal").hidden = true;
  renderMore();
}
function openAccountModal() {
  const ani = $("#accountNameInput"); if (ani) ani.value = state.settings.firstName || "";
  const ae = $("#accountEmail"); if (ae) ae.textContent = hasActiveSession() ? `Signed in as ${state.auth.email}` : "Not signed in.";
  $("#accountModal").hidden = false;
}
function closeAccountModal() {
  const ani = $("#accountNameInput");
  if (ani) {
    state.settings.firstName = ani.value.trim().slice(0, 40);
    state.settings.namePrompted = true;
    saveSettings(); scheduleSync(200);
  }
  $("#accountModal").hidden = true;
  renderMore();
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
    renderHousehold();
    if (state.view === "more") renderMore();
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
    renderMore();
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
    renderMore();
    closeHouseholdModal();
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
  input?.addEventListener("change", () => input.files[0] && handleBillFile(input.files[0]));
  ["dragover", "dragenter"].forEach((e) => drop?.addEventListener(e, (ev) => { ev.preventDefault(); drop.classList.add("drag"); }));
  ["dragleave", "drop"].forEach((e) => drop?.addEventListener(e, (ev) => { ev.preventDefault(); drop.classList.remove("drag"); }));
  drop?.addEventListener("drop", (ev) => { const f = ev.dataTransfer?.files?.[0]; if (f) handleBillFile(f); });
  const cam = $("#cameraInput");
  $("#scanButton")?.addEventListener("click", () => cam?.click());
  cam?.addEventListener("change", () => cam.files[0] && handleBillFile(cam.files[0]));

  const catSel = $("#categoryInput");
  if (catSel) {
    fillCategorySelect(catSel, "other");
    catSel.addEventListener("change", () => {
      if (catSel.value !== "__new__") { catSel.dataset.prev = catSel.value; return; }
      const name = prompt("Name your category");
      const id = name ? addCustomCategory(name) : null;
      fillCategorySelect(catSel, id || catSel.dataset.prev || "other");
    });
  }
}

function fillCategorySelect(sel, value) {
  const opts = categoryIds().map((c) => `<option value="${c}">${escapeHtml(catMeta(c).label)}</option>`).join("");
  sel.innerHTML = opts + `<option value="__new__">+ New category…</option>`;
  sel.value = isValidCategory(value) ? value : "other";
  sel.dataset.prev = sel.value;
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
      fillCategorySelect($("#categoryInput"), bill.category);
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
  if ($("#categoryInput")) fillCategorySelect($("#categoryInput"), "other");
  $("#recurrenceInput").value = "once";
  $("#extractStatus").textContent = "Upload a statement or bill PDF and Cleared's AI will pull out the amount, due date, biller and reference.";
  $("#extractPreview").textContent = "";
  $("#confidenceBadge").textContent = "Waiting";
  $("#aiExtractButton").disabled = true;
}

async function saveBillFromForm(event) {
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

  // Upload the scan to Supabase Storage (viewable until paid, then
  // auto-deleted — see applyPaid). Awaited so hasDocument only ever reflects
  // whether the file is actually stored.
  if (state.currentPdfFile && changed) {
    const file = state.currentPdfFile;
    changed.fileName = file.name || changed.fileName;
    changed.hasDocument = await saveBillDocument(changed.clientBillId, file);
  }

  markBillDirty(changed);
  closeBillSheet();
  if (state.view !== "overview" && state.view !== "bills") showView("overview"); else render();
  scheduleSync();
}

// AI extract is the only extraction path — no on-device OCR or PDF text
// parsing runs in the browser. Selecting, dropping, or scanning a file simply
// stores it and immediately sends it to the AI extractor.
function handleBillFile(file) {
  if (!file) return;
  state.currentPdfFile = file;
  $("#aiExtractButton").disabled = false;
  $("#extractPreview").textContent = `${file.name || "Selected file"} \u2022 ${humanFileSize(file.size)}`;
  extractWithAi();
}

function humanFileSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
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
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error || `AI service returned ${response.status}.`);
    }
    const result = payload || {};

    setExtractedField($("#billerInput"), result.biller, true);
    setExtractedField($("#amountInput"), result.amountDue, true);
    setExtractedField($("#dueDateInput"), result.dueDate, true);
    setExtractedField($("#referenceInput"), result.reference || result.invoiceNumber, true);

    const aiCat = (result.category && isValidCategory(result.category)) ? result.category
      : findBillerSmart(`${result.biller || ""} ${result.notes || ""}`).category || inferCategory(`${result.biller || ""} ${result.notes || ""}`);
    if (aiCat && $("#categoryInput")) fillCategorySelect($("#categoryInput"), aiCat);
    if (result.notes) $("#notesInput").value = result.notes;

    const confidence = Math.max(0, Math.min(1, Number(result.confidence || 0)));
    $("#extractStatus").textContent = confidence >= 0.75
      ? "AI extracted the bill details. Check them before saving."
      : "AI found likely details, but some fields may need checking.";
    $("#confidenceBadge").textContent = `${Math.round(confidence * 100)}%`;
  } catch (err) {
    const message = String(err?.message || "Unknown extraction error").replace(/\s+/g, " ").trim();
    $("#extractStatus").textContent = `AI extract failed: ${message.slice(0, 180)}`;
    $("#confidenceBadge").textContent = "Error";
  } finally {
    $("#aiExtractButton").disabled = false;
    setExtracting(false);
  }
}

function setExtractedField(input, value, overwrite = false) {
  if (!input || value === undefined || value === null || value === "") return;
  if (overwrite || !input.value) input.value = value;
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
  const cat = catMeta(bill.category);
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
      ${bill.status === "unpaid" && bill.hasDocument
        ? `<button class="btn ghost" id="dtViewDocument" type="button">View scanned document</button>`
        : ""}
      ${bill.status === "unpaid"
        ? `<button class="btn primary" id="dtMarkPaid" type="button">Mark as paid</button>
           <button class="btn ghost" id="dtReschedule" type="button">Reschedule</button>`
        : `<button class="btn ghost" id="dtMarkUnpaid" type="button">Mark as unpaid</button>`}
      <button class="btn ghost" id="dtEdit" type="button">Edit</button>
      <button class="btn danger-text" id="dtDelete" type="button">Delete</button>
    </div>
    ${historyRows.length ? `<div class="dt-history"><h4>History</h4>${historyRows.join("")}</div>` : ""}`;
  $("#dtViewDocument")?.addEventListener("click", () => openDocumentViewer(bill));
  $("#dtMarkPaid")?.addEventListener("click", () => { closeDetailSheet(); openPaidModal(bill); });
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
  if (bill) {
    addTombstone(bill.clientBillId || bill.id); queueDelete(bill.clientBillId || bill.id);
    if (bill.hasDocument) deleteBillDocument(bill.clientBillId);
  }
  saveBills();
  closeDetailSheet();
  render();
  scheduleSync();
}

// All real rows that belong to the same recurring bill. We match on seriesId
// AND on a biller+category signature, because seriesId can get reset to a row's
// own id after a sync if the server hasn't stored series_id — signature matching
// keeps "delete all occurrences" working regardless.
function billSignature(b) {
  return `${(b.biller || "").trim().toLowerCase()}|${b.category || ""}`;
}
function seriesMembers(bill) {
  if (!bill) return [];
  const sid = bill.seriesId;
  const sig = billSignature(bill);
  return state.bills.filter((b) => (sid && b.seriesId === sid) || billSignature(b) === sig);
}

// Delete just the current instance but keep the bill repeating: roll its due
// date forward to the next occurrence.
function skipOccurrence(id) {
  const bill = state.bills.find((b) => b.id === id);
  if (!bill) return;
  if (bill.recurrence === "once") { deleteBill(id); return; }
  const anchorDay = normalizeAnchorDay(bill.anchorDay, bill.dueDate);
  const next = advance(dateFromInput(bill.dueDate), RECURRENCE[bill.recurrence], anchorDay);
  bill.dueDate = formatDatePartsFromDate(next);
  bill.status = "unpaid";
  bill.paidAt = "";
  bill.remindedFor = [];
  bill.rescheduleNotes = "";
  if (bill.hasDocument) {
    deleteBillDocument(bill.clientBillId);
    bill.hasDocument = false;
  }
  markBillDirty(bill);
  closeDetailSheet();
  render();
  scheduleSync();
}

// Delete every occurrence of this recurring bill (past, present and future).
function deleteOccurrences(id) {
  const bill = state.bills.find((b) => b.id === id);
  if (!bill) return;
  const doomed = seriesMembers(bill);
  if (!doomed.length) { deleteBill(id); return; }
  const ids = new Set(doomed.map((b) => b.id));
  doomed.forEach((b) => {
    addTombstone(b.clientBillId || b.id); queueDelete(b.clientBillId || b.id);
    if (b.hasDocument) deleteBillDocument(b.clientBillId);
  });
  state.bills = state.bills.filter((b) => !ids.has(b.id));
  saveBills();
  closeDetailSheet();
  render();
  scheduleSync();
}

function openDeleteModal(bill) {
  state.deleteBillId = bill.id;
  const isRecurring = bill.recurrence !== "once";
  const members = seriesMembers(bill);
  const seriesCount = members.length;
  const recurLabel = (RECURRENCE[bill.recurrence]?.label || "").toLowerCase();

  const oneBtn = $("#deleteOneButton");
  const seriesBtn = $("#deleteSeriesButton");
  let message;

  if (isRecurring) {
    state.deleteMode = "recurring";
    message = `${escapeHtml(bill.biller)} repeats ${escapeHtml(recurLabel)}. Delete just this occurrence and it keeps repeating, or delete every occurrence to stop it for good.`;
    oneBtn.textContent = "Delete this occurrence";
    seriesBtn.hidden = false;
    seriesBtn.textContent = seriesCount > 1 ? `Delete all occurrences (${seriesCount})` : "Delete all occurrences";
  } else if (seriesCount > 1) {
    state.deleteMode = "single";
    message = `This is one of ${seriesCount} ${escapeHtml(bill.biller)} bills. Delete just this one, or all of them.`;
    oneBtn.textContent = "Delete this one";
    seriesBtn.hidden = false;
    seriesBtn.textContent = `Delete all (${seriesCount})`;
  } else {
    state.deleteMode = "single";
    message = `Delete ${escapeHtml(bill.biller)}? This removes it from this device and your account, and can't be undone.`;
    oneBtn.textContent = "Delete";
    seriesBtn.hidden = true;
  }

  $("#deleteModalText").innerHTML = message;
  $("#deleteModal").hidden = false;
}

function closeDeleteModal() {
  $("#deleteModal").hidden = true;
  state.deleteBillId = null;
  state.deleteSeriesId = null;
  state.deleteMode = "single";
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
  $("#closeDocViewerButton")?.addEventListener("click", closeDocumentViewer);
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
  $("#deleteOneButton")?.addEventListener("click", () => {
    const id = state.deleteBillId;
    const mode = state.deleteMode;
    closeDeleteModal();
    if (!id) return;
    if (mode === "recurring") skipOccurrence(id);
    else deleteBill(id);
  });
  $("#deleteSeriesButton")?.addEventListener("click", () => { const id = state.deleteBillId; closeDeleteModal(); if (id) deleteOccurrences(id); });
  $("#cancelDeleteButton")?.addEventListener("click", closeDeleteModal);
  $("#closeDeleteButton")?.addEventListener("click", closeDeleteModal);
}

function openPaidModal(bill) {
  state.paidBillId = bill.id;
  $("#paidDateInput").value = formatDatePartsFromDate(new Date());
  $("#paymentNotesInput").value = "";
  $("#paidStatus").textContent = `Confirm the date you paid ${bill.biller}.`;
  $("#paidModal").hidden = false;
}
function closePaidModal() { $("#paidModal").hidden = true; state.paidBillId = null; }

// Fetches a short-lived signed URL and shows the stored scan for a bill.
// Documents live in Supabase Storage (see functions/api/documents.js), so
// this works from any device or household member while the bill is unpaid.
// It can legitimately come back empty — e.g. offline, or already removed.
async function openDocumentViewer(bill) {
  const modal = $("#docViewerModal");
  const body = $("#docViewerBody");
  if (!modal || !body) return;
  $("#docViewerTitle").textContent = bill.fileName || "Scanned document";
  body.innerHTML = `<p class="muted">Loading\u2026</p>`;
  modal.hidden = false;
  state.docViewerBillId = bill.id;

  const url = await getBillDocumentUrl(bill.clientBillId);
  if (state.docViewerBillId !== bill.id) return; // superseded by a newer open
  if (!url) {
    body.innerHTML = `<p class="muted">This document isn't available right now. It may have already been removed, or you may be offline.</p>`;
    return;
  }

  const isPdf = /\.pdf$/i.test(bill.fileName || "");
  body.innerHTML = isPdf
    ? `<iframe src="${url}" class="doc-viewer-frame" title="Scanned bill"></iframe>`
    : `<img src="${url}" alt="Scanned bill" class="doc-viewer-img">`;
}

function closeDocumentViewer() {
  const modal = $("#docViewerModal");
  if (modal) modal.hidden = true;
  const body = $("#docViewerBody");
  if (body) body.innerHTML = "";
  state.docViewerBillId = null;
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
  // The scan is only needed while the bill is unpaid — remove it now so we
  // don't keep hold of financial documents longer than necessary.
  if (bill.hasDocument) {
    deleteBillDocument(bill.clientBillId);
    bill.hasDocument = false;
  }
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
    saveSettings(); renderMore(); scheduleSync(200);
  });
  $("#emailReminderToggle")?.addEventListener("change", (e) => {
    state.settings.emailReminders = e.target.checked;
    saveSettings(); updateEmailReminderHint(); scheduleSync(200);
  });
  $("#rowSyncNow")?.addEventListener("click", () => syncSupabase());
  $("#rowExport")?.addEventListener("click", exportBills);
  $("#rowImport")?.addEventListener("click", () => $("#importInput").click());
  $("#importInput")?.addEventListener("change", importBills);
  $("#rowHousehold")?.addEventListener("click", openHouseholdModal);
  $("#closeHouseholdButton")?.addEventListener("click", closeHouseholdModal);
  $("#rowAccount")?.addEventListener("click", openAccountModal);
  $("#closeAccountButton")?.addEventListener("click", closeAccountModal);
  $("#saveAccountButton")?.addEventListener("click", closeAccountModal);
  $("#rowLogout")?.addEventListener("click", () => { closeAccountModal(); logout(); });
  $("#clearBillsButton")?.addEventListener("click", () => {
    if (!confirm("Clear all bills? This removes them from this device and, once synced, your account.")) return;
    state.bills.forEach((b) => {
      addTombstone(b.clientBillId || b.id); queueDelete(b.clientBillId || b.id);
      if (b.hasDocument) deleteBillDocument(b.clientBillId);
    });
    state.bills = []; saveBills(); closeAccountModal(); render(); scheduleSync(200);
  });
  $("#accountNameInput")?.addEventListener("change", (e) => {
    state.settings.firstName = e.target.value.trim().slice(0, 40);
    state.settings.namePrompted = true;
    saveSettings(); renderMore(); scheduleSync(200);
  });

  if ($("#reminderLeadSelect")) $("#reminderLeadSelect").value = String(state.settings.reminderLeadDays);
  if ($("#emailReminderToggle")) $("#emailReminderToggle").checked = !!state.settings.emailReminders;
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
      if (Array.isArray(data.settings.customCategories)) {
        const byId = new Map(customCategories().map((c) => [c.id, c]));
        data.settings.customCategories.forEach((c) => { if (c && c.id && !byId.has(c.id)) byId.set(c.id, c); });
        state.settings.customCategories = Array.from(byId.values());
      }
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

/* ============ scanned document storage (Supabase Storage) ============ */
// Keeps a copy of the uploaded bill scan in a private Supabase Storage
// bucket via functions/api/documents.js, so it's viewable from any device or
// household member while the bill is unpaid, and deleted the moment it's
// marked paid. Requires the hosted Cloudflare backend (same as AI extract) —
// there is no local/offline fallback for document storage.

async function saveBillDocument(clientBillId, file) {
  if (!clientBillId || !file || !useCloudflareSync()) return false;
  try {
    const formData = new FormData();
    formData.append("file", file, file.name || "document");
    formData.append("clientBillId", clientBillId);
    formData.append("appInstanceId", state.settings.appInstanceId || "");
    formData.append("syncSecret", state.settings.syncSecret || "");
    const response = await cloudflareFileRequest("/api/documents", { method: "POST", body: formData });
    return response.ok;
  } catch {
    return false;
  }
}

// Returns a short-lived signed URL for viewing the document, or null if it
// isn't available (not stored, already deleted, or this device/session can't
// reach it).
async function getBillDocumentUrl(clientBillId) {
  if (!clientBillId || !useCloudflareSync()) return null;
  try {
    const params = new URLSearchParams({
      clientBillId,
      appInstanceId: state.settings.appInstanceId || "",
      syncSecret: state.settings.syncSecret || ""
    });
    const response = await cloudflareFileRequest(`/api/documents?${params.toString()}`);
    if (!response.ok) return null;
    const payload = await response.json().catch(() => null);
    return payload?.url || null;
  } catch {
    return null;
  }
}

async function deleteBillDocument(clientBillId) {
  if (!clientBillId || !useCloudflareSync()) return;
  try {
    await cloudflareFileRequest("/api/documents", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientBillId,
        appInstanceId: state.settings.appInstanceId || "",
        syncSecret: state.settings.syncSecret || ""
      })
    });
  } catch {
    // Best-effort: if this fails (e.g. offline), the server also purges any
    // document for a bill it receives marked as paid — see bills.js.
  }
}

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

// Same auth/retry behaviour as cloudflareSyncRequest, but doesn't force a
// Content-Type — needed for document uploads, which send FormData and must
// let the browser set its own multipart boundary.
async function cloudflareFileRequest(path, options = {}) {
  const send = () => fetch(path, {
    ...options,
    headers: {
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
    state.settings.lastSyncedAt = Date.now();
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
      customCategories: customCategories(),
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
  if (Array.isArray(settings.customCategories)) {
    const byId = new Map(customCategories().map((c) => [c.id, c]));
    settings.customCategories.forEach((c) => { if (c && c.id && !byId.has(c.id)) byId.set(c.id, c); });
    state.settings.customCategories = Array.from(byId.values());
  }
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
  if (state.view === "more") updateBackupRow();
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

// Known billers — recognising these gives an exact name AND the right category,
// which is what lets most statements skip the AI step entirely.
const BILLER_DICTIONARY = [
  { rx: /\bAGL\b/i, name: "AGL", cat: "utilities" },
  { rx: /origin energy/i, name: "Origin Energy", cat: "utilities" },
  { rx: /energy ?australia/i, name: "EnergyAustralia", cat: "utilities" },
  { rx: /\bred energy\b/i, name: "Red Energy", cat: "utilities" },
  { rx: /\balinta\b/i, name: "Alinta Energy", cat: "utilities" },
  { rx: /momentum energy/i, name: "Momentum Energy", cat: "utilities" },
  { rx: /powershop/i, name: "Powershop", cat: "utilities" },
  { rx: /simply energy/i, name: "Simply Energy", cat: "utilities" },
  { rx: /\bjemena\b/i, name: "Jemena", cat: "utilities_gas" },
  { rx: /australian gas networks|\bAGN\b/i, name: "Australian Gas Networks", cat: "utilities_gas" },
  { rx: /sydney water/i, name: "Sydney Water", cat: "utilities_water" },
  { rx: /yarra valley water/i, name: "Yarra Valley Water", cat: "utilities_water" },
  { rx: /south east water/i, name: "South East Water", cat: "utilities_water" },
  { rx: /greater western water|city west water/i, name: "Greater Western Water", cat: "utilities_water" },
  { rx: /\bunitywater\b/i, name: "Unitywater", cat: "utilities_water" },
  { rx: /\bsa water\b/i, name: "SA Water", cat: "utilities_water" },
  { rx: /telstra/i, name: "Telstra", cat: "telecom" },
  { rx: /optus/i, name: "Optus", cat: "telecom" },
  { rx: /vodafone/i, name: "Vodafone", cat: "telecom" },
  { rx: /\bTPG\b/i, name: "TPG", cat: "telecom" },
  { rx: /aussie ?broadband/i, name: "Aussie Broadband", cat: "telecom" },
  { rx: /\biinet\b/i, name: "iiNet", cat: "telecom" },
  { rx: /\bbelong\b/i, name: "Belong", cat: "telecom" },
  { rx: /\bdodo\b/i, name: "Dodo", cat: "telecom" },
  { rx: /amaysim/i, name: "amaysim", cat: "telecom" },
  { rx: /netflix/i, name: "Netflix", cat: "subscriptions" },
  { rx: /spotify/i, name: "Spotify", cat: "subscriptions" },
  { rx: /disney ?\+|disneyplus/i, name: "Disney+", cat: "subscriptions" },
  { rx: /\bstan\b/i, name: "Stan", cat: "subscriptions" },
  { rx: /amazon prime|prime video/i, name: "Amazon Prime", cat: "subscriptions" },
  { rx: /youtube premium/i, name: "YouTube Premium", cat: "subscriptions" },
  { rx: /apple\.com\/bill|apple music|icloud/i, name: "Apple", cat: "subscriptions" },
  { rx: /\bbinge\b/i, name: "Binge", cat: "subscriptions" },
  { rx: /\bkayo\b/i, name: "Kayo Sports", cat: "subscriptions" },
  { rx: /audible/i, name: "Audible", cat: "subscriptions" },
  { rx: /\bfoxtel\b/i, name: "Foxtel", cat: "subscriptions" },
  { rx: /microsoft 365|office 365/i, name: "Microsoft 365", cat: "subscriptions" },
  { rx: /\badobe\b/i, name: "Adobe", cat: "subscriptions" },
  { rx: /\bnib\b/i, name: "nib", cat: "insurance" },
  { rx: /\bbupa\b/i, name: "Bupa", cat: "insurance" },
  { rx: /medibank/i, name: "Medibank", cat: "insurance" },
  { rx: /\bahm\b/i, name: "ahm", cat: "insurance" },
  { rx: /\bnrma\b/i, name: "NRMA", cat: "insurance" },
  { rx: /\baami\b/i, name: "AAMI", cat: "insurance" },
  { rx: /\bracv\b/i, name: "RACV", cat: "insurance" },
  { rx: /\bracq\b/i, name: "RACQ", cat: "insurance" },
  { rx: /budget direct/i, name: "Budget Direct", cat: "insurance" },
  { rx: /allianz/i, name: "Allianz", cat: "insurance" },
  { rx: /\bqbe\b/i, name: "QBE", cat: "insurance" },
  { rx: /\bhcf\b/i, name: "HCF", cat: "insurance" },
  { rx: /rates notice|city council|shire council/i, name: "Council Rates", cat: "housing" },
  { rx: /strata|owners corporation|body corporate/i, name: "Strata", cat: "housing" }
];

const CATEGORY_KEYWORDS = [
  { cat: "utilities_water", rx: /\b(water usage|water charges|water account|sewerage|drainage|kilolitre|\bkL\b)/i },
  { cat: "utilities_gas", rx: /\b(natural gas|gas usage|gas charges|gas supply|megajoule|\bMJ\b)/i },
  { cat: "utilities", rx: /\b(electricity|\bkWh\b|kilowatt|energy charges|usage charges|peak usage|solar feed)/i },
  { cat: "telecom", rx: /\b(broadband|\bnbn\b|data allowance|mobile plan|sim card|internet plan)/i },
  { cat: "insurance", rx: /\b(premium|policy number|policy period|sum insured|excess|cover note)/i },
  { cat: "subscriptions", rx: /\b(subscription|monthly plan|renews on|membership)/i },
  { cat: "housing", rx: /\b(rent|mortgage|strata|body corporate|rates notice)/i },
  { cat: "health", rx: /\b(medical|dental|pharmacy|clinic|hospital)/i }
];

function inferCategory(normalized) {
  const hit = CATEGORY_KEYWORDS.find((k) => k.rx.test(normalized));
  return hit ? hit.cat : "";
}

function findBillerSmart(normalized) {
  const known = BILLER_DICTIONARY.find((b) => b.rx.test(normalized));
  return known ? { category: known.cat, known: true } : { category: "", known: false };
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
