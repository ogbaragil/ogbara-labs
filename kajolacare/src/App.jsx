import React, { useEffect, useMemo, useRef, useState } from 'react';
import { jsPDF } from 'jspdf';
import { supabase, isSupabaseConfigured, supabaseConfigSource } from './supabaseClient';

const STORAGE_KEY = 'lg_flow_pwa_v2_premium';
const TABS = ['Dashboard', 'Participants', 'Schedules', 'Workers', 'Invoices', 'Finance', 'Compliance', 'Reports', 'Settings'];
const TAB_LABELS = {
  Dashboard: 'Command Centre',
  Participants: 'Participants',
  Schedules: 'Operations',
  Workers: 'Workers',
  Invoices: 'Claims & Billing',
  Finance: 'Finance',
  Compliance: 'Compliance',
  Reports: 'Reports & Insights',
  Settings: 'Settings',
};
const DEFAULT_PRICING_ITEMS = [
  { id: 'selfcare-weekday-daytime', group: 'Self Care Supports', itemNumber: '01_011_0107_1_1', label: 'Assistance With Self-Care Activities - Standard - Weekday Daytime', unitType: 'Hour', rate: 70.23, archived: false },
  { id: 'selfcare-weekday-evening', group: 'Self Care Supports', itemNumber: '01_015_0107_1_1', label: 'Assistance With Self-Care Activities - Standard - Weekday Evening', unitType: 'Hour', rate: 77.38, archived: false },
  { id: 'selfcare-weekday-night', group: 'Self Care Supports', itemNumber: '01_002_0107_1_1', label: 'Assistance With Self-Care Activities - Standard - Weekday Night', unitType: 'Hour', rate: 78.81, archived: false },
  { id: 'selfcare-saturday', group: 'Self Care Supports', itemNumber: '01_013_0107_1_1', label: 'Assistance With Self-Care Activities - Standard - Saturday', unitType: 'Hour', rate: 98.83, archived: false },
  { id: 'selfcare-sunday', group: 'Self Care Supports', itemNumber: '01_014_0107_1_1', label: 'Assistance With Self-Care Activities - Standard - Sunday', unitType: 'Hour', rate: 127.43, archived: false },
  { id: 'selfcare-public-holiday', group: 'Self Care Supports', itemNumber: '01_012_0107_1_1', label: 'Assistance With Self-Care Activities - Standard - Public Holiday', unitType: 'Hour', rate: 156.03, archived: false },
  { id: 'community-weekday-daytime', group: 'Community Access', itemNumber: '04_104_0125_6_1', label: 'Access Community Social and Rec Activ - Standard - Weekday Daytime', unitType: 'Hour', rate: 70.23, archived: false },
  { id: 'community-weekday-evening', group: 'Community Access', itemNumber: '04_103_0125_6_1', label: 'Access Community Social and Rec Activ - Standard - Weekday Evening', unitType: 'Hour', rate: 77.38, archived: false },
  { id: 'community-saturday', group: 'Community Access', itemNumber: '04_105_0125_6_1', label: 'Access Community Social and Rec Activ - Standard - Saturday', unitType: 'Hour', rate: 98.83, archived: false },
  { id: 'community-sunday', group: 'Community Access', itemNumber: '04_106_0125_6_1', label: 'Access Community Social and Rec Activ - Standard - Sunday', unitType: 'Hour', rate: 127.43, archived: false },
  { id: 'community-public-holiday', group: 'Community Access', itemNumber: '04_102_0125_6_1', label: 'Access Community Social and Rec Activ - Standard - Public Holiday', unitType: 'Hour', rate: 156.03, archived: false },
  { id: 'transport-activity-based', group: 'Transport', itemNumber: '04_590_0125_6_1', label: 'Activity Based Transport', unitType: 'Each', rate: 1.00, archived: false },
  { id: 'establishment-community', group: 'Establishment Fees', itemNumber: '04_049_0125_1_1', label: 'Establishment Fee for Personal Care/Participation', unitType: 'Each', rate: 702.30, archived: false },
  { id: 'establishment-selfcare', group: 'Establishment Fees', itemNumber: '01_049_0107_1_1', label: 'Establishment Fee for Personal Care/Participation', unitType: 'Each', rate: 702.30, archived: false },
];

const DEFAULT_BUSINESS_COMPLIANCE = [
  { id: 'public-liability', group: 'Insurance', label: 'Public Liability Insurance', dueDate: '', notes: '' },
  { id: 'professional-indemnity', group: 'Insurance', label: 'Professional Indemnity Insurance', dueDate: '', notes: '' },
  { id: 'workers-insurance', group: 'Insurance', label: 'Workers Insurance', dueDate: '', notes: '' },
  { id: 'internal-audit', group: 'Audits', label: 'Internal Audit', dueDate: '', notes: '' },
  { id: 'external-audit', group: 'Audits', label: 'External Audit', dueDate: '', notes: '' },
  { id: 'ndis-audit', group: 'Audits', label: 'NDIS Audit', dueDate: '', notes: '' },
];

const DEFAULT_WORKER_COMPLIANCE_ITEMS = [
  { key: 'passportExpiry', label: 'Current Passport' },
  { key: 'driversLicenceExpiry', label: 'Aus Drivers Licence' },
  { key: 'visaExpiry', label: 'VISA', optional: true },
  { key: 'wwccExpiry', label: 'Working with Children Check' },
  { key: 'carInsuranceExpiry', label: 'Car Insurance' },
  { key: 'ndisWorkerScreeningExpiry', label: 'NDIS Worker Screening Check' },
  { key: 'cprExpiry', label: 'CPR' },
  { key: 'firstAidExpiry', label: 'FIRST AID' },
  { key: 'infectionPreventionExpiry', label: 'Infection Prev and control' },
  { key: 'complaintFeedbackExpiry', label: 'Complaint and Feedback Management' },
  { key: 'incidentManagementExpiry', label: 'Incident Management' },
  { key: 'emergencyDisasterExpiry', label: 'Emergency and Disaster Management' },
  { key: 'ahpraRegistrationExpiry', label: 'AHPRA Registration', optional: true },
  { key: 'ndisOrientationExpiry', label: 'NDIS Worker Orientation Program' },
];

const WORKER_COMPLIANCE_ALIASES = {
  passportExpiry: ['currentPassportExpiry', 'passport', 'currentPassport'],
  infectionPreventionExpiry: ['infectionPrevControlExpiry', 'infectionPreventionControlExpiry', 'infectionPrevAndControlExpiry', 'infectionControlExpiry'],
  ahpraRegistrationExpiry: ['ahpraExpiry', 'ahpraRegistration'],
  visaExpiry: ['visa', 'visaExpiryDate'],
};
const normaliseWorker = (worker = {}) => {
  const next = { ...emptyWorker(), ...worker };
  Object.entries(WORKER_COMPLIANCE_ALIASES).forEach(([key, aliases]) => {
    if (!next[key]) {
      const found = aliases.map(alias => worker?.[alias]).find(Boolean);
      if (found) next[key] = found;
    }
  });
  return next;
};
const normaliseWorkers = (workers = []) => Array.isArray(workers) ? workers.map(normaliseWorker).filter(worker => !isLegacyTemplateWorker(worker)) : [];
const EMPTY_BUSINESS = {
  name: '',
  abn: '',
  email: '',
  phone: '',
  address: '',
  paymentDetails: '',
  logoUrl: '',
  pricingItems: DEFAULT_PRICING_ITEMS,
  businessCompliance: DEFAULT_BUSINESS_COMPLIANCE,
};
const getPricingItems = (business) => {
  const source = Array.isArray(business?.pricingItems) && business.pricingItems.length ? business.pricingItems : DEFAULT_PRICING_ITEMS;
  return source.map((item, idx) => ({
    id: item.id || item.itemNumber || `pricing_${idx}`,
    group: item.group || 'Custom Items',
    itemNumber: item.itemNumber || '',
    label: item.label || item.name || 'Untitled support item',
    unitType: item.unitType || item.unit || 'Hour',
    rate: Number(item.rate || 0),
    archived: Boolean(item.archived),
  }));
};
const getActivePricingItems = (business) => getPricingItems(business).filter(item => !item.archived);

const getBusinessComplianceItems = (business) => {
  const source = Array.isArray(business?.businessCompliance) && business.businessCompliance.length ? business.businessCompliance : DEFAULT_BUSINESS_COMPLIANCE;
  return source.map((item, idx) => ({
    id: item.id || `business_compliance_${idx}`,
    group: item.group || 'Business Compliance',
    label: item.label || 'Compliance item',
    dueDate: item.dueDate || '',
    notes: item.notes || '',
  }));
};
const normaliseBusiness = (business = {}) => {
  const merged = { ...EMPTY_BUSINESS, ...(business || {}) };
  return {
    ...merged,
    pricingItems: getPricingItems(merged),
    businessCompliance: getBusinessComplianceItems(merged),
  };
};
const SECTION_KEYS = ['business', 'clients', 'invoices', 'transactions', 'workers', 'shifts', 'risks', 'incidents', 'complaints', 'improvements', 'audits', 'auditReports', 'governanceReviews', 'documents'];
const sectionUpdatedAt = (payload, section) => payload?._meta?.sectionsUpdatedAt?.[section] || '';
const isMeaningfulBusiness = (business = {}) => {
  const b = normaliseBusiness(business);
  const hasProfile = ['name', 'abn', 'email', 'phone', 'address', 'paymentDetails', 'logoUrl'].some(key => String(b[key] || '').trim());
  const hasPricing = JSON.stringify(getPricingItems(b)) !== JSON.stringify(getPricingItems({ pricingItems: DEFAULT_PRICING_ITEMS }));
  const hasCompliance = JSON.stringify(getBusinessComplianceItems(b)) !== JSON.stringify(getBusinessComplianceItems({ businessCompliance: DEFAULT_BUSINESS_COMPLIANCE }));
  return hasProfile || hasPricing || hasCompliance;
};
const isMeaningfulSection = (payload = {}, section) => {
  if (section === 'business') return isMeaningfulBusiness(payload.business);
  return Array.isArray(payload[section]) && payload[section].length > 0;
};
const normaliseMeta = (payload = {}) => ({
  ...(payload._meta || {}),
  schemaVersion: 2,
  sectionsUpdatedAt: { ...(payload._meta?.sectionsUpdatedAt || {}) },
});
const normaliseTransactions = (transactions = [], business = {}) => Array.isArray(transactions) ? transactions.map(txn => (txn?.clientId === BUSINESS_TXN_CLIENT_ID ? { ...txn, clientName: txn.clientName || business?.name || 'Business' } : txn)) : [];

const normaliseShifts = (rows = []) => Array.isArray(rows) ? rows.filter(row => row && typeof row === 'object').map(row => ({
  id: row.id || makeId('shift'),
  workerId: row.workerId || '',
  participantId: row.participantId || row.clientId || '',
  date: row.date || todayISO(),
  startTime: row.startTime || '09:00',
  endTime: row.endTime || '11:00',
  location: row.location || row.address || '',
  supportType: row.supportType || row.serviceType || 'Personal care',
  status: row.status || 'Scheduled',
  startedAt: row.startedAt || '',
  endedAt: row.endedAt || '',
  notes: row.notes || '',
  adminNotes: row.adminNotes || '',
  reviewStatus: row.reviewStatus || 'Not reviewed',
  payrollStatus: row.payrollStatus || 'Not generated',
  invoiceStatus: row.invoiceStatus || 'Not generated',
  ...row,
})) : [];

const normalisePayload = (payload = {}) => {
  const normalisedBusiness = normaliseBusiness(payload.business || {});
  return {
    business: normalisedBusiness,
    clients: Array.isArray(payload.clients) ? payload.clients : [],
    invoices: Array.isArray(payload.invoices) ? payload.invoices : [],
    transactions: normaliseTransactions(payload.transactions, normalisedBusiness),
    workers: normaliseWorkers(payload.workers || []),
    shifts: normaliseShifts(payload.shifts || []),
    risks: Array.isArray(payload.risks) ? payload.risks : [],
    incidents: Array.isArray(payload.incidents) ? payload.incidents : [],
    complaints: Array.isArray(payload.complaints) ? payload.complaints : [],
    improvements: Array.isArray(payload.improvements) ? payload.improvements : [],
    audits: Array.isArray(payload.audits) ? payload.audits : [],
    auditReports: Array.isArray(payload.auditReports) ? payload.auditReports : [],
    governanceReviews: Array.isArray(payload.governanceReviews) ? payload.governanceReviews : [],
    documents: Array.isArray(payload.documents) ? payload.documents : [],
    _meta: normaliseMeta(payload),
  };
};
const stripMeta = (payload = {}) => {
  const p = normalisePayload(payload);
  return { business: p.business, clients: p.clients, invoices: p.invoices, transactions: p.transactions, workers: p.workers, shifts: p.shifts, risks: p.risks, incidents: p.incidents, complaints: p.complaints, improvements: p.improvements, audits: p.audits, auditReports: p.auditReports, governanceReviews: p.governanceReviews, documents: p.documents };
};
const mergePayloads = (localPayload = {}, cloudPayload = {}) => {
  const local = normalisePayload(localPayload);
  const cloud = normalisePayload(cloudPayload);
  const merged = {};
  const sectionsUpdatedAt = {};
  SECTION_KEYS.forEach(section => {
    const lt = sectionUpdatedAt(local, section);
    const ct = sectionUpdatedAt(cloud, section);
    const localMeaningful = isMeaningfulSection(local, section);
    const cloudMeaningful = isMeaningfulSection(cloud, section);
    let useLocal;
    if (lt && ct && lt !== ct) useLocal = lt > ct;
    else if (lt && !ct) useLocal = localMeaningful || !cloudMeaningful;
    else if (!lt && ct) useLocal = localMeaningful && !cloudMeaningful;
    else useLocal = localMeaningful && !cloudMeaningful;
    merged[section] = useLocal ? local[section] : cloud[section];
    sectionsUpdatedAt[section] = useLocal ? (lt || new Date().toISOString()) : (ct || lt || '');
  });
  return normalisePayload({ ...merged, _meta: { ...cloud._meta, ...local._meta, sectionsUpdatedAt } });
};
const getComplianceStatus = (dateStr) => {
  const d = daysUntil(dateStr);
  if (d === null) return { label: 'Missing', tone: 'missing', days: null, sort: 3 };
  if (d < 0) return { label: 'Overdue', tone: 'overdue', days: d, sort: 0 };
  if (d <= 30) return { label: 'Due soon', tone: 'due', days: d, sort: 1 };
  return { label: 'Current', tone: 'current', days: d, sort: 2 };
};
const statusSummary = (dateStr) => {
  const s = getComplianceStatus(dateStr);
  if (s.days === null) return 'No date set';
  if (s.days < 0) return `${Math.abs(s.days)} day${Math.abs(s.days) === 1 ? '' : 's'} overdue`;
  return `${s.days} day${s.days === 1 ? '' : 's'} left`;
};

const MELBOURNE_TZ = 'Australia/Melbourne';
const melbourneParts = (value = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-AU', { timeZone: MELBOURNE_TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false }).formatToParts(value);
  return Object.fromEntries(parts.filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
};
const todayISO = () => { const p = melbourneParts(); return `${p.year}-${p.month}-${p.day}`; };
const addDaysISO = (days) => { const p = melbourneParts(); const d = new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day) + days, 12)); return d.toISOString().slice(0, 10); };
const makeId = (p) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const money = (v) => `$${Number(v || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmt = (d) => d ? new Intl.DateTimeFormat('en-AU', { timeZone: MELBOURNE_TZ, month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${d}T12:00:00`)) : '-';
const fmtWeekday = (d) => d ? new Intl.DateTimeFormat('en-AU', { timeZone: MELBOURNE_TZ, weekday: 'short' }).format(new Date(`${d}T12:00:00`)) : '-';
const fmtMelbourneTime = (iso) => iso ? new Intl.DateTimeFormat('en-AU', { timeZone: MELBOURNE_TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : '—';
const fmtMelbourneDateTime = (iso) => iso ? new Intl.DateTimeFormat('en-AU', { timeZone: MELBOURNE_TZ, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)) : '—';
const melbourneHour = () => Number(melbourneParts().hour || 0);
const hoursBetween = (start, end) => {
  if (!start || !end) return 0;
  const [sh, sm] = String(start).split(':').map(Number);
  const [eh, em] = String(end).split(':').map(Number);
  if ([sh, sm, eh, em].some(n => Number.isNaN(n))) return 0;
  const minutes = ((eh * 60 + em) - (sh * 60 + sm));
  return Math.max(0, minutes / 60);
};
const getFirstName = (user) => {
  const source = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'there';
  const first = String(source).trim().split(/[\s._-]+/).filter(Boolean)[0] || 'there';
  return first === 'there' ? first : first.charAt(0).toUpperCase() + first.slice(1);
};
const getTimeGreeting = () => {
  const hour = melbourneHour();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};
const buildWelcomeMessage = (user) => `${getTimeGreeting()}, ${getFirstName(user)}`;
const daysUntil = (dateStr) => { if (!dateStr) return null; const end = new Date(`${dateStr}T00:00:00`); if (Number.isNaN(end.getTime())) return null; return Math.ceil((end - new Date()) / 86400000); };
const fileToDataUrl = (file) => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
const safeText = (value) => String(value ?? '');
const emptyClient = { name: '', ndisNumber: '', email: '', phone: '', address: '', planStartDate: '', planEndDate: '', budget: '', consentExpiry: '', agreementExpiry: '', riskReviewDate: '', complianceNotes: '' };
const emptyLine = () => { const item = DEFAULT_PRICING_ITEMS[0]; return { id: makeId('line'), itemCode: item.itemNumber, itemLabel: item.label, serviceDate: todayISO(), unitType: item.unitType, quantity: '1', rate: String(item.rate), notes: '' }; };
const emptyInvoice = () => ({ clientId: '', dueDate: addDaysISO(7), notes: '', lines: [emptyLine()] });
const emptyTxn = { clientId: '', type: 'expense', status: 'pending', category: '', description: '', amount: '', date: todayISO() };
const emptyWorker = () => Object.fromEntries([['id', makeId('worker')], ['name', ''], ['role', ''], ['email', ''], ['phone', ''], ['employeeUsername', ''], ['employeePasswordHash', ''], ['temporaryPassword', ''], ['mustChangePassword', false], ['loginEnabled', true], ['lastPasswordResetAt', ''], ['notes', ''], ...DEFAULT_WORKER_COMPLIANCE_ITEMS.map(item => [item.key, ''])]);

const parseShiftStartMs = (shift) => {
  if (!shift?.date || !shift?.startTime) return NaN;
  const ms = new Date(`${shift.date}T${shift.startTime}`).getTime();
  return Number.isNaN(ms) ? NaN : ms;
};
const canStartShiftNow = (shift, nowMs = Date.now()) => {
  const startMs = parseShiftStartMs(shift);
  if (Number.isNaN(startMs)) return { ok: false, reason: 'Shift start time is missing.' };
  const diff = startMs - nowMs;
  const sixHours = 6 * 60 * 60 * 1000;
  if (diff > sixHours) return { ok: false, reason: `Start opens 6 hours before shift commencement. Available from ${fmtMelbourneDateTime(new Date(startMs - sixHours).toISOString())}.` };
  return { ok: true, reason: 'Start available.' };
};

const emptyShift = () => ({ id: makeId('shift'), workerId: '', participantId: '', date: todayISO(), startTime: '09:00', endTime: '11:00', location: '', supportType: 'Personal care', status: 'Scheduled', startedAt: '', endedAt: '', notes: '', adminNotes: '' });
const INVOICE_STATUSES = ['Draft', 'Pending', 'Paid', 'Cancelled'];
const BUSINESS_TXN_CLIENT_ID = '__business__';
const LEGACY_WORKER_TEMPLATE_NAMES = new Set([
  ...DEFAULT_WORKER_COMPLIANCE_ITEMS.map(item => item.label.toLowerCase()),
  'infection control',
  'infection prevention and control',
  'manual handling',
  'medication training',
  'police check',
  'worker screening',
  'working with children check',
  'jhk',
]);
const hasWorkerComplianceData = (worker = {}) => DEFAULT_WORKER_COMPLIANCE_ITEMS.some(item => Boolean(worker?.[item.key]));
const isLegacyTemplateWorker = (worker = {}) => {
  const name = String(worker?.name || '').trim().toLowerCase();
  if (!name || !LEGACY_WORKER_TEMPLATE_NAMES.has(name)) return false;
  const hasProfile = ['role', 'email', 'phone', 'notes'].some(key => String(worker?.[key] || '').trim());
  return !hasProfile && !hasWorkerComplianceData(worker);
};
const normaliseInvoiceStatus = (status) => {
  const value = String(status || '').toLowerCase();
  if (value === 'paid') return 'Paid';
  if (value === 'cancelled' || value === 'canceled') return 'Cancelled';
  if (value === 'draft') return 'Draft';
  return 'Pending';
};
async function syncSnapshot(payload, user) {
  if (!supabase) return { ok: false, message: 'Cloud sync is not configured.' };
  if (!user?.id) return { ok: false, message: 'Please sign in first.' };
  // Resolve the LIVE authenticated user. RLS on app_snapshots requires the row's
  // user_id to equal auth.uid(); if the session token has expired, the React `user`
  // can be stale while auth.uid() is null, which causes "new row violates RLS policy".
  let authId = user.id;
  try {
    const { data: authData } = await supabase.auth.getUser();
    if (authData?.user?.id) {
      authId = authData.user.id;
    } else {
      // Try to refresh an expired session before giving up.
      const { data: refreshed } = await supabase.auth.refreshSession();
      if (refreshed?.user?.id) authId = refreshed.user.id;
      else return { ok: false, message: 'Your session has expired. Please sign out and sign in again to sync.' };
    }
  } catch {
    return { ok: false, message: 'Could not verify your session. Please sign in again to sync.' };
  }
  const safePayload = normalisePayload(payload);
  const { error } = await supabase.from('app_snapshots').upsert({
    id: authId,
    user_id: authId,
    payload: safePayload,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });
  if (error) {
    const msg = /row-level security/i.test(error.message || '')
      ? 'Cloud sync was blocked by a security policy. Please sign out and sign in again; if it persists, re-run the latest database schema in Supabase.'
      : error.message;
    return { ok: false, message: msg };
  }
  return { ok: true, message: 'Cloud sync complete.' };
}
async function loadSnapshot(user) {
  if (!supabase) return { ok: false, message: 'Cloud sync is not configured.' };
  if (!user?.id) return { ok: false, message: 'Please sign in first.' };
  const { data, error } = await supabase.from('app_snapshots').select('payload').eq('id', user.id).single();
  if (error) {
    if (error.code === 'PGRST116') return { ok: true, payload: null, message: 'No cloud profile found yet.' };
    return { ok: false, message: error.message };
  }
  return { ok: true, payload: data?.payload };
}
const storageKeyFor = (user) => user?.id ? `${STORAGE_KEY}_${user.id}` : STORAGE_KEY;
const EMPLOYEE_SESSION_KEY = 'kajola_employee_portal_session_v1';
const employeePasswordHash = (value = '') => {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < String(value).length; i++) {
    const ch = String(value).charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${(h2 >>> 0).toString(36)}${(h1 >>> 0).toString(36)}`;
};
const normaliseUsername = (value = '') => String(value || '').trim().toLowerCase();
const employeeLoginEnabled = (worker = {}) => worker.loginEnabled !== false && Boolean(normaliseUsername(worker.employeeUsername || worker.username));
const findEmployeeLogin = async (username, password) => {
  const u = normaliseUsername(username);
  const hash = employeePasswordHash(password);
  if (!u || !password) return { ok: false, message: 'Enter your username and password.' };

  // Production path: load the employee profile and assigned shifts directly from Supabase.
  // This lets workers sign in from their own phone/device without the admin signing in first.
  if (supabase) {
    try {
      const { data, error } = await supabase.rpc('employee_portal_login', { p_username: u, p_password_hash: hash });
      if (!error && data?.ok) {
        const payload = normalisePayload(data.payload || {});
        return { ok: true, session: { workerId: data.worker_id, username: u, passwordHash: hash, cloud: true, signedInAt: new Date().toISOString() }, payload };
      }
      if (!error && data && data.ok === false) return { ok: false, message: data.message || 'Employee sign in failed.' };
      // If the RPC is not installed yet, fall back to this device and tell admin what to run.
      if (error && !String(error.message || '').toLowerCase().includes('employee_portal_login')) {
        return { ok: false, message: error.message };
      }
    } catch {}
  }

  // Local fallback for preview/demo only.
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (!key || !key.startsWith(STORAGE_KEY)) continue;
    try {
      const payload = normalisePayload(JSON.parse(window.localStorage.getItem(key) || '{}'));
      const worker = payload.workers.find(w => employeeLoginEnabled(w) && normaliseUsername(w.employeeUsername || w.username) === u);
      if (!worker) continue;
      if ((worker.employeePasswordHash || worker.passwordHash) !== hash) return { ok: false, message: 'Password is incorrect.' };
      return { ok: true, session: { workerId: worker.id, ownerStorageKey: key, username: u, passwordHash: hash, signedInAt: new Date().toISOString() }, payload };
    } catch {}
  }
  return { ok: false, message: supabase ? 'Employee login service is not set up yet. Ask your administrator to enable cloud sync, then sync the admin workspace.' : 'Employee username was not found on this device.' };
};

const refreshEmployeePortal = async (session) => {
  if (!session?.cloud || !supabase) return { ok: false, message: 'Cloud employee session unavailable.' };
  const { data, error } = await supabase.rpc('employee_portal_login', { p_username: session.username, p_password_hash: session.passwordHash });
  if (error) return { ok: false, message: error.message };
  if (!data?.ok) return { ok: false, message: data?.message || 'Employee session expired.' };
  return { ok: true, payload: normalisePayload(data.payload || {}), workerId: data.worker_id };
};

const updateEmployeeShiftCloud = async (session, shiftId, patch) => {
  if (!session?.cloud || !supabase) return { ok: false, message: 'Cloud employee session unavailable.' };
  const { data, error } = await supabase.rpc('employee_portal_update_shift', {
    p_username: session.username,
    p_password_hash: session.passwordHash,
    p_worker_id: session.workerId,
    p_shift_id: shiftId,
    p_patch: patch || {},
  });
  if (error) return { ok: false, message: error.message };
  if (!data?.ok) return { ok: false, message: data?.message || 'Shift update failed.' };
  return { ok: true, payload: normalisePayload(data.payload || {}) };
};

export default function App() {
  const [active, setActive] = useState('Dashboard');
  const [complianceSection, setComplianceSection] = useState('Employees');
  const [focusWorker, setFocusWorker] = useState(null);
  const [clients, setClients] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [risks, setRisks] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [improvements, setImprovements] = useState([]);
  const [audits, setAudits] = useState([]);
  const [auditReports, setAuditReports] = useState([]);
  const [governanceReviews, setGovernanceReviews] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [business, setBusiness] = useState(EMPTY_BUSINESS);
  const [clientForm, setClientForm] = useState(emptyClient);
  const [invoiceForm, setInvoiceForm] = useState(emptyInvoice());
  const [txnForm, setTxnForm] = useState(emptyTxn);
  const [editingClient, setEditingClient] = useState(null);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [editingTxn, setEditingTxn] = useState(null);
  const [notice, setNotice] = useState('');
  const [theme, setTheme] = useState(() => localStorage.getItem('lg_flow_theme') || 'light');
  const [user, setUser] = useState(null);
  const [employeeSession, setEmployeeSession] = useState(() => { try { return JSON.parse(localStorage.getItem(EMPLOYEE_SESSION_KEY) || 'null'); } catch { return null; } });
  const [authLoading, setAuthLoading] = useState(true);
  const [storageLoaded, setStorageLoaded] = useState(false);
  const [cloudChecked, setCloudChecked] = useState(false);
  const [cloudLoading, setCloudLoading] = useState(false);
  const autoSyncTimer = useRef(null);
  const lastCloudSnapshotRef = useRef('');
  const lastLocalSnapshotRef = useRef('');
  const lastSectionSnapshotsRef = useRef({});
  const sectionUpdatedAtRef = useRef({});
  const skipNextAutoSyncRef = useRef(false);
  const isEmployeeRoute = ['employee', 'employee-portal', 'worker', 'staff'].includes(String(window.location.pathname || '').replace(/^\/+/, '').split('/')[0]);

  useEffect(() => {
    let mounted = true;
    if (!supabase) { setAuthLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => { if (mounted) { setUser(data.session?.user || null); setAuthLoading(false); } });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => { setUser(session?.user || null); });
    return () => { mounted = false; listener?.subscription?.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!employeeSession?.workerId || user?.id) return;
    let cancelled = false;
    async function loadEmployeeSession() {
      try {
        if (employeeSession.cloud) {
          const result = await refreshEmployeePortal(employeeSession);
          if (cancelled) return;
          if (result.ok) {
            applyPayload(result.payload);
            setEmployeeSession(prev => ({ ...prev, workerId: result.workerId || prev.workerId }));
            setStorageLoaded(true);
            setCloudChecked(true);
            return;
          }
          localStorage.removeItem(EMPLOYEE_SESSION_KEY);
          setEmployeeSession(null);
          return;
        }
        if (employeeSession.ownerStorageKey) {
          const raw = localStorage.getItem(employeeSession.ownerStorageKey);
          if (raw) { applyPayload(JSON.parse(raw)); setStorageLoaded(true); setCloudChecked(true); }
          else { localStorage.removeItem(EMPLOYEE_SESSION_KEY); setEmployeeSession(null); }
        }
      } catch {
        localStorage.removeItem(EMPLOYEE_SESSION_KEY);
        setEmployeeSession(null);
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    }
    loadEmployeeSession();
    return () => { cancelled = true; };
  }, [employeeSession?.workerId, employeeSession?.cloud, employeeSession?.ownerStorageKey, user?.id]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('lg_flow_theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  const updateSectionTracking = (data, { stampChanges = false } = {}) => {
    const clean = stripMeta(data);
    const now = new Date().toISOString();
    SECTION_KEYS.forEach(section => {
      const serial = JSON.stringify(clean[section]);
      if (lastSectionSnapshotsRef.current[section] !== serial) {
        if (stampChanges) sectionUpdatedAtRef.current[section] = now;
        lastSectionSnapshotsRef.current[section] = serial;
      }
    });
  };

  const applyPayload = (d) => {
    const next = normalisePayload(d);
    sectionUpdatedAtRef.current = { ...(next._meta?.sectionsUpdatedAt || sectionUpdatedAtRef.current) };
    updateSectionTracking(next, { stampChanges: false });
    setBusiness(next.business);
    setClients(next.clients);
    setInvoices(next.invoices);
    setTransactions(next.transactions);
    setWorkers(next.workers);
    setShifts(next.shifts);
    setRisks(next.risks);
    setIncidents(next.incidents);
    setComplaints(next.complaints);
    setImprovements(next.improvements);
    setAudits(next.audits);
    setAuditReports(next.auditReports);
    setGovernanceReviews(next.governanceReviews);
    setDocuments(next.documents);
  };

  const currentPayload = () => normalisePayload({ business, clients, invoices, transactions, workers, shifts, risks, incidents, complaints, improvements, audits, auditReports, governanceReviews, documents, _meta: { sectionsUpdatedAt: sectionUpdatedAtRef.current } });
  const serialisePayload = (data) => JSON.stringify(normalisePayload(data || currentPayload()));
  const payloadWithFreshMeta = () => {
    const data = currentPayload();
    updateSectionTracking(data, { stampChanges: !cloudLoading });
    return normalisePayload({ ...stripMeta(data), _meta: { sectionsUpdatedAt: sectionUpdatedAtRef.current } });
  };

  useEffect(() => {
    if (authLoading || !user?.id || employeeSession?.workerId) return;
    let cancelled = false;
    async function loadAdminWorkspaceOnSignIn() {
      setStorageLoaded(false);
      setCloudChecked(false);
      setCloudLoading(true);
      const emptyWorkspace = { business: EMPTY_BUSINESS, clients: [], invoices: [], transactions: [], workers: [], shifts: [], risks: [], incidents: [], complaints: [], improvements: [], audits: [], auditReports: [], governanceReviews: [], documents: [], _meta: { sectionsUpdatedAt: {} } };
      try {
        let loaded = null;
        if (supabase) {
          const cloud = await loadSnapshot(user);
          if (cloud.ok && cloud.payload) loaded = normalisePayload(cloud.payload);
        }
        if (!loaded) {
          const raw = localStorage.getItem(storageKeyFor(user));
          loaded = raw ? normalisePayload(JSON.parse(raw)) : normalisePayload(emptyWorkspace);
        }
        if (cancelled) return;
        lastCloudSnapshotRef.current = loaded ? serialisePayload(loaded) : '';
        lastLocalSnapshotRef.current = '';
        applyPayload(loaded || emptyWorkspace);
      } catch {
        if (!cancelled) applyPayload(emptyWorkspace);
      } finally {
        if (!cancelled) {
          setStorageLoaded(true);
          setCloudChecked(true);
          setCloudLoading(false);
        }
      }
    }
    loadAdminWorkspaceOnSignIn();
    return () => { cancelled = true; };
  }, [authLoading, user?.id]);

  useEffect(() => {
    if (!storageLoaded || (!user?.id && !employeeSession?.ownerStorageKey)) return;
    const data = payloadWithFreshMeta();
    const snapshot = serialisePayload(data);
    if (snapshot === lastLocalSnapshotRef.current) return;
    lastLocalSnapshotRef.current = snapshot;
    localStorage.setItem(employeeSession?.ownerStorageKey || storageKeyFor(user), snapshot);
  }, [storageLoaded, user?.id, business, clients, invoices, transactions, workers, shifts, risks, incidents, complaints, improvements, audits, auditReports, governanceReviews, documents]);

  // Admin workspace loads from Supabase on sign-in, but admin edits do not auto-backup.
  // Use Settings > Sync to Supabase when the admin intentionally wants to publish workspace changes.

  const loadCloudData = async ({ silent = false } = {}) => {
    if (!user?.id) return { ok: false, message: 'Please sign in first.' };
    setCloudLoading(true);
    try {
      const r = await loadSnapshot(user);
      if (r.ok && r.payload) {
        const nextPayload = mergePayloads(payloadWithFreshMeta(), r.payload);
        lastCloudSnapshotRef.current = serialisePayload(nextPayload);
        lastLocalSnapshotRef.current = '';
        applyPayload(nextPayload);
        if (!silent) showNotice('Cloud data loaded onto this device. Admin changes stay on this device until you sync to the cloud.');
      } else if (!silent) {
        showNotice(r.message || 'No cloud data found yet.');
      }
      return r;
    } finally {
      setCloudLoading(false);
    }
  };

  const totals = useMemo(() => {
    const income = transactions.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount || 0), 0);
    const expenses = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount || 0), 0);
    const outstanding = invoices.filter(i => !['Paid', 'Cancelled'].includes(normaliseInvoiceStatus(i.status))).reduce((s, i) => s + Number(i.total || 0), 0);
    const activeClients = clients.filter(c => c && !c.archived);
    const totalBudget = activeClients.reduce((s, c) => s + Number(c.budget || 0), 0);
    const invoicedTotal = invoices.reduce((s, i) => s + Number(i.total || 0), 0);
    const remainingBudget = totalBudget - invoicedTotal;
    const expiringPlans = activeClients.filter(c => { const d = daysUntil(c.planEndDate); return d !== null && d >= 0 && d <= 30; }).length;
    return { activeClients: activeClients.length, invoices: invoices.length, income, expenses, net: income - expenses, outstanding, totalBudget, invoicedTotal, remainingBudget, expiringPlans };
  }, [clients, invoices, transactions]);

  const payload = currentPayload();
  const pricingItems = useMemo(() => getActivePricingItems(business), [business]);
  const showNotice = (message) => { setNotice(message); setTimeout(() => setNotice(''), 4200); };


  // Publish worker/employee changes (e.g. password reset) to the cloud immediately,
  // so employee-portal logins authenticate against the updated credentials.
  const publishWorkers = async (nextWorkers) => {
    const cleanWorkers = normaliseWorkers(nextWorkers || workers);
    if (!user?.id || !supabase) {
      showNotice('Saved locally. Connect cloud sync so employees can sign in from their own devices.');
      return { ok: false, message: 'Cloud sync is not configured.' };
    }
    try {
      const cloud = await loadSnapshot(user);
      const base = cloud.ok && cloud.payload ? normalisePayload(cloud.payload) : currentPayload();
      const nextPayload = normalisePayload({
        ...base,
        workers: cleanWorkers,
        _meta: { sectionsUpdatedAt: { ...(base._meta?.sectionsUpdatedAt || {}), workers: new Date().toISOString() } }
      });
      const r = await syncSnapshot(nextPayload, user);
      if (r.ok) {
        lastCloudSnapshotRef.current = serialisePayload(nextPayload);
        showNotice('Employee login updated. The worker can now sign in with their new password.');
      } else {
        showNotice(`Saved locally, but cloud update failed: ${r.message}. Employees may not be able to sign in until you Sync to Cloud.`);
      }
      return r;
    } catch (error) {
      const msg = error?.message || 'Unknown error';
      showNotice(`Saved locally, but cloud update failed: ${msg}.`);
      return { ok: false, message: msg };
    }
  };

  const publishScheduleChanges = async ({ nextShifts, nextInvoices = invoices, message = 'Schedule changes published to employee portal.' } = {}) => {
    const cleanShifts = normaliseShifts(nextShifts || shifts);
    const cleanInvoices = Array.isArray(nextInvoices) ? nextInvoices : invoices;
    if (!user?.id || !supabase) {
      showNotice('Schedule saved locally. Cloud sync is not configured for employee portal publishing.');
      return { ok: false, message: 'Cloud sync is not configured.' };
    }
    try {
      const cloud = await loadSnapshot(user);
      const base = cloud.ok && cloud.payload ? normalisePayload(cloud.payload) : currentPayload();
      const nextPayload = normalisePayload({
        ...base,
        business,
        clients,
        workers,
        shifts: cleanShifts,
        invoices: cleanInvoices,
        _meta: { sectionsUpdatedAt: { ...(base._meta?.sectionsUpdatedAt || {}), shifts: new Date().toISOString(), invoices: new Date().toISOString(), workers: new Date().toISOString(), clients: new Date().toISOString() } }
      });
      const r = await syncSnapshot(nextPayload, user);
      if (r.ok) {
        lastCloudSnapshotRef.current = serialisePayload(nextPayload);
        showNotice(message);
      } else {
        showNotice(`Schedule saved locally, but cloud publish failed: ${r.message}`);
      }
      return r;
    } catch (error) {
      const msg = error?.message || 'Unknown error';
      showNotice(`Schedule saved locally, but cloud publish failed: ${msg}`);
      return { ok: false, message: msg };
    }
  };

  const saveClient = () => {
    if (!clientForm.name.trim()) return alert('Please enter the client name.');
    if (editingClient) setClients(prev => prev.map(c => c.id === editingClient ? { ...c, ...clientForm, updatedAt: new Date().toISOString() } : c));
    else setClients(prev => [{ id: makeId('client'), archived: false, createdAt: new Date().toISOString(), ...clientForm }, ...prev]);
    setClientForm(emptyClient); setEditingClient(null); showNotice('Client profile saved.');
  };
  const editClient = (c) => { setClientForm({ name: c.name || '', ndisNumber: c.ndisNumber || '', email: c.email || '', phone: c.phone || '', address: c.address || '', planStartDate: c.planStartDate || '', planEndDate: c.planEndDate || '', budget: String(c.budget ?? ''), consentExpiry: c.consentExpiry || '', agreementExpiry: c.agreementExpiry || '', riskReviewDate: c.riskReviewDate || '', complianceNotes: c.complianceNotes || '' }); setEditingClient(c.id); setActive('Participants'); window.scrollTo(0, 0); };
  const archiveClient = (cid) => setClients(prev => prev.map(c => c.id === cid ? { ...c, archived: !c.archived } : c));
  const deleteClient = (cid) => invoices.some(i => i.clientId === cid) ? alert('This participant has invoices and cannot be deleted.') : setClients(prev => prev.filter(c => c.id !== cid));

  const setLine = (lineId, field, value) => setInvoiceForm(p => ({ ...p, lines: p.lines.map(l => l.id === lineId ? { ...l, [field]: value } : l) }));
  const selectItem = (lineId, value) => { const item = pricingItems.find(i => i.itemNumber === value || i.id === value || i.label === value) || safePricingItems[0] || DEFAULT_PRICING_ITEMS[0]; setInvoiceForm(p => ({ ...p, lines: p.lines.map(l => l.id === lineId ? { ...l, itemCode: item.itemNumber, itemLabel: item.label, rate: String(item.rate), unitType: item.unitType } : l) })); };

  const syncInvoiceTransaction = (invoice, status = invoice?.status, note = '') => {
    if (!invoice?.id) return;
    const nextStatus = normaliseInvoiceStatus(status);
    setTransactions(prev => {
      const existing = prev.find(t => t.invoiceId === invoice.id);
      if (nextStatus === 'Cancelled' || nextStatus === 'Draft') {
        return existing ? prev.filter(t => t.invoiceId !== invoice.id) : prev;
      }
      const tx = {
        ...(existing || {}),
        id: existing?.id || makeId('txn'),
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        clientId: invoice.clientId || '',
        clientName: invoice.clientName || '',
        type: 'income',
        status: nextStatus === 'Paid' ? 'paid' : 'pending',
        category: 'Invoice',
        description: `Invoice ${invoice.invoiceNumber} - ${invoice.clientName || 'Client'}`,
        amount: Number(invoice.total || 0),
        date: nextStatus === 'Paid' ? todayISO() : (invoice.issueDate || todayISO()),
        notes: note || existing?.notes || '',
        updatedAt: new Date().toISOString(),
        createdAt: existing?.createdAt || new Date().toISOString(),
      };
      return existing ? prev.map(t => t.invoiceId === invoice.id ? tx : t) : [tx, ...prev];
    });
  };

  const updateInvoiceStatus = (invoiceId, status, note = '') => {
    const current = invoices.find(inv => inv.id === invoiceId);
    if (!current) return;
    const nextStatus = normaliseInvoiceStatus(status);
    const updated = {
      ...current,
      status: nextStatus,
      statusNote: note,
      statusHistory: [
        ...(current.statusHistory || []),
        { status: nextStatus, note, at: new Date().toISOString() },
      ],
      updatedAt: new Date().toISOString(),
    };
    setInvoices(prev => prev.map(inv => inv.id === invoiceId ? updated : inv));
    syncInvoiceTransaction(updated, nextStatus, note);
    showNotice(`Invoice ${current.invoiceNumber} updated to ${nextStatus}.`);
  };

  const saveInvoice = () => {
    const safeInvoiceList = Array.isArray(invoices) ? invoices.filter(i => i && typeof i === 'object') : [];
    const client = clients.find(c => c.id === invoiceForm.clientId && !c.archived);
    if (!client) return alert('Please select an active client.');
    const lines = invoiceForm.lines.map(l => ({ ...l, itemCode: l.itemCode || '', itemLabel: l.itemLabel || '', unitType: l.unitType || 'Hour', quantity: Number(l.quantity), rate: Number(l.rate), notes: l.notes || '', lineTotal: Number(l.quantity) * Number(l.rate) }));
    if (lines.some(l => !l.quantity || l.quantity <= 0 || Number.isNaN(l.rate))) return alert('Check quantity and rate values.');
    const total = lines.reduce((s, l) => s + l.lineTotal, 0);
    const baseInvoice = {
      clientId: client.id,
      clientName: client.name,
      clientEmail: client.email,
      clientPhone: client.phone,
      clientAddress: client.address,
      ndisNumber: client.ndisNumber,
      clientPlanStartDate: client.planStartDate,
      clientPlanEndDate: client.planEndDate,
      clientBudget: Number(client.budget || 0),
      dueDate: invoiceForm.dueDate,
      notes: invoiceForm.notes,
      lines,
      total,
      updatedAt: new Date().toISOString(),
    };
    let savedInvoice;
    if (editingInvoice) {
      const current = safeInvoiceList.find(inv => inv.id === editingInvoice);
      savedInvoice = { ...current, ...baseInvoice, status: normaliseInvoiceStatus(current?.status), statusHistory: current?.statusHistory || [] };
      setInvoices(prev => prev.map(inv => inv.id === editingInvoice ? savedInvoice : inv));
      if (['Pending', 'Paid'].includes(normaliseInvoiceStatus(savedInvoice.status))) {
        syncInvoiceTransaction(savedInvoice, savedInvoice.status, savedInvoice.statusNote || '');
      }
    } else {
      const stamp = todayISO().replace(/-/g, '');
      const next = safeInvoiceList.filter(i => String(i.invoiceNumber).startsWith(`INV-${stamp}-`)).length + 1;
      savedInvoice = {
        id: makeId('invoice'),
        invoiceNumber: `INV-${stamp}-${String(next).padStart(3, '0')}`,
        issueDate: todayISO(),
        status: 'Pending',
        statusHistory: [{ status: 'Pending', note: 'Invoice generated', at: new Date().toISOString() }],
        createdAt: new Date().toISOString(),
        ...baseInvoice,
      };
      setInvoices(prev => [savedInvoice, ...prev]);
      syncInvoiceTransaction(savedInvoice, 'Pending', 'Invoice generated');
    }
    setInvoiceForm(emptyInvoice()); setEditingInvoice(null); showNotice('Invoice saved.');
  };
  const editInvoice = (inv) => { setInvoiceForm({ clientId: inv.clientId, dueDate: inv.dueDate, notes: inv.notes || '', lines: inv.lines.map(l => ({ ...l, id: l.id || makeId('line'), itemCode: l.itemCode || '', notes: l.notes || '', quantity: String(l.quantity), rate: String(l.rate) })) }); setEditingInvoice(inv.id); setActive('Invoices'); window.scrollTo(0, 0); };
  const exportPDF = (inv) => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;
    const right = pageWidth - margin;
    let y = 18;

    const drawFooter = () => {
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, pageHeight - 18, right, pageHeight - 18);
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(`${business.name || 'Business'} • ${business.email || ''} ${business.phone ? '• ' + business.phone : ''}`, margin, pageHeight - 12);
      doc.text(`Generated by Kajola Care`, right, pageHeight - 12, { align: 'right' });
    };

    const ensureSpace = (needed = 16) => {
      if (y + needed > pageHeight - 24) {
        drawFooter();
        doc.addPage();
        y = 18;
      }
    };

    // Brand header
    if (business.logoUrl) {
      try {
        const imageType = String(business.logoUrl).includes('image/png') ? 'PNG' : 'JPEG';
        doc.addImage(business.logoUrl, imageType, margin, y - 2, 28, 22, undefined, 'FAST');
      } catch (e) {
        doc.setFillColor(15, 23, 42);
        doc.roundedRect(margin, y - 2, 28, 22, 3, 3, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(12);
        doc.text((business.name || 'KC').slice(0, 2).toUpperCase(), margin + 14, y + 11, { align: 'center' });
      }
    } else {
      doc.setFillColor(15, 23, 42);
      doc.roundedRect(margin, y - 2, 28, 22, 3, 3, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(12);
      doc.text((business.name || 'KC').slice(0, 2).toUpperCase(), margin + 14, y + 11, { align: 'center' });
    }

    doc.setTextColor(15, 23, 42);
    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.text(safeText(business.name || 'Business Name'), margin + 36, y + 4);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    const businessLines = [business.abn, business.address, business.phone, business.email].filter(Boolean);
    businessLines.slice(0, 4).forEach((line, idx) => doc.text(safeText(line), margin + 36, y + 10 + idx * 5));

    doc.setTextColor(15, 23, 42);
    doc.setFontSize(24);
    doc.setFont(undefined, 'bold');
    doc.text('TAX INVOICE', right, y + 4, { align: 'right' });
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(`Invoice No: ${inv.invoiceNumber}`, right, y + 13, { align: 'right' });
    doc.text(`Issue Date: ${fmt(inv.issueDate)}`, right, y + 18, { align: 'right' });
    doc.text(`Due Date: ${fmt(inv.dueDate)}`, right, y + 23, { align: 'right' });
    y += 40;

    // Bill/payment boxes
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, y, 86, 42, 3, 3, 'FD');
    doc.roundedRect(margin + 94, y, 88, 42, 3, 3, 'FD');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.setFont(undefined, 'bold');
    doc.text('BILLED TO', margin + 6, y + 8);
    doc.text('PAYMENT DETAILS', margin + 100, y + 8);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    const clientLines = [inv.clientName, inv.ndisNumber ? `NDIS: ${inv.ndisNumber}` : '', inv.clientAddress, inv.clientPhone, inv.clientEmail].filter(Boolean);
    clientLines.slice(0, 5).forEach((line, idx) => doc.text(safeText(line), margin + 6, y + 15 + idx * 5));
    const payLines = (business.paymentDetails || 'Payment details not provided').split('\n').filter(Boolean);
    payLines.slice(0, 5).forEach((line, idx) => doc.text(safeText(line), margin + 100, y + 15 + idx * 5));
    y += 52;

    // Table header
    doc.setFillColor(15, 23, 42);
    doc.roundedRect(margin, y, pageWidth - margin * 2, 10, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont(undefined, 'bold');
    const cols = { no: margin + 4, date: margin + 14, desc: margin + 42, qty: margin + 108, unit: margin + 125, rate: margin + 145, total: right - 4 };
    doc.text('#', cols.no, y + 6.5);
    doc.text('Date', cols.date, y + 6.5);
    doc.text('Item / Description', cols.desc, y + 6.5);
    doc.text('Qty', cols.qty, y + 6.5);
    doc.text('Unit', cols.unit, y + 6.5);
    doc.text('Rate', cols.rate, y + 6.5);
    doc.text('Amount', cols.total, y + 6.5, { align: 'right' });
    y += 12;

    doc.setFont(undefined, 'normal');
    inv.lines.forEach((l, i) => {
      ensureSpace(14);
      if (i % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y - 5, pageWidth - margin * 2, 10, 'F');
      }
      doc.setTextColor(51, 65, 85);
      doc.setFontSize(8.5);
      const desc = doc.splitTextToSize(`${safeText(l.itemCode ? l.itemCode + ' - ' : '')}${safeText(l.itemLabel)}${l.notes ? ' — ' + safeText(l.notes) : ''}`, 62);
      doc.text(String(i + 1), cols.no, y);
      doc.text(fmt(l.serviceDate), cols.date, y);
      doc.text(desc[0] || '', cols.desc, y);
      doc.text(String(l.quantity), cols.qty, y);
      doc.text(safeText(l.unitType), cols.unit, y);
      doc.text(money(l.rate), cols.rate, y);
      doc.text(money(l.lineTotal), cols.total, y, { align: 'right' });
      y += Math.max(10, desc.length * 4.5);
    });

    y += 4;
    ensureSpace(42);
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y, right, y);
    y += 8;
    const subtotal = Number(inv.total || 0);
    const totalBoxX = right - 70;
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text('Subtotal', totalBoxX, y);
    doc.text(money(subtotal), right, y, { align: 'right' });
    y += 8;
    doc.setFillColor(15, 23, 42);
    doc.roundedRect(totalBoxX - 4, y - 6, 74, 13, 3, 3, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont(undefined, 'bold');
    doc.text('TOTAL DUE', totalBoxX, y + 2);
    doc.text(money(inv.total), right - 4, y + 2, { align: 'right' });
    y += 18;

    if (inv.notes) {
      ensureSpace(24);
      doc.setFont(undefined, 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text('Notes', margin, y);
      y += 6;
      doc.setFont(undefined, 'normal');
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      doc.splitTextToSize(safeText(inv.notes), pageWidth - margin * 2).forEach(line => { ensureSpace(6); doc.text(line, margin, y); y += 5; });
    }

    drawFooter();
    doc.save(`${(business.name || 'Kajola-Care').replace(/[^a-z0-9]+/gi, '-')}_${inv.clientName}_${inv.invoiceNumber}.pdf`);
  };

  const saveTxn = () => {
    const amount = Number(txnForm.amount);
    if (!txnForm.description.trim() || !amount || amount <= 0) return alert('Enter a description and amount greater than zero.');
    const isBusinessExpense = txnForm.type === 'expense' && txnForm.clientId === BUSINESS_TXN_CLIENT_ID;
    const client = clients.find(c => c.id === txnForm.clientId);
    const data = {
      ...txnForm,
      amount,
      clientId: isBusinessExpense ? BUSINESS_TXN_CLIENT_ID : (client?.id || ''),
      clientName: isBusinessExpense ? (business.name || 'Business') : (client?.name || ''),
    };
    if (editingTxn) setTransactions(prev => prev.map(t => t.id === editingTxn ? { ...t, ...data, updatedAt: new Date().toISOString() } : t));
    else setTransactions(prev => [{ id: makeId('txn'), ...data, createdAt: new Date().toISOString() }, ...prev]);
    setTxnForm(emptyTxn); setEditingTxn(null); showNotice('Transaction saved.');
  };
  const editTxn = (t) => { setTxnForm({ clientId: t.clientId || '', type: t.type || 'expense', status: t.status || 'paid', category: t.category || '', description: t.description || '', amount: String(t.amount || ''), date: t.date || todayISO() }); setEditingTxn(t.id); setActive('Finance'); window.scrollTo(0, 0); };
  const updateTxnStatus = (id, status) => {
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, status, updatedAt: new Date().toISOString() } : t));
    showNotice('Transaction status saved.');
  };

  if (authLoading) return <LoadingScreen />;
  if (employeeSession?.workerId && (!user || isEmployeeRoute)) {
    if (!storageLoaded) return <LoadingScreen message="Loading employee portal…" />;
    const currentWorker = workers.find(w => w.id === employeeSession.workerId);
    return <WorkerPortal employeeSession={employeeSession} business={business} worker={currentWorker} workers={workers} clients={clients} shifts={shifts} setShifts={setShifts} onCloudPayload={applyPayload} onSignOut={() => { localStorage.removeItem(EMPLOYEE_SESSION_KEY); setEmployeeSession(null); setStorageLoaded(false); }} />;
  }
  if (isEmployeeRoute && !employeeSession?.workerId) return <AuthGate forceRole="worker" onEmployeeLogin={(session, payload) => { localStorage.setItem(EMPLOYEE_SESSION_KEY, JSON.stringify(session)); setEmployeeSession(session); applyPayload(payload); setStorageLoaded(true); setCloudChecked(true); }} />;
  if (!user) return <AuthGate onEmployeeLogin={(session, payload) => { localStorage.setItem(EMPLOYEE_SESSION_KEY, JSON.stringify(session)); setEmployeeSession(session); applyPayload(payload); setStorageLoaded(true); setCloudChecked(true); }} />;

  const displayName = getFirstName(user);
  const welcomeMessage = buildWelcomeMessage(user);
  const userInitial = (displayName || user?.email || 'U').slice(0, 1).toUpperCase();

  const backup = () => { const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), data: payload }, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'kajola-care-backup.json'; a.click(); };
  const restore = async (file) => { try { const parsed = JSON.parse(await file.text()); const d = normalisePayload(parsed.data || parsed); applyPayload(d); showNotice('Backup restored.'); } catch { alert('Invalid backup JSON.'); } };

  const saveBusiness = (nextBusiness) => {
    const next = normaliseBusiness(nextBusiness);
    if (!next.name.trim()) return alert('Please enter your business name.');
    setBusiness(next);
    showNotice('Business profile saved.');
  };

  if (!storageLoaded || !cloudChecked || cloudLoading) return <LoadingScreen message="Loading your business workspace…" />;

  const role = user?.user_metadata?.kajola_role || user?.user_metadata?.role || window.localStorage.getItem('kajola_last_login_role') || 'admin';
  const currentWorker = workers.find(w => String(w.email || '').toLowerCase() === String(user?.email || '').toLowerCase());
  if (role === 'worker' || role === 'employee') return <WorkerPortal user={user} business={business} worker={currentWorker} workers={workers} clients={clients} shifts={shifts} setShifts={setShifts} onCloudPayload={applyPayload} onSignOut={async () => { await supabase.auth.signOut(); }} />;

  const needsOnboarding = !business.name.trim();
  if (needsOnboarding) return <BusinessOnboarding business={business} onSave={saveBusiness} user={user} onLoadCloud={() => loadCloudData()} cloudLoading={cloudLoading} />;

  const openComplianceSection = (sectionName) => {
    setComplianceSection(sectionName);
    setActive('Compliance');
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 20);
  };

  return <><div className="shell desktop-shell">
    <aside className="sidebar">
      <div className="brand"><BrandMark /><div><BrandWordmark /><p>{business.name || "Life's Good Disability Services"}</p></div></div>
      <nav>{TABS.map(t => <button key={t} className={active === t ? 'active' : ''} onClick={() => setActive(t)}><Icon name={t}/><span>{TAB_LABELS[t] || t}</span></button>)}</nav>
    </aside>
    <main className="main">
      <header className="topbar"><div><h2>{welcomeMessage}</h2><p>{active === 'Dashboard' ? "Here's what's happening today." : (business.name || 'Kajola Care Operations')}</p></div><div className="top-actions"><button className="ghost" onClick={async () => { await supabase.auth.signOut(); }}>Sign out</button></div></header>
      {notice && <div className="notice">{notice}</div>}
      {active === 'Dashboard' && <Dashboard totals={totals} invoices={invoices.slice(0, 5)} transactions={transactions} clients={clients} business={business} workers={workers} shifts={shifts} setActive={setActive}/>} 
      {active === 'Participants' && <Clients clients={clients} form={clientForm} setForm={setClientForm} editing={editingClient} save={saveClient} edit={editClient} archive={archiveClient} del={deleteClient} cancel={() => { setEditingClient(null); setClientForm(emptyClient); }} invoices={invoices} shifts={shifts} workers={workers}/>} 
      {active === 'Workers' && <WorkersWorkspace workers={workers} shifts={shifts} clients={clients} onManage={(worker) => { setFocusWorker(worker || 'new'); setComplianceSection('Employees'); setActive('Compliance'); }} />}
      {active === 'Invoices' && <Invoices pricingItems={pricingItems} clients={clients.filter(c => !c.archived)} invoices={invoices} form={invoiceForm} setForm={setInvoiceForm} editing={editingInvoice} setLine={setLine} selectItem={selectItem} addLine={() => setInvoiceForm(p => ({ ...p, lines: [...p.lines, emptyLine()] }))} removeLine={lid => setInvoiceForm(p => p.lines.length === 1 ? p : ({ ...p, lines: p.lines.filter(l => l.id !== lid) }))} save={saveInvoice} edit={editInvoice} del={id => { setInvoices(p => p.filter(i => i.id !== id)); setTransactions(p => p.filter(t => t.invoiceId !== id)); }} exportPDF={exportPDF} onStatusChange={updateInvoiceStatus} cancel={() => { setEditingInvoice(null); setInvoiceForm(emptyInvoice()); }}/>} 
      {active === 'Finance' && <FinanceWorkspace business={business} clients={clients.filter(c => !c.archived)} transactions={transactions} invoices={invoices} form={txnForm} setForm={setTxnForm} editing={editingTxn} save={saveTxn} edit={editTxn} updateStatus={updateTxnStatus} del={id => setTransactions(p => p.filter(t => t.id !== id))} cancel={() => { setEditingTxn(null); setTxnForm(emptyTxn); }}/>} 
      {active === 'Compliance' && <ComplianceWorkspace clients={clients} invoices={invoices} totals={totals} business={business} setBusiness={setBusiness} saveBusiness={saveBusiness} workers={workers} setWorkers={setWorkers} risks={risks} setRisks={setRisks} incidents={incidents} setIncidents={setIncidents} complaints={complaints} setComplaints={setComplaints} improvements={improvements} setImprovements={setImprovements} audits={audits} setAudits={setAudits} auditReports={auditReports} setAuditReports={setAuditReports} governanceReviews={governanceReviews} setGovernanceReviews={setGovernanceReviews} documents={documents} setDocuments={setDocuments} initialSection={complianceSection} onSectionChange={setComplianceSection} focusWorker={focusWorker} onWorkerFocusHandled={() => setFocusWorker(null)} onPublishWorkers={publishWorkers} />}
      {active === 'Reports' && <ReportsWorkspace business={business} transactions={transactions} clients={clients} risks={risks} incidents={incidents} complaints={complaints} improvements={improvements} audits={audits} auditReports={auditReports} governanceReviews={governanceReviews} documents={documents} workers={workers} shifts={shifts} invoices={invoices} />}
      {active === 'Schedules' && <SchedulesWorkspace clients={clients} workers={workers} shifts={shifts} setShifts={setShifts} invoices={invoices} setInvoices={setInvoices} pricingItems={pricingItems} onPublishSchedule={publishScheduleChanges} />}
      {active === 'Settings' && <Settings pricingItems={pricingItems} business={business} setBusiness={setBusiness} saveBusiness={saveBusiness} clients={clients} invoices={invoices} transactions={transactions} backup={backup} restore={restore} clear={() => { if (confirm('Clear all local data on this device? Your cloud backup will not be affected.')) { skipNextAutoSyncRef.current = true; sectionUpdatedAtRef.current = {}; setBusiness(normaliseBusiness(EMPTY_BUSINESS)); setClients([]); setInvoices([]); setTransactions([]); setWorkers([]); setShifts([]); setRisks([]); setIncidents([]); setComplaints([]); setImprovements([]); setAudits([]); setAuditReports([]); setGovernanceReviews([]); setDocuments([]); localStorage.removeItem(storageKeyFor(user)); } }} user={user} sync={async () => { const data = payloadWithFreshMeta(); const r = await syncSnapshot(data, user); if (r.ok) lastCloudSnapshotRef.current = serialisePayload(data); showNotice(r.message); }} load={async () => loadCloudData()}/>} 
    </main>
  </div>
  <MobileShell
    active={active}
    setActive={setActive}
    complianceSection={complianceSection}
    setComplianceSection={setComplianceSection}
    displayName={displayName}
    welcomeMessage={welcomeMessage}
    business={business}
    clients={clients}
    invoices={invoices}
    transactions={transactions}
    workers={workers}
    pricingItems={pricingItems}
    totals={totals}
    clients={clients}
    invoices={invoices}
    transactions={transactions}
    workers={workers}
    setWorkers={setWorkers}
    setInvoices={setInvoices}
    shifts={shifts}
    setShifts={setShifts}
    risks={risks}
    setRisks={setRisks}
    incidents={incidents}
    setIncidents={setIncidents}
    complaints={complaints}
    setComplaints={setComplaints}
    improvements={improvements}
    setImprovements={setImprovements}
    audits={audits}
    setAudits={setAudits}
    auditReports={auditReports}
    setAuditReports={setAuditReports}
    governanceReviews={governanceReviews}
    setGovernanceReviews={setGovernanceReviews}
    documents={documents}
    setDocuments={setDocuments}
    notice={notice}
    user={user}
    theme={theme}
    toggleTheme={toggleTheme}
    onSignOut={async () => { await supabase.auth.signOut(); }}
    clientForm={clientForm}
    setClientForm={setClientForm}
    editingClient={editingClient}
    saveClient={saveClient}
    editClient={editClient}
    archiveClient={archiveClient}
    deleteClient={deleteClient}
    cancelClient={() => { setEditingClient(null); setClientForm(emptyClient); }}
    invoiceForm={invoiceForm}
    setInvoiceForm={setInvoiceForm}
    editingInvoice={editingInvoice}
    setLine={setLine}
    selectItem={selectItem}
    addLine={() => setInvoiceForm(p => ({ ...p, lines: [...p.lines, emptyLine()] }))}
    removeLine={lid => setInvoiceForm(p => p.lines.length === 1 ? p : ({ ...p, lines: p.lines.filter(l => l.id !== lid) }))}
    saveInvoice={saveInvoice}
    editInvoice={editInvoice}
    deleteInvoice={id => { setInvoices(p => p.filter(i => i.id !== id)); setTransactions(p => p.filter(t => t.invoiceId !== id)); }}
    exportPDF={exportPDF}
    updateInvoiceStatus={updateInvoiceStatus}
    cancelInvoice={() => { setEditingInvoice(null); setInvoiceForm(emptyInvoice()); }}
    txnForm={txnForm}
    setTxnForm={setTxnForm}
    editingTxn={editingTxn}
    saveTxn={saveTxn}
    editTxn={editTxn}
    deleteTxn={id => setTransactions(p => p.filter(t => t.id !== id))}
    cancelTxn={() => { setEditingTxn(null); setTxnForm(emptyTxn); }}
    setBusiness={setBusiness}
    saveBusiness={saveBusiness}
    onPublishSchedule={publishScheduleChanges}
    onPublishWorkers={publishWorkers}
    settings={<Settings pricingItems={pricingItems} business={business} setBusiness={setBusiness} saveBusiness={saveBusiness} clients={clients} invoices={invoices} transactions={transactions} backup={backup} restore={restore} clear={() => { if (confirm('Clear all local data on this device? Your cloud backup will not be affected.')) { skipNextAutoSyncRef.current = true; sectionUpdatedAtRef.current = {}; setBusiness(normaliseBusiness(EMPTY_BUSINESS)); setClients([]); setInvoices([]); setTransactions([]); setWorkers([]); setShifts([]); setRisks([]); setIncidents([]); setComplaints([]); setImprovements([]); setAudits([]); setAuditReports([]); setGovernanceReviews([]); setDocuments([]); localStorage.removeItem(storageKeyFor(user)); } }} user={user} sync={async () => { const data = payloadWithFreshMeta(); const r = await syncSnapshot(data, user); if (r.ok) lastCloudSnapshotRef.current = serialisePayload(data); showNotice(r.message); }} load={async () => loadCloudData()}/>}
  />
</>;
}

function BrandWordmark({ compact = false, hero = false }) {
  return <div className={`kajola-wordmark ${compact ? 'compact' : ''} ${hero ? 'hero' : ''}`} aria-label="Kajola Care"><span className="kajola-name">Kajola</span><span className="kajola-care">Care</span></div>;
}

function BrandMark({ compact = false }) {
  return <div className={`kajola-mark ${compact ? 'compact' : ''}`}><img src="/icons/kajola-care-logo.png" alt="Kajola Care" /></div>;
}

function MobileShell({ active, setActive, complianceSection, setComplianceSection, displayName, welcomeMessage, business, setBusiness, saveBusiness, pricingItems, totals, clients, invoices, transactions, workers, setWorkers, setInvoices = () => {}, shifts = [], setShifts = () => {}, onPublishSchedule = async () => {}, onPublishWorkers = async () => {}, risks = [], setRisks = () => {}, incidents = [], setIncidents = () => {}, complaints = [], setComplaints = () => {}, improvements = [], setImprovements = () => {}, audits = [], setAudits = () => {}, auditReports = [], setAuditReports = () => {}, governanceReviews = [], setGovernanceReviews = () => {}, documents = [], setDocuments = () => {}, notice, user, theme, toggleTheme, onSignOut, clientForm, setClientForm, editingClient, saveClient, editClient, archiveClient, deleteClient, cancelClient, invoiceForm, setInvoiceForm, editingInvoice, setLine, selectItem, addLine, removeLine, saveInvoice, editInvoice, deleteInvoice, exportPDF, updateInvoiceStatus, cancelInvoice, txnForm, setTxnForm, editingTxn, saveTxn, editTxn, deleteTxn, cancelTxn, settings }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const activeClients = clients.filter(c => c && !c.archived);
  const alerts = getMobileAlerts({ clients, invoices, totals, business, workers });
  const recentInvoices = invoices.slice(0, 4);
  const openAction = (tab) => { setMoreOpen(false); setActive(tab); setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 20); };
  const openMore = () => setMoreOpen(true);
  const openComplianceSection = (sectionName) => { setComplianceSection(sectionName); openAction('Compliance'); };
  const moreActive = ['Compliance','Reports','Schedules','Settings'].includes(active);
  return <div className="mobile-shell">
    <header className="mobile-top">
      <div className="mobile-brand"><BrandMark compact /><div><BrandWordmark compact /><small>{business.name || 'Care • Connect • Empower'}</small></div></div>
      <div className="mobile-top-actions"><button className="mobile-signout" onClick={onSignOut}>Sign out</button></div>
    </header>
    <main className="mobile-main">
      {notice && <div className="notice mobile-notice">{notice}</div>}
      {active === 'Dashboard' && <MobileHome welcomeMessage={welcomeMessage} totals={totals} alerts={alerts} invoices={recentInvoices} clients={activeClients} setActive={setActive} />}
      {active === 'Participants' && <MobileParticipants clients={clients} form={clientForm} setForm={setClientForm} editing={editingClient} save={saveClient} edit={editClient} archive={archiveClient} del={deleteClient} cancel={cancelClient} />}
      {active === 'Invoices' && <MobileInvoices pricingItems={pricingItems} clients={activeClients} invoices={invoices} form={invoiceForm} setForm={setInvoiceForm} editing={editingInvoice} setLine={setLine} selectItem={selectItem} addLine={addLine} removeLine={removeLine} save={saveInvoice} edit={editInvoice} del={deleteInvoice} exportPDF={exportPDF} onStatusChange={updateInvoiceStatus} cancel={cancelInvoice} />}
      {active === 'Finance' && <MobileFinance business={business} clients={activeClients} transactions={transactions} form={txnForm} setForm={setTxnForm} editing={editingTxn} save={saveTxn} edit={editTxn} del={deleteTxn} cancel={cancelTxn} />}
      {active === 'Compliance' && <ComplianceWorkspace clients={clients} invoices={invoices} totals={totals} business={business} setBusiness={setBusiness} saveBusiness={saveBusiness} workers={workers} setWorkers={setWorkers} risks={risks} setRisks={setRisks} incidents={incidents} setIncidents={setIncidents} complaints={complaints} setComplaints={setComplaints} improvements={improvements} setImprovements={setImprovements} audits={audits} setAudits={setAudits} auditReports={auditReports} setAuditReports={setAuditReports} governanceReviews={governanceReviews} setGovernanceReviews={setGovernanceReviews} documents={documents} setDocuments={setDocuments} initialSection={complianceSection} onSectionChange={setComplianceSection} onPublishWorkers={onPublishWorkers} />}
      {active === 'Reports' && <ReportsWorkspace business={business} transactions={transactions} clients={clients} risks={risks} incidents={incidents} complaints={complaints} improvements={improvements} audits={audits} auditReports={auditReports} governanceReviews={governanceReviews} documents={documents} workers={workers} />}
      {active === 'Workers' && <WorkersWorkspace workers={workers} shifts={shifts} clients={clients} onManage={() => setActive('Compliance')} />}
      {active === 'Schedules' && <SchedulesWorkspace clients={clients} workers={workers} shifts={shifts} setShifts={setShifts} invoices={invoices} setInvoices={setInvoices} pricingItems={pricingItems} onPublishSchedule={onPublishSchedule} />}
      {active === 'Settings' && <div className="mobile-settings">{settings}</div>}
    </main>
    {moreOpen && <MobileSideDrawer active={active} setActive={openAction} onClose={() => setMoreOpen(false)} onSignOut={onSignOut} business={business} onComplianceSection={openComplianceSection} />}
    <nav className="mobile-bottom">
      {[['Dashboard','Home','◇'],['Participants','People','◉'],['Schedules','Ops','▦'],['Invoices','Claims','▤']].map(([tab,label,icon]) => <button key={tab} className={active === tab ? 'active' : ''} onClick={() => openAction(tab)}><span>{icon}</span><small>{label}</small></button>)}
      <button className={moreActive ? 'active' : ''} onClick={openMore}><span>☰</span><small>More</small></button>
    </nav>
  </div>;
}

function MobileSideDrawer({ active, setActive, onClose, onSignOut, business, onComplianceSection }) {
  const [complianceOpen, setComplianceOpen] = useState(false);
  const items = [
    ['Workers', '◉', 'Team roster and documents'],
    ['Reports', '▥', 'PDF and CSV exports'],
    ['Settings', '⚙', 'Business, pricing and data'],
  ];
  const complianceSections = [
    ['Employees', 'Worker checks and training'],
    ['Participants', 'Plan, consent and agreement'],
    ['Business', 'Insurance and audits'],
    ['Items', 'Due and overdue report'],
  ];
  return <div className="mobile-drawer-backdrop" onClick={onClose}>
    <aside className="mobile-drawer" onClick={e => e.stopPropagation()}>
      <div className="mobile-drawer-head"><div><BrandMark compact /><BrandWordmark compact /></div><button onClick={onClose} aria-label="Close menu">×</button></div>
      <p>{business?.name || 'Kajola Care workspace'}</p>
      <div className={`mobile-drawer-group ${complianceOpen ? 'open' : ''}`}>
        <button type="button" className="mobile-drawer-toggle" onClick={() => setComplianceOpen(open => !open)} aria-expanded={complianceOpen}>
          <span>✓</span><div><b>Compliance</b><small>Employees, participants, business and due items</small></div><strong>{complianceOpen ? '−' : '+'}</strong>
        </button>
        {complianceOpen && <div className="mobile-drawer-list compliance-drawer-list">
          {complianceSections.map(([sectionName, desc]) => <button key={sectionName} className={active === 'Compliance' ? 'active-subtle' : ''} onClick={() => onComplianceSection(sectionName)}><span>✓</span><div><b>{sectionName}</b><small>{desc}</small></div></button>)}
        </div>}
      </div>
      <div className="mobile-drawer-list">
        {items.map(([tab, icon, desc]) => <button key={tab} className={active === tab ? 'active' : ''} onClick={() => setActive(tab)}><span>{icon}</span><div><b>{tab}</b><small>{desc}</small></div></button>)}
      </div>
      <button className="mobile-drawer-signout" onClick={onSignOut}>Sign out</button>
    </aside>
  </div>;
}

function getMobileAlerts({ clients, invoices, totals, business, workers = [] }) {
  const complianceItems = getComplianceItems({ clients, invoices, totals, business, workers });
  const overdue = complianceItems.filter(i => i.tone === 'overdue');
  const due = complianceItems.filter(i => i.tone === 'due');
  const alerts = [];
  if (overdue.length) alerts.push({ type: 'Overdue', title: `${overdue.length} compliance item${overdue.length === 1 ? '' : 's'} overdue`, meta: overdue.slice(0, 3).map(i => i.title).join(' · ') });
  if (due.length) alerts.push({ type: 'Due soon', title: `${due.length} compliance item${due.length === 1 ? '' : 's'} due soon`, meta: due.slice(0, 3).map(i => i.title).join(' · ') });
  clients.filter(c => !c.archived).forEach(c => {
    const d = daysUntil(c.planEndDate);
    if (d !== null && d >= 0 && d <= 30) alerts.push({ type: 'Plan', title: `${c.name} plan ends in ${d} day${d === 1 ? '' : 's'}`, meta: fmt(c.planEndDate) });
  });
  invoices.filter(i => normaliseInvoiceStatus(i.status) !== 'Paid').forEach(i => {
    const d = daysUntil(i.dueDate);
    if (d !== null && d < 0) alerts.push({ type: 'Invoice', title: `${i.invoiceNumber} is overdue`, meta: `${i.clientName} · ${money(i.total)}` });
  });
  if (totals.totalBudget > 0) {
    const used = Math.min(999, Math.round((totals.invoicedTotal / totals.totalBudget) * 100));
    if (used >= 80) alerts.push({ type: 'Budget', title: `Budget usage is ${used}%`, meta: `${money(totals.remainingBudget)} remaining` });
  }
  return alerts.slice(0, 5);
}

function MobileHome({ welcomeMessage, totals, alerts, invoices, clients, setActive }) {
  return <section className="mobile-home">
    <div className="mobile-hero"><h2>{welcomeMessage}</h2><p>Here's what's happening with your business today.</p></div>
    <div className="mobile-kpis">
      <MiniKpi label="Revenue" value={money(totals.income)} />
      <MiniKpi label="Expenses" value={money(totals.expenses)} />
      <MiniKpi label="Participants" value={totals.activeClients} />
      <MiniKpi label="Net" value={money(totals.net)} />
    </div>
    <div className="mobile-quick"><button className="primary" onClick={() => setActive('Participants')}>+ Participant</button><button onClick={() => setActive('Schedules')}>+ Shift</button><button onClick={() => setActive('Invoices')}>+ Invoice</button></div>
    <MobilePanel title="Today" action={alerts.length ? `${alerts.length} alerts` : 'All clear'}>{alerts.length ? alerts.map((a,i) => <div className="mobile-alert" key={i}><span>{a.type}</span><div><b>{a.title}</b><small>{a.meta}</small></div></div>) : <p className="mobile-empty">No urgent compliance, invoice, or plan alerts today.</p>}<button className="text-link mobile-alert-link" onClick={() => setActive('Compliance')}>Open compliance report</button></MobilePanel>
    <MobilePanel title="Recent invoices" action={<button className="text-link" onClick={() => setActive('Invoices')}>View all</button>}><Records rows={invoices} empty="No invoices yet." render={i => <div className="mobile-list-row" key={i.id}><div><b>{i.invoiceNumber}</b><small>{i.clientName} · {fmt(i.dueDate)}</small></div><strong>{money(i.total)}</strong></div>} /></MobilePanel>
    <MobilePanel title="Active clients" action={<button className="text-link" onClick={() => setActive('Participants')}>View all</button>}><Records rows={clients.slice(0,3)} empty="No participants yet." render={c => <div className="mobile-list-row" key={c.id}><div><b>{c.name}</b><small>Plan ends {fmt(c.planEndDate)}</small></div><strong>{money(c.budget)}</strong></div>} /></MobilePanel>
  </section>;
}

function MiniKpi({ label, value }) { return <div className="mini-kpi"><small>{label}</small><b>{value}</b></div>; }
function MobilePanel({ title, action, children }) { return <section className="mobile-panel"><div className="mobile-panel-head"><h3>{title}</h3><small>{action}</small></div>{children}</section>; }

function MobileParticipants({ clients, form, setForm, editing, save, edit, archive, del, cancel }) {
  const [showForm, setShowForm] = useState(false);
  const active = clients.filter(c => !c.archived);
  return <section className="mobile-page">
    <div className="mobile-title"><h2>Participants</h2><button onClick={() => setShowForm(v => !v)}>{showForm || editing ? 'Hide form' : '+ Participant'}</button></div>
    {(showForm || editing) && <MobilePanel title={editing ? 'Edit client' : 'New client'}>
      <div className="mobile-form-section"><small className="mobile-form-label">Identity</small><Field label="Participant Name" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}/><Field label="NDIS Number" value={form.ndisNumber} onChange={e => setForm(p => ({ ...p, ndisNumber: e.target.value }))}/></div>
      <div className="mobile-form-section"><small className="mobile-form-label">Plan & Budget</small><div className="mobile-two"><Field type="date" label="Plan Start" value={form.planStartDate} onChange={e => setForm(p => ({ ...p, planStartDate: e.target.value }))}/><Field type="date" label="Plan End" value={form.planEndDate} onChange={e => setForm(p => ({ ...p, planEndDate: e.target.value }))}/></div><Field type="number" label="Budget" value={form.budget} onChange={e => setForm(p => ({ ...p, budget: e.target.value }))}/></div>
      <div className="mobile-form-section"><small className="mobile-form-label">Compliance Dates</small><div className="mobile-two"><Field type="date" label="Consent Expiry" value={form.consentExpiry} onChange={e => setForm(p => ({ ...p, consentExpiry: e.target.value }))}/><Field type="date" label="Agreement Expiry" value={form.agreementExpiry} onChange={e => setForm(p => ({ ...p, agreementExpiry: e.target.value }))}/></div><Field type="date" label="Risk Review" value={form.riskReviewDate} onChange={e => setForm(p => ({ ...p, riskReviewDate: e.target.value }))}/></div>
      <div className="mobile-form-section"><small className="mobile-form-label">Contact</small><Field label="Email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}/><Field label="Phone" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}/><Field label="Address" multiline value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))}/><Field label="Compliance Notes" multiline value={form.complianceNotes} onChange={e => setForm(p => ({ ...p, complianceNotes: e.target.value }))}/></div>
      <button className="primary" onClick={() => { save(); setShowForm(false); }}>{editing ? 'Update client' : 'Save client'}</button>{editing && <button onClick={cancel}>Cancel</button>}
    </MobilePanel>}
    <MobilePanel title="Active clients" action={`${active.length} clients`}>
      <div className="compact-client-list"><Records rows={active} empty="No active participants added yet." render={c => <div className="compact-client-row" key={c.id}><div><b>{c.name}</b><small>NDIS {c.ndisNumber || '-'} · Plan {fmt(c.planEndDate)}</small></div><div><strong>{money(c.budget)}</strong><small>{(() => { const d = daysUntil(c.planEndDate); return d === null ? 'No end date' : d < 0 ? 'Ended' : `${d} days left`; })()}</small></div><div className="compact-actions"><button onClick={() => { edit(c); setShowForm(true); }}>Edit</button><button onClick={() => archive(c.id)}>Archive</button><button className="danger" onClick={() => del(c.id)}>Delete</button></div></div>} /></div>
    </MobilePanel>
  </section>;
}

function MobileInvoices({ pricingItems = DEFAULT_PRICING_ITEMS, clients, invoices, form, setForm, editing, setLine, selectItem, addLine, removeLine, save, edit, del, exportPDF, onStatusChange, cancel }) {
  const [step, setStep] = useState(1);
  const line = form.lines[0] || emptyLine();
  const preview = form.lines.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.rate || 0), 0);
  return <section className="mobile-page">
    <div className="mobile-title"><h2>Invoice</h2><span>Step {step}/4</span></div>
    <MobilePanel title={editing ? 'Edit invoice' : 'New invoice'} action="Client → Service → Review">
      <div className="step-dots">{[1,2,3,4].map(n => <button key={n} className={step === n ? 'active' : ''} onClick={() => setStep(n)}>{n}</button>)}</div>
      {step === 1 && <><label><span>Client</span><select value={form.clientId} onChange={e => setForm(p => ({ ...p, clientId: e.target.value }))}><option value="">Select active client</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><Field type="date" label="Due Date" value={form.dueDate} onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))}/></>}
      {step === 2 && <><label><span>Support Item</span><select value={line.itemCode || line.itemLabel} onChange={e => selectItem(line.id, e.target.value)}>{pricingItems.map(i => <option key={i.id || i.itemNumber} value={i.itemNumber || i.id}>{i.itemNumber ? `${i.itemNumber} — ${i.label}` : i.label}</option>)}</select></label><Field type="date" label="Service Date" value={line.serviceDate} onChange={e => setLine(line.id, 'serviceDate', e.target.value)}/><div className="mobile-two"><Field type="number" step="0.01" label="Qty" value={line.quantity} onChange={e => setLine(line.id, 'quantity', e.target.value)}/><Field type="number" step="0.01" label="Rate" value={line.rate} onChange={e => setLine(line.id, 'rate', e.target.value)}/></div><Field label="Line Notes" value={line.notes || ''} onChange={e => setLine(line.id, 'notes', e.target.value)} placeholder="Optional notes" /><button onClick={addLine}>+ Add another line</button>{form.lines.length > 1 && <small>{form.lines.length} service lines attached</small>}</>}
      {step === 3 && <><Field label="Notes" multiline value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}/>{form.lines.map((l, idx) => <div className="mobile-list-row" key={l.id}><div><b>{idx + 1}. {l.itemLabel}</b><small>{l.quantity} {l.unitType} @ {money(l.rate)}</small></div><strong>{money(Number(l.quantity || 0) * Number(l.rate || 0))}</strong></div>)}</>}
      {step === 4 && <div className="review-box"><small>Invoice total</small><b>{money(preview)}</b><p>Check the client, service dates, rates, and notes before generating.</p></div>}
      <div className="mobile-wizard-actions"><button disabled={step === 1} onClick={() => setStep(s => Math.max(1, s - 1))}>Back</button>{step < 4 ? <button className="primary" onClick={() => setStep(s => Math.min(4, s + 1))}>Next</button> : <button className="primary" onClick={() => { save(); setStep(1); }}>{editing ? 'Update invoice' : 'Generate invoice'}</button>}</div>{editing && <button onClick={cancel}>Cancel edit</button>}
    </MobilePanel>
    <MobilePanel title="Invoice register" action={`${invoices.length} invoices`}><Records rows={invoices} empty="No invoices created yet." render={i => <div className="mobile-invoice-card" key={i.id}><div><b>{i.invoiceNumber}</b><span>{money(i.total)}</span></div><small>{i.clientName} · Due {fmt(i.dueDate)}</small><InvoiceStatusControls invoice={i} onChange={onStatusChange} compact /><div className="mobile-card-actions"><button onClick={() => edit(i)}>Edit</button><button onClick={() => exportPDF(i)}>PDF</button><button className="danger" onClick={() => del(i.id)}>Delete</button></div></div>} /></MobilePanel>
  </section>;
}


function dateValue(value) {
  const time = new Date(value || 0).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function filterAndSortTransactions(transactions, filters) {
  return [...transactions]
    .filter(t => (filters.type === 'all' || t.type === filters.type))
    .filter(t => (filters.status === 'all' || (t.status || 'paid') === filters.status))
    .filter(t => (filters.clientId === 'all' || (filters.clientId === 'none' ? !t.clientId : t.clientId === filters.clientId)))
    .filter(t => {
      const q = String(filters.query || '').trim().toLowerCase();
      if (!q) return true;
      return `${t.description || ''} ${t.clientName || ''} ${t.category || ''}`.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (filters.sort === 'date_asc') return dateValue(a.date) - dateValue(b.date);
      if (filters.sort === 'amount_desc') return Number(b.amount || 0) - Number(a.amount || 0);
      if (filters.sort === 'amount_asc') return Number(a.amount || 0) - Number(b.amount || 0);
      return dateValue(b.date) - dateValue(a.date);
    });
}

function MobileFinance({ business, clients, transactions, form, setForm, editing, save, edit, del, cancel }) {
  const [filters, setFilters] = useState({ type: 'all', status: 'all', clientId: 'all', sort: 'date_desc', query: '' });
  const [page, setPage] = useState(1);
  const rows = filterAndSortTransactions(transactions, filters);
  const { totalPages, safePage, start, pageRows } = paginateRows(rows, page);
  useEffect(() => { setPage(1); }, [filters.type, filters.status, filters.clientId, filters.sort, filters.query, transactions.length]);
  const income = rows.filter(t => t.type === 'income').reduce((s,t)=>s+Number(t.amount||0),0);
  const expenses = rows.filter(t => t.type === 'expense').reduce((s,t)=>s+Number(t.amount||0),0);
  const setFilter = (key, value) => setFilters(prev => ({ ...prev, [key]: value }));
  const businessLabel = business?.name || 'Business';
  const changeTxnType = (value) => setForm(p => ({ ...p, type: value, clientId: value === 'expense' ? p.clientId : (p.clientId === BUSINESS_TXN_CLIENT_ID ? '' : p.clientId) }));
  return <section className="mobile-page">
    <div className="mobile-title"><h2>Finance</h2><span>{money(income-expenses)} net</span></div>
    <div className="mobile-kpis two"><MiniKpi label="Income" value={money(income)} /><MiniKpi label="Expenses" value={money(expenses)} /></div>
    <MobilePanel title={editing ? 'Edit transaction' : 'New transaction'}>
      <label><span>Client / Business</span><select value={form.clientId} onChange={e => setForm(p => ({ ...p, clientId: e.target.value }))}><option value="">No Participant</option>{form.type === 'expense' && <option value={BUSINESS_TXN_CLIENT_ID}>{businessLabel}</option>}{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <div className="mobile-two"><label><span>Type</span><select value={form.type} onChange={e => changeTxnType(e.target.value)}><option>expense</option><option>income</option></select></label><label><span>Status</span><select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}><option>pending</option><option>paid</option></select></label></div>
      <Field label="Description" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}/><Field label="Category" value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}/><div className="mobile-two"><Field type="number" step="0.01" label="Amount" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}/><Field type="date" label="Date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))}/></div><button className="primary" onClick={save}>{editing ? 'Update transaction' : 'Save transaction'}</button>{editing && <button onClick={cancel}>Cancel</button>}
    </MobilePanel>
    <MobilePanel title="Transaction filters" action={`${rows.length} shown`}>
      <Field label="Search" value={filters.query} placeholder="Description, client, category" onChange={e => setFilter('query', e.target.value)} />
      <div className="mobile-two">
        <label><span>Type</span><select value={filters.type} onChange={e => setFilter('type', e.target.value)}><option value="all">All</option><option value="income">Income</option><option value="expense">Expense</option></select></label>
        <label><span>Status</span><select value={filters.status} onChange={e => setFilter('status', e.target.value)}><option value="all">All</option><option value="pending">Pending</option><option value="paid">Paid</option></select></label>
      </div>
      <div className="mobile-two">
        <label><span>Client</span><select value={filters.clientId} onChange={e => setFilter('clientId', e.target.value)}><option value="all">All participants/business</option><option value="none">No participant</option><option value={BUSINESS_TXN_CLIENT_ID}>{businessLabel}</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label><span>Sort</span><select value={filters.sort} onChange={e => setFilter('sort', e.target.value)}><option value="date_desc">Newest date</option><option value="date_asc">Oldest date</option><option value="amount_desc">Highest amount</option><option value="amount_asc">Lowest amount</option></select></label>
      </div>
    </MobilePanel>
    <MobilePanel title="Transactions" action={`${rows.length ? start + 1 : 0}-${Math.min(start + PAGE_SIZE, rows.length)} of ${rows.length}`}><Records rows={pageRows} empty="No matching transactions found." render={t => <div className="mobile-list-row" key={t.id}><div><b>{t.description}</b><small>{t.clientId === BUSINESS_TXN_CLIENT_ID ? (t.clientName || businessLabel) : (t.clientName || 'No participant')} · {t.category || 'General'} · {fmt(t.date)} · {(t.status || 'paid')}</small></div><strong className={t.type === 'expense' ? 'negative' : 'positive'}>{t.type === 'expense' ? '-' : '+'}{money(t.amount)}</strong><div className="mobile-card-actions"><button onClick={() => edit(t)}>Edit</button><button className="danger" onClick={() => del(t.id)}>Delete</button></div></div>} />{rows.length > PAGE_SIZE && <Pagination page={safePage} totalPages={totalPages} onPrev={() => setPage(p => Math.max(1, p - 1))} onNext={() => setPage(p => Math.min(totalPages, p + 1))} />}</MobilePanel>
  </section>;
}

function Icon({ name }) { return <span className="nav-icon">{({Dashboard:'◇', Participants:'◉', Schedules:'▦', Workers:'◈', Invoices:'▤', Finance:'◗', Compliance:'✓', Reports:'▥', Settings:'⚙'})[name] || '•'}</span>; }
function Card({ title, action, children, className = '' }) { return <section className={`card ${className}`}><div className="card-head"><h3>{title}</h3>{action}</div>{children}</section>; }
function Field({ label, multiline, ...props }) { return <label><span>{label}</span>{multiline ? <textarea {...props}/> : <input {...props}/>}</label>; }
function Records({ rows, empty, render }) { return rows.length ? rows.map(render) : <p className="empty">{empty}</p>; }
function Stat({ label, value, tone, icon, trend }) { return <div className={`stat ${tone || ''}`}><div className="stat-icon">{icon}</div><small>{label}</small><strong>{value}</strong><em>{trend}</em></div>; }
function Spark() { return <svg viewBox="0 0 180 48" className="spark"><path d="M4 38 C22 40 24 31 38 30 C52 28 48 16 66 20 C82 25 82 34 100 29 C116 25 111 18 130 17 C150 16 151 29 176 10" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg>; }


function CashflowOverview({ transactions }) {
  const [period, setPeriod] = useState('30');
  const days = Number(period);
  const now = new Date();
  const buckets = Array.from({ length: Math.min(days, 90) }, (_, index) => {
    const d = new Date(now);
    d.setDate(now.getDate() - (Math.min(days, 90) - 1 - index) * Math.ceil(days / Math.min(days, 90)));
    return { date: d, income: 0, expenses: 0 };
  });
  const bucketFor = (date) => {
    if (!buckets.length) return -1;
    const diff = Math.floor((date - buckets[0].date) / 86400000);
    return Math.max(0, Math.min(buckets.length - 1, Math.floor(diff / Math.ceil(days / buckets.length))));
  };
  transactions.forEach(t => {
    const d = new Date(`${t.date || t.createdAt || todayISO()}T00:00:00`);
    if (Number.isNaN(d.getTime())) return;
    const age = (now - d) / 86400000;
    if (age < 0 || age > days) return;
    const idx = bucketFor(d);
    if (idx < 0) return;
    if (t.type === 'income') buckets[idx].income += Number(t.amount || 0);
    if (t.type === 'expense') buckets[idx].expenses += Number(t.amount || 0);
  });
  const max = Math.max(1, ...buckets.map(b => Math.max(b.income, b.expenses)));
  const points = (key) => buckets.map((b, i) => {
    const x = buckets.length === 1 ? 0 : (i / (buckets.length - 1)) * 660;
    const y = 230 - (Number(b[key] || 0) / max) * 210;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const totalIncome = buckets.reduce((s,b)=>s+b.income,0);
  const totalExpenses = buckets.reduce((s,b)=>s+b.expenses,0);
  return <Card title="Cashflow Overview" className="wide" action={<select className="period-select" value={period} onChange={e => setPeriod(e.target.value)}><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last 12 months</option></select>}>
    <div className="chart"><div className="axis"><span>{money(max)}</span><span>{money(max * .75)}</span><span>{money(max * .5)}</span><span>{money(max * .25)}</span><span>$0</span></div><svg viewBox="0 0 660 260"><defs><linearGradient id="cashGold" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#d7b46a" stopOpacity=".55"/><stop offset="1" stopColor="#d7b46a" stopOpacity="0"/></linearGradient><linearGradient id="cashBlue" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#4f7cff" stopOpacity=".32"/><stop offset="1" stopColor="#4f7cff" stopOpacity="0"/></linearGradient></defs><polyline points={points('income')} fill="none" stroke="#d7b46a" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/><polyline points={points('expenses')} fill="none" stroke="#4f7cff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/></svg><div className="legend"><span className="gold-dot">Income {money(totalIncome)}</span><span className="blue-dot">Expenses {money(totalExpenses)}</span></div></div>
  </Card>;
}

function ComplianceRing({ pct, label = 'Compliance Score', sub }) {
  const r = 46, c = 2 * Math.PI * r, off = c - (Math.min(100, Math.max(0, pct)) / 100) * c;
  const tone = pct >= 85 ? 'var(--green)' : pct >= 60 ? 'var(--amber)' : 'var(--red)';
  return <div className="compliance-ring" style={{ display: 'grid', placeItems: 'center', gap: '10px' }}>
    <svg viewBox="0 0 120 120" width="128" height="128">
      <circle cx="60" cy="60" r={r} fill="none" stroke="var(--line)" strokeWidth="11" />
      <circle cx="60" cy="60" r={r} fill="none" stroke={tone} strokeWidth="11" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={off} transform="rotate(-90 60 60)" />
      <text x="60" y="58" textAnchor="middle" fontSize="26" fontWeight="780" fill="var(--ink)">{pct}%</text>
      <text x="60" y="76" textAnchor="middle" fontSize="10" fill="var(--muted)">overall</text>
    </svg>
    <div style={{ textAlign: 'center' }}><b style={{ display: 'block' }}>{label}</b>{sub && <small style={{ color: 'var(--muted)' }}>{sub}</small>}</div>
  </div>;
}

function Dashboard({ totals, invoices, transactions, clients, business, workers = [], shifts = [], setActive }) {
  const activeParticipants = clients.filter(c => !c.archived);
  const clientSpend = (clientId) => invoices.filter(i => i.clientId === clientId).reduce((s, i) => s + Number(i.total || 0), 0);
  const totalBudget = activeParticipants.reduce((s, c) => s + Number(c.budget || 0), 0);
  const usedBudget = invoices.reduce((s, i) => s + Number(i.total || 0), 0);
  const budgetPct = totalBudget ? Math.min(100, Math.round((usedBudget / totalBudget) * 100)) : 0;
  const pendingInvoices = invoices.filter(i => !['Paid', 'Cancelled'].includes(normaliseInvoiceStatus(i.status)));
  const expiringParticipants = activeParticipants.filter(c => { const d = daysUntil(c.planEndDate); return d !== null && d >= 0 && d <= 30; });
  const complianceItems = getComplianceItems({ clients, invoices, totals, business, workers });
  const complianceDue = complianceItems.length;
  const topParticipants = [...activeParticipants].sort((a, b) => clientSpend(b.id) - clientSpend(a.id)).slice(0, 5);

  // Compliance score: share of all tracked items that are current.
  const allComplianceRows = [
    ...buildParticipantComplianceRows(clients).flatMap(r => r.items),
    ...buildWorkerComplianceRows(workers).flatMap(r => r.items),
    ...buildBusinessComplianceRows(business),
  ];
  const currentCount = allComplianceRows.filter(i => (i.status?.tone || i.tone) === 'current').length;
  const complianceScore = allComplianceRows.length ? Math.round((currentCount / allComplianceRows.length) * 100) : 100;

  // Today's operations
  const today = todayISO();
  const todaysShifts = shifts.filter(s => s.date === today);
  const onShift = todaysShifts.filter(s => ['In Progress', 'Started'].includes(s.status)).length;
  const missingClockIns = todaysShifts.filter(s => ['Scheduled', 'Open'].includes(s.status)).length;
  const pendingNotes = shifts.filter(s => s.status === 'Awaiting Notes' || (s.endedAt && !s.notes)).length;

  // Action centre — derive from data, ordered by urgency
  const expiredDocs = buildWorkerComplianceRows(workers).reduce((n, r) => n + r.items.filter(i => i.status.tone === 'overdue' || i.status.tone === 'missing').length, 0);
  const overdueInvoices = pendingInvoices.filter(i => { const d = daysUntil(i.dueDate); return d !== null && d < 0; }).length;
  const actions = [
    expiredDocs && { tone: 'red', label: `${expiredDocs} worker document${expiredDocs > 1 ? 's' : ''} expired`, go: 'Workers' },
    expiringParticipants.length && { tone: 'amber', label: `${expiringParticipants.length} service agreement${expiringParticipants.length > 1 ? 's' : ''} due`, go: 'Participants' },
    overdueInvoices && { tone: 'red', label: `${overdueInvoices} unpaid invoice${overdueInvoices > 1 ? 's' : ''} overdue`, go: 'Invoices' },
    complianceDue && { tone: 'amber', label: `${complianceDue} compliance item${complianceDue > 1 ? 's' : ''} need review`, go: 'Compliance' },
    pendingNotes && { tone: 'blue', label: `${pendingNotes} shift note${pendingNotes > 1 ? 's' : ''} awaiting approval`, go: 'Schedules' },
  ].filter(Boolean);

  const ops = [
    { icon: '◈', label: 'Workers on shift', value: onShift, go: 'Workers' },
    { icon: '▦', label: 'Shifts today', value: todaysShifts.length, go: 'Schedules' },
    { icon: '!', label: 'Missing clock-ins', value: missingClockIns, go: 'Schedules', tone: missingClockIns ? 'amber' : '' },
    { icon: '✎', label: 'Pending notes', value: pendingNotes, go: 'Schedules', tone: pendingNotes ? 'amber' : '' },
  ];

  return <>
    <div className="ops-hero-actions">
      <button className="primary" onClick={() => setActive('Participants')}>+ Participant</button>
      <button onClick={() => setActive('Schedules')}>+ Shift</button>
      <button onClick={() => setActive('Invoices')}>+ Invoice</button>
      <button onClick={() => setActive('Compliance')}>+ Incident</button>
      <button onClick={() => setActive('Workers')}>+ Worker</button>
    </div>

    <div className="dashboard-grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: '16px' }}>
      <Card title="Action Centre" action={<button className="text-link" onClick={() => setActive('Compliance')}>View all</button>}>
        <Records rows={actions} empty="Nothing needs your attention. You're all caught up." render={(a, idx) => (
          <div className="invoice-row" key={idx} style={{ gridTemplateColumns: 'auto 1fr auto', cursor: 'pointer' }} onClick={() => setActive(a.go)}>
            <span className={`pill ${a.tone}`} style={{ width: '24px', height: '24px', padding: 0, justifyContent: 'center', borderRadius: '7px' }}>!</span>
            <b style={{ fontWeight: 600 }}>{a.label}</b>
            <button className="ghost">›</button>
          </div>
        )} />
      </Card>
      <Card title="Today's Operations" action={<button className="text-link" onClick={() => setActive('Schedules')}>Operations centre</button>}>
        {ops.map((o, idx) => (
          <div className="invoice-row" key={idx} style={{ gridTemplateColumns: 'auto 1fr auto', cursor: 'pointer' }} onClick={() => setActive(o.go)}>
            <span className="feed-icon" style={{ width: '32px', height: '32px', borderRadius: '9px', background: 'var(--blue-50)', color: 'var(--blue)', display: 'grid', placeItems: 'center' }}>{o.icon}</span>
            <span style={{ color: 'var(--ink-2)' }}>{o.label}</span>
            <strong className={o.tone === 'amber' ? '' : ''} style={{ color: o.tone === 'amber' ? 'var(--amber)' : 'var(--ink)' }}>{o.value}</strong>
          </div>
        ))}
      </Card>
    </div>

    <div className="dashboard-grid" style={{ gridTemplateColumns: '2fr 1fr', marginBottom: '16px' }}>
      <Card title="Financial Snapshot">
        <div className="ops-stat-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', margin: 0 }}>
          <div className="mini-kpi"><small style={{ color: 'var(--muted)', textTransform: 'uppercase', fontSize: '11px', fontWeight: 700 }}>Revenue this month</small><b style={{ color: 'var(--green)' }}>{money(totals.income)}</b></div>
          <div className="mini-kpi"><small style={{ color: 'var(--muted)', textTransform: 'uppercase', fontSize: '11px', fontWeight: 700 }}>Claims submitted</small><b style={{ color: 'var(--blue)' }}>{money(pendingInvoices.reduce((s, i) => s + Number(i.total || 0), 0))}</b></div>
          <div className="mini-kpi"><small style={{ color: 'var(--muted)', textTransform: 'uppercase', fontSize: '11px', fontWeight: 700 }}>Claims paid</small><b style={{ color: 'var(--teal)' }}>{money(invoices.filter(i => normaliseInvoiceStatus(i.status) === 'Paid').reduce((s, i) => s + Number(i.total || 0), 0))}</b></div>
          <div className="mini-kpi"><small style={{ color: 'var(--muted)', textTransform: 'uppercase', fontSize: '11px', fontWeight: 700 }}>Outstanding</small><b style={{ color: 'var(--amber)' }}>{money(totals.expenses)}</b></div>
        </div>
      </Card>
      <Card title="Compliance Score" action={<button className="text-link" onClick={() => setActive('Compliance')}>Hub</button>}>
        <ComplianceRing pct={complianceScore} label={complianceDue ? `${complianceDue} due soon` : 'All clear'} sub={`${currentCount} of ${allComplianceRows.length} current`} />
      </Card>
    </div>

    <div className="ops-insight-grid">
      <InsightCard label="NDIS Budget Usage" value={`${budgetPct}%`} sub={`${money(usedBudget)} used of ${money(totalBudget)}`} progress={budgetPct} />
      <InsightCard label="Plans Expiring Soon" value={expiringParticipants.length} sub="Within 30 days" />
      <InsightCard label="Pending Invoices" value={pendingInvoices.length} sub={money(pendingInvoices.reduce((s, i) => s + Number(i.total || 0), 0))} />
      <InsightCard label="Active Participants" value={topParticipants.length || (clients.filter(c => !c.archived).length)} sub="Currently supported" />
    </div>
    <div className="dashboard-grid" style={{ gridTemplateColumns: '1fr' }}>
      <CashflowOverview transactions={transactions} />
    </div>
  </>;
}

function InsightCard({ label, value, sub, progress }) {
  return <div className="insight-card"><small>{label}</small><strong>{value}</strong><span>{sub}</span>{typeof progress === 'number' && <div className="bar"><span style={{ width: `${progress}%` }} /></div>}</div>;
}

function buildParticipantComplianceRows(clients) {
  return clients.filter(c => !c.archived).map(c => {
    const items = [
      { key: 'Plan Review', date: c.planEndDate, detail: 'Plan end date' },
      { key: 'Consent', date: c.consentExpiry, detail: 'Consent expiry' },
      { key: 'Agreement', date: c.agreementExpiry, detail: 'Service agreement expiry' },
      { key: 'Risk Review', date: c.riskReviewDate, detail: 'Risk review date' },
    ];
    const statuses = items.map(item => ({ ...item, status: getComplianceStatus(item.date) }));
    const worst = [...statuses].sort((a, b) => a.status.sort - b.status.sort)[0]?.status || getComplianceStatus('');
    return { client: c, items: statuses, overall: worst };
  });
}

function buildBusinessComplianceRows(business) {
  return getBusinessComplianceItems(business).map(item => ({ ...item, status: getComplianceStatus(item.dueDate) }));
}

function buildWorkerComplianceRows(workers = []) {
  return workers.map(worker => {
    const normalisedWorker = normaliseWorker(worker);
    const items = DEFAULT_WORKER_COMPLIANCE_ITEMS.map(item => {
      const date = normalisedWorker[item.key] || '';
      const status = item.optional && !date ? { label: 'Optional', tone: 'current', days: null, sort: 2 } : getComplianceStatus(date);
      return { ...item, date, status };
    });
    const worst = [...items].sort((a, b) => a.status.sort - b.status.sort)[0]?.status || getComplianceStatus('');
    return { worker, items, overall: worst };
  });
}

function getComplianceItems({ clients, invoices, business, workers = [] }) {
  const items = [];
  buildParticipantComplianceRows(clients).forEach(row => {
    row.items.forEach(item => {
      if (['due', 'overdue'].includes(item.status.tone)) {
        items.push({
          id: `participant-${row.client.id}-${item.key}`,
          type: 'Participant',
          title: `${row.client.name} ${item.key}`,
          detail: item.date ? `${item.detail}: ${fmt(item.date)}` : `${item.detail} missing`,
          status: item.status.label,
          tone: item.status.tone,
          sort: item.status.sort,
        });
      }
    });
  });
  buildWorkerComplianceRows(workers).forEach(row => {
    row.items.forEach(item => {
      if (['due', 'overdue'].includes(item.status.tone)) {
        items.push({
          id: `worker-${row.worker.id}-${item.key}`,
          type: 'Employee',
          title: `${row.worker.name || 'Worker'} ${item.label}`,
          detail: item.date ? `Due ${fmt(item.date)}` : 'Due date missing',
          status: item.status.label,
          tone: item.status.tone,
          sort: item.status.sort,
        });
      }
    });
  });
  buildBusinessComplianceRows(business).forEach(item => {
    if (['due', 'overdue'].includes(item.status.tone)) {
      items.push({
        id: `business-${item.id}`,
        type: item.group,
        title: item.label,
        detail: item.dueDate ? `Due ${fmt(item.dueDate)}` : 'Due date missing',
        status: item.status.label,
        tone: item.status.tone,
        sort: item.status.sort,
      });
    }
  });
  invoices.filter(i => !['Paid', 'Cancelled'].includes(normaliseInvoiceStatus(i.status))).forEach(i => {
    const d = daysUntil(i.dueDate);
    if (d !== null && d < 0) items.push({ id: `invoice-${i.id}`, type: 'Invoice', title: `Overdue invoice ${i.invoiceNumber}`, detail: i.clientName || 'Participant', status: `${Math.abs(d)}d overdue`, tone: 'overdue', sort: 0 });
  });
  return items.sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title));
}

function ParticipantDetail({ client, invoices = [], shifts = [], workers = [], onBack, onEdit }) {
  const c = client;
  const [tab, setTab] = useState('Overview');
  const spent = invoices.filter(i => i.clientId === c.id).reduce((s, i) => s + Number(i.total || 0), 0);
  const budget = Number(c.budget || 0);
  const remaining = Math.max(0, budget - spent);
  const usedPct = budget ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
  const daysLeft = daysUntil(c.planEndDate);
  const findWorker = (id) => workers.find(w => w.id === id);
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 7);
  const myShifts = shifts.filter(s => s.participantId === c.id).sort((a, b) => `${b.date}${b.startTime}`.localeCompare(`${a.date}${a.startTime}`));
  const thisWeek = myShifts.filter(s => { const d = new Date(`${s.date}T00:00:00`); return d >= weekStart && d < weekEnd; }).sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));
  const myInvoices = invoices.filter(i => i.clientId === c.id);
  const recentInvoices = myInvoices.slice(0, 4);
  const status = c.archived ? 'Inactive' : 'Active';

  // Compliance items for this participant.
  const complianceRows = buildParticipantComplianceRows([c])[0]?.items || [];
  const toneClass = (t) => ({ current: 'green', due: 'amber', overdue: 'red', missing: 'red' }[t] || 'grey');

  // Timeline: merge shifts + invoices into a dated activity feed.
  const timeline = [
    ...myShifts.map(s => ({ date: s.date, kind: 'shift', label: `${s.supportType || 'Support'} · ${findWorker(s.workerId)?.name || 'Worker'}`, meta: `${s.startTime}–${s.endTime} · ${s.status || 'Scheduled'}`, icon: '▦' })),
    ...myInvoices.map(i => ({ date: i.issueDate, kind: 'invoice', label: `${i.invoiceNumber} · ${normaliseInvoiceStatus(i.status)}`, meta: money(i.total), icon: '▤' })),
  ].filter(x => x.date).sort((a, b) => b.date.localeCompare(a.date));

  const TABS_P = ['Overview', 'Funding', 'Services', 'Invoices', 'Compliance', 'Timeline'];

  return <>
    <div className="ops-hero-actions" style={{ marginBottom: '14px' }}>
      <button onClick={onBack}>← Participants</button>
      <button className="primary" onClick={() => onEdit(c)}>Edit</button>
    </div>
    <Card>
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="big-avatar">{(c.name || 'P').split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase()}</div>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><h2 style={{ fontSize: '22px' }}>{c.name}</h2><span className={`pill ${c.archived ? 'grey' : 'green'}`}>{status}</span></div>
          <small style={{ color: 'var(--muted)' }}>NDIS #{c.ndisNumber || '-'}</small>
        </div>
        <div style={{ textAlign: 'right' }}><small style={{ color: 'var(--muted)', display: 'block', textTransform: 'uppercase', fontSize: '11px', fontWeight: 700 }}>Plan</small><b>{fmt(c.planStartDate)} → {fmt(c.planEndDate)}</b></div>
      </div>
      <div className="participant-tabs" style={{ display: 'flex', gap: '4px', marginTop: '16px', borderTop: '1px solid var(--line)', paddingTop: '14px', overflowX: 'auto' }}>
        {TABS_P.map(t => <button key={t} className={tab === t ? 'active' : 'ghost'} onClick={() => setTab(t)}>{t}</button>)}
      </div>
    </Card>

    <div className="ops-stat-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
      <div className="mini-kpi"><small style={{ color: 'var(--muted)', textTransform: 'uppercase', fontSize: '11px', fontWeight: 700 }}>Budget</small><b>{money(budget)}</b></div>
      <div className="mini-kpi"><small style={{ color: 'var(--muted)', textTransform: 'uppercase', fontSize: '11px', fontWeight: 700 }}>Used</small><b style={{ color: 'var(--blue)' }}>{money(spent)}</b><div className="bar" style={{ marginTop: '8px' }}><span style={{ width: `${usedPct}%` }} /></div></div>
      <div className="mini-kpi"><small style={{ color: 'var(--muted)', textTransform: 'uppercase', fontSize: '11px', fontWeight: 700 }}>Remaining</small><b style={{ color: 'var(--green)' }}>{money(remaining)}</b></div>
      <div className="mini-kpi"><small style={{ color: 'var(--muted)', textTransform: 'uppercase', fontSize: '11px', fontWeight: 700 }}>Days Left</small><b style={{ color: daysLeft !== null && daysLeft < 30 ? 'var(--amber)' : 'var(--ink)' }}>{daysLeft === null ? '—' : daysLeft < 0 ? 'Ended' : daysLeft}</b></div>
    </div>

    {tab === 'Overview' && <div className="bottom-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
      <Card title="About">
        <div className="checkline" style={{ borderTop: 'none' }}><span style={{ color: 'var(--muted)', flex: 1 }}>Contact</span><b>{c.phone || '-'}</b></div>
        <div className="checkline"><span style={{ color: 'var(--muted)', flex: 1 }}>Email</span><b style={{ wordBreak: 'break-all' }}>{c.email || '-'}</b></div>
        <div className="checkline"><span style={{ color: 'var(--muted)', flex: 1 }}>Address</span><b style={{ textAlign: 'right' }}>{c.address || '-'}</b></div>
      </Card>
      <Card title="This Week's Services">
        <Records rows={thisWeek} empty="No shifts scheduled this week." render={s => <div className="feed" key={s.id}><span>▦</span><div><b style={{ fontWeight: 600 }}>{s.supportType || 'Support'}</b><small>{fmtWeekday(s.date)} · {s.startTime}–{s.endTime} · {findWorker(s.workerId)?.name || 'Worker'}</small></div></div>} />
      </Card>
      <Card title="Recent Activity">
        <Records rows={recentInvoices} empty="No recent invoices." render={i => <div className="feed" key={i.id}><span>▤</span><div><b style={{ fontWeight: 600 }}>{i.invoiceNumber}</b><small>{fmt(i.issueDate)} · {normaliseInvoiceStatus(i.status)}</small></div><time>{money(i.total)}</time></div>} />
      </Card>
    </div>}

    {tab === 'Funding' && <Card title="Plan & Funding">
      <div className="ops-insight-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        <InsightCard label="Total Budget" value={money(budget)} sub="Plan allocation" />
        <InsightCard label="Used" value={money(spent)} sub={`${usedPct}% of plan`} progress={usedPct} />
        <InsightCard label="Remaining" value={money(remaining)} sub="Available to spend" />
      </div>
      <div className="two" style={{ marginTop: '14px' }}>
        <div className="checkline" style={{ borderTop: 'none' }}><span style={{ color: 'var(--muted)', flex: 1 }}>Plan start</span><b>{fmt(c.planStartDate)}</b></div>
        <div className="checkline" style={{ borderTop: 'none' }}><span style={{ color: 'var(--muted)', flex: 1 }}>Plan end</span><b>{fmt(c.planEndDate)}</b></div>
        <div className="checkline"><span style={{ color: 'var(--muted)', flex: 1 }}>Consent expiry</span><b>{fmt(c.consentExpiry)}</b></div>
        <div className="checkline"><span style={{ color: 'var(--muted)', flex: 1 }}>Agreement expiry</span><b>{fmt(c.agreementExpiry)}</b></div>
      </div>
    </Card>}

    {tab === 'Services' && <Card title="All Services & Shifts" action={`${myShifts.length} total`}>
      <Records rows={myShifts} empty="No shifts recorded for this participant." render={s => <div className="invoice-row" key={s.id} style={{ gridTemplateColumns: 'auto 1fr auto auto' }}>
        <span className="feed-icon" style={{ width: '32px', height: '32px', borderRadius: '9px', background: 'var(--blue-50)', color: 'var(--blue)', display: 'grid', placeItems: 'center' }}>▦</span>
        <div><b>{s.supportType || 'Support'}</b><small>{fmt(s.date)} · {s.startTime}–{s.endTime} · {findWorker(s.workerId)?.name || 'Worker'}</small></div>
        <span className={`pill ${({ Completed: 'green', 'In Progress': 'blue', Cancelled: 'grey', Missed: 'red' }[s.status]) || 'amber'}`}>{s.status || 'Scheduled'}</span>
        <small style={{ color: 'var(--muted)' }}>{s.location || '-'}</small>
      </div>} />
    </Card>}

    {tab === 'Invoices' && <Card title="Invoices" action={`${myInvoices.length} · ${money(spent)}`}>
      <Records rows={myInvoices} empty="No invoices for this participant." render={i => <div className="invoice-row" key={i.id}><span className="accent-line" /><div><b>{i.invoiceNumber}</b><small>Issued {fmt(i.issueDate)} · Due {fmt(i.dueDate)}</small></div><strong>{money(i.total)}</strong><span className={`pill ${({ Paid: 'green', Submitted: 'violet', Cancelled: 'grey' }[normaliseInvoiceStatus(i.status)]) || 'amber'}`}>{normaliseInvoiceStatus(i.status)}</span></div>} />
    </Card>}

    {tab === 'Compliance' && <Card title="Participant Compliance">
      <Records rows={complianceRows} empty="No compliance items tracked." render={(it, idx) => <div className="checkline" key={idx}><span style={{ flex: 1 }}>{it.label}</span><b style={{ color: 'var(--muted)' }}>{it.date ? fmt(it.date) : 'Not set'}</b><span className={`pill ${toneClass(it.status.tone)}`}>{it.status.label}</span></div>} />
    </Card>}

    {tab === 'Timeline' && <Card title="Activity Timeline" action={`${timeline.length} events`}>
      <Records rows={timeline} empty="No activity yet." render={(t, idx) => <div className="feed" key={idx}><span>{t.icon}</span><div><b style={{ fontWeight: 600 }}>{t.label}</b><small>{fmt(t.date)} · {t.meta}</small></div></div>} />
    </Card>}
  </>;
}

function ParticipantRow({ c, invoices, onView, onEdit, onArchive, onDelete, archivedView }) {
  const spent = invoices.filter(i => i.clientId === c.id).reduce((s, i) => s + Number(i.total || 0), 0);
  const budget = Number(c.budget || 0);
  const usedPct = budget ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
  const d = daysUntil(c.planEndDate);
  const planTone = d === null ? 'grey' : d < 0 ? 'red' : d <= 30 ? 'amber' : 'green';
  const planLabel = d === null ? 'No end date' : d < 0 ? 'Plan ended' : `${d} days left`;
  const initials = (c.name || 'P').split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div className="p-row">
      <button className="p-row-main" onClick={() => onView(c.id)}>
        <span className="p-avatar">{initials}</span>
        <span className="p-id">
          <b>{c.name || 'Unnamed participant'}</b>
          <small>NDIS {c.ndisNumber || '—'}</small>
        </span>
        <span className="p-plan">
          <span className={`pill ${planTone}`}>{archivedView ? 'Archived' : planLabel}</span>
          <small>{c.planEndDate ? `Ends ${fmt(c.planEndDate)}` : 'No plan end set'}</small>
        </span>
        <span className="p-budget">
          <b>{money(budget)}</b>
          {budget ? <span className="p-bar"><span style={{ width: `${usedPct}%` }} /></span> : <small>No budget set</small>}
          {budget ? <small>{money(spent)} used · {usedPct}%</small> : null}
        </span>
        <span className="p-contact">
          <b>{c.email || '—'}</b>
          <small>{c.phone || 'No phone'}</small>
        </span>
      </button>
      <div className="p-actions">
        <button className="ghost" onClick={() => onView(c.id)} title="View">View</button>
        <button className="ghost" onClick={() => onEdit(c)} title="Edit">Edit</button>
        <button className="ghost" onClick={() => onArchive(c.id)} title={archivedView ? 'Unarchive' : 'Archive'}>{archivedView ? 'Unarchive' : 'Archive'}</button>
        <button className="ghost danger-ghost" onClick={() => onDelete(c.id)} title="Delete">Delete</button>
      </div>
    </div>
  );
}

function Clients({ clients, form, setForm, editing, save, edit, archive, del, cancel, invoices = [], shifts = [], workers = [] }) {
  const [detailId, setDetailId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState('');
  const [planFilter, setPlanFilter] = useState('all');
  const [showArchived, setShowArchived] = useState(false);
  const detailClient = detailId ? clients.find(c => c.id === detailId) : null;
  if (detailClient) return <ParticipantDetail client={detailClient} invoices={invoices} shifts={shifts} workers={workers} onBack={() => setDetailId(null)} onEdit={(c) => { setDetailId(null); edit(c); setShowForm(true); }} />;
  const active = clients.filter(c => !c.archived);
  const archived = clients.filter(c => c.archived);
  const matchesQuery = (c) => !query || [c.name, c.ndisNumber, c.email, c.phone, c.address].join(' ').toLowerCase().includes(query.toLowerCase());
  const matchesPlan = (c) => {
    if (planFilter === 'all') return true;
    const d = daysUntil(c.planEndDate);
    if (planFilter === 'expiring') return d !== null && d >= 0 && d <= 30;
    if (planFilter === 'ended') return d !== null && d < 0;
    if (planFilter === 'active') return d === null || d >= 0;
    return true;
  };
  const filteredActive = active.filter(c => matchesQuery(c) && matchesPlan(c));
  const formIsOpen = showForm || editing;

  // Summary stats
  const totalBudget = active.reduce((s, c) => s + Number(c.budget || 0), 0);
  const expiringSoon = active.filter(c => { const d = daysUntil(c.planEndDate); return d !== null && d >= 0 && d <= 30; }).length;

  return <>
    <div className="ops-stat-grid">
      <Stat label="Active Participants" value={active.length} tone="navy" icon="◉" trend="Currently supported" />
      <Stat label="Total Plan Budget" value={money(totalBudget)} tone="teal" icon="$" trend="Across active plans" />
      <Stat label="Plans Expiring" value={expiringSoon} tone="gold" icon="!" trend="Within 30 days" />
      <Stat label="Archived" value={archived.length} tone="violet" icon="▢" trend="Past participants" />
    </div>

    <Card
      title="Participants"
      action={<div className="filters">
        <div className="search inline-search"><input placeholder="Search participants…" value={query} onChange={e => setQuery(e.target.value)} /></div>
        <select value={planFilter} onChange={e => setPlanFilter(e.target.value)} className="filter-select"><option value="all">All plans</option><option value="active">Active plans</option><option value="expiring">Expiring (30 days)</option><option value="ended">Ended plans</option></select>
        <button className="primary" onClick={() => { setShowForm(true); if (editing) cancel(); setTimeout(() => document.getElementById('participant-form-anchor')?.scrollIntoView({ behavior: 'smooth' }), 30); }}>+ Add Participant</button>
      </div>}
    >
      <div className="list-meta">{filteredActive.length} of {active.length} shown</div>
      <div className="p-list">
        {filteredActive.length
          ? filteredActive.map(c => <ParticipantRow key={c.id} c={c} invoices={invoices} onView={setDetailId} onEdit={(x) => { edit(x); setShowForm(true); setTimeout(() => document.getElementById('participant-form-anchor')?.scrollIntoView({ behavior: 'smooth' }), 30); }} onArchive={archive} onDelete={del} />)
          : <p className="empty">{query || planFilter !== 'all' ? 'No participants match your filters.' : 'No active participants yet. Add your first to get started.'}</p>}
      </div>
    </Card>

    {archived.length > 0 && <Card title="Archived Participants" action={<button className="text-link" onClick={() => setShowArchived(v => !v)}>{showArchived ? 'Hide' : `Show ${archived.length}`}</button>}>
      {showArchived
        ? <div className="p-list">{archived.map(c => <ParticipantRow key={c.id} c={c} invoices={invoices} onView={setDetailId} onEdit={(x) => { edit(x); setShowForm(true); }} onArchive={archive} onDelete={del} archivedView />)}</div>
        : <p className="empty">{archived.length} archived participant{archived.length > 1 ? 's' : ''}. Click "Show" to view.</p>}
    </Card>}

    <span id="participant-form-anchor" />
    {formIsOpen && <Card title={editing ? 'Edit Participant' : 'Add Participant'} action={<button className="ghost" onClick={() => { setShowForm(false); if (editing) cancel(); }}>Close</button>}>
      <div className="grid"><Field label="Participant Name" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}/><Field label="NDIS Number" value={form.ndisNumber} onChange={e => setForm(p => ({ ...p, ndisNumber: e.target.value }))}/><Field type="date" label="Plan Start Date" value={form.planStartDate} onChange={e => setForm(p => ({ ...p, planStartDate: e.target.value }))}/><Field type="date" label="Plan End Date" value={form.planEndDate} onChange={e => setForm(p => ({ ...p, planEndDate: e.target.value }))}/><Field type="number" step="0.01" label="Budget" value={form.budget} onChange={e => setForm(p => ({ ...p, budget: e.target.value }))}/><Field type="date" label="Consent Expiry" value={form.consentExpiry} onChange={e => setForm(p => ({ ...p, consentExpiry: e.target.value }))}/><Field type="date" label="Service Agreement Expiry" value={form.agreementExpiry} onChange={e => setForm(p => ({ ...p, agreementExpiry: e.target.value }))}/><Field type="date" label="Risk Review Date" value={form.riskReviewDate} onChange={e => setForm(p => ({ ...p, riskReviewDate: e.target.value }))}/><Field label="Email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}/><Field label="Phone" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}/><Field label="Address" multiline value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))}/><Field label="Compliance Notes" multiline value={form.complianceNotes} onChange={e => setForm(p => ({ ...p, complianceNotes: e.target.value }))}/></div>
      <button className="primary" onClick={() => { save(); setShowForm(false); }}>{editing ? 'Update Participant' : 'Save Participant'}</button>{editing && <button onClick={() => { cancel(); setShowForm(false); }}>Cancel Edit</button>}
    </Card>}
  </>;
}

function BillingPipeline({ invoices }) {
  // Map invoice statuses onto the NDIS claim pipeline.
  const norm = (i) => normaliseInvoiceStatus(i.status);
  const stages = [
    { key: 'Delivered', label: 'Delivered', sub: 'Services provided', icon: '✓', match: () => true },
    { key: 'Approved', label: 'Approved', sub: 'Ready to invoice', icon: '◷', match: (s) => !['Draft'].includes(s) },
    { key: 'Generated', label: 'Invoice Created', sub: 'Waiting to claim', icon: '▤', match: (s) => !['Draft'].includes(s) },
    { key: 'Submitted', label: 'Claim Submitted', sub: 'With NDIA', icon: '↗', match: (s) => ['Submitted', 'Paid'].includes(s) },
    { key: 'Paid', label: 'Paid', sub: 'Payment received', icon: '$', match: (s) => s === 'Paid' },
  ];
  const counts = stages.map(st => ({ ...st, n: invoices.filter(i => st.match(norm(i))).length }));
  return <div className="billing-pipeline" style={{ display: 'flex', alignItems: 'center', gap: '4px', overflowX: 'auto', padding: '6px 0 2px' }}>
    {counts.map((st, idx) => <React.Fragment key={st.key}>
      <div style={{ display: 'grid', placeItems: 'center', gap: '6px', minWidth: '96px', textAlign: 'center' }}>
        <div style={{ width: '42px', height: '42px', borderRadius: '50%', display: 'grid', placeItems: 'center', background: st.n ? 'var(--blue)' : 'var(--surface-2)', color: st.n ? '#fff' : 'var(--muted)', border: st.n ? 'none' : '1px solid var(--line-2)', fontSize: '17px', fontWeight: 700 }}>{st.icon}</div>
        <div><b style={{ fontSize: '13px' }}>{st.label}</b><small style={{ display: 'block', color: 'var(--muted)', fontSize: '11px' }}>{st.sub}</small><span className="pill grey" style={{ marginTop: '4px' }}>{st.n}</span></div>
      </div>
      {idx < counts.length - 1 && <div style={{ flex: 1, height: '2px', minWidth: '20px', background: 'var(--line-2)', alignSelf: 'flex-start', marginTop: '20px' }} />}
    </React.Fragment>)}
  </div>;
}

function Invoices({ pricingItems = DEFAULT_PRICING_ITEMS, clients, invoices, form, setForm, editing, setLine, selectItem, addLine, removeLine, save, edit, del, exportPDF, onStatusChange, cancel }) {
  const preview = form.lines.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.rate || 0), 0);
  const norm = (i) => normaliseInvoiceStatus(i.status);
  const sumWhere = (pred) => invoices.filter(pred).reduce((s, i) => s + Number(i.total || 0), 0);
  const readyToClaim = invoices.filter(i => ['Generated', 'Approved'].includes(norm(i)));
  const submitted = invoices.filter(i => norm(i) === 'Submitted');
  const paid = invoices.filter(i => norm(i) === 'Paid');
  const outstanding = invoices.filter(i => !['Paid', 'Cancelled'].includes(norm(i)));
  const [open, setOpen] = useState(false);
  const openNew = () => setOpen(true);
  const openEdit = (i) => { edit(i); setOpen(true); };
  const closeModal = () => { setOpen(false); if (editing) cancel(); };
  const submitInvoice = () => { save(); setOpen(false); };
  const selectedClient = clients.find(c => c.id === form.clientId);
  // Auto-open when editing is triggered externally
  useEffect(() => { if (editing) setOpen(true); }, [editing]);

  return <>
    <div className="ops-stat-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
      <Stat label="Ready to Claim" value={money(sumWhere(i => ['Generated', 'Approved'].includes(norm(i))))} tone="blue" icon="▤" trend={`${readyToClaim.length} services`} />
      <Stat label="Submitted" value={money(sumWhere(i => norm(i) === 'Submitted'))} tone="violet" icon="↗" trend={`${submitted.length} invoices`} />
      <Stat label="Paid" value={money(sumWhere(i => norm(i) === 'Paid'))} tone="green" icon="$" trend={`${paid.length} invoices`} />
      <Stat label="Outstanding" value={money(sumWhere(i => !['Paid', 'Cancelled'].includes(norm(i))))} tone="gold" icon="!" trend={`${outstanding.length} invoices`} />
    </div>
    <Card title="Claims Pipeline" action={<button className="primary" onClick={openNew}>+ Create Invoice</button>}>
      <p style={{ marginTop: 0 }}>Track services through to payment.</p>
      <BillingPipeline invoices={invoices} />
    </Card>

    <Card title="Invoice Register" className="invoice-register-card" action={`${invoices.length} invoices`}><Records rows={invoices} empty="No invoices created yet. Click + Create Invoice to start." render={i => <details className="invoice-tile" key={i.id}><summary><div><b>{i.invoiceNumber}</b><small>{i.clientName}</small></div><strong>{money(i.total)}</strong><span className={`pill ${({ Paid: 'green', Submitted: 'violet', Cancelled: 'grey' }[norm(i)]) || 'amber'}`}>{i.status || 'Generated'}</span></summary><p>Issue: {fmt(i.issueDate)} · Due: {fmt(i.dueDate)} · NDIS: {i.ndisNumber || '-'}</p>{i.lines.map((l, idx) => <p key={l.id || idx}>{idx + 1}. {l.itemCode ? `${l.itemCode} · ` : ''}{l.itemLabel} · {fmt(l.serviceDate)} · {l.quantity} {l.unitType} @ {money(l.rate)} = {money(l.lineTotal)}</p>)}{i.notes && <p>Notes: {i.notes}</p>}<InvoiceStatusControls invoice={i} onChange={onStatusChange} /><div className="actions"><button onClick={() => openEdit(i)}>Edit</button><button onClick={() => exportPDF(i)}>Export PDF</button><button className="danger" onClick={() => del(i.id)}>Delete</button></div></details>}/></Card>

    {open && <div className="modal-overlay" onClick={closeModal}>
      <div className="modal invoice-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div><h3>{editing ? 'Edit Invoice' : 'Generate Invoice'}</h3><small>{editing ? 'Update invoice details and service lines' : 'Bill services to an NDIS participant plan'}</small></div>
          <button className="modal-close" onClick={closeModal} aria-label="Close">×</button>
        </div>
        <div className="modal-body">
          <div className="invoice-modal-grid">
            <label className="field"><span>Participant</span><select value={form.clientId} onChange={e => setForm(p => ({ ...p, clientId: e.target.value }))}><option value="">Select participant</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <Field type="date" label="Due Date" value={form.dueDate} onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))}/>
            {selectedClient && <div className="invoice-client-chip"><span className="p-avatar">{(selectedClient.name || 'P').split(' ').map(x => x[0]).join('').slice(0,2).toUpperCase()}</span><div><b>{selectedClient.name}</b><small>NDIS {selectedClient.ndisNumber || '—'} · Budget {money(selectedClient.budget)}</small></div></div>}
          </div>

          <div className="invoice-lines-head"><b>Service Lines</b><small>{form.lines.length} line{form.lines.length === 1 ? '' : 's'}</small></div>
          {form.lines.map((line, idx) => <div className="invoice-line-card" key={line.id}>
            <div className="invoice-line-top"><span className="invoice-line-num">{idx + 1}</span><label className="field invoice-line-item"><span>Support Item</span><select value={line.itemCode || line.itemLabel} onChange={e => selectItem(line.id, e.target.value)}>{pricingItems.map(i => <option key={i.id || i.itemNumber} value={i.itemNumber || i.id}>{i.itemNumber ? `${i.itemNumber} — ${i.label}` : i.label}</option>)}</select></label>{form.lines.length > 1 && <button className="ghost danger-ghost invoice-line-remove" onClick={() => removeLine(line.id)}>Remove</button>}</div>
            <div className="invoice-line-grid">
              <Field type="date" label="Service Date" value={line.serviceDate} onChange={e => setLine(line.id, 'serviceDate', e.target.value)}/>
              <Field label="Unit Type" value={line.unitType} onChange={e => setLine(line.id, 'unitType', e.target.value)}/>
              <Field type="number" step="0.01" label="Quantity" value={line.quantity} onChange={e => setLine(line.id, 'quantity', e.target.value)}/>
              <Field type="number" step="0.01" label="Rate" value={line.rate} onChange={e => setLine(line.id, 'rate', e.target.value)}/>
            </div>
            <Field label="Line Notes" value={line.notes || ''} onChange={e => setLine(line.id, 'notes', e.target.value)} placeholder="Optional notes for this support item" />
            <div className="invoice-line-subtotal">Subtotal <b>{money(Number(line.quantity || 0) * Number(line.rate || 0))}</b></div>
          </div>)}
          <button className="invoice-add-line" onClick={addLine}>+ Add Another Service</button>
          <Field label="Invoice Notes" multiline value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Notes shown on the invoice…" />
        </div>
        <div className="modal-foot">
          <div className="invoice-total-display"><small>Invoice Total</small><b>{money(preview)}</b></div>
          <div className="modal-foot-actions">
            <button onClick={closeModal}>Cancel</button>
            <button className="primary" onClick={submitInvoice} disabled={!form.clientId}>{editing ? 'Update Invoice' : 'Generate Invoice'}</button>
          </div>
        </div>
      </div>
    </div>}
  </>;
}


function InvoiceStatusControls({ invoice, onChange, compact = false }) {
  const [status, setStatus] = useState(normaliseInvoiceStatus(invoice.status));
  const [note, setNote] = useState(invoice.statusNote || '');
  useEffect(() => {
    setStatus(normaliseInvoiceStatus(invoice.status));
    setNote(invoice.statusNote || '');
  }, [invoice.id, invoice.status, invoice.statusNote]);
  const apply = () => onChange?.(invoice.id, status, note);
  const history = invoice.statusHistory || [];
  return <div className={compact ? 'invoice-status compact' : 'invoice-status'}>
    <div className="status-row">
      <label><span>Status</span><select value={status} onChange={e => setStatus(e.target.value)}>{INVOICE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select></label>
      <label><span>Status note</span><input value={note} placeholder="Optional note" onChange={e => setNote(e.target.value)} /></label>
      <button className="primary" onClick={apply}>Update status</button>
    </div>
    {!compact && history.length > 0 && <small className="status-history">Last update: {history[history.length - 1].status} · {fmt(String(history[history.length - 1].at || '').slice(0,10))}{history[history.length - 1].note ? ` · ${history[history.length - 1].note}` : ''}</small>}
  </div>;
}

const PAGE_SIZE = 10;
const paginateRows = (rows, page, pageSize = PAGE_SIZE) => {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return { totalPages, safePage, start, pageRows: rows.slice(start, start + pageSize) };
};


const TRANSACTION_REPORT_PERIODS = [
  { key: '1m', label: '1 month', months: 1 },
  { key: '3m', label: '3 months', months: 3 },
  { key: '6m', label: '6 months', months: 6 },
  { key: '12m', label: '12 months', months: 12 },
  { key: 'all', label: 'All time', months: null },
];

function getTransactionReportRows(transactions = [], period = '1m') {
  const option = TRANSACTION_REPORT_PERIODS.find(p => p.key === period) || TRANSACTION_REPORT_PERIODS[0];
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = option.months ? new Date(end) : null;
  if (start) {
    start.setMonth(start.getMonth() - option.months);
    start.setHours(0, 0, 0, 0);
  }
  return [...transactions]
    .filter(t => {
      if (!t.date) return option.key === 'all';
      const txDate = new Date(`${t.date}T12:00:00`);
      if (Number.isNaN(txDate.getTime())) return option.key === 'all';
      return (!start || txDate >= start) && txDate <= end;
    })
    .sort((a, b) => dateValue(b.date) - dateValue(a.date));
}

function transactionReportSummary(rows = []) {
  const income = rows.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount || 0), 0);
  const expenses = rows.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount || 0), 0);
  return { income, expenses, net: income - expenses, count: rows.length };
}


function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadTextFile(filename, content, type = 'text/csv;charset=utf-8;') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function exportTransactionReportCsv({ business = {}, transactions = [], period = '1m' }) {
  const option = TRANSACTION_REPORT_PERIODS.find(p => p.key === period) || TRANSACTION_REPORT_PERIODS[0];
  const rows = getTransactionReportRows(transactions, period);
  const cleanFile = (value) => String(value || 'Kajola-Care').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
  const txName = (t) => t.clientId === BUSINESS_TXN_CLIENT_ID ? (t.clientName || business.name || 'Business') : (t.clientName || 'No participant');
  const headers = ['Date', 'Type', 'Description', 'Participant / Business', 'Category', 'Status', 'Invoice Number', 'Amount'];
  const lines = [
    headers.map(csvEscape).join(','),
    ...rows.map(t => [
      t.date || '',
      t.type || '',
      t.description || '',
      txName(t),
      t.category || '',
      t.status || 'pending',
      t.invoiceNumber || '',
      Number(t.amount || 0).toFixed(2),
    ].map(csvEscape).join(',')),
  ];
  downloadTextFile(`${cleanFile(business.name)}-transaction-report-${option.key}.csv`, lines.join('\n'));
}

function exportTransactionReportPdf({ business = {}, transactions = [], period = '1m' }) {
  const option = TRANSACTION_REPORT_PERIODS.find(p => p.key === period) || TRANSACTION_REPORT_PERIODS[0];
  const rows = getTransactionReportRows(transactions, period);
  const summary = transactionReportSummary(rows);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const right = pageWidth - margin;
  let y = 18;
  const cleanFile = (value) => String(value || 'Kajola-Care').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
  const txName = (t) => t.clientId === BUSINESS_TXN_CLIENT_ID ? (t.clientName || business.name || 'Business') : (t.clientName || 'No participant');
  const drawFooter = () => {
    const pages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pages; i += 1) {
      doc.setPage(i);
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, pageHeight - 14, right, pageHeight - 14);
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(`${business.name || 'Kajola Care'} · Transaction Report`, margin, pageHeight - 8);
      doc.text(`Page ${i} of ${pages}`, right, pageHeight - 8, { align: 'right' });
    }
  };
  const ensureSpace = (needed = 12) => {
    if (y + needed > pageHeight - 22) {
      doc.addPage();
      y = 18;
    }
  };

  doc.setFillColor(7, 52, 139);
  doc.rect(0, 0, pageWidth, 34, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont(undefined, 'bold');
  doc.setFontSize(18);
  doc.text('Transaction Report', margin, 16);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(9);
  doc.text(`${option.label} · Generated ${new Intl.DateTimeFormat('en-AU', { timeZone: MELBOURNE_TZ }).format(new Date())}`, margin, 24);
  doc.setFont(undefined, 'bold');
  doc.text(safeText(business.name || 'Kajola Care'), right, 16, { align: 'right' });
  doc.setFont(undefined, 'normal');
  doc.setFontSize(8);
  [business.abn ? `ABN ${business.abn}` : '', business.email || '', business.phone || ''].filter(Boolean).slice(0, 3).forEach((line, idx) => {
    doc.text(safeText(line), right, 23 + idx * 4, { align: 'right' });
  });
  y = 44;

  const cardW = (pageWidth - margin * 2 - 9) / 4;
  const cards = [
    ['Income', money(summary.income)],
    ['Expenses', money(summary.expenses)],
    ['Net', money(summary.net)],
    ['Transactions', String(summary.count)],
  ];
  cards.forEach(([label, value], idx) => {
    const x = margin + idx * (cardW + 3);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(214, 226, 242);
    doc.roundedRect(x, y, cardW, 22, 3, 3, 'FD');
    doc.setFontSize(7);
    doc.setTextColor(7, 52, 139);
    doc.setFont(undefined, 'bold');
    doc.text(label.toUpperCase(), x + 4, y + 7);
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(value, x + 4, y + 16);
  });
  y += 34;

  doc.setFont(undefined, 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('Register', margin, y);
  y += 6;
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(margin, y, pageWidth - margin * 2, 10, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7.5);
  const cols = { date: margin + 3, type: margin + 25, desc: margin + 45, client: margin + 92, status: margin + 135, amount: right - 3 };
  doc.text('DATE', cols.date, y + 6.4);
  doc.text('TYPE', cols.type, y + 6.4);
  doc.text('DESCRIPTION', cols.desc, y + 6.4);
  doc.text('PARTICIPANT / BUSINESS', cols.client, y + 6.4);
  doc.text('STATUS', cols.status, y + 6.4);
  doc.text('AMOUNT', cols.amount, y + 6.4, { align: 'right' });
  y += 12;

  if (!rows.length) {
    doc.setFont(undefined, 'normal');
    doc.setTextColor(71, 85, 105);
    doc.setFontSize(10);
    doc.text(`No transactions found for ${option.label}.`, margin, y + 6);
  } else {
    rows.forEach((t, idx) => {
      ensureSpace(12);
      if (idx % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y - 5, pageWidth - margin * 2, 10, 'F');
      }
      doc.setFont(undefined, 'normal');
      doc.setTextColor(51, 65, 85);
      doc.setFontSize(8);
      const desc = doc.splitTextToSize(safeText(t.description || '-'), 42)[0] || '-';
      const participant = doc.splitTextToSize(safeText(txName(t)), 38)[0] || '-';
      doc.text(fmt(t.date), cols.date, y);
      doc.text(safeText(t.type || '-'), cols.type, y);
      doc.text(desc, cols.desc, y);
      doc.text(participant, cols.client, y);
      doc.text(safeText(t.status || 'pending'), cols.status, y);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(t.type === 'expense' ? 190 : 4, t.type === 'expense' ? 18 : 120, t.type === 'expense' ? 60 : 87);
      doc.text(`${t.type === 'expense' ? '-' : '+'}${money(t.amount)}`, cols.amount, y, { align: 'right' });
      y += 10;
    });
  }
  drawFooter();
  doc.save(`${cleanFile(business.name)}-transaction-report-${option.key}.pdf`);
}


const EXPORT_COLUMNS = {
  risks: ['number','taskActivityArea','issueHazardAspect','riskImpact','consequence','likelihood','riskScore','controlMeasures','personResponsible','residualConsequence','residualLikelihood','residualRiskScore'],
  incidents: ['title','participantName','date','severity','reportable','immediateAction','followUp','status','evidence'],
  complaints: ['title','participantName','date','receivedBy','category','details','resolution','status','evidence'],
  improvements: ['referenceNumber','date','sourceOfFeedback','opportunityForImprovement','relevantStandardIndicator','actionsRequired','priority','byWhen','status','outcome','review'],
  audits: ['auditArea','dateReviewLastCompleted','dateNextDue','status','evidence'],
  governanceReviews: ['title','date','attendees','summary','decisions','actions','nextReviewDate','status','evidence'],
  documents: ['title','category','owner','reviewDate','version','location','status','notes'],
};
const COMPLIANCE_NAV = ['Employees','Participants','Business','Risks','Incidents','Complaints','Improvements','Audits','Audit Reports','Governance','Documents','Items'];
const INTERNAL_AUDIT_AREAS = [
  'Person-centred Supports Policy & Procedure',
  'Individual Values and Beliefs Policy & Procedure',
  'Privacy and Dignity Policy & Procedure',
  'Independence and Informed Choice Policy & Procedure',
  'Violence, Abuse, Neglect, Exploitation and Discrimination Policy & Procedure',
  'Governance and Operational Management Policy & Procedure',
  'Risk Management Policy & Procedure',
  'Quality Management Policy & Procedure',
  'Information Management Policy & Procedure',
  'Feedback and Complaints Management Policy & Procedure',
  'Incident Management Policy & Procedure',
  'Human Resource Management Policy & Procedure',
  'Rights and Responsibilities Policy & Procedure',
  'Conflict of Interest Policy & Procedure',
  'Service Agreements with Participants Policy & Procedure',
  'Emergency & Disaster Management',
  'Continuity of Supports',
];
const DEFAULT_INTERNAL_AUDIT_SCHEDULE = INTERNAL_AUDIT_AREAS.map((auditArea, index) => ({
  id: `aud-${String(index + 1).padStart(3, '0')}`,
  auditArea,
  dateReviewLastCompleted: '',
  dateNextDue: '',
  status: 'Open',
  createdAt: new Date().toISOString(),
}));

const INTERNAL_AUDIT_TEMPLATE = [
  { division: 'Division 1 – Rights and Responsibilities', area: 'Person-centred supports', outcome: 'Each participant accesses supports that promote, uphold and respect their legal and human rights and is enabled to exercise informed choice and control.', questions: [
    'Does each participant understand their legal and human rights?',
    'Are participant legal and human rights incorporated into everyday practices?',
    'Is communication about support provision provided in the mode, language and terms the participant is most likely to understand?',
    'Is each participant supported to engage family, friends and chosen community as directed?'
  ]},
  { division: 'Division 1 – Rights and Responsibilities', area: 'Individual values and beliefs', outcome: 'Each participant accesses supports that respect their culture, diversity, values and beliefs.', questions: [
    'Are participant culture, diversity, values and beliefs identified and responded to at their direction?',
    'Is each participant supported to practice their culture, values and beliefs while accessing supports?'
  ]},
  { division: 'Division 1 – Rights and Responsibilities', area: 'Privacy and Dignity', outcome: 'Each participant accesses supports that respect and protect their dignity and right to privacy.', questions: [
    'Are consistent processes and practices in place to protect privacy and dignity?',
    'Is each participant advised of confidentiality policies in an understandable way?',
    'Does each participant understand and agree to what personal information is collected and why?'
  ]},
  { division: 'Division 1 – Rights and Responsibilities', area: 'Independence and Informed Choice', outcome: 'Each participant is supported to make informed choices, exercise control and maximise independence.', questions: [
    'Is active decision-making and individual choice supported for each participant?',
    'Is dignity of risk supported when participants make decisions?',
    'Is participant autonomy respected, including rights to intimacy and sexual expression?',
    'Does each participant have enough time to consider options and seek advice?',
    'Is each participant supported to access an advocate of their choosing?'
  ]},
  { division: 'Division 1 – Rights and Responsibilities', area: 'Violence, Abuse, Neglect, Exploitation and Discrimination', outcome: 'Each participant accesses supports free from violence, abuse, neglect, exploitation or discrimination.', questions: [
    'Are policies, procedures and practices in place to actively prevent violence, abuse, neglect, exploitation or discrimination?',
    'Is advocacy information provided and access facilitated where allegations are made?',
    'Are allegations and incidents acted upon, recorded, reviewed and used to prevent recurrence?'
  ]},
  { division: 'Division 2 – Governance and Operational Management', area: 'Governance and Operational Management', outcome: 'Participant support is overseen by robust governance and operational management systems proportionate to the provider.', questions: [
    'Is participant input used in governance, policy and process development?',
    'Is a defined structure implemented to meet financial, legislative, regulatory and contractual responsibilities?',
    'Are governance skills and training needs identified and addressed?',
    'Does strategic and business planning consider legislation, risks, NDIS requirements, participant and worker needs?',
    'Is management performance monitored to drive continuous improvement?',
    'Are roles, responsibilities, authority and accountability clearly defined?',
    'Is delegated responsibility documented for absence of usual position holders?',
    'Are conflicts of interest proactively managed and documented?'
  ]},
  { division: 'Division 2 – Governance and Operational Management', area: 'Risk Management', outcome: 'Risks to participants, workers and the provider are identified and managed.', questions: [
    'Are participant, financial, WHS and support delivery risks identified, analysed, prioritised and treated?',
    'Is a documented risk management system in place and proportionate?',
    'Does the risk system cover incidents, complaints, finance, governance, HR, information, WHS and emergency management?',
    'Are infection prevention and outbreak controls included where relevant?',
    'Are supports provided consistently with the risk management system?',
    'Is appropriate insurance in place?'
  ]},
  { division: 'Division 2 – Governance and Operational Management', area: 'Quality Management', outcome: 'Participants benefit from a quality management system that promotes continuous improvement.', questions: [
    'Is a quality management system maintained and reviewed?',
    'Is a documented internal audit program/schedule in place?',
    'Does quality management use outcomes, risk data, evidence-informed practice and feedback?'
  ]},
  { division: 'Division 2 – Governance and Operational Management', area: 'Information Management', outcome: 'Participant information is identifiable, accurate, current, confidential and accessible.', questions: [
    'Is consent obtained to collect, use, retain and disclose participant information?',
    'Is each participant informed how information is stored, used, accessed, corrected or consent withdrawn?',
    'Is an information management system maintained with accurate and timely records?',
    'Are documents managed with appropriate access, security, transfer, retention, destruction and disposal processes?'
  ]},
  { division: 'Division 2 – Governance and Operational Management', area: 'Feedback and Complaints Management', outcome: 'Feedback and complaints are welcomed, acknowledged, respected and well managed.', questions: [
    'Is a complaints management and resolution system maintained consistent with procedural fairness and NDIS rules?',
    'Is each participant told how to provide feedback or complain, including external pathways and advocacy?',
    'Is continuous improvement demonstrated through complaint and feedback review?',
    'Are workers aware of, trained in and compliant with complaints procedures?'
  ]},
  { division: 'Division 2 – Governance and Operational Management', area: 'Incident Management', outcome: 'Participants are safeguarded by an incident management system that acknowledges, responds to and learns from incidents.', questions: [
    'Is an incident management system maintained and compliant with NDIS incident rules?',
    'Is each participant provided information about incident management?',
    'Is continuous improvement in incident management demonstrated?',
    'Are workers aware of, trained in and compliant with incident procedures?'
  ]},
  { division: 'Division 2 – Governance and Operational Management', area: 'Human Resource Management', outcome: 'Participant support needs are met by competent workers with suitable qualifications, expertise and experience.', questions: [
    'Are skills, knowledge, responsibilities, scope and limitations documented for each position?',
    'Are worker checks, qualifications and experience records maintained?',
    'Is orientation and induction completed including NDIS worker orientation?',
    'Is training identified, planned, recorded and evaluated?',
    'Are supervision, support and resources available to workers?',
    'Is worker performance managed, developed and documented?',
    'Are emergency/disaster capable workers identified and workforce disruption plans in place?',
    'Is infection prevention and control training undertaken and refreshed?',
    'Are worker contact details and secondary employment details recorded and current?'
  ]},
  { division: 'Division 2 – Governance and Operational Management', area: 'Continuity of Supports', outcome: 'Each participant has timely and appropriate support without interruption.', questions: [
    'Are day-to-day operations managed to avoid disruption and ensure continuity?',
    'Is a suitably qualified or experienced person available for worker absence or vacancy?',
    'Are supports planned with each participant and preferences provided to workers before service starts?',
    'Are arrangements in place to provide support without interruption throughout the service agreement?',
    'Are alternative arrangements explained and agreed when changes or interruptions are unavoidable?',
    'Are disaster preparedness measures in place for critical supports?'
  ]},
  { division: 'Division 2 – Governance and Operational Management', area: 'Emergency and disaster management', outcome: 'Emergency and disaster planning mitigates risks and ensures continuity of critical supports.', questions: [
    'Are measures in place to continue critical supports before, during and after an emergency or disaster?',
    'Do measures include preparation, support changes, rapid response and communication to workers and support networks?',
    'Does the governing body develop, consult on and implement emergency and disaster plans?',
    'Do plans guide governance response and oversight?',
    'Are plans tested, adjusted and periodically reviewed?',
    'Are plans communicated to workers, participants and support networks?',
    'Is each worker trained in plan implementation?'
  ]},
  { division: 'Division 3 – Provision of Supports', area: 'Access to Supports', outcome: 'Each participant accesses appropriate supports that meet their needs, goals and preferences.', questions: [
    'Are available supports, access criteria and costs clearly defined, documented and communicated?',
    'Are reasonable adjustments made and monitored so support environments remain fit for purpose?',
    'Is each participant supported to understand circumstances where supports can be withdrawn?'
  ]},
  { division: 'Division 3 – Provision of Supports', area: 'Support Planning', outcome: 'Each participant is actively involved in support planning and reviews.', questions: [
    'Is support planning completed with participant consent and support network involvement where appropriate?',
    'Are risk assessments regularly undertaken, documented and treated in support plans?',
    'Are risk strategies reviewed with each participant and changed when required?',
    'Are support plans reviewed annually or earlier when needs change?',
    'Are plans updated when progress differs from expected outcomes?',
    'Are support plans provided in accessible language and available to participants and workers?',
    'Are support plans communicated to support networks, providers and agencies with consent?',
    'Do plans include preventative health measures where required?',
    'Do plans incorporate emergency and disaster response arrangements?'
  ]},
  { division: 'Division 3 – Provision of Supports', area: 'Service Agreements with Participants', outcome: 'Each participant understands chosen supports and how they will be provided.', questions: [
    'Are service agreements developed collaboratively and do they establish expectations, supports and conditions?',
    'Is each participant supported to understand their service agreement in accessible language?',
    'Does each participant receive a signed copy or is any exception documented?',
    'Do service agreements include emergency or disaster support arrangements?'
  ]},
  { division: 'Division 3 – Provision of Supports', area: 'Responsive Support Provision', outcome: 'Each participant accesses responsive, timely, competent and appropriate supports.', questions: [
    'Are supports based on least intrusive options and evidence-informed practice?',
    'Are links maintained with other providers with participant consent?',
    'Are reasonable efforts made to involve participants in selecting workers?',
    'Are workers trained in participant-specific needs where monitoring or daily support is required?'
  ]},
  { division: 'Division 3 – Provision of Supports', area: 'Transitions to or from the provider', outcome: 'Each participant experiences planned and coordinated transitions.', questions: [
    'Are transitions planned, documented, communicated and managed with participants where possible?',
    'Are transition risks identified, documented and responded to?',
    'Are transition processes developed, applied, reviewed and communicated?'
  ]},
  { division: 'Division 4 – Support Provision Environment', area: 'Safe Environment', outcome: 'Each participant accesses supports in a safe environment appropriate to their needs.', questions: [
    'Can each participant easily identify workers who provide supports?',
    'Is work undertaken with participants to ensure safe support delivery environments?',
    'Where relevant, is work undertaken with other providers to identify and manage risks?',
    'Are infection prevention and control measures implemented where relevant?'
  ]}
];
const createAuditResponses = () => INTERNAL_AUDIT_TEMPLATE.flatMap(section => section.questions.map((question, idx) => ({
  id: makeId('auditq'), division: section.division, area: section.area, outcome: section.outcome, requirement: question, status: 'C', findings: '', evidence: '', actionRequired: '', priority: 'Medium', responsiblePerson: '', reviewDate: '', ncRaised: false, improvementItem: false, riskRaised: false
})));

const REGISTER_LABELS = {
  referenceNumber: 'Reference number',
  date: 'Date',
  sourceOfFeedback: 'Source of feedback',
  opportunityForImprovement: 'Opportunity for improvement',
  relevantStandardIndicator: 'Relevant standard and indicator of practice',
  actionsRequired: 'Actions required',
  priority: 'Priority',
  byWhen: 'By when',
  status: 'Status',
  outcome: 'Outcome',
  review: 'Review',
  auditArea: 'Policy / Procedure',
  dateReviewLastCompleted: 'Date review last completed',
  dateNextDue: 'Date next due',
  number: 'No',
  taskActivityArea: 'Tasks or Activity or Area',
  issueHazardAspect: 'Issue / Hazard / Aspect',
  riskImpact: 'Risk / Impact',
  consequence: 'Consequence',
  likelihood: 'Likelihood',
  riskScore: 'Risk score',
  controlMeasures: 'Control measures',
  personResponsible: 'Person responsible',
  residualConsequence: 'Residual consequence',
  residualLikelihood: 'Residual likelihood',
  residualRiskScore: 'Residual risk score',
  participantName: 'Participant',
  participantId: 'Participant',
  title: 'Title',
  category: 'Category',
  owner: 'Owner',
  evidence: 'Evidence',
  notes: 'Notes',
};
const registerLabel = (field) => REGISTER_LABELS[field] || String(field).replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
const nextRef = (prefix, rows = []) => `${prefix}-${String((rows?.length || 0) + 1).padStart(4, '0')}`;
const riskScoreFrom = (consequence, likelihood) => {
  const c = { Insignificant: 1, Minor: 2, Moderate: 3, Major: 4, Severe: 5 }[consequence] || 0;
  const l = { Rare: 1, Unlikely: 2, Possible: 3, Likely: 4, 'Almost Certain': 5 }[likelihood] || 0;
  return c && l ? c * l : '';
};
const recordDisplayTitle = (record = {}) => record.title || record.auditArea || record.referenceNumber || record.taskActivityArea || record.issueHazardAspect || record.category || 'Untitled';
const emptyRecordFor = (type, rows = []) => {
  const base = { id: makeId(type), title: '', participantId: '', participantName: '', category: '', date: todayISO(), owner: '', status: 'Open', evidence: '', notes: '', createdAt: new Date().toISOString(),
    likelihood: 'Possible', impact: 'Moderate', rating: 'Medium', treatment: '', reviewDate: addDaysISO(90),
    number: (rows?.length || 0) + 1, taskActivityArea: '', issueHazardAspect: '', riskImpact: '', consequence: 'Moderate', riskScore: 9, controlMeasures: '', personResponsible: '', residualConsequence: 'Minor', residualLikelihood: 'Unlikely', residualRiskScore: 4,
    severity: 'Low', reportable: 'No', immediateAction: '', followUp: '',
    receivedBy: '', details: '', resolution: '',
    referenceNumber: type === 'improvements' ? nextRef('CIR', rows) : '', sourceOfFeedback: 'Audit', opportunityForImprovement: '', relevantStandardIndicator: '', actionsRequired: '', priority: 'Medium', byWhen: addDaysISO(14), outcome: '', review: '',
    source: 'Audit', action: '', dueDate: addDaysISO(14),
    auditArea: '', dateReviewLastCompleted: '', dateNextDue: '',
    scope: 'NDIS Practice Standards', findings: '', actions: '',
    attendees: '', summary: '', decisions: '', nextReviewDate: addDaysISO(90),
    version: '1.0', location: '',
  };
  if (type === 'audits') return { ...base, title: '', referenceNumber: '', sourceOfFeedback: '', date: '', byWhen: '' };
  return base;
};
const withParticipantName = (record, clients = []) => {
  const c = clients.find(x => x.id === record.participantId);
  return { ...record, participantName: record.participantName || c?.name || '' };
};

function auditReportSummary(report = {}) {
  const rows = Array.isArray(report.responses) ? report.responses : [];
  return {
    total: rows.length,
    c: rows.filter(r => r.status === 'C').length,
    nc: rows.filter(r => r.status === 'NC').length,
    ofi: rows.filter(r => r.status === 'OFI').length,
    na: rows.filter(r => r.status === 'NA').length,
    actions: rows.filter(r => r.actionRequired || r.ncRaised || r.improvementItem || r.riskRaised).length,
  };
}
function newAuditReport() {
  const now = new Date();
  return { id: makeId('auditReport'), auditNo: `IA-${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`, auditDate: todayISO(), scope: 'NDIS Practice Standards internal audit', site: 'Head Office', auditTeam: '', auditees: '', status: 'Draft', responses: createAuditResponses(), createdAt: new Date().toISOString() };
}
function exportInternalAuditReportPdf({ business = {}, report = {} }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12; const right = pageWidth - margin; let y = 18;
  const summary = auditReportSummary(report);
  const ensure = (n=12) => { if (y + n > pageHeight - 20) { doc.addPage(); y = 18; header(); } };
  const header = () => {
    doc.setFillColor(7, 52, 139); doc.rect(0,0,pageWidth,28,'F');
    doc.setTextColor(255,255,255); doc.setFont(undefined,'bold'); doc.setFontSize(15); doc.text('Kajola Care Internal Audit Report', margin, 12);
    doc.setFont(undefined,'normal'); doc.setFontSize(8); doc.text(`${safeText(report.auditNo || 'Internal Audit')} · ${fmt(report.auditDate)} · ${safeText(report.site || 'Head Office')}`, margin, 19);
    doc.setFont(undefined,'bold'); doc.text(safeText(business.name || 'Kajola Care'), right, 12, { align:'right' });
    doc.setFont(undefined,'normal'); doc.text([business.abn ? `ABN ${business.abn}` : '', business.email || '', business.phone || ''].filter(Boolean).join(' · '), right, 19, { align:'right' });
    y = 36;
  };
  header();
  doc.setTextColor(15,23,42); doc.setFont(undefined,'bold'); doc.setFontSize(11); doc.text('Audit Overview', margin, y); y += 7;
  doc.setFont(undefined,'normal'); doc.setFontSize(8.5);
  [['Audit No', report.auditNo], ['Audit Date', fmt(report.auditDate)], ['Scope', report.scope], ['Site', report.site], ['Audit Team', report.auditTeam], ['Auditees', report.auditees], ['Status', report.status]].forEach(([k,v]) => { ensure(6); doc.setFont(undefined,'bold'); doc.text(`${k}:`, margin, y); doc.setFont(undefined,'normal'); doc.text(safeText(v || '-'), margin+30, y); y += 5; });
  y += 4;
  doc.setFillColor(248,250,252); doc.setDrawColor(214,226,242); doc.roundedRect(margin, y, pageWidth-margin*2, 18, 3,3,'FD');
  doc.setFont(undefined,'bold'); doc.setFontSize(8); doc.setTextColor(7,52,139);
  [['Total',summary.total], ['C',summary.c], ['NC',summary.nc], ['OFI',summary.ofi], ['NA',summary.na], ['Actions',summary.actions]].forEach(([k,v],i)=>{ const x=margin+8+i*30; doc.text(k, x, y+7); doc.setTextColor(15,23,42); doc.setFontSize(11); doc.text(String(v), x, y+14); doc.setFontSize(8); doc.setTextColor(7,52,139); });
  y += 26;
  let lastDivision = '', lastArea = '';
  (report.responses || []).forEach((row, idx) => {
    if (row.division !== lastDivision) { ensure(12); doc.setFillColor(214,235,205); doc.rect(margin, y, pageWidth-margin*2, 7, 'F'); doc.setFont(undefined,'bold'); doc.setFontSize(9); doc.setTextColor(15,23,42); doc.text(safeText(row.division), margin+2, y+5); y += 9; lastDivision = row.division; lastArea = ''; }
    if (row.area !== lastArea) { ensure(14); doc.setFillColor(255,226,203); doc.rect(margin, y, pageWidth-margin*2, 7, 'F'); doc.setFont(undefined,'bold'); doc.setFontSize(8.5); doc.text(safeText(row.area), margin+2, y+5); y += 8; doc.setFont(undefined,'normal'); doc.setFontSize(7); doc.text(doc.splitTextToSize(safeText(row.outcome), pageWidth-margin*2-4), margin+2, y); y += Math.max(5, doc.splitTextToSize(safeText(row.outcome), pageWidth-margin*2-4).length*3.5); lastArea = row.area; }
    ensure(22);
    doc.setDrawColor(226,232,240); doc.line(margin, y, right, y); y += 4;
    doc.setFont(undefined,'bold'); doc.setFontSize(7.5); doc.setTextColor(15,23,42); doc.text(`${idx+1}.`, margin, y);
    doc.text(doc.splitTextToSize(safeText(row.requirement), 78), margin+6, y);
    doc.setTextColor(row.status === 'NC' ? 185 : row.status === 'OFI' ? 180 : 22, row.status === 'NC' ? 28 : row.status === 'OFI' ? 83 : 101, row.status === 'NC' ? 28 : row.status === 'OFI' ? 9 : 52);
    doc.text(safeText(row.status || 'C'), margin+88, y);
    doc.setTextColor(51,65,85); doc.setFont(undefined,'normal');
    const findingLines = doc.splitTextToSize(safeText(row.findings || '-'), 84).slice(0,5);
    doc.text(findingLines, margin+100, y);
    y += Math.max(9, findingLines.length*3.7 + 2);
    if (row.evidence || row.actionRequired) { doc.setFontSize(7); doc.setTextColor(71,85,105); const extra = [row.evidence ? `Evidence: ${row.evidence}` : '', row.actionRequired ? `Action: ${row.actionRequired}` : ''].filter(Boolean).join(' | '); doc.text(doc.splitTextToSize(safeText(extra), pageWidth-margin*2-8), margin+6, y); y += Math.max(4, doc.splitTextToSize(safeText(extra), pageWidth-margin*2-8).length*3.4); }
  });
  const pages = doc.internal.getNumberOfPages();
  for (let i=1;i<=pages;i++){ doc.setPage(i); doc.setDrawColor(226,232,240); doc.line(margin, pageHeight-13, right, pageHeight-13); doc.setFontSize(7); doc.setTextColor(100,116,139); doc.text('Status legends: C - Conformance, NC - Non-Conformance, OFI - Opportunity for Improvement, NA - Not Applicable', margin, pageHeight-8); doc.text(`Page ${i} of ${pages}`, right, pageHeight-8, {align:'right'}); }
  doc.save(`${cleanFile(business.name)}-${cleanFile(report.auditNo || 'internal-audit-report')}.pdf`);
}
function exportInternalAuditSummaryPdf({ business = {}, auditReports = [] }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' }); let y=18; const margin=14; const right=196;
  doc.setFont(undefined,'bold'); doc.setFontSize(16); doc.text('Internal Audit Reports Register', margin, y); y+=8;
  doc.setFont(undefined,'normal'); doc.setFontSize(9); doc.text(`${business.name || 'Kajola Care'} · Generated ${fmt(todayISO())}`, margin, y); y+=12;
  if (!auditReports.length) doc.text('No internal audit reports found.', margin, y);
  auditReports.forEach(r => { const sum=auditReportSummary(r); if (y>270){doc.addPage(); y=18;} doc.setFont(undefined,'bold'); doc.text(`${r.auditNo || 'Internal Audit'} — ${fmt(r.auditDate)}`, margin, y); doc.setFont(undefined,'normal'); doc.text(`Status ${r.status || '-'} · C ${sum.c} · NC ${sum.nc} · OFI ${sum.ofi} · NA ${sum.na}`, margin, y+5); y+=12; });
  doc.save(`${cleanFile(business.name)}-internal-audit-reports.pdf`);
}
function InternalAuditReports({ business, auditReports = [], setAuditReports, setImprovements, setRisks, setDocuments }) {
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(newAuditReport());
  const [open, setOpen] = useState(false);
  const activeReport = editingId ? draft : null;
  const startNew = () => { setDraft(newAuditReport()); setEditingId(null); setOpen(true); window.scrollTo(0,0); };
  const editReport = (r) => { setDraft({ ...newAuditReport(), ...r, responses: Array.isArray(r.responses) && r.responses.length ? r.responses : createAuditResponses() }); setEditingId(r.id); setOpen(true); window.scrollTo(0,0); };
  const updateDraft = (field, value) => setDraft(prev => ({ ...prev, [field]: value }));
  const updateResponse = (id, field, value) => setDraft(prev => ({ ...prev, responses: prev.responses.map(r => r.id === id ? { ...r, [field]: value } : r) }));
  const saveReport = () => {
    const enriched = { ...draft, id: draft.id || makeId('auditReport'), updatedAt: new Date().toISOString() };
    setAuditReports(prev => editingId ? prev.map(r => r.id === editingId ? enriched : r) : [enriched, ...prev]);
    setEditingId(enriched.id); setOpen(false);
  };
  const delReport = (id) => { if (confirm('Delete this internal audit report?')) setAuditReports(prev => prev.filter(r => r.id !== id)); };
  const createLinkedItems = () => {
    const actionRows = (draft.responses || []).filter(r => r.status === 'NC' || r.status === 'OFI' || r.actionRequired || r.improvementItem || r.riskRaised);
    const now = new Date().toISOString();
    const ciRows = actionRows.filter(r => r.status === 'NC' || r.status === 'OFI' || r.improvementItem || r.actionRequired).map((r, idx) => ({ id: makeId('improvements'), referenceNumber: nextRef('CIR', []), date: todayISO(), sourceOfFeedback: `Internal audit ${draft.auditNo}`, opportunityForImprovement: r.requirement, relevantStandardIndicator: `${r.division} / ${r.area}`, actionsRequired: r.actionRequired || r.findings || 'Review and action finding.', priority: r.priority || 'Medium', byWhen: r.reviewDate || addDaysISO(30), status: 'Open', outcome: '', review: r.findings || '', evidence: r.evidence || '', createdAt: now }));
    const riskRows = actionRows.filter(r => r.riskRaised || r.status === 'NC').map((r, idx) => ({ id: makeId('risks'), number: idx + 1, taskActivityArea: r.area, issueHazardAspect: r.requirement, riskImpact: r.findings || r.actionRequired || 'Internal audit finding requiring risk review.', consequence: 'Moderate', likelihood: 'Possible', riskScore: 9, controlMeasures: r.actionRequired || '', personResponsible: r.responsiblePerson || '', residualConsequence: 'Minor', residualLikelihood: 'Unlikely', residualRiskScore: 4, status: 'Open', evidence: r.evidence || '', createdAt: now }));
    if (ciRows.length) setImprovements(prev => [...ciRows.map((x,i)=>({ ...x, referenceNumber: nextRef('CIR', [...prev, ...ciRows.slice(0,i)]) })), ...prev]);
    if (riskRows.length) setRisks(prev => [...riskRows.map((x,i)=>({ ...x, number: prev.length + i + 1 })), ...prev]);
    setDocuments(prev => [{ id: makeId('documents'), title: `Internal Audit Report ${draft.auditNo}`, category: 'Internal Audit', owner: draft.auditTeam || 'Management', reviewDate: draft.auditDate, version: '1.0', location: 'Generated in Kajola Care', status: draft.status || 'Draft', notes: `${ciRows.length} CI items and ${riskRows.length} risk items linked.`, createdAt: now }, ...prev]);
    alert(`Linked ${ciRows.length} improvement item(s), ${riskRows.length} risk item(s), and 1 evidence library record.`);
  };
  const reportsWithSummary = auditReports.map(r => ({ ...r, summary: auditReportSummary(r) }));
  const grouped = (draft.responses || []).reduce((acc, row) => { const key = `${row.division}||${row.area}`; if (!acc[key]) acc[key] = { division: row.division, area: row.area, outcome: row.outcome, rows: [] }; acc[key].rows.push(row); return acc; }, {});
  return <>
    <Card title="Internal Audit Reports" action={<button className="primary" onClick={startNew}>+ Run Audit</button>}>
      <p>Use the Form15-style audit engine inside Kajola Care. Each question captures status, findings, evidence, actions, responsibility and review date. NC/OFI findings can create continuous improvement, risk and evidence records automatically.</p>
      <div className="report-summary-grid"><InsightCard label="Reports" value={auditReports.length} sub="Saved audits"/><InsightCard label="Open" value={auditReports.filter(r=>r.status !== 'Closed').length} sub="Draft or active"/><InsightCard label="NC" value={auditReports.reduce((s,r)=>s+auditReportSummary(r).nc,0)} sub="Non-conformances"/><InsightCard label="OFI" value={auditReports.reduce((s,r)=>s+auditReportSummary(r).ofi,0)} sub="Improvements"/></div>
      <div className="report-actions"><button onClick={() => exportInternalAuditSummaryPdf({ business, auditReports })}>Export Register PDF</button></div>
    </Card>
    {open && <Card title={editingId ? `Edit ${draft.auditNo}` : 'Run Internal Audit'} action={<button onClick={() => setOpen(false)}>Close</button>}>
      <div className="grid"><Field label="Audit No" value={draft.auditNo} onChange={e=>updateDraft('auditNo', e.target.value)}/><Field label="Audit Date" type="date" value={draft.auditDate} onChange={e=>updateDraft('auditDate', e.target.value)}/><Field label="Audit Scope" value={draft.scope} onChange={e=>updateDraft('scope', e.target.value)}/><Field label="Site Audited" value={draft.site} onChange={e=>updateDraft('site', e.target.value)}/><Field label="Audit Team" value={draft.auditTeam} onChange={e=>updateDraft('auditTeam', e.target.value)}/><Field label="Auditees" value={draft.auditees} onChange={e=>updateDraft('auditees', e.target.value)}/><label><span>Status</span><select value={draft.status || 'Draft'} onChange={e=>updateDraft('status', e.target.value)}><option>Draft</option><option>In Progress</option><option>Completed</option><option>Closed</option></select></label></div>
      <div className="report-actions"><button className="primary" onClick={saveReport}>Save Audit Report</button><button onClick={() => exportInternalAuditReportPdf({ business, report: draft })}>Export PDF</button><button onClick={createLinkedItems}>Create Linked CI/Risk/Evidence</button></div>
      <div className="audit-builder">
        {Object.values(grouped).map(group => <section className="audit-section" key={`${group.division}-${group.area}`}><h4>{group.division}</h4><h5>{group.area}</h5><p>{group.outcome}</p>{group.rows.map(row => <div className="audit-question" key={row.id}><div><b>{row.requirement}</b></div><div className="audit-response-grid"><label><span>Status</span><select value={row.status || 'C'} onChange={e=>updateResponse(row.id,'status',e.target.value)}><option>C</option><option>NC</option><option>OFI</option><option>NA</option></select></label><Field label="Findings / Comments / Remarks" multiline value={row.findings || ''} onChange={e=>updateResponse(row.id,'findings',e.target.value)}/><Field label="Evidence Link" value={row.evidence || ''} onChange={e=>updateResponse(row.id,'evidence',e.target.value)}/><Field label="Actions Required" multiline value={row.actionRequired || ''} onChange={e=>updateResponse(row.id,'actionRequired',e.target.value)}/><label><span>Priority</span><select value={row.priority || 'Medium'} onChange={e=>updateResponse(row.id,'priority',e.target.value)}><option>Low</option><option>Medium</option><option>High</option><option>Critical</option></select></label><Field label="Responsible Person" value={row.responsiblePerson || ''} onChange={e=>updateResponse(row.id,'responsiblePerson',e.target.value)}/><Field label="Review Date" type="date" value={row.reviewDate || ''} onChange={e=>updateResponse(row.id,'reviewDate',e.target.value)}/><label className="checkline"><input type="checkbox" checked={!!row.improvementItem} onChange={e=>updateResponse(row.id,'improvementItem',e.target.checked)}/> Create CI item</label><label className="checkline"><input type="checkbox" checked={!!row.riskRaised} onChange={e=>updateResponse(row.id,'riskRaised',e.target.checked)}/> Create risk item</label></div></div>)}</section>)}
      </div>
    </Card>}
    <Card title="Saved Internal Audit Reports" action={`${auditReports.length} saved`}>
      <div className="reg-list"><Records rows={reportsWithSummary} empty="No internal audit reports yet." render={r => {
        const tone = r.status === 'Closed' || r.status === 'Completed' ? 'green' : r.status === 'In Progress' ? 'amber' : 'red';
        return <div className="reg-row" key={r.id}>
          <div className="reg-main">
            <b>{r.auditNo}</b>
            <small>{r.site || 'No site'} · {fmt(r.auditDate)}</small>
            <small className="reg-note">{r.scope || 'No scope noted'} · C {r.summary.c} · NC {r.summary.nc} · OFI {r.summary.ofi} · NA {r.summary.na} · {r.summary.actions} action(s)</small>
          </div>
          <span className={`pill ${tone}`}>{r.status || 'Draft'}</span>
          <div className="reg-actions"><button className="ghost" onClick={()=>editReport(r)}>Edit</button><button className="ghost" onClick={()=>exportInternalAuditReportPdf({ business, report: r })}>PDF</button><button className="ghost danger-ghost" onClick={()=>delReport(r.id)}>Delete</button></div>
        </div>;
      }} /></div>
    </Card>
  </>;
}

function downloadCsv(filename, rows, cols) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [cols.map(c => esc(registerLabel(c))).join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
}
function exportRegisterPdf({ business = {}, title, rows = [], cols = [] }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const margin = 14; let y = 18; const pageWidth = doc.internal.pageSize.getWidth(); const right = pageWidth - margin;
  const addHeader = () => { doc.setFontSize(16); doc.setFont(undefined, 'bold'); doc.text(title, margin, y); doc.setFont(undefined, 'normal'); doc.setFontSize(9); doc.text(`${business.name || 'Business'} · Generated ${fmt(todayISO())}`, margin, y + 6); y += 16; };
  const ensure = (n=12) => { if (y + n > 282) { doc.addPage(); y = 18; addHeader(); } };
  addHeader();
  if (!rows.length) { doc.text('No records found.', margin, y); }
  rows.forEach((row, idx) => { ensure(22); doc.setFont(undefined, 'bold'); doc.setFontSize(10); doc.text(`${idx + 1}. ${safeText(recordDisplayTitle(row))}`, margin, y); y += 5; doc.setFont(undefined, 'normal'); doc.setFontSize(8); cols.filter(c => c !== 'title').forEach(c => { const text = `${registerLabel(c)}: ${safeText(row[c])}`; doc.splitTextToSize(text, right - margin).slice(0,3).forEach(line => { ensure(5); doc.text(line, margin + 3, y); y += 4; }); }); y += 3; });
  doc.save(`${cleanFile(business.name)}-${cleanFile(title)}.pdf`);
}
function cleanFile(value) { return String(value || 'kajola-care').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase(); }

function ReportsWorkspace({ business, transactions = [], clients = [], risks = [], incidents = [], complaints = [], improvements = [], audits = [], auditReports = [], governanceReviews = [], documents = [], workers = [], shifts = [], invoices = [] }) {
  const [period, setPeriod] = useState('1m');
  const rows = getTransactionReportRows(transactions, period);
  const summary = transactionReportSummary(rows);
  const recentRows = rows.slice(0, 12);

  // Insight KPIs
  const now = new Date();
  const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthKey = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;
  const incomeIn = (key) => transactions.filter(t => t.type === 'income' && (t.date || '').slice(0, 7) === key).reduce((s, t) => s + Number(t.amount || 0), 0);
  const thisRev = incomeIn(thisMonthKey), lastRev = incomeIn(lastMonthKey);
  const revenueGrowth = lastRev ? Math.round(((thisRev - lastRev) / lastRev) * 100) : (thisRev ? 100 : 0);
  const completed = shifts.filter(s => s.status === 'Completed');
  const clockedIn = completed.filter(s => s.startedAt);
  const clockInPct = completed.length ? Math.round((clockedIn.length / completed.length) * 100) : 100;
  const plansExpiring = clients.filter(c => { const d = daysUntil(c.planEndDate); return d !== null && d >= 0 && d <= 60; }).length;
  const incidentsThisMonth = incidents.filter(i => (i.date || i.createdAt || '').slice(0, 7) === thisMonthKey).length;

  return <>
    <Card title="Reports & Insights" action="Your key insights at a glance">
      <div className="ops-stat-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', margin: '4px 0 0' }}>
        <div className="mini-kpi"><small style={{ color: 'var(--muted)', textTransform: 'uppercase', fontSize: '11px', fontWeight: 700 }}>Revenue Growth</small><b style={{ color: revenueGrowth >= 0 ? 'var(--green)' : 'var(--red)' }}>{revenueGrowth >= 0 ? '▲' : '▼'} {Math.abs(revenueGrowth)}%</b><small style={{ color: 'var(--muted)' }}>vs last month</small></div>
        <div className="mini-kpi"><small style={{ color: 'var(--muted)', textTransform: 'uppercase', fontSize: '11px', fontWeight: 700 }}>Clock-in Compliance</small><b>{clockInPct}%</b><small style={{ color: 'var(--muted)' }}>Completed shifts</small></div>
        <div className="mini-kpi"><small style={{ color: 'var(--muted)', textTransform: 'uppercase', fontSize: '11px', fontWeight: 700 }}>Plans Expiring Soon</small><b style={{ color: plansExpiring ? 'var(--amber)' : 'var(--ink)' }}>{plansExpiring}</b><small style={{ color: 'var(--muted)' }}>Within 60 days</small></div>
        <div className="mini-kpi"><small style={{ color: 'var(--muted)', textTransform: 'uppercase', fontSize: '11px', fontWeight: 700 }}>Incidents This Month</small><b style={{ color: incidentsThisMonth ? 'var(--red)' : 'var(--ink)' }}>{incidentsThisMonth}</b><small style={{ color: 'var(--muted)' }}>Logged this month</small></div>
      </div>
    </Card>
    <Card title="Reports" action="PDF & CSV exports">
      <p>Generate professional transaction reports for management records, bookkeeping and reconciliation.</p>
      <div className="report-periods">
        {TRANSACTION_REPORT_PERIODS.map(option => <button key={option.key} className={period === option.key ? 'active' : ''} onClick={() => setPeriod(option.key)}>{option.label}</button>)}
      </div>
    </Card>
    <Card title="Transaction Report" action={`${rows.length} transactions`}>
      <p style={{ marginTop: 0 }}>Download a professional transaction report for the selected period. The full register lives in Finance.</p>
      <div className="report-summary-grid">
        <InsightCard label="Income" value={money(summary.income)} sub="For selected period" />
        <InsightCard label="Expenses" value={money(summary.expenses)} sub="For selected period" />
        <InsightCard label="Net" value={money(summary.net)} sub="Income less expenses" />
        <InsightCard label="Count" value={summary.count} sub="Transactions included" />
      </div>
      <div className="report-actions">
        <div className="report-button-row"><button className="primary" onClick={() => exportTransactionReportPdf({ business, transactions, period })}>Download PDF</button><button onClick={() => exportTransactionReportCsv({ business, transactions, period })}>Download CSV</button></div>
        <small>Period: {TRANSACTION_REPORT_PERIODS.find(p => p.key === period)?.label || '1 month'}</small>
      </div>
    </Card>
    <Card title="Audit & Compliance Evidence Pack" action="PDF/CSV">
      <p>Export live registers for audit evidence. Each register is audit-ready as PDF or CSV.</p>
      <div className="evidence-grid">
        <EvidenceCard business={business} title="Risk Register" count={risks.length} rows={risks.map(r => withParticipantName(r, clients))} cols={EXPORT_COLUMNS.risks} icon="⚠" />
        <EvidenceCard business={business} title="Incident Register" count={incidents.length} rows={incidents.map(r => withParticipantName(r, clients))} cols={EXPORT_COLUMNS.incidents} icon="◎" />
        <EvidenceCard business={business} title="Complaints Register" count={complaints.length} rows={complaints.map(r => withParticipantName(r, clients))} cols={EXPORT_COLUMNS.complaints} icon="◷" />
        <EvidenceCard business={business} title="Continuous Improvement" count={improvements.length} rows={improvements} cols={EXPORT_COLUMNS.improvements} icon="✦" />
        <EvidenceCard business={business} title="Internal Audit Schedule" count={audits.length} rows={audits} cols={EXPORT_COLUMNS.audits} icon="▤" />
        <EvidenceCard business={business} title="Internal Audit Reports" count={auditReports.length} pdfOnly onPdf={() => exportInternalAuditSummaryPdf({ business, auditReports })} icon="▥" />
        <EvidenceCard business={business} title="Governance Reviews" count={governanceReviews.length} rows={governanceReviews} cols={EXPORT_COLUMNS.governanceReviews} icon="◈" />
        <EvidenceCard business={business} title="Evidence Library" count={documents.length} rows={documents} cols={EXPORT_COLUMNS.documents} icon="▢" />
      </div>
    </Card>
  </>;
}
function EvidenceCard({ business, title, count, rows, cols, icon, pdfOnly, onPdf }) {
  return (
    <div className="evidence-card">
      <div className="evidence-head">
        <span className="evidence-icon">{icon}</span>
        <div className="evidence-title"><b>{title}</b><small>{count} record{count === 1 ? '' : 's'}</small></div>
      </div>
      <div className="evidence-actions">
        <button className="primary" onClick={() => pdfOnly ? onPdf() : exportRegisterPdf({ business, title, rows, cols })}>PDF</button>
        {!pdfOnly && <button onClick={() => downloadCsv(`${cleanFile(title)}.csv`, rows, cols)}>CSV</button>}
      </div>
    </div>
  );
}
function ComplianceExportButton({ business, title, rows, cols }) { return <span className="report-button-row"><button onClick={() => exportRegisterPdf({ business, title, rows, cols })}>{title} PDF</button><button onClick={() => downloadCsv(`${cleanFile(title)}.csv`, rows, cols)}>CSV</button></span>; }


function MiniLineChart({ points = [], height = 200, stroke = 'var(--blue)' }) {
  if (!points.length) return <p className="empty">No data for this period.</p>;
  const max = Math.max(...points.map(p => p.value), 1);
  const min = Math.min(...points.map(p => p.value), 0);
  const range = max - min || 1;
  const w = 600, h = height, pad = 24;
  const x = (i) => pad + (i / Math.max(1, points.length - 1)) * (w - pad * 2);
  const y = (v) => h - pad - ((v - min) / range) * (h - pad * 2);
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)} ${h - pad} L${x(0).toFixed(1)} ${h - pad} Z`;
  return <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height }}>
    <defs><linearGradient id="rt-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={stroke} stopOpacity="0.18" /><stop offset="100%" stopColor={stroke} stopOpacity="0" /></linearGradient></defs>
    <path d={area} fill="url(#rt-fill)" />
    <path d={line} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
    {points.map((p, i) => <g key={i}><circle cx={x(i)} cy={y(p.value)} r="3.5" fill="#fff" stroke={stroke} strokeWidth="2" /><text x={x(i)} y={h - 6} textAnchor="middle" fontSize="10" fill="var(--muted)">{p.label}</text></g>)}
  </svg>;
}

function DonutChart({ segments = [], size = 180 }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = size / 2 - 16, cx = size / 2, cy = size / 2, sw = 26;
  let acc = 0;
  const arcs = segments.map((seg, idx) => {
    const frac = seg.value / total;
    const start = acc * 2 * Math.PI - Math.PI / 2;
    acc += frac;
    const end = acc * 2 * Math.PI - Math.PI / 2;
    const large = frac > 0.5 ? 1 : 0;
    const x1 = cx + r * Math.cos(start), y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(end), y2 = cy + r * Math.sin(end);
    return <path key={idx} d={`M${x1.toFixed(1)} ${y1.toFixed(1)} A${r} ${r} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`} fill="none" stroke={seg.color} strokeWidth={sw} strokeLinecap="butt" />;
  });
  return <div style={{ display: 'flex', alignItems: 'center', gap: '18px', flexWrap: 'wrap' }}>
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>{arcs}</svg>
    <div style={{ display: 'grid', gap: '8px', flex: 1, minWidth: '160px' }}>
      {segments.map((seg, idx) => <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', fontSize: '13px' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--ink-2)' }}><span style={{ width: '10px', height: '10px', borderRadius: '50%', background: seg.color }} />{seg.label}</span>
        <b>{Math.round((seg.value / total) * 100)}%</b>
      </div>)}
    </div>
  </div>;
}

function BusinessPerformance({ business, transactions = [], invoices = [], clients = [] }) {
  const income = transactions.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount || 0), 0);
  const expenses = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount || 0), 0);
  const profit = income - expenses;
  const outstanding = invoices.filter(i => !['Paid', 'Cancelled'].includes(normaliseInvoiceStatus(i.status))).reduce((s, i) => s + Number(i.total || 0), 0);

  // Revenue trend: last 6 months of income transactions.
  const months = [];
  const base = new Date();
  for (let k = 5; k >= 0; k--) {
    const d = new Date(base.getFullYear(), base.getMonth() - k, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months.push({ key, label: d.toLocaleString('en-AU', { month: 'short' }), value: 0 });
  }
  transactions.filter(t => t.type === 'income').forEach(t => {
    const key = (t.date || '').slice(0, 7);
    const m = months.find(x => x.key === key);
    if (m) m.value += Number(t.amount || 0);
  });

  // Revenue by service type (from invoice line item labels).
  const palette = ['#1d4ed8', '#10b6b0', '#7c3aed', '#16a34a', '#d97706', '#6b7a90'];
  const byService = {};
  invoices.forEach(inv => (inv.lines || []).forEach(l => {
    const label = (l.itemLabel || l.itemCode || 'Other').split('—')[0].trim();
    byService[label] = (byService[label] || 0) + Number(l.lineTotal || (Number(l.quantity || 0) * Number(l.rate || 0)) || 0);
  }));
  const serviceSegments = Object.entries(byService).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, value], i) => ({ label, value, color: palette[i % palette.length] }));

  return <Card title="Business Performance" action="Financial overview">
    <p style={{ marginTop: 0 }}>Financial overview of your organisation.</p>
    <div className="ops-stat-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', margin: '0 0 16px' }}>
      <div className="mini-kpi"><small style={{ color: 'var(--muted)', textTransform: 'uppercase', fontSize: '11px', fontWeight: 700 }}>Revenue</small><b style={{ color: 'var(--green)' }}>{money(income)}</b></div>
      <div className="mini-kpi"><small style={{ color: 'var(--muted)', textTransform: 'uppercase', fontSize: '11px', fontWeight: 700 }}>Expenses</small><b style={{ color: 'var(--red)' }}>{money(expenses)}</b></div>
      <div className="mini-kpi"><small style={{ color: 'var(--muted)', textTransform: 'uppercase', fontSize: '11px', fontWeight: 700 }}>Profit</small><b style={{ color: profit >= 0 ? 'var(--blue)' : 'var(--red)' }}>{money(profit)}</b></div>
      <div className="mini-kpi"><small style={{ color: 'var(--muted)', textTransform: 'uppercase', fontSize: '11px', fontWeight: 700 }}>Outstanding</small><b style={{ color: 'var(--amber)' }}>{money(outstanding)}</b></div>
    </div>
    <div className="two">
      <div className="card" style={{ margin: 0, boxShadow: 'none', background: 'var(--surface-2)' }}>
        <div className="card-head"><h3>Revenue Trend</h3></div>
        <MiniLineChart points={months} />
      </div>
      <div className="card" style={{ margin: 0, boxShadow: 'none', background: 'var(--surface-2)' }}>
        <div className="card-head"><h3>Revenue by Service Type</h3></div>
        {serviceSegments.length ? <DonutChart segments={serviceSegments} /> : <p className="empty">No invoiced services yet.</p>}
      </div>
    </div>
  </Card>;
}

function FinanceWorkspace({ business, clients, transactions, invoices = [], form, setForm, editing, save, edit, updateStatus = () => {}, del, cancel }) {
  const [filters, setFilters] = useState({ type: 'all', status: 'all', clientId: 'all', sort: 'date_desc', query: '' });
  const [page, setPage] = useState(1);
  const rows = filterAndSortTransactions(transactions, filters);
  const { totalPages, safePage, start, pageRows } = paginateRows(rows, page);
  useEffect(() => { setPage(1); }, [filters.type, filters.status, filters.clientId, filters.sort, filters.query, transactions.length]);
  const setFilter = (key, value) => setFilters(prev => ({ ...prev, [key]: value }));
  const income = rows.filter(t => t.type === 'income').reduce((s,t)=>s+Number(t.amount || 0),0);
  const expenses = rows.filter(t => t.type === 'expense').reduce((s,t)=>s+Number(t.amount || 0),0);
  const businessLabel = business?.name || 'Business';
  const changeTxnType = (value) => setForm(p => ({ ...p, type: value, clientId: value === 'expense' ? p.clientId : (p.clientId === BUSINESS_TXN_CLIENT_ID ? '' : p.clientId) }));
  const [txnOpen, setTxnOpen] = useState(false);
  const openTxnNew = () => setTxnOpen(true);
  const openTxnEdit = (t) => { edit(t); setTxnOpen(true); };
  const closeTxn = () => { setTxnOpen(false); if (editing) cancel(); };
  const submitTxn = () => { save(); setTxnOpen(false); };
  useEffect(() => { if (editing) setTxnOpen(true); }, [editing]);
  return <>
    <BusinessPerformance business={business} transactions={transactions} invoices={invoices} clients={clients} />
    <Card title="Transaction Register" action={<div className="filters"><span className="list-meta" style={{ margin: 0 }}>{rows.length ? start + 1 : 0}-{Math.min(start + PAGE_SIZE, rows.length)} of {rows.length}</span><button className="primary" onClick={openTxnNew}>+ New Transaction</button></div>}>
      <div className="filters transaction-filters">
        <input value={filters.query} placeholder="Search description, client, category" onChange={e => setFilter('query', e.target.value)} />
        <select value={filters.type} onChange={e => setFilter('type', e.target.value)}><option value="all">All types</option><option value="income">Income</option><option value="expense">Expense</option></select>
        <select value={filters.status} onChange={e => setFilter('status', e.target.value)}><option value="all">All statuses</option><option value="pending">Pending</option><option value="paid">Paid</option></select>
        <select value={filters.clientId} onChange={e => setFilter('clientId', e.target.value)}><option value="all">All participants/business</option><option value="none">No participant</option><option value={BUSINESS_TXN_CLIENT_ID}>{businessLabel}</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select value={filters.sort} onChange={e => setFilter('sort', e.target.value)}><option value="date_desc">Newest date first</option><option value="date_asc">Oldest date first</option><option value="amount_desc">Highest amount first</option><option value="amount_asc">Lowest amount first</option></select>
      </div>
      <div className="register-summary"><b>Income {money(income)}</b><b>Expenses {money(expenses)}</b><b>Net {money(income-expenses)}</b></div>
      <div className="txn-list"><Records rows={pageRows} empty="No matching transactions found." render={t => <div className="txn-card" key={t.id}>
        <span className={`txn-dot ${t.type === 'expense' ? 'out' : 'in'}`}>{t.type === 'expense' ? '−' : '+'}</span>
        <div className="txn-info">
          <b>{t.description || 'Transaction'}</b>
          <small>{t.clientId === BUSINESS_TXN_CLIENT_ID ? (t.clientName || businessLabel) : (t.clientName || 'No participant')} · {t.category || 'General'}{t.invoiceNumber ? ` · Invoice ${t.invoiceNumber}` : ''}</small>
        </div>
        <time className="txn-when">{fmt(t.date)}</time>
        <select className="status-select" value={t.status || 'pending'} onChange={e => updateStatus(t.id, e.target.value)}><option value="pending">pending</option><option value="paid">paid</option></select>
        <strong className={`txn-amt ${t.type === 'expense' ? 'negative' : 'positive'}`}>{t.type === 'expense' ? '-' : '+'}{money(t.amount)}</strong>
        <div className="reg-actions"><button className="ghost" onClick={() => openTxnEdit(t)}>Edit</button><button className="ghost danger-ghost" onClick={() => del(t.id)}>Delete</button></div>
      </div>}/></div>{rows.length > PAGE_SIZE && <Pagination page={safePage} totalPages={totalPages} onPrev={() => setPage(p => Math.max(1, p - 1))} onNext={() => setPage(p => Math.min(totalPages, p + 1))} />}</Card>

    {txnOpen && <div className="modal-overlay" onClick={closeTxn}>
      <div className="modal txn-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div><h3>{editing ? 'Edit Transaction' : 'New Transaction'}</h3><small>{form.type === 'income' ? 'Record money received' : 'Record an expense or payment'}</small></div>
          <button className="modal-close" onClick={closeTxn} aria-label="Close">×</button>
        </div>
        <div className="modal-body">
          <div className="txn-type-toggle">
            <button className={form.type === 'expense' ? 'active out' : ''} onClick={() => changeTxnType('expense')}><span>−</span> Expense</button>
            <button className={form.type === 'income' ? 'active in' : ''} onClick={() => changeTxnType('income')}><span>+</span> Income</button>
          </div>
          <Field type="number" step="0.01" label="Amount" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} placeholder="0.00" />
          <Field label="Description" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="What was this for?" />
          <div className="txn-modal-grid">
            <label className="field"><span>Participant / Business</span><select value={form.clientId} onChange={e => setForm(p => ({ ...p, clientId: e.target.value }))}><option value="">No participant</option>{form.type === 'expense' && <option value={BUSINESS_TXN_CLIENT_ID}>{businessLabel}</option>}{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <Field label="Category" value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} placeholder="e.g. Wages, Travel" />
            <Field type="date" label="Date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
            <label className="field"><span>Status</span><select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}><option value="pending">Pending</option><option value="paid">Paid</option></select></label>
          </div>
        </div>
        <div className="modal-foot">
          <div className="invoice-total-display"><small>{form.type === 'expense' ? 'Expense' : 'Income'} Amount</small><b className={form.type === 'expense' ? 'txn-amt negative' : 'txn-amt positive'}>{form.type === 'expense' ? '-' : '+'}{money(Number(form.amount || 0))}</b></div>
          <div className="modal-foot-actions">
            <button onClick={closeTxn}>Cancel</button>
            <button className="primary" onClick={submitTxn}>{editing ? 'Update' : 'Save Transaction'}</button>
          </div>
        </div>
      </div>
    </div>}
  </>;
}


function WorkersWorkspace({ workers = [], shifts = [], clients = [], onManage = () => {} }) {
  const [query, setQuery] = useState('');
  const rows = buildWorkerComplianceRows(workers);
  const today = todayISO();
  const onShiftIds = new Set(shifts.filter(s => s.date === today && ['In Progress', 'Started', 'Scheduled'].includes(s.status)).map(s => s.workerId));
  const expiringDocs = rows.reduce((n, r) => n + r.items.filter(i => i.status.tone === 'due' || i.status.tone === 'overdue').length, 0);
  const openActions = rows.filter(r => r.overall.tone === 'overdue' || r.overall.tone === 'missing').length;
  const filtered = rows.filter(r => !query || (r.worker.name || '').toLowerCase().includes(query.toLowerCase()) || (r.worker.role || '').toLowerCase().includes(query.toLowerCase()));
  const toneClass = (tone) => ({ current: 'green', due: 'amber', overdue: 'red', missing: 'red' }[tone] || 'grey');

  return <>
    <div className="ops-stat-grid">
      <Stat label="Active Workers" value={workers.length} tone="navy" icon="◈" trend="On your team" />
      <Stat label="On Shift Now" value={onShiftIds.size} tone="green" icon="●" trend="Currently working" />
      <Stat label="Expiring Docs" value={expiringDocs} tone="gold" icon="!" trend="Due or overdue soon" />
      <Stat label="Open Actions" value={openActions} tone="violet" icon="◎" trend="Workers needing review" />
    </div>
    <Card
      title="Workers"
      action={<div className="filters"><div className="search inline-search"><input placeholder="Search workers…" value={query} onChange={e => setQuery(e.target.value)} /></div><button className="primary" onClick={() => onManage()}>+ Add Worker</button></div>}
    >
      <div className="list-meta">{filtered.length} of {workers.length} shown</div>
      <div className="p-list">
        <Records rows={filtered} empty="No workers yet. Add your first team member to get started." render={({ worker, items, overall }) => (
          <div className="w-row" key={worker.id}>
            <span className="p-avatar">{(worker.name || 'W').split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase()}</span>
            <div className="w-id">
              <b>{worker.name || 'Unnamed worker'}</b>
              <small>{worker.role || 'Support Worker'}{worker.email ? ` · ${worker.email}` : ''}</small>
            </div>
            <div className="w-dots">
              {items.slice(0, 5).map((it, idx) => (
                <span key={idx} className={`doc-dot ${toneClass(it.status.tone)}`} title={`${it.label}: ${it.status.label}`}>{it.label?.[0] || '•'}</span>
              ))}
            </div>
            <span className={`pill ${toneClass(overall.tone)}`}>{overall.label}</span>
            <button className="ghost" onClick={() => onManage(worker)}>Manage</button>
          </div>
        )} />
      </div>
    </Card>
  </>;
}

function ComplianceWorkspace({ clients, invoices, totals, business, setBusiness, saveBusiness, workers = [], setWorkers = () => {}, onPublishWorkers = null, risks = [], setRisks = () => {}, incidents = [], setIncidents = () => {}, complaints = [], setComplaints = () => {}, improvements = [], setImprovements = () => {}, audits = [], setAudits = () => {}, auditReports = [], setAuditReports = () => {}, governanceReviews = [], setGovernanceReviews = () => {}, documents = [], setDocuments = () => {}, initialSection = 'Employees', onSectionChange = () => {}, focusWorker = null, onWorkerFocusHandled = () => {} }) {
  const [section, setSectionState] = useState(initialSection || 'Employees');
  useEffect(() => { if (initialSection && initialSection !== section) setSectionState(initialSection); }, [initialSection]);
  const setSection = (next) => { setSectionState(next); onSectionChange(next); };
  const [workerDraft, setWorkerDraft] = useState(emptyWorker());
  const [editingWorkerId, setEditingWorkerId] = useState(null);
  const [workerFormOpen, setWorkerFormOpen] = useState(false);
  const items = getComplianceItems({ clients, invoices, totals, business, workers });
  const participantRows = buildParticipantComplianceRows(clients);
  const businessRows = buildBusinessComplianceRows(business);
  const workerRows = buildWorkerComplianceRows(workers);
  const allStatuses = [
    ...participantRows.flatMap(r => r.items.map(i => i.status)),
    ...businessRows.map(r => r.status),
    ...workerRows.flatMap(r => r.items.map(i => i.status)),
  ];
  const counts = {
    current: allStatuses.filter(s => s.tone === 'current').length,
    due: items.filter(i => i.tone === 'due').length,
    overdue: items.filter(i => i.tone === 'overdue').length,
    missing: items.filter(i => i.tone === 'missing').length,
  };
  const openActionCount = risks.filter(x=>x.status !== 'Closed').length + incidents.filter(x=>x.status !== 'Closed').length + complaints.filter(x=>x.status !== 'Closed').length + improvements.filter(x=>x.status !== 'Closed').length + audits.filter(x=>x.status !== 'Closed').length + auditReports.filter(x=>x.status !== 'Closed').length;
  const updateBusinessCompliance = (id, field, value) => {
    const current = getBusinessComplianceItems(business);
    const nextItems = current.map(item => item.id === id ? { ...item, [field]: value } : item);
    setBusiness(prev => ({ ...EMPTY_BUSINESS, ...prev, businessCompliance: nextItems }));
  };
  const saveCompliance = () => saveBusiness({ ...EMPTY_BUSINESS, ...business, businessCompliance: getBusinessComplianceItems(business) });
  const saveWorker = () => {
    if (!workerDraft.name.trim()) return alert('Please enter the worker name.');
    const savedWorker = normaliseWorker(workerDraft);
    savedWorker.employeeUsername = normaliseUsername(savedWorker.employeeUsername || savedWorker.username);
    if (savedWorker.employeeUsername && workers.some(w => w.id !== editingWorkerId && normaliseUsername(w.employeeUsername || w.username) === savedWorker.employeeUsername)) return alert('Employee username must be unique.');
    let passwordChanged = false;
    if (savedWorker.temporaryPassword) {
      savedWorker.employeePasswordHash = employeePasswordHash(savedWorker.temporaryPassword);
      savedWorker.mustChangePassword = true;
      savedWorker.lastPasswordResetAt = new Date().toISOString();
      delete savedWorker.temporaryPassword;
      passwordChanged = true;
    }
    if (savedWorker.employeeUsername && !savedWorker.employeePasswordHash) return alert('Set or generate a password for this employee login.');
    const nextWorkers = editingWorkerId
      ? workers.map(w => w.id === editingWorkerId ? { ...savedWorker, id: editingWorkerId, updatedAt: new Date().toISOString() } : w)
      : [{ ...savedWorker, id: savedWorker.id || makeId('worker'), createdAt: new Date().toISOString() }, ...workers];
    setWorkers(nextWorkers);
    setWorkerDraft(emptyWorker()); setEditingWorkerId(null); setWorkerFormOpen(false);
    // Push to the cloud so the employee portal (which authenticates against the
    // cloud snapshot) sees the new credentials immediately. Without this, a password
    // reset stays local and the worker keeps getting "Password is incorrect".
    if (onPublishWorkers && (passwordChanged || savedWorker.employeeUsername)) {
      onPublishWorkers(nextWorkers);
    }
  };
  const editWorker = (worker) => { setWorkerDraft(normaliseWorker(worker)); setEditingWorkerId(worker.id); setSection('Employees'); setWorkerFormOpen(true); window.scrollTo(0, 0); };
  useEffect(() => {
    if (!focusWorker) return;
    if (focusWorker === 'new') { setSection('Employees'); setWorkerDraft(emptyWorker()); setEditingWorkerId(null); setWorkerFormOpen(true); }
    else { setWorkerDraft(normaliseWorker(focusWorker)); setEditingWorkerId(focusWorker.id); setSection('Employees'); setWorkerFormOpen(true); }
    window.scrollTo(0, 0);
    onWorkerFocusHandled();
  }, [focusWorker]);
  const deleteWorker = (id) => { if (confirm('Delete this worker profile?')) setWorkers(prev => prev.filter(w => w.id !== id)); if (editingWorkerId === id) { setWorkerDraft(emptyWorker()); setEditingWorkerId(null); } };
  const updateWorkerDraft = (field, value) => setWorkerDraft(prev => ({ ...prev, [field]: value }));

  const overallScore = allStatuses.length ? Math.round((counts.current / allStatuses.length) * 100) : 100;
  const docsExpiring = items.filter(i => i.tone === 'due').length;
  const policiesDue = businessRows.filter(r => r.status.tone === 'due' || r.status.tone === 'overdue').length;
  const auditsDue = audits.filter(a => a.status !== 'Closed').length;
  const incidentsOpen = incidents.filter(i => i.status !== 'Closed').length;
  const hubDomains = [
    { key: 'People', icon: '◉', desc: 'Workers, participants and documents', tone: workerRows.some(r => r.overall.tone === 'overdue') ? 'red' : workerRows.some(r => r.overall.tone === 'due') ? 'amber' : 'green', go: 'Employees' },
    { key: 'Quality', icon: '✦', desc: 'Incidents, complaints and improvements', tone: incidentsOpen ? 'amber' : 'green', go: 'Incidents' },
    { key: 'Governance', icon: '▤', desc: 'Policies, audits and governance', tone: policiesDue ? 'amber' : 'green', go: 'Governance' },
    { key: 'Risk', icon: '⚠', desc: 'Risk register and management', tone: risks.some(r => r.status !== 'Closed' && (r.rating === 'High' || r.rating === 'Extreme')) ? 'red' : 'green', go: 'Risks' },
  ];

  return <>
    <div className="dashboard-grid" style={{ gridTemplateColumns: '1fr auto', alignItems: 'start', marginBottom: '16px' }}>
      <Card title="Compliance Hub">
        <p style={{ marginTop: 0 }}>Monitor quality, risk and governance.</p>
        <div className="hub-grid">
          {hubDomains.map(d => (
            <button key={d.key} className="hub-tile" onClick={() => setSection(d.go)}>
              <span className={`hub-tile-icon ${d.tone === 'red' ? 'red' : d.tone === 'amber' ? 'amber' : 'green'}`}>{d.icon}</span>
              <b>{d.key}</b>
              <small>{d.desc}</small>
            </button>
          ))}
        </div>
      </Card>
      <Card title="Overall Score" className="">
        <ComplianceRing pct={overallScore} label="" sub={`${counts.current} of ${allStatuses.length} current`} />
      </Card>
    </div>
    <div className="two" style={{ marginBottom: '16px' }}>
      <Card title="Compliance Overview">
        <div className="checkline"><span style={{ flex: 1 }}>Documents expiring</span><span className={`pill ${docsExpiring ? 'amber' : 'green'}`}>{docsExpiring}</span><small style={{ color: 'var(--muted)' }}>Within 30 days</small></div>
        <div className="checkline"><span style={{ flex: 1 }}>Policies due for review</span><span className={`pill ${policiesDue ? 'amber' : 'green'}`}>{policiesDue}</span><small style={{ color: 'var(--muted)' }}>Within 30 days</small></div>
        <div className="checkline"><span style={{ flex: 1 }}>Audits due</span><span className={`pill ${auditsDue ? 'red' : 'green'}`}>{auditsDue}</span><small style={{ color: 'var(--muted)' }}>{auditsDue ? 'Open' : 'Up to date'}</small></div>
        <div className="checkline"><span style={{ flex: 1 }}>Incidents open</span><span className={`pill ${incidentsOpen ? 'amber' : 'green'}`}>{incidentsOpen}</span><small style={{ color: 'var(--muted)' }}>{incidentsOpen ? 'Requires action' : 'Clear'}</small></div>
      </Card>
      <Card title="Upcoming" action={<button className="text-link" onClick={() => setSection('Audits')}>View all</button>}>
        <ComplianceItemsReport items={items.slice(0, 6)} compact empty="Nothing due soon." />
      </Card>
    </div>
    <Card title="Compliance Workspace" action={`${items.length + openActionCount} needs review`}>
      <p>Run business compliance from daily records. Each register below becomes audit evidence automatically: risks, incidents, complaints, CAPA, internal audits, governance reviews and document control.</p>
      <div className="compliance-tabs">{COMPLIANCE_NAV.map(tab => <button key={tab} className={section === tab ? 'active' : ''} onClick={() => setSection(tab)}>{tab}</button>)}</div>
      <div className="compliance-grid">
        <InsightCard label="Current" value={counts.current} sub="Green items" />
        <InsightCard label="Due Soon" value={counts.due} sub="Within 30 days" />
        <InsightCard label="Overdue" value={counts.overdue} sub="Past due" />
        <InsightCard label="Open Actions" value={openActionCount} sub="Registers not closed" />
      </div>
    </Card>

    {section === 'Employees' && <>
      <Card title={editingWorkerId ? 'Edit Worker' : 'Add Worker'} action={<button type="button" className="text-link" onClick={() => setWorkerFormOpen(open => !open)}>{workerFormOpen ? 'Collapse' : '+ Add Worker'}</button>}>
        {!workerFormOpen && <p className="muted">Worker form is collapsed. Open it only when adding or editing an employee.</p>}
        {workerFormOpen && <>
          <div className="grid"><Field label="Worker Name" value={workerDraft.name} onChange={e => updateWorkerDraft('name', e.target.value)} /><Field label="Role" value={workerDraft.role} onChange={e => updateWorkerDraft('role', e.target.value)} /><Field label="Email (optional)" type="email" value={workerDraft.email} onChange={e => updateWorkerDraft('email', e.target.value)} /><Field label="Phone" value={workerDraft.phone} onChange={e => updateWorkerDraft('phone', e.target.value)} /></div>
          <h4 className="section-label">Employee portal login</h4>
          <div className="grid"><Field label="Unique Username" value={workerDraft.employeeUsername || ''} onChange={e => updateWorkerDraft('employeeUsername', e.target.value)} placeholder="e.g. john.smith" /><Field label={editingWorkerId ? 'New Password / Reset Password' : 'Password'} type="text" value={workerDraft.temporaryPassword || ''} onChange={e => updateWorkerDraft('temporaryPassword', e.target.value)} placeholder={editingWorkerId ? 'Leave blank to keep existing password' : 'Set employee password'} /><label className="field"><span>Login Enabled</span><select value={workerDraft.loginEnabled === false ? 'no' : 'yes'} onChange={e => updateWorkerDraft('loginEnabled', e.target.value === 'yes')}><option value="yes">Enabled</option><option value="no">Disabled</option></select></label><label className="field"><span>Generate Password</span><button type="button" onClick={() => updateWorkerDraft('temporaryPassword', Math.random().toString(36).slice(2, 6).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase())}>Generate New Password</button></label></div>
          <p className="muted" style={{ fontSize: '13px', marginTop: '4px' }}>Saving publishes the login to the cloud so the employee can sign in from their own device. Share the password with them directly — it isn't shown again after saving.</p>
          <p className="muted">Employee usernames and passwords are separate from admin email sign-in. These credentials only open the employee portal.</p>
          <h4 className="section-label">Worker compliance dates</h4>
          <div className="grid">{DEFAULT_WORKER_COMPLIANCE_ITEMS.map(item => <Field key={item.key} type="date" label={`${item.label}${item.optional ? ' (optional)' : ''}`} value={workerDraft[item.key] || ''} onChange={e => updateWorkerDraft(item.key, e.target.value)} />)}<Field label="Notes" multiline value={workerDraft.notes || ''} onChange={e => updateWorkerDraft('notes', e.target.value)} /></div>
          <button className="primary" onClick={saveWorker}>{editingWorkerId ? 'Update Worker' : 'Save Worker'}</button>{editingWorkerId && <button onClick={() => { setWorkerDraft(emptyWorker()); setEditingWorkerId(null); setWorkerFormOpen(false); }}>Cancel Edit</button>}
        </>}
      </Card>
      <Card title="Employees Compliance Register" action={`${workerRows.length} staff`}>
        <div className="reg-list"><Records rows={workerRows} empty="No workers added yet." render={row => {
          const reviewItems = row.items.filter(item => ['due','overdue','missing'].includes(item.status.tone));
          return <div className="reg-row" key={row.worker.id}>
            <span className="p-avatar">{(row.worker.name || 'W').split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase()}</span>
            <div className="reg-main">
              <b>{row.worker.name || 'Unnamed worker'}</b>
              <small>{row.worker.role || 'Support Worker'}{row.worker.employeeUsername ? ` · @${row.worker.employeeUsername}` : (row.worker.email ? ` · ${row.worker.email}` : '')}</small>
              <small className="reg-note">{reviewItems.length ? `Needs: ${reviewItems.slice(0, 3).map(i => i.label).join(', ')}` : 'All documents current'}</small>
            </div>
            <span className={`pill ${row.overall.tone === 'overdue' ? 'red' : row.overall.tone === 'due' ? 'amber' : row.overall.tone === 'missing' ? 'red' : 'green'}`}>{row.overall.label}</span>
            <div className="reg-actions"><button className="ghost" onClick={() => editWorker(row.worker)}>Edit</button><button className="ghost danger-ghost" onClick={() => deleteWorker(row.worker.id)}>Delete</button></div>
          </div>;
        }} /></div>
      </Card>
    </>}

    {section === 'Participants' && <Card title="Participant Compliance"><div className="compliance-table"><div className="compliance-table-head"><span>Participant</span><span>Plan Review</span><span>Consent</span><span>Agreement</span><span>Risk Review</span><span>Status</span></div><Records rows={participantRows} empty="No participants yet." render={row => <div className="compliance-table-row" key={row.client.id}><div><b>{row.client.name}</b><small>{row.client.ndisNumber || 'NDIS missing'}</small></div>{row.items.map(item => <ComplianceDateCell key={item.key} item={item} />)}<span className={`traffic-pill ${row.overall.tone}`}>{row.overall.label}</span></div>} /></div></Card>}

    {section === 'Business' && <Card title="Business Compliance" action={<button className="primary" onClick={saveCompliance}>Save Compliance</button>}><p>Maintain insurance and audit due dates for the business. Worker checks and mandatory training are managed under Employees Compliance.</p><div className="business-compliance-list">{['Insurance','Audits'].map(group => <section key={group} className="business-compliance-group"><h4>{group}</h4>{businessRows.filter(item => item.group === group).map(item => <div className="business-compliance-row" key={item.id}><label><span>Item</span><input value={item.label} onChange={e => updateBusinessCompliance(item.id, 'label', e.target.value)} /></label><label><span>Due date</span><input type="date" value={item.dueDate} onChange={e => updateBusinessCompliance(item.id, 'dueDate', e.target.value)} /></label><label><span>Notes</span><input value={item.notes || ''} onChange={e => updateBusinessCompliance(item.id, 'notes', e.target.value)} /></label><span className={`traffic-pill ${item.status.tone}`}>{item.status.label}</span></div>)}</section>)}</div></Card>}

    {section === 'Risks' && <RecordRegister title="Risk Register" type="risks" rows={risks} setRows={setRisks} clients={clients} fields={EXPORT_COLUMNS.risks} business={business} />}
    {section === 'Incidents' && <RecordRegister title="Incident Register" type="incidents" rows={incidents} setRows={setIncidents} clients={clients} fields={['title','participantId','date','severity','reportable','immediateAction','followUp','status','evidence']} business={business} />}
    {section === 'Complaints' && <RecordRegister title="Complaints Register" type="complaints" rows={complaints} setRows={setComplaints} clients={clients} fields={['title','participantId','date','receivedBy','category','details','resolution','status','evidence']} business={business} />}
    {section === 'Improvements' && <RecordRegister title="Continuous Improvement Register" type="improvements" rows={improvements} setRows={setImprovements} clients={clients} fields={EXPORT_COLUMNS.improvements} business={business} />}
    {section === 'Audits' && <RecordRegister title="Internal Audit Schedule" type="audits" rows={audits} setRows={setAudits} clients={clients} fields={EXPORT_COLUMNS.audits} defaultRows={DEFAULT_INTERNAL_AUDIT_SCHEDULE} business={business} />}
    {section === 'Audit Reports' && <InternalAuditReports business={business} auditReports={auditReports} setAuditReports={setAuditReports} setImprovements={setImprovements} setRisks={setRisks} setDocuments={setDocuments} />}
    {section === 'Governance' && <RecordRegister title="Governance Review Register" type="governanceReviews" rows={governanceReviews} setRows={setGovernanceReviews} clients={clients} fields={['title','date','attendees','summary','decisions','actions','nextReviewDate','status','evidence']} business={business} />}
    {section === 'Documents' && <RecordRegister title="Evidence Library & Document Control" type="documents" rows={documents} setRows={setDocuments} clients={clients} fields={['title','category','owner','reviewDate','version','location','status','notes']} business={business} />}
    {section === 'Items' && <Card title="Compliance Items" action={`${items.length} due`}><ComplianceItemsReport items={items} empty="No compliance items due." /></Card>}
  </>;
}

function RecordRegister({ title, type, rows = [], setRows = () => {}, clients = [], fields = [], defaultRows = [], business = {} }) {
  const normaliseAuditRow = (row = {}, idx = 0) => ({
    ...row,
    id: row.id || `aud-${String(idx + 1).padStart(3, '0')}`,
    auditArea: row.auditArea || row.title || row.category || '',
    title: '',
    referenceNumber: '',
    status: row.status || 'Open',
    evidence: row.evidence || row.evidenceLink || '',
  });
  const baseRows = type === 'audits'
    ? (rows.length ? rows : defaultRows).map(normaliseAuditRow).filter(row => row.auditArea)
    : (rows.length ? rows : defaultRows);
  const effectiveRows = baseRows;
  const [draft, setDraft] = useState(emptyRecordFor(type, effectiveRows));
  const [editingId, setEditingId] = useState(null);
  const [open, setOpen] = useState(false);
  const activeFields = type === 'audits' ? ['auditArea','dateReviewLastCompleted','dateNextDue','status','evidence'] : fields;
  const setField = (field, value) => setDraft(prev => {
    const next = { ...prev, [field]: value };
    if (field === 'consequence' || field === 'likelihood') next.riskScore = riskScoreFrom(next.consequence, next.likelihood);
    if (field === 'residualConsequence' || field === 'residualLikelihood') next.residualRiskScore = riskScoreFrom(next.residualConsequence, next.residualLikelihood);
    return next;
  });
  const save = () => {
    if (!String(recordDisplayTitle(draft) || '').trim() || recordDisplayTitle(draft) === 'Untitled') return alert('Please complete the main record field.');
    const cleaned = type === 'audits' ? { ...draft, title: '', referenceNumber: '', sourceOfFeedback: '' } : draft;
    const enriched = withParticipantName({ ...cleaned, updatedAt: new Date().toISOString() }, clients);
    if (editingId) setRows(prev => {
      const source = prev.length ? prev : effectiveRows;
      return source.map((r, idx) => r.id === editingId ? { ...normaliseAuditRow(r, idx), ...enriched, id: editingId } : r);
    });
    else setRows(prev => [{ ...enriched, id: enriched.id || makeId(type), createdAt: new Date().toISOString() }, ...prev]);
    setDraft(emptyRecordFor(type, effectiveRows)); setEditingId(null); setOpen(false);
  };
  const edit = (row) => { setDraft({ ...emptyRecordFor(type, effectiveRows), ...(type === 'audits' ? normaliseAuditRow(row) : row) }); setEditingId(row.id); setOpen(true); window.scrollTo(0, 0); };
  const del = (id) => { if (confirm('Delete this record?')) setRows(prev => prev.filter(r => r.id !== id)); };
  const statusCounts = effectiveRows.reduce((acc, row) => { const key = row.status || 'Open'; acc[key] = (acc[key] || 0) + 1; return acc; }, {});
  const cols = EXPORT_COLUMNS[type] || activeFields;
  return <>
    <Card title={title} action={<button type="button" className="text-link" onClick={() => setOpen(v => !v)}>{open ? 'Collapse' : '+ Add Record'}</button>}>
      <div className="report-summary-grid"><InsightCard label="Total" value={effectiveRows.length} sub="Records"/><InsightCard label="Open" value={statusCounts.Open || 0} sub="Needs action"/><InsightCard label="In Progress" value={statusCounts['In Progress'] || 0} sub="Being handled"/><InsightCard label="Closed" value={statusCounts.Closed || 0} sub="Completed"/></div>
      <div className="report-actions"><button onClick={() => exportRegisterPdf({ business, title, rows: effectiveRows.map(r => withParticipantName(r, clients)), cols })}>Export PDF</button><button onClick={() => downloadCsv(`${cleanFile(title)}.csv`, effectiveRows.map(r => withParticipantName(r, clients)), cols)}>Export CSV</button></div>
      {!open && <p className="muted">Use this register during normal operations so the audit trail is ready without extra paperwork.</p>}
      {open && <div className="grid">{activeFields.map(field => <RegisterField key={field} field={field} value={draft[field] || ''} onChange={value => setField(field, value)} clients={clients} />)}</div>}
      {open && <><button className="primary" onClick={save}>{editingId ? 'Update Record' : 'Save Record'}</button>{editingId && <button onClick={() => { setDraft(emptyRecordFor(type, effectiveRows)); setEditingId(null); setOpen(false); }}>Cancel Edit</button>}</>}
    </Card>
    <Card title={`${title} Records`} action={`${effectiveRows.length} saved`}>
      <div className="reg-list"><Records rows={effectiveRows} empty="No records yet. Add one above to build your audit trail." render={row => {
        const tone = row.status === 'Closed' || row.status === 'Completed' ? 'green' : row.status === 'In Progress' || row.status === 'Pending Review' ? 'amber' : 'red';
        const evidence = withParticipantName(row, clients).participantName || row.owner || row.personResponsible || row.receivedBy || '';
        const sub = type === 'audits' ? 'Internal audit schedule' : (row.category || row.sourceOfFeedback || row.auditArea || row.issueHazardAspect || row.version || 'General');
        const dateStr = fmt(row.dateReviewLastCompleted || row.date || row.reviewDate || row.byWhen || row.dateNextDue || row.dueDate || row.nextReviewDate);
        const dueLabel = row.dateNextDue ? `Next due ${fmt(row.dateNextDue)}` : row.reviewDate ? `Review ${fmt(row.reviewDate)}` : row.byWhen ? `Due ${fmt(row.byWhen)}` : row.dueDate ? `Due ${fmt(row.dueDate)}` : '';
        return <div className="reg-row" key={row.id}>
          <div className="reg-main">
            <b>{recordDisplayTitle(row)}</b>
            <small>{sub}{evidence ? ` · ${evidence}` : ''}</small>
            {(row.evidence || row.controlMeasures || row.location || row.notes) && <small className="reg-note">{row.evidence || row.controlMeasures || row.location || row.notes}</small>}
          </div>
          <div className="reg-date"><b>{dateStr}</b>{dueLabel && <small>{dueLabel}</small>}</div>
          <span className={`pill ${tone}`}>{row.status || 'Open'}</span>
          <div className="reg-actions"><button className="ghost" onClick={() => edit(row)}>Edit</button><button className="ghost danger-ghost" onClick={() => del(row.id)}>Delete</button></div>
        </div>;
      }} /></div>
    </Card>
  </>;
}

function RegisterField({ field, value, onChange, clients }) {
  const label = registerLabel(field);
  if (field === 'participantId') return <label><span>Participant</span><select value={value} onChange={e => onChange(e.target.value)}><option value="">No participant / business-wide</option>{clients.filter(c => !c.archived).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>;
  if (field === 'status') return <label><span>{label}</span><select value={value || 'Open'} onChange={e => onChange(e.target.value)}><option>Open</option><option>In Progress</option><option>Pending Review</option><option>Completed</option><option>Closed</option></select></label>;
  if (field === 'priority') return <label><span>{label}</span><select value={value || 'Medium'} onChange={e => onChange(e.target.value)}><option>Low</option><option>Medium</option><option>High</option><option>Critical</option></select></label>;
  if (field === 'likelihood' || field === 'residualLikelihood') return <label><span>{label}</span><select value={value || 'Possible'} onChange={e => onChange(e.target.value)}><option>Rare</option><option>Unlikely</option><option>Possible</option><option>Likely</option><option>Almost Certain</option></select></label>;
  if (field === 'consequence' || field === 'residualConsequence') return <label><span>{label}</span><select value={value || 'Moderate'} onChange={e => onChange(e.target.value)}><option>Insignificant</option><option>Minor</option><option>Moderate</option><option>Major</option><option>Severe</option></select></label>;
  if (field === 'impact' || field === 'rating' || field === 'severity') return <label><span>{label}</span><select value={value} onChange={e => onChange(e.target.value)}><option>Low</option><option>Moderate</option><option>Medium</option><option>High</option><option>Critical</option></select></label>;
  if (field === 'reportable') return <label><span>NDIS Reportable?</span><select value={value || 'No'} onChange={e => onChange(e.target.value)}><option>No</option><option>Unsure</option><option>Yes</option></select></label>;
  if (field === 'riskScore' || field === 'residualRiskScore') return <Field label={label} value={value} onChange={e => onChange(e.target.value)} />;
  if (field.toLowerCase().includes('date') || field === 'byWhen') return <Field type="date" label={label} value={value} onChange={e => onChange(e.target.value)} />;
  if (['treatment','immediateAction','followUp','details','resolution','action','outcome','findings','actions','summary','decisions','notes','evidence','location','opportunityForImprovement','relevantStandardIndicator','actionsRequired','review','riskImpact','controlMeasures','issueHazardAspect'].includes(field)) return <Field label={label} multiline value={value} onChange={e => onChange(e.target.value)} />;
  return <Field label={label} value={value} onChange={e => onChange(e.target.value)} />;
}

function ComplianceItemsReport({ items, compact = false, empty = 'No compliance items due.' }) {
  const grouped = items.reduce((acc, item) => {
    const key = item.type || 'Compliance';
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
  const iconFor = (type) => ({ Employee: '👤', Participant: '♙', Invoice: '$', Insurance: '☂', Audits: '✓' }[type] || '✓');
  if (!items.length) return <p className="empty">{empty}</p>;
  if (compact) return <div className="compliance-report compact">
    {items.map(item => <div className={`compliance-report-row ${item.tone}`} key={item.id}>
      <div className="compliance-report-icon">{iconFor(item.type)}</div>
      <div className="compliance-report-main"><b>{item.title}</b><small>{item.type} · {item.detail}</small></div>
      <span className={`traffic-pill ${item.tone}`}>{item.status}</span>
    </div>)}
  </div>;
  return <div className="compliance-report">
    {Object.entries(grouped).map(([type, rows]) => <section className="compliance-report-group" key={type}>
      <div className="compliance-report-group-head"><span>{iconFor(type)}</span><b>{type}</b><small>{rows.length} item{rows.length === 1 ? '' : 's'}</small></div>
      {rows.map(item => <div className={`compliance-report-row ${item.tone}`} key={item.id}>
        <div className="compliance-report-main"><b>{item.title}</b><small>{item.detail}</small></div>
        <span className={`traffic-pill ${item.tone}`}>{item.status}</span>
      </div>)}
    </section>)}
  </div>;
}

function ComplianceDateCell({ item }) {
  return <div><b>{fmt(item.date)}</b><small>{statusSummary(item.date)}</small><span className={`traffic-dot ${item.status.tone}`} aria-label={item.status.label} /></div>;
}

function FutureWorkspace({ title, description }) {
  return <Card title={title}><div className="future-panel"><b>{title} is coming soon</b><p>{description}</p><button className="primary" disabled>Planned module</button></div></Card>;
}

function Pagination({ page, totalPages, onPrev, onNext }) {
  return <div className="pagination"><button onClick={onPrev} disabled={page <= 1}>Previous</button><span>Page {page} of {totalPages}</span><button onClick={onNext} disabled={page >= totalPages}>Next</button></div>;
}

function Settings({ pricingItems, business, setBusiness, saveBusiness, clients, invoices, transactions, backup, restore, clear, sync, load, user }) {
  const [draft, setDraft] = useState({ ...EMPTY_BUSINESS, ...business });
  const [businessOpen, setBusinessOpen] = useState(false);
  const [pricingOpen, setPricingOpen] = useState(false);

  useEffect(() => {
    setDraft({ ...EMPTY_BUSINESS, ...business });
  }, [business]);

  const updateDraft = (field, value) => setDraft(prev => ({ ...prev, [field]: value }));

  // Derived workspace data
  const activeClients = clients.filter(c => !c.archived);
  const plansNeedReview = activeClients.filter(c => { const d = daysUntil(c.planEndDate); return d !== null && d <= 30; }).length;
  const pricingCount = getPricingItems(business).length;
  const locationCount = (business.address ? 1 : 0) + (business.secondaryAddress ? 1 : 0) || (business.address ? 1 : 1);
  const goPricing = () => setPricingOpen(true);
  const goBusiness = () => setBusinessOpen(true);
  const goCloud = () => document.getElementById('settings-cloud-anchor')?.scrollIntoView({ behavior: 'smooth' });
  const closeBusiness = () => setBusinessOpen(false);
  const closePricing = () => setPricingOpen(false);

  const categories = [
    { icon: '▤', tone: 'violet', title: 'Organisation', desc: 'Business profile, branding and provider details.', link: 'Open organisation settings', onLink: goBusiness, items: [
      { icon: '▦', label: 'Business Profile', go: goBusiness },
      { icon: '▥', label: 'Logo & Branding', go: goBusiness },
      { icon: '◉', label: 'Provider Details', go: goBusiness },
      { icon: '$', label: 'Payment Details', go: goBusiness },
    ] },
    { icon: '◷', tone: 'green', title: 'Pricing & Funding', desc: 'NDIS support items, rates and funding.', link: 'Open pricing manager', onLink: goPricing, items: [
      { icon: '◷', label: 'NDIS Pricing Manager', go: goPricing },
      { icon: '▢', label: 'Support Item Rates', go: goPricing },
      { icon: '▤', label: 'Price Guide', go: goPricing },
    ] },
    { icon: '✓', tone: 'blue', title: 'Data & Backup', desc: 'Back up, restore and export your data.', link: 'Open backup tools', onLink: goCloud, items: [
      { icon: '☁', label: 'Cloud Sync', go: goCloud },
      { icon: '↻', label: 'Restore Backup', go: goCloud },
      { icon: '⤓', label: 'Backup & Export', go: goCloud },
    ] },
    { icon: '⌁', tone: 'amber', title: 'Documents', desc: 'Invoices, reports and compliance exports.', link: 'Open reports', onLink: goCloud, items: [
      { icon: '▤', label: 'Invoice PDFs', go: goCloud },
      { icon: '▥', label: 'Compliance Registers', go: goCloud },
      { icon: '◷', label: 'Financial Reports', go: goCloud },
    ] },
  ];

  const workspaceStats = [
    { icon: '◉', tone: 'violet', value: activeClients.length, label: 'Participants', sub: 'Active' },
    { icon: '▤', tone: 'green', value: invoices.length, label: 'Invoices', sub: 'Generated' },
    { icon: '$', tone: 'blue', value: transactions.length, label: 'Transactions', sub: 'Processed' },
    { icon: '◷', tone: 'amber', value: pricingCount, label: 'Support Items', sub: 'Active' },
  ];

  return <>
    {/* Header */}
    <div className="org-settings-head org-settings-head-compact">
      <div className="org-summary-card">
        <div className="org-summary-info">
          <b>{business.name || "Your Disability Services"}</b>
          <small>NDIS Provider{business.abn ? ` · ABN ${business.abn}` : ''}</small>
          <div className="org-summary-stats">
            <span><i>◉</i> {activeClients.length} Participants</span>
            <span><i>◈</i> {pricingCount} Support Items</span>
            <span><i>⌖</i> {locationCount} Location{locationCount === 1 ? '' : 's'}</span>
          </div>
        </div>
        <div className="org-summary-logo">{business.logoUrl ? <img src={business.logoUrl} alt="Logo" /> : <span>{(business.name || 'KC').slice(0, 2).toUpperCase()}</span>}</div>
      </div>
    </div>

    {/* Workspace Health */}
    <Card title="Workspace Health">
      <div className="health-strip">
        <div className="health-item"><span className="health-ic green">✓</span><div><b>Data Backup</b><small className="health-status green">Ready</small><small>Export &amp; restore available</small></div></div>
        <div className="health-item"><span className="health-ic green">✓</span><div><b>NDIS Pricing</b><small className="health-status green">Up to date</small><small>{pricingCount} support items</small></div></div>
        <div className="health-item"><span className="health-ic green">✓</span><div><b>Participants</b><small className="health-status green">{activeClients.length} active</small><small>{plansNeedReview ? `${plansNeedReview} need review` : 'All plans current'}</small></div></div>
        <div className="health-item"><span className={`health-ic ${plansNeedReview ? 'amber' : 'green'}`}>{plansNeedReview ? '!' : '✓'}</span><div><b>Plans Review</b><small className={`health-status ${plansNeedReview ? 'amber' : 'green'}`}>{plansNeedReview ? `${plansNeedReview} plan${plansNeedReview === 1 ? '' : 's'}` : 'All current'}</small><small>{plansNeedReview ? 'Update required' : 'No action needed'}</small></div></div>
        <div className="health-item"><span className="health-ic green">✓</span><div><b>System Status</b><small className="health-status green">All good</small><small>No issues detected</small></div></div>
      </div>
    </Card>

    {/* Category cards */}
    <div className="settings-cat-grid">
      {categories.map((cat, ci) => (
        <div className="settings-cat-card" key={ci}>
          <div className="settings-cat-head">
            <span className={`settings-cat-icon ${cat.tone}`}>{cat.icon}</span>
            <div><b>{cat.title}</b><small>{cat.desc}</small></div>
          </div>
          <div className="settings-cat-list">
            {cat.items.map((it, ii) => <button key={ii} className="settings-cat-item" onClick={it.go}><span className="settings-cat-item-ic">{it.icon}</span><span>{it.label}</span><span className="settings-cat-chevron">›</span></button>)}
          </div>
          <button className="text-link settings-cat-link" onClick={cat.onLink}>{cat.link}</button>
        </div>
      ))}
    </div>

    {/* Bottom row */}
    <div className="settings-bottom-grid">
      <Card title="Workspace Statistics">
        <div className="workspace-stat-grid">
          {workspaceStats.map((s, i) => <div className={`workspace-stat ${s.tone}`} key={i}><span className="workspace-stat-ic">{s.icon}</span><b>{s.value}</b><small>{s.label}</small><em>{s.sub}</em></div>)}
        </div>
      </Card>
      <Card title="Backup & Sync" action={<span className="pill green">Ready</span>}>
        <div className="cloud-status-body">
          <div className="cloud-status-lines">
            <div><small>Workspace</small><b>{clients.length} clients · {invoices.length} invoices</b></div>
            <div><small>Transactions</small><b>{transactions.length} recorded</b></div>
            <div><small>Support items</small><b>{pricingCount} active</b></div>
          </div>
          <div className="cloud-status-icon">☁</div>
        </div>
        <div className="cloud-status-actions">
          <button className="primary" onClick={sync}>Sync Now</button>
          <button onClick={load}>Restore</button>
        </div>
      </Card>
      <Card title="Quick Actions">
        <div className="quick-actions-list">
          <button className="quick-action" onClick={goBusiness}><span className="quick-action-ic blue">◉</span><span>Edit Business Profile</span><span className="settings-cat-chevron">›</span></button>
          <button className="quick-action" onClick={goPricing}><span className="quick-action-ic violet">◷</span><span>Open Pricing Manager</span><span className="settings-cat-chevron">›</span></button>
          <button className="quick-action" onClick={goCloud}><span className="quick-action-ic amber">☁</span><span>Backup &amp; Restore</span><span className="settings-cat-chevron">›</span></button>
        </div>
      </Card>
    </div>

    <span id="settings-cloud-anchor" />
    <Card title="Backup & Data" action={<button className="text-link" onClick={async () => supabase && supabase.auth.signOut()}>Sign out</button>}>
      <p>Your workspace is saved on this device and can be backed up to the secure cloud. Export a backup file any time, restore from a previous backup, or sync your full workspace.</p>
      <div className="settings-action-row">
        <button className="primary" onClick={sync}>Sync to Cloud</button>
        <button onClick={load}>Restore from Cloud</button>
        <button onClick={backup}>Export Backup File</button>
        <label className="file">Import Backup File<input type="file" accept="application/json" onChange={e => e.target.files?.[0] && restore(e.target.files[0])}/></label>
        <button className="danger" onClick={clear}>Clear All Data</button>
      </div>
    </Card>

    <div className="settings-brand-footer">
      <span className="settings-brand-lock">🔒 Your data is secure and encrypted.</span>
      <span className="settings-brand-tag"><b>Kajola Care</b> by Ogbara</span>
    </div>

    {/* Business Profile modal */}
    {businessOpen && <div className="modal-overlay" onClick={closeBusiness}>
      <div className="modal business-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div><h3>Business Profile</h3><small>Details shown on invoices and exported reports</small></div>
          <button className="modal-close" onClick={closeBusiness} aria-label="Close">×</button>
        </div>
        <div className="modal-body">
          <div className="logo-uploader">
            <div className="logo-preview">{draft.logoUrl ? <img src={draft.logoUrl} alt="Business logo" /> : <span>{(draft.name || 'KC').slice(0,2).toUpperCase()}</span>}</div>
            <div>
              <b>Business Logo</b>
              <small>Upload a PNG or JPG. It will appear on exported invoices.</small>
              <label className="file">Upload Logo<input type="file" accept="image/png,image/jpeg,image/jpg" onChange={async e => { const file = e.target.files?.[0]; if (file) updateDraft('logoUrl', await fileToDataUrl(file)); }}/></label>
              {draft.logoUrl && <button type="button" onClick={() => updateDraft('logoUrl', '')}>Remove Logo</button>}
            </div>
          </div>
          <div className="grid">
            <Field label="Business Name" value={draft.name} onChange={e => updateDraft('name', e.target.value)} />
            <Field label="ABN / Registration" value={draft.abn} onChange={e => updateDraft('abn', e.target.value)} />
            <Field label="Business Email" type="email" value={draft.email} onChange={e => updateDraft('email', e.target.value)} />
            <Field label="Business Phone" value={draft.phone} onChange={e => updateDraft('phone', e.target.value)} />
            <Field label="Business Address" multiline value={draft.address} onChange={e => updateDraft('address', e.target.value)} />
            <Field label="Payment Details" multiline value={draft.paymentDetails} onChange={e => updateDraft('paymentDetails', e.target.value)} placeholder={"Bank: Your Bank\nBSB: 000 000\nAccount: 0000 0000"} />
          </div>
        </div>
        <div className="modal-foot">
          <span className="muted" style={{ fontSize: '13px' }}>Appears on all exported documents</span>
          <div className="modal-foot-actions">
            <button onClick={closeBusiness}>Cancel</button>
            <button className="primary" onClick={() => { saveBusiness(draft); setBusinessOpen(false); }}>Save Profile</button>
          </div>
        </div>
      </div>
    </div>}

    {/* NDIS Pricing modal */}
    {pricingOpen && <div className="modal-overlay" onClick={closePricing}>
      <div className="modal pricing-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div><h3>NDIS Pricing Manager</h3><small>Manage support items and rates</small></div>
          <button className="modal-close" onClick={closePricing} aria-label="Close">×</button>
        </div>
        <div className="modal-body">
          <NdisPricingManager
            items={draft.pricingItems || DEFAULT_PRICING_ITEMS}
            onChange={(nextItems) => updateDraft('pricingItems', nextItems)}
            onSave={() => { saveBusiness({ ...draft, pricingItems: draft.pricingItems || DEFAULT_PRICING_ITEMS }); }}
          />
        </div>
        <div className="modal-foot">
          <span className="muted" style={{ fontSize: '13px' }}>{pricingCount} support items</span>
          <div className="modal-foot-actions">
            <button className="primary" onClick={closePricing}>Done</button>
          </div>
        </div>
      </div>
    </div>}
  </>;
}


function NdisPricingManager({ items, onChange, onSave }) {
  const [editingRates, setEditingRates] = useState(false);
  const [query, setQuery] = useState('');
  const pricingItems = getPricingItems({ pricingItems: items });
  const groups = [...new Set(pricingItems.map(item => item.group || 'Custom Items'))];
  const filtered = pricingItems.filter(item => `${item.group} ${item.itemNumber} ${item.label} ${item.unitType}`.toLowerCase().includes(query.toLowerCase()));
  const updateItem = (id, field, value) => {
    if (field === 'rate' && !editingRates) return;
    onChange(pricingItems.map(item => item.id === id ? { ...item, [field]: field === 'rate' ? Number(value || 0) : value } : item));
  };
  const addItem = () => {
    onChange([
      ...pricingItems,
      { id: makeId('pricing'), group: 'Custom Items', itemNumber: '', label: 'New support item', unitType: 'Hour', rate: 0, archived: false },
    ]);
    setEditingRates(true);
  };
  const restoreDefaults = () => {
    if (confirm('Restore default NDIS pricing items? This will replace your custom pricing table.')) onChange(DEFAULT_PRICING_ITEMS);
  };
  const savePricing = () => {
    onSave();
    setEditingRates(false);
  };
  return <div className="pricing-manager"><div className="rate-lock-note"><b>{pricingItems.filter(i => !i.archived).length} active items</b></div>
    <p>Manage support item numbers, descriptions, units and annual NDIS rates here. Rate fields are locked by default so prices are not changed by mistake. Invoice generation uses this table for future invoices.</p>
    <div className="settings-toolbar">
      <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search item number, name, group or unit" />
      <button onClick={addItem}>+ Add Item</button>
      <button onClick={restoreDefaults}>Restore Defaults</button>
      <button type="button" className={editingRates ? 'danger' : ''} onClick={() => setEditingRates(value => !value)}>{editingRates ? 'Lock Rates' : 'Edit Rates'}</button>
      <button className="primary" onClick={savePricing}>Save Pricing</button>
    </div>
    <div className="rate-lock-note">{editingRates ? 'Rate editing is unlocked. Review changes carefully before saving.' : 'Rates are locked. Click Edit Rates to update annual NDIS prices.'}</div>
    <div className="pricing-groups">
      {groups.map(group => {
        const groupRows = filtered.filter(item => item.group === group);
        if (!groupRows.length) return null;
        return <section className="pricing-group" key={group}>
          <div className="pricing-group-head"><h4>{group}</h4><small>{groupRows.length} item{groupRows.length === 1 ? '' : 's'}</small></div>
          <div className="pricing-table-wrap">
            <table className="pricing-table">
              <thead><tr><th>Active</th><th>Item Number</th><th>Item Name and Notes</th><th>Unit</th><th>National Rate</th></tr></thead>
              <tbody>{groupRows.map(item => <tr key={item.id} className={item.archived ? 'archived' : ''}>
                <td><input type="checkbox" checked={!item.archived} onChange={e => updateItem(item.id, 'archived', !e.target.checked)} /></td>
                <td><input value={item.itemNumber} onChange={e => updateItem(item.id, 'itemNumber', e.target.value)} placeholder="01_011_0107_1_1" /></td>
                <td><input value={item.label} onChange={e => updateItem(item.id, 'label', e.target.value)} /></td>
                <td><input value={item.unitType} onChange={e => updateItem(item.id, 'unitType', e.target.value)} placeholder="Hour" /></td>
                <td><input className="rate-input" type="number" step="0.01" value={item.rate} readOnly={!editingRates} aria-readonly={!editingRates} title={editingRates ? 'Rate editing unlocked' : 'Rates are locked. Click Edit Rates to unlock.'} onChange={e => updateItem(item.id, 'rate', e.target.value)} /></td>
              </tr>)}</tbody>
            </table>
          </div>
        </section>;
      })}
    </div>
  </div>;
}


function SchedulesWorkspace({ clients = [], workers = [], shifts = [], setShifts = () => {}, invoices = [], setInvoices = () => {}, pricingItems = DEFAULT_PRICING_ITEMS, onPublishSchedule = async () => {} }) {
  const safeClients = Array.isArray(clients) ? clients.filter(c => c && typeof c === 'object') : [];
  const safeWorkers = Array.isArray(workers) ? workers.filter(w => w && typeof w === 'object') : [];
  const safeInvoices = Array.isArray(invoices) ? invoices.filter(i => i && typeof i === 'object') : [];
  const safePricingItems = Array.isArray(pricingItems) && pricingItems.length ? pricingItems : DEFAULT_PRICING_ITEMS;
  const [draft, setDraft] = useState(emptyShift());
  const [editingId, setEditingId] = useState(null);
  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const [recurring, setRecurring] = useState({ enabled: false, frequency: 'weekly', occurrences: 4, weekdays: [] });
  const [view, setView] = useState('Calendar');
  const [filterWorker, setFilterWorker] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [detailId, setDetailId] = useState(null);
  const [selectedShiftIds, setSelectedShiftIds] = useState([]);
  const safeShifts = normaliseShifts(shifts);
  const activeWorkers = safeWorkers.filter(w => !w.archived);
  const activeClients = safeClients.filter(c => !c.archived);
  const findWorker = (id) => safeWorkers.find(w => w.id === id);
  const findClient = (id) => safeClients.find(c => c.id === id);
  const updateDraft = (field, value) => setDraft(prev => ({ ...prev, [field]: value }));
  const shiftDateTime = (shift) => `${shift.date || ''}T${shift.startTime || '00:00'}`;
  const addDaysToISO = (isoDate, days) => {
    const d = isoDate ? new Date(`${isoDate}T00:00:00`) : new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const recurringStepDays = recurring.frequency === 'daily' ? 1 : recurring.frequency === 'fortnightly' ? 14 : 7;
  const recurringCount = Math.min(52, Math.max(1, Number(recurring.occurrences) || 1));
  const weekdayOptions = [
    { value: 1, short: 'Mon', label: 'Monday' },
    { value: 2, short: 'Tue', label: 'Tuesday' },
    { value: 3, short: 'Wed', label: 'Wednesday' },
    { value: 4, short: 'Thu', label: 'Thursday' },
    { value: 5, short: 'Fri', label: 'Friday' },
    { value: 6, short: 'Sat', label: 'Saturday' },
    { value: 0, short: 'Sun', label: 'Sunday' },
  ];
  const selectedWeekdays = (Array.isArray(recurring.weekdays) && recurring.weekdays.length ? recurring.weekdays : [new Date(`${draft.date || todayISO()}T00:00:00`).getDay()]).map(Number);
  const toggleWeekday = (day) => setRecurring(prev => {
    const existing = Array.isArray(prev.weekdays) ? prev.weekdays.map(Number) : [];
    const next = existing.includes(day) ? existing.filter(x => x !== day) : [...existing, day];
    return { ...prev, weekdays: next.sort((a, b) => ((a || 7) - (b || 7))) };
  });
  const buildRecurringDates = () => {
    if (!recurring.enabled) return [draft.date || todayISO()];
    if (recurring.frequency !== 'weekly') return Array.from({ length: recurringCount }, (_, idx) => addDaysToISO(draft.date, idx * recurringStepDays));
    const dates = [];
    const start = draft.date || todayISO();
    let cursor = new Date(`${start}T00:00:00`);
    let guard = 0;
    const wanted = new Set(selectedWeekdays);
    while (dates.length < recurringCount && guard < 370) {
      if (wanted.has(cursor.getDay())) dates.push(cursor.toISOString().slice(0, 10));
      cursor.setDate(cursor.getDate() + 1);
      guard += 1;
    }
    return dates.length ? dates : [start];
  };
  const nowKey = new Date().toISOString().slice(0, 16);
  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
  const weekDays = Array.from({ length: 7 }, (_, idx) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + idx);
    return d.toISOString().slice(0, 10);
  });
  const getShiftTone = (status = 'Scheduled') => {
    if (status === 'Completed') return 'current';
    if (status === 'Awaiting Notes') return 'due';
    if (status === 'In Progress') return 'due';
    if (status === 'Missed' || status === 'Cancelled') return 'overdue';
    return '';
  };
  const scheduledHours = (shift) => hoursBetween(shift.startTime, shift.endTime);
  const actualHours = (shift) => {
    if (!shift.startedAt || !shift.endedAt) return 0;
    const ms = new Date(shift.endedAt) - new Date(shift.startedAt);
    return Math.max(0, ms / 3600000);
  };
  const timeOnly = (iso) => fmtMelbourneTime(iso);
  const dateTime = (iso) => fmtMelbourneDateTime(iso);
  const saveShift = () => {
    if (!draft.workerId) return alert('Please choose a support worker. Add the employee in Compliance > Employees first, then assign them here.');
    if (!draft.participantId) return alert('Please choose a participant.');
    const selectedWorker = findWorker(draft.workerId);
    const selectedClient = findClient(draft.participantId);
    const baseShift = {
      ...draft,
      workerEmail: selectedWorker?.email || draft.workerEmail || '',
      workerName: selectedWorker?.name || draft.workerName || '',
      participantName: selectedClient?.name || draft.participantName || '',
      updatedAt: new Date().toISOString(),
      status: draft.status || 'Scheduled'
    };
    if (editingId) {
      const nextShifts = safeShifts.map(shift => shift.id === editingId ? { ...baseShift, id: editingId } : shift);
      setShifts(nextShifts);
      onPublishSchedule({ nextShifts, message: 'Shift updated and published to employee portal.' });
    } else {
      const recurringDates = recurring.enabled ? buildRecurringDates() : [baseShift.date];
      const seriesId = recurring.enabled && recurringDates.length > 1 ? makeId('series') : '';
      const recurrenceDayLabel = recurring.frequency === 'weekly' ? selectedWeekdays.map(day => weekdayOptions.find(x => x.value === day)?.short).filter(Boolean).join(', ') : recurring.frequency;
      const newShifts = recurringDates.map((date, idx) => ({
        ...baseShift,
        id: idx === 0 ? (baseShift.id || makeId('shift')) : makeId('shift'),
        date,
        createdAt: new Date().toISOString(),
        reviewStatus: 'Not reviewed',
        payrollStatus: 'Not generated',
        invoiceStatus: 'Not generated',
        recurrenceSeriesId: seriesId,
        recurrenceLabel: seriesId ? `${recurrenceDayLabel} · ${recurringDates.length} shifts` : ''
      }));
      const nextShifts = [...newShifts, ...safeShifts];
      setShifts(nextShifts);
      onPublishSchedule({ nextShifts, message: `${newShifts.length} shift${newShifts.length === 1 ? '' : 's'} published to employee portal.` });
    }
    setDraft(emptyShift());
    setEditingId(null);
    setShiftModalOpen(false);
  };
  const editShift = (shift) => { setDraft({ ...emptyShift(), ...shift }); setEditingId(shift.id); setShiftModalOpen(true); };
  const openShiftNew = () => { setDraft(emptyShift()); setEditingId(null); setShiftModalOpen(true); };
  const closeShiftModal = () => { setShiftModalOpen(false); setEditingId(null); setDraft(emptyShift()); };
  const duplicateShift = (shift) => { setDraft({ ...emptyShift(), ...shift, id: makeId('shift'), status: 'Scheduled', startedAt: '', endedAt: '', notes: '', date: shift.date || todayISO(), reviewStatus: 'Not reviewed', payrollStatus: 'Not generated', invoiceStatus: 'Not generated' }); setEditingId(null); setShiftModalOpen(true); };
  const deleteShift = (id) => { if (confirm('Delete this assigned shift?')) { const nextShifts = safeShifts.filter(shift => shift.id !== id); setShifts(nextShifts); onPublishSchedule({ nextShifts, message: 'Shift deleted and employee portal updated.' }); } };
  const toggleShiftSelection = (id) => setSelectedShiftIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const selectAllVisibleShifts = () => setSelectedShiftIds(viewRows.map(s => s.id).filter(Boolean));
  const clearShiftSelection = () => setSelectedShiftIds([]);
  const deleteSelectedShifts = () => {
    const count = selectedShiftIds.length;
    if (!count) return;
    if (confirm(`Delete ${count} selected shift${count === 1 ? '' : 's'}? This will also update the employee portal.`)) {
      const selected = new Set(selectedShiftIds);
      const nextShifts = safeShifts.filter(shift => !selected.has(shift.id));
      setShifts(nextShifts);
      setSelectedShiftIds([]);
      onPublishSchedule({ nextShifts, message: `${count} shift${count === 1 ? '' : 's'} deleted and employee portal updated.` });
    }
  };
  const updateShift = (id, patch, nextInvoices = safeInvoices) => { const nextShifts = safeShifts.map(shift => shift.id === id ? { ...shift, ...patch, updatedAt: new Date().toISOString() } : shift); setShifts(nextShifts); onPublishSchedule({ nextShifts, nextInvoices, message: 'Shift status updated and published.' }); };
  const reviewShift = (shift) => updateShift(shift.id, { reviewStatus: 'Reviewed', reviewedAt: new Date().toISOString() });
  const generateTimesheet = (shift) => updateShift(shift.id, { payrollStatus: 'Timesheet generated', timesheetGeneratedAt: new Date().toISOString() });
  const markInvoiceReady = (shift) => {
    const client = findClient(shift.participantId);
    if (!client) return updateShift(shift.id, { invoiceStatus: 'Ready for invoice', invoiceReadyAt: new Date().toISOString() });
    const existingInvoiceId = shift.invoiceId;
    if (existingInvoiceId && safeInvoices.some(inv => inv.id === existingInvoiceId)) return updateShift(shift.id, { invoiceStatus: 'Invoice generated', invoiceReadyAt: new Date().toISOString() });
    const item = safePricingItems.find(p => String(shift.supportType || '').toLowerCase().includes(String(p.label || '').toLowerCase())) || safePricingItems[0] || { itemNumber: '', label: shift.supportType || 'Support worker shift', unitType: 'hours', rate: 0 };
    const qty = Number((actualHours(shift) || scheduledHours(shift) || 0).toFixed(2));
    const rate = Number(item.rate || 0);
    const stamp = todayISO().replace(/-/g, '');
    const next = safeInvoices.filter(i => String(i.invoiceNumber).startsWith(`INV-${stamp}-`)).length + 1;
    const invoice = {
      id: makeId('invoice'),
      invoiceNumber: `INV-${stamp}-${String(next).padStart(3, '0')}`,
      issueDate: todayISO(),
      dueDate: addDaysISO(7),
      clientId: client.id,
      clientName: client.name,
      clientEmail: client.email,
      clientPhone: client.phone,
      clientAddress: client.address,
      ndisNumber: client.ndisNumber,
      notes: `Generated from completed shift ${fmt(shift.date)} ${shift.startTime}-${shift.endTime}. Worker notes: ${shift.notes || 'No notes.'}`,
      lines: [{ id: makeId('line'), itemCode: item.itemNumber || '', itemLabel: item.label || shift.supportType || 'Support shift', serviceDate: shift.date, unitType: item.unitType || 'hours', quantity: qty || 1, rate, notes: shift.supportType || '', lineTotal: (qty || 1) * rate }],
      total: (qty || 1) * rate,
      status: 'Pending',
      statusHistory: [{ status: 'Pending', note: 'Generated from completed reviewed shift', at: new Date().toISOString() }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const nextInvoices = [invoice, ...safeInvoices];
    setInvoices(nextInvoices);
    updateShift(shift.id, { invoiceStatus: 'Invoice generated', invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, invoiceReadyAt: new Date().toISOString() }, nextInvoices);
  };
  const filteredShifts = [...safeShifts]
    .filter(shift => filterWorker === 'all' || shift.workerId === filterWorker)
    .filter(shift => filterStatus === 'all' || (shift.status || 'Scheduled') === filterStatus)
    .filter(shift => {
      const haystack = [findWorker(shift.workerId)?.name, findWorker(shift.workerId)?.email, findClient(shift.participantId)?.name, shift.location, shift.supportType, shift.adminNotes, shift.notes].join(' ').toLowerCase();
      return !search || haystack.includes(search.toLowerCase());
    })
    .sort((a,b) => shiftDateTime(a).localeCompare(shiftDateTime(b)));
  const weekShifts = filteredShifts.filter(shift => weekDays.includes(shift.date));
  const todayShifts = safeShifts.filter(shift => shift.date === todayISO());
  const liveShifts = safeShifts.filter(shift => shift.status === 'In Progress');
  const completedShifts = filteredShifts.filter(shift => shift.status === 'Completed');
  const reviewQueue = completedShifts.filter(shift => (shift.notes || '').trim() && shift.reviewStatus !== 'Reviewed');
  const payrollQueue = completedShifts.filter(shift => shift.reviewStatus === 'Reviewed' && shift.payrollStatus !== 'Timesheet generated');
  const invoiceQueue = completedShifts.filter(shift => shift.reviewStatus === 'Reviewed' && shift.invoiceStatus !== 'Invoice generated');
  const coverageHours = filteredShifts.reduce((sum, shift) => sum + scheduledHours(shift), 0);
  const actualCompletedHours = completedShifts.reduce((sum, shift) => sum + (actualHours(shift) || scheduledHours(shift)), 0);
  const statusList = ['Scheduled','In Progress','Awaiting Notes','Completed','Cancelled','Missed'];
  const workerTimesheets = activeWorkers.map(worker => {
    const rows = completedShifts.filter(s => s.workerId === worker.id && s.reviewStatus === 'Reviewed');
    return { worker, rows, hours: rows.reduce((sum, s) => sum + (actualHours(s) || scheduledHours(s)), 0) };
  }).filter(x => x.rows.length);
  const viewRows = view === 'In Progress' ? filteredShifts.filter(s => s.status === 'In Progress') : view === 'Completed' ? completedShifts : view === 'Review' ? reviewQueue : view === 'Timesheets' ? completedShifts.filter(s => s.reviewStatus === 'Reviewed') : filteredShifts;

  // Operations Centre alerts: late check-ins, missing notes, expired worker/participant items.
  const now = new Date();
  const lateCheckIns = todayShifts.filter(s => {
    if (s.status !== 'Scheduled') return false;
    const start = new Date(`${s.date}T${s.startTime || '00:00'}:00`);
    return start < now;
  });
  const missingNotes = todayShifts.filter(s => (s.status === 'Completed' || s.endedAt) && !(s.notes || '').trim());
  const expiredWorkerDocs = buildWorkerComplianceRows(safeWorkers).flatMap(r => r.items.filter(i => i.status.tone === 'overdue').map(i => ({ worker: r.worker, item: i })));
  const opsAlerts = [
    ...lateCheckIns.map(s => ({ tone: 'red', title: `${findWorker(s.workerId)?.name || 'Worker'} late check-in`, sub: `${findClient(s.participantId)?.name || 'Client'} · ${s.startTime}` })),
    ...(missingNotes.length ? [{ tone: 'amber', title: `${missingNotes.length} shift${missingNotes.length > 1 ? 's' : ''} missing notes`, sub: 'Awaiting submission' }] : []),
    ...expiredWorkerDocs.slice(0, 3).map(x => ({ tone: 'red', title: `${x.item.label} expired`, sub: x.worker.name || 'Worker' })),
  ];

  return <>
    <div className="ops-stat-grid">
      <Stat label="Today's Shifts" value={todayShifts.length} tone="navy" icon="▦" trend="Assigned today" />
      <Stat label="Live Now" value={liveShifts.length} tone="green" icon="●" trend="Clocked in" />
      <Stat label="Missing Clock-ins" value={lateCheckIns.length} tone="gold" icon="!" trend="Past start time" />
      <Stat label="Pending Notes" value={reviewQueue.length} tone="violet" icon="✎" trend="Completed, need review" />
    </div>
    <div className="dashboard-grid" style={{ gridTemplateColumns: '2.2fr 1fr', marginBottom: '16px' }}>
      <Card title="Operations Centre" action={<div className="filters"><span className="list-meta" style={{ margin: 0 }}>{filteredShifts.length} visible · {coverageHours.toFixed(1)} hrs</span><button className="primary" onClick={openShiftNew}>+ Assign Shift</button></div>}>
        <p style={{ marginTop: 0 }}>Real-time overview of today's shifts and activities.</p>
        <div className="schedule-toolbar">
          <div className="segmented-control">{['Calendar','Assigned','In Progress','Completed','Review','Timesheets'].map(tab => <button key={tab} className={view === tab ? 'active' : ''} onClick={() => setView(tab)}>{tab}</button>)}</div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search worker, client, notes, location…" />
          <select value={filterWorker} onChange={e => setFilterWorker(e.target.value)}><option value="all">All workers</option>{activeWorkers.map(w => <option key={w.id} value={w.id}>{w.name || w.email || w.employeeUsername}</option>)}</select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}><option value="all">All statuses</option>{statusList.map(x => <option key={x}>{x}</option>)}</select>
        </div>
      </Card>
      <Card title="Today's Alerts" action={opsAlerts.length ? `${opsAlerts.length}` : ''}>
        <Records rows={opsAlerts} empty="No alerts. Today's running smoothly." render={(a, idx) => (
          <div className="feed" key={idx}>
            <span className={`pill ${a.tone}`} style={{ width: '32px', height: '32px', padding: 0, justifyContent: 'center', borderRadius: '9px' }}>!</span>
            <div><b style={{ fontWeight: 600 }}>{a.title}</b><small>{a.sub}</small></div>
          </div>
        )} />
      </Card>
    </div>

    {shiftModalOpen && <div className="modal-overlay" onClick={closeShiftModal}>
      <div className="modal shift-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div><h3>{editingId ? 'Edit Client Shift' : 'Assign Client Shift'}</h3><small>{editingId ? 'Update this shift assignment' : 'Schedule a support worker for a participant'}</small></div>
          <button className="modal-close" onClick={closeShiftModal} aria-label="Close">×</button>
        </div>
        <div className="modal-body">
          {(!activeWorkers.length || !activeClients.length) && <div className="auth-message">Add at least one employee in Compliance &gt; Employees and one participant before creating assigned shifts.</div>}
          <div className="shift-modal-grid">
            <label className="field"><span>Employee / Support Worker</span><select value={draft.workerId} onChange={e => updateDraft('workerId', e.target.value)}><option value="">Select employee</option>{activeWorkers.map(w => <option key={w.id} value={w.id}>{w.name || w.email || w.employeeUsername}</option>)}</select></label>
            <label className="field"><span>Client / Participant</span><select value={draft.participantId} onChange={e => updateDraft('participantId', e.target.value)}><option value="">Select client</option>{activeClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <Field label="Date" type="date" value={draft.date} onChange={e => updateDraft('date', e.target.value)} />
            <label className="field"><span>Status</span><select value={draft.status} onChange={e => updateDraft('status', e.target.value)}>{statusList.map(x => <option key={x}>{x}</option>)}</select></label>
            <Field label="Start" type="time" value={draft.startTime} onChange={e => updateDraft('startTime', e.target.value)} />
            <Field label="Finish" type="time" value={draft.endTime} onChange={e => updateDraft('endTime', e.target.value)} />
          </div>
          <Field label="Address / Location" value={draft.location} onChange={e => updateDraft('location', e.target.value)} placeholder="Participant home address or community location…" />
          <Field label="Service Type" value={draft.supportType} onChange={e => updateDraft('supportType', e.target.value)} placeholder="Personal care, community access, domestic assistance…" />
          <Field label="Worker Instructions / Admin Notes" multiline value={draft.adminNotes || ''} onChange={e => updateDraft('adminNotes', e.target.value)} placeholder="Key risks, goals, transport notes, medication prompts, handover details…" />
          {!editingId && <div className="recurring-shift-panel">
            <label className="recurring-toggle"><input type="checkbox" checked={recurring.enabled} onChange={e => setRecurring(prev => ({ ...prev, enabled: e.target.checked }))} /><span>Create as recurring shift</span></label>
            {recurring.enabled && <div className="recurring-grid">
              <label><span>Repeat</span><select value={recurring.frequency} onChange={e => setRecurring(prev => ({ ...prev, frequency: e.target.value }))}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="fortnightly">Fortnightly</option></select></label>
              <label><span>Number of shifts</span><input type="number" min="1" max="52" value={recurring.occurrences} onChange={e => setRecurring(prev => ({ ...prev, occurrences: e.target.value }))} /></label>
              {recurring.frequency === 'weekly' && <div className="weekday-picker"><span>Repeat on</span><div>{weekdayOptions.map(day => <button type="button" key={day.value} className={selectedWeekdays.includes(day.value) ? 'active' : ''} onClick={() => toggleWeekday(day.value)} aria-label={day.label}>{day.short}</button>)}</div><small>Select one or more days. The app will create the next {recurringCount} matching shift{recurringCount === 1 ? '' : 's'} from the start date.</small></div>}
              <div className="recurring-preview"><small>Preview</small><b>{buildRecurringDates().length} shift{buildRecurringDates().length === 1 ? '' : 's'} from {fmt(buildRecurringDates()[0])}</b><span>{recurring.frequency === 'weekly' ? `Weekly on ${selectedWeekdays.map(day => weekdayOptions.find(x => x.value === day)?.short).filter(Boolean).join(', ')}` : recurring.frequency} · same worker, client, time, address and service type.</span></div>
            </div>}
          </div>}
        </div>
        <div className="modal-foot">
          <div className="invoice-total-display"><small>Scheduled Hours</small><b>{scheduledHours(draft).toFixed(1)} hrs</b></div>
          <div className="modal-foot-actions">
            <button onClick={closeShiftModal}>Cancel</button>
            <button className="primary" onClick={saveShift} disabled={!activeWorkers.length || !activeClients.length}>{editingId ? 'Update Shift' : recurring.enabled ? `Create ${buildRecurringDates().length} Shifts` : 'Assign Shift'}</button>
          </div>
        </div>
      </div>
    </div>}

    {view === 'Calendar' && <Card title="Today's Timeline" action={<small style={{ color: 'var(--muted)' }}>{new Intl.DateTimeFormat('en-AU', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</small>}>
      <div className="client-table"><div className="client-table-head" style={{ gridTemplateColumns: '120px 1fr 1fr 1fr auto' }}><span>Time</span><span>Worker</span><span>Participant</span><span>Service</span><span>Status</span></div>
        <Records rows={[...todayShifts].sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''))} empty="No shifts scheduled for today." render={s => <div className="client-table-row" key={s.id} style={{ gridTemplateColumns: '120px 1fr 1fr 1fr auto', cursor: 'pointer' }} onClick={() => setDetailId(s.id)}><div><b>{s.startTime}–{s.endTime}</b></div><div><b>{findWorker(s.workerId)?.name || s.workerName || 'Unassigned'}</b></div><div><b>{findClient(s.participantId)?.name || s.participantName || 'Participant'}</b></div><div><b style={{ fontWeight: 500 }}>{s.supportType || 'Support'}</b></div><span className={`pill ${({ Completed: 'green', 'In Progress': 'blue', Cancelled: 'grey', Missed: 'red' }[s.status]) || 'amber'}`}>{s.status === 'In Progress' ? 'Live' : (s.status || 'Scheduled')}</span></div>} />
      </div>
    </Card>}

    {view === 'Calendar' && <Card title="This Week Coverage"><div className="schedule-week-board">{weekDays.map(day => {
      const dayRows = weekShifts.filter(shift => shift.date === day);
      return <section className="schedule-day-column" key={day}><div className="schedule-day-head"><b>{fmtWeekday(day)}</b><small>{fmt(day)}</small></div>{dayRows.length ? dayRows.map(shift => <button className="schedule-mini-card" key={shift.id} onClick={() => setDetailId(shift.id)}><span>{shift.startTime}–{shift.endTime}</span><b>{findClient(shift.participantId)?.name || shift.participantName || 'Client'}</b><small>{findWorker(shift.workerId)?.name || shift.workerName || 'Worker'} · {shift.supportType}</small><em className={`traffic-pill ${getShiftTone(shift.status)}`}>{shift.status || 'Scheduled'}</em></button>) : <small className="muted">No shifts</small>}</section>;
    })}</div></Card>}

    {view === 'Timesheets' && <Card title="Timesheet Summary"><Records rows={workerTimesheets} empty="No reviewed completed shifts are ready for timesheets yet." render={item => <div className="timesheet-card" key={item.worker.id}><div><b>{item.worker.name}</b><small>{item.rows.length} reviewed shift{item.rows.length === 1 ? '' : 's'} · {item.hours.toFixed(2)} hrs</small></div><div className="actions"><button onClick={() => item.rows.forEach(generateTimesheet)}>Generate Timesheet</button><button onClick={() => item.rows.forEach(markInvoiceReady)}>Mark Invoice Ready</button></div></div>} /></Card>}

    <Card title={view === 'Review' ? 'Completed Shifts Review Queue' : view === 'Timesheets' ? 'Reviewed Shift Evidence' : 'Shift Register'} action={selectedShiftIds.length ? `${selectedShiftIds.length} selected` : ''}>
      <div className="bulk-shift-toolbar">
        <button type="button" onClick={selectAllVisibleShifts} disabled={!viewRows.length}>Select visible</button>
        <button type="button" onClick={clearShiftSelection} disabled={!selectedShiftIds.length}>Clear</button>
        <button type="button" className="danger" onClick={deleteSelectedShifts} disabled={!selectedShiftIds.length}>Delete selected</button>
      </div>
      <div className="shift-list"><Records rows={viewRows} empty="No shifts match this view." render={shift => {
        const worker = findWorker(shift.workerId);
        const client = findClient(shift.participantId);
        const late = (shift.status || 'Scheduled') === 'Scheduled' && `${shift.date || ''}T${shift.startTime || '00:00'}` < nowKey;
        const opened = detailId === shift.id;
        const tone = late ? 'red' : ({ Completed: 'green', 'In Progress': 'blue', Cancelled: 'grey', Missed: 'red', 'Awaiting Notes': 'amber' }[shift.status]) || 'amber';
        const statusLabel = late ? 'Needs review' : (shift.status === 'In Progress' ? 'Live' : shift.status || 'Scheduled');
        return <div className={`shift-card ${opened ? 'open' : ''}`} key={shift.id}>
          <div className="shift-card-top">
            <label className="shift-check" onClick={e => e.stopPropagation()}><input type="checkbox" checked={selectedShiftIds.includes(shift.id)} onChange={() => toggleShiftSelection(shift.id)} /></label>
            <div className="shift-time">
              <b>{shift.startTime}–{shift.endTime}</b>
              <small>{fmt(shift.date)}</small>
            </div>
            <div className="shift-people">
              <div className="shift-line"><span className="shift-ic">◈</span><b>{worker?.name || shift.workerName || 'Unassigned'}</b>{worker?.employeeUsername ? <small>@{worker.employeeUsername}</small> : null}</div>
              <div className="shift-line"><span className="shift-ic">◉</span><b>{client?.name || shift.participantName || 'Participant missing'}</b><small>· {shift.supportType || 'No service'}</small></div>
            </div>
            <div className="shift-meta">
              <span className={`pill ${tone}`}>{statusLabel}</span>
              <small>{scheduledHours(shift).toFixed(1)} hrs scheduled</small>
              <small>{(actualHours(shift) ? `${actualHours(shift).toFixed(2)} hrs actual` : 'Not clocked')}</small>
            </div>
            <div className="shift-actions">
              <button className="ghost" onClick={() => setDetailId(opened ? null : shift.id)}>{opened ? 'Hide' : 'Details'}</button>
              <button className="ghost" onClick={() => editShift(shift)}>Edit</button>
              <button className="ghost" onClick={() => duplicateShift(shift)}>Duplicate</button>
              <button className="ghost danger-ghost" onClick={() => deleteShift(shift.id)}>Delete</button>
            </div>
          </div>
          {shift.location && <div className="shift-loc">📍 {shift.location || client?.address}</div>}
          {opened && <div className="shift-drawer">
            <div className="shift-drawer-grid">
              <div><small>Clock-in</small><b>{dateTime(shift.startedAt)}</b></div>
              <div><small>Clock-out</small><b>{dateTime(shift.endedAt)}</b></div>
              <div><small>Actual duration</small><b>{(actualHours(shift) || 0).toFixed(2)} hrs</b></div>
              <div><small>Review status</small><b>{shift.reviewStatus || 'Not reviewed'}</b></div>
            </div>
            <div className="shift-drawer-notes">
              <div><small>Worker shift notes</small><p>{shift.notes || 'No worker notes submitted yet.'}</p></div>
              <div><small>Admin instructions</small><p>{shift.adminNotes || 'No admin instructions entered.'}</p></div>
            </div>
            <div className="actions"><button disabled={shift.status !== 'Completed'} onClick={() => reviewShift(shift)}>Mark Reviewed</button><button disabled={shift.reviewStatus !== 'Reviewed'} onClick={() => generateTimesheet(shift)}>Generate Timesheet</button><button disabled={shift.reviewStatus !== 'Reviewed'} onClick={() => markInvoiceReady(shift)}>Mark Invoice Ready</button></div>
          </div>}
        </div>;
      }} /></div>
    </Card>
  </>;
}

function WorkerPortal({ user, employeeSession, business, worker, workers = [], clients = [], shifts = [], setShifts = () => {}, onCloudPayload = () => {}, onSignOut }) {
  const matchedWorker = worker || workers.find(w => w.id === employeeSession?.workerId || normaliseUsername(w.employeeUsername || w.username) === normaliseUsername(employeeSession?.username));
  const [active, setActive] = useState('Today');
  const [portalMessage, setPortalMessage] = useState('');
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer); }, []);
  const findClient = (id) => clients.find(c => c.id === id);
  const today = todayISO();
  const startOfWeek = (() => { const d = new Date(`${today}T00:00:00`); const day = d.getDay() || 7; d.setDate(d.getDate() - day + 1); return d; })();
  const weekDates = Array.from({ length: 7 }, (_, i) => { const d = new Date(startOfWeek); d.setDate(startOfWeek.getDate() + i); return d.toISOString().slice(0, 10); });
  const monthKey = today.slice(0, 7);
  const workerShifts = shifts
    .filter(s => s.workerId === matchedWorker?.id)
    .sort((a,b) => new Date(`${a.date || ''} ${a.startTime || ''}`) - new Date(`${b.date || ''} ${b.startTime || ''}`));
  const getDisplayStatus = (shift) => {
    const status = shift.status || 'Scheduled';
    if (status === 'Scheduled' && shift.date && shift.startTime) {
      const scheduled = new Date(`${shift.date}T${shift.startTime}`);
      if (!Number.isNaN(scheduled.getTime()) && scheduled.getTime() + 60 * 60 * 1000 < now) return 'Missed';
    }
    return status;
  };
  const todayShifts = workerShifts.filter(s => s.date === today);
  const nextShift = todayShifts.find(s => !['Completed','Cancelled'].includes(getDisplayStatus(s))) || workerShifts.find(s => (s.date || '') >= today && !['Completed','Cancelled'].includes(getDisplayStatus(s)));
  const visible = active === 'Today'
    ? todayShifts
    : active === 'Week'
      ? workerShifts.filter(s => weekDates.includes(s.date))
      : active === 'Month'
        ? workerShifts.filter(s => String(s.date || '').startsWith(monthKey))
        : active === 'Notes'
          ? workerShifts.filter(s => String(s.notes || '').trim() || String(s.incidentDescription || '').trim())
          : workerShifts;
  const patchShift = async (id, patch) => {
    const fullPatch = { ...patch, updatedAt: new Date().toISOString() };
    setPortalMessage('');
    setShifts(prev => prev.map(s => s.id === id ? { ...s, ...fullPatch } : s));
    if (employeeSession?.cloud) {
      const result = await updateEmployeeShiftCloud(employeeSession, id, fullPatch);
      if (result.ok) onCloudPayload(result.payload);
      else setPortalMessage(result.message || 'Could not save this shift update to cloud. Please check your internet and try again.');
      return result;
    }
    return { ok: true };
  };
  const startShift = (shift) => {
    const availability = canStartShiftNow(shift, Date.now());
    if (!availability.ok) return alert(availability.reason);
    if (!window.confirm('Confirm shift start? This will record your clock-in time in Melbourne time.')) return Promise.resolve({ ok: false, cancelled: true });
    return patchShift(shift.id, { status: 'In Progress', startedAt: shift.startedAt || new Date().toISOString(), viewedAt: shift.viewedAt || new Date().toISOString() });
  };
  const endShift = (shift) => {
    if (!window.confirm('Confirm shift end? This will record your clock-out time in Melbourne time and move the shift to notes completion.')) return Promise.resolve({ ok: false, cancelled: true });
    return patchShift(shift.id, { status: 'Awaiting Notes', endedAt: new Date().toISOString() });
  };
  const saveNotes = (shift, payload) => patchShift(shift.id, payload);
  const inProgress = workerShifts.filter(s => s.status === 'In Progress').length;
  const completed = workerShifts.filter(s => s.status === 'Completed').length;
  const nextShiftStart = nextShift ? canStartShiftNow(nextShift, now) : { ok: false, reason: '' };

  return <div className="worker-shell">
    <header className="worker-top">
      <div><BrandMark compact /><span><b>{business?.name || 'Kajola Care'}</b><small>Employee Portal</small></span></div>
      <button className="ghost" onClick={onSignOut}>Sign out</button>
    </header>
    <main className="worker-main">
      {active === 'Today' ? <>
        <section className="worker-hero worker-dashboard-hero">
          <div><small>Welcome back</small><h1>{matchedWorker?.name || employeeSession?.username || getFirstName(user)}</h1><p>Your shifts for today. Clock in and out, add notes, and report incidents here. Times shown in Melbourne time.</p></div>
          <div className="worker-hero-card"><span>{todayShifts.length}</span><small>Today</small></div>
        </section>
        {nextShift && <section className="worker-next-shift">
          <div><small>{nextShift.date === today ? "Today's shift" : 'Next shift'}</small><h2>{findClient(nextShift.participantId)?.name || nextShift.participantName || 'Assigned participant'}</h2><p>{fmt(nextShift.date)} · {nextShift.startTime || '--:--'}–{nextShift.endTime || '--:--'} · {nextShift.supportType || 'Support shift'}</p>{nextShift.recurrenceLabel && <span className="recurring-badge">Recurring: {nextShift.recurrenceLabel}</span>}</div>
          <button className="primary" disabled={getDisplayStatus(nextShift) !== 'Scheduled' || !nextShiftStart.ok} title={nextShiftStart.reason} onClick={() => startShift(nextShift)}>{nextShiftStart.ok ? 'Start Shift' : 'Start Locked'}</button>
        </section>}
        <section className="worker-summary-grid">
          <div><small>Today</small><b>{todayShifts.length}</b></div>
          <div><small>In progress</small><b>{inProgress}</b></div>
          <div><small>Completed</small><b>{completed}</b></div>
        </section>
      </> : <section className="worker-view-heading">
        <div>
          <small>{active === 'All Shifts' ? 'All shifts' : active}</small>
          <h1>{active === 'Week' ? 'This Week' : active === 'Month' ? 'This Month' : active === 'Notes' ? 'Client Notes' : 'All Shifts'}</h1>
          <p>{active === 'Week' ? 'Your roster grouped by day. Tap a day to expand shifts.' : active === 'Month' ? 'Your monthly roster grouped by date. Tap a group to expand.' : active === 'Notes' ? 'Progress notes and incident reports grouped by assigned clients only.' : 'Searchable shift history grouped by date.'}</p>
        </div>
      </section>}
      {!matchedWorker && <div className="worker-notice"><b>Employee Profile Not Found</b><span>Your account is not yet linked to an employee record. Ask an admin to create or enable your employee username under Compliance &gt; Employees before assigning shifts.</span></div>}
      {matchedWorker && workerShifts.length === 0 && <div className="worker-notice"><b>No assigned shifts yet</b><span>Your employee profile is active, but no client shifts have been assigned to you yet.</span></div>}
      {portalMessage && <div className="worker-notice"><b>Sync notice</b><span>{portalMessage}</span></div>}
      <div className="worker-shift-list">
        {active === 'Today'
          ? <Records rows={visible} empty="No assigned shifts found." render={shift => <WorkerShiftCard key={shift.id} shift={shift} displayStatus={getDisplayStatus(shift)} client={findClient(shift.participantId)} now={now} onStart={() => startShift(shift)} onEnd={() => endShift(shift)} onNotes={payload => saveNotes(shift, payload)} />} />
          : active === 'Notes'
            ? <WorkerNotesByClient shifts={visible} clients={clients} getDisplayStatus={getDisplayStatus} />
            : <WorkerGroupedShiftList shifts={visible} clients={clients} getDisplayStatus={getDisplayStatus} mode={active} now={now} onStart={startShift} onEnd={endShift} onNotes={saveNotes} />}
      </div>
    </main>
    <nav className="worker-bottom-nav">{[
      ['Today','⌂','Home'],
      ['Week','▦','Week'],
      ['Month','◷','Month'],
      ['Notes','✎','Notes'],
      ['All Shifts','☰','All']
    ].map(([tab, icon, label]) => <button key={tab} className={active === tab ? 'active' : ''} onClick={() => setActive(tab)}><span>{icon}</span><small>{label}</small></button>)}</nav>
  </div>;
}

function WorkerShiftCard({ shift, displayStatus, client, onStart, onEnd, onNotes, now = Date.now() }) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(shift.notes || '');
  const [incident, setIncident] = useState(Boolean(shift.incidentDescription));
  const [incidentType, setIncidentType] = useState(shift.incidentType || '');
  const [incidentDescription, setIncidentDescription] = useState(shift.incidentDescription || '');
  const [incidentAction, setIncidentAction] = useState(shift.incidentAction || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { setNotes(shift.notes || ''); setIncident(Boolean(shift.incidentDescription)); setIncidentType(shift.incidentType || ''); setIncidentDescription(shift.incidentDescription || ''); setIncidentAction(shift.incidentAction || ''); setSaved(false); }, [shift.id, shift.notes, shift.incidentType, shift.incidentDescription, shift.incidentAction]);
  const status = displayStatus || shift.status || 'Scheduled';
  const clientName = client?.name || shift.participantName || 'Assigned participant';
  const address = shift.location || client?.address || 'Address not entered';
  const serviceType = shift.supportType || 'Support shift';
  const scheduledLabel = `${fmt(shift.date)} · ${shift.startTime || '--:--'}–${shift.endTime || '--:--'} Melbourne`;
  const duration = shift.startTime && shift.endTime ? `${hoursBetween(shift.startTime, shift.endTime).toFixed(1)} hrs scheduled` : 'Duration pending';
  const elapsed = shift.startedAt ? Math.max(0, now - new Date(shift.startedAt).getTime()) : 0;
  const elapsedLabel = elapsed ? `${Math.floor(elapsed / 3600000)}h ${Math.floor((elapsed % 3600000) / 60000)}m` : '';
  const notesRequired = status === 'Awaiting Notes' || shift.status === 'Awaiting Notes';
  const canShowNotes = notesRequired || status === 'Completed' || String(notes || '').trim() || incident;
  const canReportIncident = ['In Progress','Awaiting Notes','Completed'].includes(status) || incident;
  const notesValid = notes.trim().length >= (notesRequired ? 20 : 1);
  const statusSteps = ['Scheduled', 'In Progress', 'Awaiting Notes', 'Completed'];
  const currentStep = status === 'Missed' ? 0 : Math.max(0, statusSteps.indexOf(status));
  const handleSaveNotes = async () => {
    if (notesRequired && notes.trim().length < 20) return alert('Please enter at least 20 characters of shift notes before completing this shift.');
    if (incident && (!incidentType.trim() || !incidentDescription.trim() || !incidentAction.trim())) return alert('Please complete incident type, description and immediate action, or untick Report incident.');
    setSaving(true);
    const payload = {
      notes: notes.trim(),
      status: notesRequired ? 'Completed' : (shift.status || 'Scheduled'),
      notesSubmittedAt: new Date().toISOString(),
      incidentReported: incident,
      incidentType: incident ? incidentType.trim() : '',
      incidentDescription: incident ? incidentDescription.trim() : '',
      incidentAction: incident ? incidentAction.trim() : ''
    };
    const result = await onNotes(payload);
    setSaving(false);
    if (result?.ok === false) return alert(result.message || 'Could not submit notes. Please try again.');
    setSaved(true);
    setTimeout(() => setSaved(false), 2400);
  };
  const startAvailability = canStartShiftNow(shift, now);
  const primaryAction = status === 'Scheduled'
    ? { label: startAvailability.ok ? 'Start Shift' : 'Start Locked', action: onStart, disabled: !startAvailability.ok, reason: startAvailability.reason }
    : status === 'In Progress'
      ? { label: 'End Shift', action: onEnd, disabled: false }
      : notesRequired
        ? { label: saving ? 'Submitting…' : 'Submit Notes & Complete', action: handleSaveNotes, disabled: saving || !notesValid || (incident && (!incidentType.trim() || !incidentDescription.trim() || !incidentAction.trim())) }
        : null;
  const confirmation = status === 'In Progress'
    ? `Shift started ${fmtMelbourneTime(shift.startedAt)} Melbourne · elapsed ${elapsedLabel}`
    : status === 'Awaiting Notes'
      ? `Clocked out ${fmtMelbourneTime(shift.endedAt)} Melbourne · notes required`
      : status === 'Completed'
        ? `Completed${shift.notesSubmittedAt ? ` ${fmtMelbourneDateTime(shift.notesSubmittedAt)}` : ''}`
        : status === 'Missed'
          ? 'This scheduled shift appears missed. Contact admin if this is incorrect.'
          : 'Ready to start.';

  return <article className={`worker-shift-card worker-shift-compact status-${status.toLowerCase().replace(/\s+/g, '-')}`}>
    <div className="worker-shift-head compact">
      <div className="worker-client-block"><small>Client</small><h3>{clientName}</h3><p>{serviceType}</p>{shift.recurrenceLabel && <span className="recurring-badge">Recurring: {shift.recurrenceLabel}</span>}</div>
      <span className={`worker-status ${status.toLowerCase().replace(/\s+/g, '-')}`}>{status}</span>
    </div>

    <div className="worker-quick-details">
      <div><small>Time</small><b>{scheduledLabel}</b><span>{duration}</span></div>
      <div><small>Address</small><b>{address}</b><span>{address === 'Address not entered' ? 'Ask admin for the location' : 'Where to attend'}</span></div>
    </div>

    <div className={`worker-status-timeline step-${currentStep}`}>
      {statusSteps.map((step, idx) => <div key={step} className={idx <= currentStep ? 'done' : ''}><span></span><small>{step === 'Awaiting Notes' ? 'Notes' : step}</small></div>)}
    </div>

    {(status === 'In Progress' || status === 'Awaiting Notes' || status === 'Completed' || status === 'Missed') && <div className={`worker-confirmation ${status.toLowerCase().replace(/\s+/g, '-')}`}><b>{status === 'In Progress' ? 'Shift in progress' : status === 'Awaiting Notes' ? 'Shift ended' : status}</b><span>{confirmation}</span></div>}

    <button className="worker-detail-toggle" type="button" onClick={() => setOpen(v => !v)}>{open ? 'Hide shift details' : 'Open shift details'}</button>
    {open && <div className="worker-detail-panel worker-detail-panel-compact">
      <div><small>Emergency Contact</small><b>{client?.emergencyContact || client?.nextOfKin || 'Not entered'}</b></div>
      <div><small>Participant Notes</small><p>{client?.notes || client?.supportNotes || 'No participant notes entered.'}</p></div>
      <div><small>Admin Instructions</small><p>{shift.adminNotes || 'No admin notes entered.'}</p></div>
      <div><small>Clock Evidence</small><p>{shift.viewedAt ? `Viewed: ${fmtMelbourneDateTime(shift.viewedAt)}` : 'Viewed time not recorded'}{shift.startedAt ? ` · Started: ${fmtMelbourneDateTime(shift.startedAt)}` : ''}{shift.endedAt ? ` · Ended: ${fmtMelbourneDateTime(shift.endedAt)}` : ''}</p></div>
    </div>}

    {shift.adminNotes && !open && <div className="worker-admin-note"><b>Admin notes</b><p>{shift.adminNotes}</p></div>}

    {canShowNotes && <div className="worker-notes-stage">
      <label className="worker-note-field"><span>Shift Notes {notesRequired ? '*' : ''}</span><textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Enter progress notes, observations, concerns or handover notes. Minimum 20 characters required to complete a shift." /><small>{notes.trim().length} characters{notesRequired && !notesValid ? ' · minimum 20 required' : ''}</small></label>
      {canReportIncident && <label className="worker-incident-toggle"><input type="checkbox" checked={incident} onChange={e => setIncident(e.target.checked)} /><span>Report incident for this shift</span></label>}
      {incident && <div className="worker-incident-box">
        <label><span>Incident Type</span><input value={incidentType} onChange={e => setIncidentType(e.target.value)} placeholder="Fall, behaviour, medication, injury…" /></label>
        <label><span>Description</span><textarea value={incidentDescription} onChange={e => setIncidentDescription(e.target.value)} placeholder="Describe what happened." /></label>
        <label><span>Immediate Action Taken</span><textarea value={incidentAction} onChange={e => setIncidentAction(e.target.value)} placeholder="What action did you take and who was notified?" /></label>
      </div>}
    </div>}

    <div className="worker-single-action">
      {primaryAction ? <button className="primary" onClick={primaryAction.action} disabled={primaryAction.disabled}>{primaryAction.label}</button> : <button type="button" disabled>{status === 'Completed' ? 'Shift Completed' : status}</button>}
      {!canShowNotes && canReportIncident && <button type="button" className="ghost" onClick={() => { setIncident(true); setOpen(true); }}>Report Incident</button>}
      <small>{saved ? 'Saved successfully.' : (primaryAction?.reason && !startAvailability.ok ? primaryAction.reason : confirmation)}</small>
    </div>
  </article>;
}

function groupWorkerShifts(shifts, mode) {
  const groups = new Map();
  const labelFor = (shift) => {
    if (mode === 'All Shifts') return shift.date || 'Unscheduled';
    if (mode === 'Month') return shift.date ? `${fmtWeekday(shift.date)}, ${fmt(shift.date)}` : 'Unscheduled';
    return shift.date ? `${fmtWeekday(shift.date)}, ${fmt(shift.date)}` : 'Unscheduled';
  };
  shifts.forEach(shift => {
    const key = labelFor(shift);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(shift);
  });
  return Array.from(groups.entries()).map(([label, rows]) => ({ label, rows }));
}

function WorkerGroupedShiftList({ shifts = [], clients = [], getDisplayStatus, mode, onStart, onEnd, onNotes, now = Date.now() }) {
  const [openGroup, setOpenGroup] = useState('');
  const [openShift, setOpenShift] = useState('');
  const [query, setQuery] = useState('');
  const findClient = (id) => clients.find(c => c.id === id);
  const filtered = !query.trim() ? shifts : shifts.filter(s => {
    const c = findClient(s.participantId);
    return [c?.name, s.participantName, s.supportType, s.location, s.date, s.startTime, getDisplayStatus(s)].join(' ').toLowerCase().includes(query.trim().toLowerCase());
  });
  const groups = groupWorkerShifts(filtered, mode);
  const showSearch = mode === 'All Shifts';
  if (!shifts.length) return <div className="worker-empty-state">No assigned shifts found.</div>;
  return <div className="worker-collapsed-groups">
    {showSearch && <div className="worker-search"><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search client, service, date or status…" />{query && <button type="button" className="worker-search-clear" onClick={() => setQuery('')} aria-label="Clear search">×</button>}</div>}
    {!groups.length && <div className="worker-empty-state">No shifts match "{query}".</div>}
    {groups.map((group, idx) => {
      const isOpen = openGroup === group.label || (!openGroup && idx === 0);
      return <section className="worker-collapse-group" key={group.label}>
        <button type="button" className="worker-collapse-head" onClick={() => setOpenGroup(isOpen ? '' : group.label)}>
          <span><b>{group.label}</b><small>{group.rows.length} shift{group.rows.length === 1 ? '' : 's'}</small></span><em>{isOpen ? '−' : '+'}</em>
        </button>
        {isOpen && <div className="worker-collapse-body">{group.rows.map(shift => {
          const client = findClient(shift.participantId);
          const status = getDisplayStatus(shift);
          const expanded = openShift === shift.id;
          return <div className="worker-collapsed-shift" key={shift.id}>
            <button type="button" className="worker-collapsed-row" onClick={() => setOpenShift(expanded ? '' : shift.id)}>
              <span><b>{client?.name || shift.participantName || 'Assigned participant'}</b><small>{shift.startTime || '--:--'}–{shift.endTime || '--:--'} · {shift.supportType || 'Support shift'}</small></span>
              <i className={`worker-status ${String(status).toLowerCase().replace(/\s+/g, '-')}`}>{status}</i>
            </button>
            {expanded && <WorkerShiftCard shift={shift} displayStatus={status} client={client} now={now} onStart={() => onStart(shift)} onEnd={() => onEnd(shift)} onNotes={payload => onNotes(shift, payload)} />}
          </div>;
        })}</div>}
      </section>;
    })}
  </div>;
}

function WorkerNotesByClient({ shifts = [], clients = [], getDisplayStatus }) {
  const notedShifts = shifts.filter(s => String(s.notes || '').trim() || String(s.incidentDescription || '').trim());
  const groups = new Map();
  notedShifts.forEach(shift => {
    const client = clients.find(c => c.id === shift.participantId);
    const key = shift.participantId || shift.participantName || 'unknown';
    if (!groups.has(key)) groups.set(key, { client, rows: [] });
    groups.get(key).rows.push(shift);
  });
  const [openClient, setOpenClient] = useState('');
  if (!notedShifts.length) return <div className="worker-empty-state">No saved progress notes or incident reports for your assigned clients yet.</div>;
  return <div className="worker-notes-groups">
    {Array.from(groups.entries()).map(([key, group], idx) => {
      const isOpen = openClient === key || (!openClient && idx === 0);
      const clientName = group.client?.name || group.rows[0]?.participantName || 'Assigned client';
      return <section className="worker-collapse-group" key={key}>
        <button type="button" className="worker-collapse-head" onClick={() => setOpenClient(isOpen ? '' : key)}>
          <span><b>{clientName}</b><small>{group.rows.length} saved record{group.rows.length === 1 ? '' : 's'}</small></span><em>{isOpen ? '−' : '+'}</em>
        </button>
        {isOpen && <div className="worker-note-records">{group.rows.map(shift => <article className="worker-note-record" key={shift.id}>
          <div><small>{fmt(shift.date)} · {shift.startTime || '--:--'}–{shift.endTime || '--:--'}</small><span className={`worker-status ${String(getDisplayStatus(shift)).toLowerCase().replace(/\s+/g, '-')}`}>{getDisplayStatus(shift)}</span></div>
          {shift.notes && <p><b>Progress note</b>{shift.notes}</p>}
          {shift.incidentDescription && <p><b>Incident report</b>{shift.incidentType || 'Incident'} — {shift.incidentDescription}<br/><small>Action: {shift.incidentAction || 'Not recorded'}</small></p>}
        </article>)}</div>}
      </section>;
    })}
  </div>;
}

function BusinessOnboarding({ business, onSave, user, onLoadCloud, cloudLoading }) {
  const [draft, setDraft] = useState({ ...EMPTY_BUSINESS, ...business });
  const updateDraft = (field, value) => setDraft(prev => ({ ...prev, [field]: value }));

  return <div className="auth-shell">
    <section className="auth-hero">
      <BrandMark />
      <BrandWordmark hero />
      <h1>Set up your business</h1>
      <p>Personalise Kajola Care for your invoices, payment details and workspace branding.</p>
      <div className="auth-glass"><b>{user?.email || 'Your account'}</b><span>This profile is saved in your private cloud snapshot.</span></div>
      <button className="ghost" type="button" onClick={onLoadCloud} disabled={cloudLoading}>{cloudLoading ? 'Loading cloud…' : 'Load existing cloud profile'}</button>
    </section>
    <form className="auth-card" onSubmit={e => { e.preventDefault(); onSave(draft); }}>
      <h2>Business onboarding</h2>
      <p>Enter the details you want shown on invoices. You can edit these later in Settings.</p>
      <div className="logo-uploader compact">
        <div className="logo-preview">{draft.logoUrl ? <img src={draft.logoUrl} alt="Business logo" /> : <span>{(draft.name || 'KC').slice(0,2).toUpperCase()}</span>}</div>
        <div>
          <b>Business Logo</b>
          <small>Optional, but recommended for professional invoices.</small>
          <label className="file">Upload Logo<input type="file" accept="image/png,image/jpeg,image/jpg" onChange={async e => { const file = e.target.files?.[0]; if (file) updateDraft('logoUrl', await fileToDataUrl(file)); }}/></label>
        </div>
      </div>
      <Field label="Business Name" value={draft.name} onChange={e => updateDraft('name', e.target.value)} placeholder="Your business name" />
      <Field label="ABN / Registration" value={draft.abn} onChange={e => updateDraft('abn', e.target.value)} placeholder="ABN 000 000 000 00" />
      <Field label="Business Email" type="email" value={draft.email} onChange={e => updateDraft('email', e.target.value)} placeholder="hello@yourbusiness.com" />
      <Field label="Business Phone" value={draft.phone} onChange={e => updateDraft('phone', e.target.value)} placeholder="04xx xxx xxx" />
      <Field label="Business Address" multiline value={draft.address} onChange={e => updateDraft('address', e.target.value)} placeholder="Street, suburb, state" />
      <Field label="Payment Details" multiline value={draft.paymentDetails} onChange={e => updateDraft('paymentDetails', e.target.value)} placeholder={"Bank: Your Bank\nBSB: 000 000\nAccount: 0000 0000"} />
      <button className="primary">Complete Setup</button>
    </form>
  </div>;
}

function LoadingScreen({ message = 'Securing your workspace…' }) {
  return <div className="auth-shell"><div className="auth-card"><BrandMark /><BrandWordmark hero /><p>{message}</p></div></div>;
}

function AuthGate({ onEmployeeLogin, forceRole = null }) {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loginRole, setLoginRole] = useState(forceRole || 'admin');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [setupUrl, setSetupUrl] = useState('');
  const [setupAnonKey, setSetupAnonKey] = useState('');

  useEffect(() => { if (forceRole) { setLoginRole(forceRole); setMode('signin'); } }, [forceRole]);

  function saveSupabaseSetup(e) {
    e.preventDefault();
    if (!setupUrl || !setupAnonKey) {
      setMessage('Enter both the cloud URL and public key.');
      return;
    }
    window.localStorage.setItem('lg_flow_supabase_config', JSON.stringify({
      url: setupUrl.trim().replace(/\/rest\/v1\/?$/, ''),
      anonKey: setupAnonKey.trim(),
    }));
    window.location.reload();
  }

  if (!supabase) {
    return <div className="auth-shell">
      <section className="auth-hero"><BrandMark /><BrandWordmark hero /><p>Care • Connect • Empower</p><div className="auth-glass"><b>Cloud setup required</b><span>Paste your Kajola Care cloud URL and public key once. The app will save it in this browser.</span></div></section>
      <form className="auth-card" onSubmit={saveSupabaseSetup}>
        <h2>Connect Cloud</h2>
        <p>Your administrator can provide these connection details.</p>
        <Field label="Cloud URL" value={setupUrl} onChange={e => setSetupUrl(e.target.value)} placeholder="https://your-project.example.co" />
        <Field label="Public key" value={setupAnonKey} onChange={e => setSetupAnonKey(e.target.value)} placeholder="eyJ..." />
        {message && <div className="auth-message">{message}</div>}
        <button className="primary">Save & Reload</button>
      </form>
    </div>;
  }

  async function submit(e) {
    e.preventDefault();
    if (loginRole === 'worker') {
      if (!email || !password) { setMessage('Enter your employee username and password.'); return; }
      setBusy(true); setMessage('');
      const result = await findEmployeeLogin(email, password);
      setBusy(false);
      if (!result.ok) setMessage(result.message);
      else { setMessage('Signed in. Loading employee portal…'); onEmployeeLogin?.(result.session, result.payload); }
      return;
    }
    if (!supabase) { setMessage('Cloud sync is not configured.'); return; }
    if (!email || !password) { setMessage('Enter your email and password.'); return; }
    window.localStorage.setItem('kajola_last_login_role', 'admin');
    setBusy(true); setMessage('');
    const result = mode === 'signup'
      ? await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName || 'Kajola Care User', kajola_role: 'admin' } } })
      : await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (result.error) setMessage(result.error.message);
    else if (mode === 'signup' && !result.data.session) setMessage('Account created. Check your email to confirm your sign up, then sign in.');
    else setMessage('Signed in. Loading workspace…');
  }

  return <div className="auth-shell">
    <section className="auth-hero"><BrandMark /><BrandWordmark hero /><p>Care • Connect • Empower</p><div className="auth-glass"><b>{loginRole === 'admin' ? 'Admin workspace' : 'Employee portal'}</b><span>{loginRole === 'admin' ? 'Participants, invoices, finance and snapshots protected by secure cloud authentication.' : 'Workers can view assigned shifts, clock in/out and submit shift notes.'}</span></div></section>
    <form className="auth-card" onSubmit={submit}>
      {!forceRole && <div className="auth-role-tabs"><button type="button" className={loginRole === 'admin' ? 'active' : ''} onClick={() => { setLoginRole('admin'); setEmail(''); setPassword(''); }}>Admin Sign In</button><button type="button" className={loginRole === 'worker' ? 'active' : ''} onClick={() => { setLoginRole('worker'); setMode('signin'); setEmail(''); setPassword(''); }}>Employee Sign In</button></div>}
      <h2>{mode === 'signup' ? 'Create your account' : loginRole === 'admin' ? 'Admin sign in' : 'Employee sign in'}</h2>
      <p>{mode === 'signup' ? (loginRole === 'admin' ? 'Start a secure Kajola Care admin workspace.' : 'Create an employee account for the worker portal.') : (loginRole === 'admin' ? 'Sign in to continue to the admin dashboard.' : 'Sign in to continue to your assigned shifts.')}</p>
      {mode === 'signup' && loginRole === 'admin' && <Field label="Full name" value={fullName} onChange={e => setFullName(e.target.value)} />}
      <Field label={loginRole === 'admin' ? 'Email' : 'Username'} type={loginRole === 'admin' ? 'email' : 'text'} value={email} onChange={e => setEmail(e.target.value)} autoComplete={loginRole === 'admin' ? 'email' : 'username'} />
      <Field label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
      {message && <div className="auth-message">{message}</div>}
      <button className="primary" disabled={busy}>{busy ? 'Please wait…' : mode === 'signup' ? 'Sign up' : 'Sign in'}</button>
      {loginRole === 'admin' && <button type="button" className="text-link auth-switch" onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setMessage(''); }}>
        {mode === 'signup' ? 'Already have an account? Sign in' : 'Need an account? Sign up'}
      </button>}
      {loginRole === 'worker' && <p className="muted">Ask your administrator for your employee username and password.</p>}
    </form>
  </div>;
}
