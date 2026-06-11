import React, { useCallback, useEffect, useMemo, useState } from
'react';
import {
View,
Text,
TextInput,
TouchableOpacity,
ScrollView,
SafeAreaView,
Alert,
StyleSheet,
Platform,
StatusBar,
Modal,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { Share } from 'react-native';
const STORAGE_KEY = 'ndis_simple_transaction_app_v2';
const TABS = {
DASHBOARD: 'Dash��️',
CLIENTS: 'Cust��',
INVOICES: 'Inv��',
TRANSACTIONS: 'Trans��',
SETTINGS: '��️',
};
const BUSINESS = {
name: "Life's Good Disability Services",
abn: 'ABN 616 600 252 94',
email: 'hola@lgds.com.au',
phone: '0450 696 350',
address: '36 Sankuru Road, Truganina',
paymentDetails: "Life's Good Disability Services\nBank: Common Wealth
Bank\nBSB: 067 873\nAccount: 1866 9873",
};
const INVOICE_ITEMS = [
{ label: 'Self-Care Support', rate: 70.23 },
{ label: 'Community Access', rate: 70.23 },
{ label: 'Transport', rate: 1.00 },
{
label: 'Establishment Fee for Personal Care/Participation',
rate: 702.30
},
];
const emptyClientForm = {
name: '',
ndisNumber: '',
email: '',
phone: '',
address: '',
};
function todayISO() {
return new Date().toISOString().slice(0, 10);
}
function addDaysISO(days) {
const d = new Date();
d.setDate(d.getDate() + days);
return d.toISOString().slice(0, 10);
}
function makeId(prefix) {
return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,
8)}`;
}
function emptyInvoiceLine() {
return {
id: makeId('line'),
itemLabel: INVOICE_ITEMS[0].label,
serviceDate: todayISO(),
unitType: 'hours',
quantity: '1',
rate: String(INVOICE_ITEMS[0].rate),
};
}
const emptyInvoiceForm = {
clientId: '',
notes: '',
dueDate: addDaysISO(7),
lines: [emptyInvoiceLine()],
};
const emptyTransactionForm = {
clientId: '',
type: 'expense',
status: 'pending',
category: '',
description: '',
amount: '',
date: todayISO(),
};
function currency(value) {
const num = Number(value || 0);
return `$${num.toFixed(2)}`;
}
function formatDate(dateStr) {
if (!dateStr) return '-';
const date = new Date(dateStr);
if (Number.isNaN(date.getTime())) return dateStr;
return date.toLocaleDateString();
}
function escapeHtml(value) {
return String(value ?? '')
.replace(/&/g, '&amp;')
.replace(/</g, '&lt;')
.replace(/>/g, '&gt;')
.replace(/"/g, '&quot;')
.replace(/'/g, '&#039;');
}
export default function App() {
const [activeTab, setActiveTab] = useState(TABS.DASHBOARD);
const [clients, setClients] = useState([]);
const [invoices, setInvoices] = useState([]);
const [transactions, setTransactions] = useState([]);
const [clientForm, setClientForm] = useState(emptyClientForm);
const [invoiceForm, setInvoiceForm] = useState(emptyInvoiceForm);
const [transactionForm, setTransactionForm] =
useState(emptyTransactionForm);
const [loading, setLoading] = useState(true);
const [exportingInvoiceId, setExportingInvoiceId] = useState('');
const [editingInvoiceId, setEditingInvoiceId] = useState(null);const
[editingClientId, setEditingClientId] = useState(null);
const [editingTransactionId, setEditingTransactionId] = useState(null);
const [backupJsonText, setBackupJsonText] = useState('');
const loadData = useCallback(async () => {
try {
const raw = await AsyncStorage.getItem(STORAGE_KEY);
if (raw) {
const parsed = JSON.parse(raw);
const loadedClients = (parsed.clients || []).map((client) => ({
archived: false,
...client,
}));
const loadedTransactions = (parsed.transactions || []).map((txn) => ({
clientId: '',
clientName: '',
status: 'paid',
...txn,
}));
setClients(loadedClients);
setInvoices(parsed.invoices || []);
setTransactions(loadedTransactions);
}
} catch (error) {
Alert.alert('Load error', 'Could not load saved app data.');
} finally {
setLoading(false);
}
}, []);
const saveData = useCallback(async () => {
try {
await AsyncStorage.setItem(
STORAGE_KEY,
JSON.stringify({ clients, invoices, transactions })
);
} catch (error) {
Alert.alert('Save error', 'Could not save app data.');
}
}, [clients, invoices, transactions]);
useEffect(() => {
loadData();
}, [loadData]);
useEffect(() => {
if (!loading) {
saveData();
}
}, [clients, invoices, transactions, loading, saveData]);
const totals = useMemo(() => {
const activeClients = clients.filter((c) => !c.archived).length;
const income = transactions
.filter((t) => t.type === 'income')
.reduce((sum, t) => sum + Number(t.amount || 0), 0);
const expenses = transactions
.filter((t) => t.type === 'expense')
.reduce((sum, t) => sum + Number(t.amount || 0), 0);
return {
clients: activeClients,
invoices: invoices.length,
income,
expenses,
net: income - expenses,
};
}, [clients, invoices, transactions]);
function handleAddClient() {
if (!clientForm.name.trim()) {
Alert.alert('Missing client name', 'Please enter the client name.');
return false;
}
if (editingClientId) {
setClients((prev) =>
prev.map((client) =>
client.id === editingClientId
? {
...client,
...clientForm,
updatedAt: new Date().toISOString(),
}
: client
)
);
Alert.alert('Client updated', `${clientForm.name} has been updated.`);
setEditingClientId(null);
setClientForm(emptyClientForm);
return true;
}
const newClient = {
id: makeId('client'),
...clientForm,
archived: false,
createdAt: new Date().toISOString(),
};
setClients((prev) => [newClient, ...prev]);
setClientForm(emptyClientForm);
Alert.alert('Client added', `${newClient.name} has been saved.`);
return true;
}
function handleEditClient(client) {
setClientForm({
name: client.name || '',
ndisNumber: client.ndisNumber || '',
email: client.email || '',
phone: client.phone || '',
address: client.address || '',
});
setEditingClientId(client.id);
setActiveTab(TABS.CLIENTS);
}
function handleCancelEditClient() {
setEditingClientId(null);
setClientForm(emptyClientForm);
}
function handleArchiveClient(id) {
if (editingClientId === id) {
setEditingClientId(null);
setClientForm(emptyClientForm);
}
setClients((prev) =>
prev.map((client) =>
client.id === id
? {
...client,
archived: !client.archived,
updatedAt: new Date().toISOString(),
}
: client
)
);
}
function handleInvoiceItemChange(lineId, label) {
const item = INVOICE_ITEMS.find((x) => x.label === label);
setInvoiceForm((prev) => ({
...prev,
lines: prev.lines.map((line) =>
line.id === lineId
? {
...line,
itemLabel: label,
unitType: label === 'Transport' ? 'km' : 'hours',
rate: item ? String(item.rate) : line.rate,
}
: line
),
}));
}
function handleInvoiceLineChange(lineId, field, value) {
setInvoiceForm((prev) => ({
...prev,
lines: prev.lines.map((line) =>
line.id === lineId ? { ...line, [field]: value } : line
),
}));
}
function handleAddInvoiceLine() {
setInvoiceForm((prev) => ({
...prev,
lines: [...prev.lines, emptyInvoiceLine()],
}));
}
function handleRemoveInvoiceLine(lineId) {
setInvoiceForm((prev) => {
if (prev.lines.length === 1) {
Alert.alert('Cannot remove line', 'An invoice needs at least one service
line.');
return prev;
}
return {
...prev,
lines: prev.lines.filter((line) => line.id !== lineId),
};
});
}
function handleGenerateInvoice() {
if (!invoiceForm.clientId) {
Alert.alert('Missing client', 'Please select an NDIS client.');
return;
}
if (!invoiceForm.lines.length) {
Alert.alert('Missing services', 'Please add at least one service
line.');
return;
}
const client = clients.find((c) => c.id === invoiceForm.clientId &&
!c.archived);
if (!client) {
Alert.alert('Client not found', 'Please select a valid active client.');
return;
}
const cleanedLines = [];
for (const line of invoiceForm.lines) {
const qty = Number(line.quantity);
const rate = Number(line.rate);
if (!qty || qty <= 0 || Number.isNaN(qty) || rate < 0 ||
Number.isNaN(rate)) {
Alert.alert(
'Invalid invoice values',
'Please enter valid quantity and rate values for every service line.'
);
return;
}
cleanedLines.push({
id: line.id,
itemLabel: line.itemLabel,
serviceDate: line.serviceDate || '',
unitType: line.unitType,
quantity: qty,
rate,
lineTotal: qty * rate,
});
}
const total = cleanedLines.reduce((sum, line) => sum + line.lineTotal,
0);
const nextNumber =
Math.max(
0,
...invoices.map((inv) =>
Number(String(inv.invoiceNumber).replace('INV-', '')) || 0
)
) + 1;
const todayStamp = todayISO().replace(/-/g, '');
const todayInvoices = invoices.filter((inv) =>
String(inv.invoiceNumber || '').startsWith(`INV-${todayStamp}-`)
);
const nextTodayNumber = todayInvoices.length + 1;
const invoiceNumber =
`INV-${todayStamp}-${String(nextTodayNumber).padStart(3, '0')}`;
const newInvoice = {
id: makeId('invoice'),
invoiceNumber,
clientId: client.id,
clientName: client.name,
clientEmail: client.email,
clientPhone: client.phone,
clientAddress: client.address,
ndisNumber: client.ndisNumber,
issueDate: todayISO(),
dueDate: invoiceForm.dueDate || addDaysISO(7),
lines: cleanedLines,
total,
notes: invoiceForm.notes,
status: 'Generated',
createdAt: new Date().toISOString(),
};
setInvoices((prev) => [newInvoice, ...prev]);
setInvoiceForm({
...emptyInvoiceForm,
dueDate: addDaysISO(7),
lines: [emptyInvoiceLine()],
});
Alert.alert('Invoice generated', `${invoiceNumber} created for
${client.name}.`);
}
function handleAddTransaction() {
const amount = Number(transactionForm.amount);
const selectedClient = clients.find((c) => c.id ===
transactionForm.clientId && !c.archived);
if (!transactionForm.description.trim()) {
Alert.alert('Missing description', 'Please enter a transaction
description.');
return false;
}
if (!amount || amount <= 0) {
Alert.alert('Invalid amount', 'Please enter a valid amount greater than
zero.');
return false;
}
if (editingTransactionId) {
setTransactions((prev) =>
prev.map((txn) =>
txn.id === editingTransactionId
? {
...txn,
...transactionForm,
clientName: selectedClient?.name || '',
amount,
updatedAt: new Date().toISOString(),
}
: txn
)
);
Alert.alert('Transaction updated', 'The transaction has been updated.');
setEditingTransactionId(null);
setTransactionForm(emptyTransactionForm);
return true;
}
const newTransaction = {
id: makeId('txn'),
...transactionForm,
clientName: selectedClient?.name || '',
amount,
createdAt: new Date().toISOString(),
};
setTransactions((prev) => [newTransaction, ...prev]);
setTransactionForm(emptyTransactionForm);
Alert.alert('Transaction added', 'The transaction has been recorded.');
return true;
}
function handleEditTransaction(txn) {
setTransactionForm({
clientId: txn.clientId || '',
type: txn.type || 'expense',
status: txn.status || 'paid',
category: txn.category || '',
description: txn.description || '',
amount: String(txn.amount ?? ''),
date: txn.date || todayISO(),
});
setEditingTransactionId(txn.id);
setActiveTab(TABS.TRANSACTIONS);
}
function handleCancelEditTransaction() {
setEditingTransactionId(null);
setTransactionForm(emptyTransactionForm);
}
function handleDeleteClient(id) {
const linkedInvoices = invoices.some((i) => i.clientId === id);
if (linkedInvoices) {
Alert.alert(
'Cannot delete client',
'This client already has invoices. Keep the record for reporting
integrity.'
);
return;
}
setClients((prev) => prev.filter((c) => c.id !== id));
}
function handleDeleteInvoice(id) {
setInvoices((prev) => prev.filter((i) => i.id !== id));
}
function handleEditInvoice(invoice) {
setInvoiceForm({
clientId: invoice.clientId,
dueDate: invoice.dueDate || addDaysISO(7),
notes: invoice.notes || '',
lines: invoice.lines.map((line) => ({
id: line.id || makeId('line'),
itemLabel: line.itemLabel,
serviceDate: line.serviceDate || todayISO(),
unitType: line.unitType || 'hours',
quantity: String(line.quantity ?? '1'),
rate: String(line.rate ?? '0'),
})),
});
setEditingInvoiceId(invoice.id);
setActiveTab(TABS.INVOICES);
}
function handleCancelEditInvoice() {
setEditingInvoiceId(null);
setInvoiceForm({
...emptyInvoiceForm,
dueDate: addDaysISO(7),
lines: [emptyInvoiceLine()],
});
}
function handleDeleteTransaction(id) {
if (editingTransactionId === id) {
setEditingTransactionId(null);
setTransactionForm(emptyTransactionForm);
}
setTransactions((prev) => prev.filter((t) => t.id !== id));
}
async function handleExportBackup() {
try {
const backup = {
exportedAt: new Date().toISOString(),
version: 1,
data: {
clients,
invoices,
transactions,
},
};
const json = JSON.stringify(backup, null, 2);
await Share.share({
message: json,
title: 'NDIS Backup',
});
} catch (error) {
Alert.alert('Export failed', 'Could not create backup.');
}
}
function applyImportedBackupFromText(rawText) {
try {
const parsed = JSON.parse(rawText);
const imported = parsed?.data || parsed;
const importedClients = (imported.clients || []).map((c) => ({
archived: false,
...c,
}));
const importedTransactions = (imported.transactions || []).map((t) => ({
clientId: '',
clientName: '',
status: 'paid',
...t,
}));
Alert.alert(
'Import Backup',
'This will overwrite all current data. Continue?',
[
{ text: 'Cancel', style: 'cancel' },
{
text: 'Import',
style: 'destructive',
onPress: () => {
setClients(importedClients);
setInvoices(imported.invoices || []);
setTransactions(importedTransactions);
setClientForm(emptyClientForm);
setInvoiceForm(emptyInvoiceForm);
setTransactionForm(emptyTransactionForm);
setEditingClientId(null);
setEditingTransactionId(null);
setBackupJsonText('');
Alert.alert('Success', 'Backup restored.');
},
},
]
);
} catch (error) {
Alert.alert('Import failed', 'Invalid JSON format.');
}
}
async function handleImportBackup() {
try {
const result = await DocumentPicker.getDocumentAsync({
type: 'application/json',
copyToCacheDirectory: false,
});
if (result.canceled) return;
const file = result.assets?.[0];
if (!file?.uri) {
Alert.alert('Import failed', 'No file selected.');
return;
}
const response = await fetch(file.uri);
const text = await response.text();
applyImportedBackupFromText(text);
} catch (error) {
Alert.alert('Import failed', 'Invalid or unreadable file.');
}
}
function handleImportPastedBackup() {
if (!backupJsonText.trim()) {
Alert.alert('No JSON provided', 'Please paste backup JSON first.');
return;
}
applyImportedBackupFromText(backupJsonText);
}
function handleClearAllData() {
Alert.alert(
'Clear all data',
'This will permanently remove all clients, invoices, and transactions
from the app.',
[
{ text: 'Cancel', style: 'cancel' },
{
text: 'Clear All',
style: 'destructive',
onPress: async () => {
try {
setClients([]);
setInvoices([]);
setTransactions([]);
setClientForm(emptyClientForm);
setInvoiceForm(emptyInvoiceForm);
setTransactionForm(emptyTransactionForm);
setEditingClientId(null);
setEditingTransactionId(null);
await AsyncStorage.removeItem(STORAGE_KEY);
Alert.alert('Data cleared', 'All app data has been removed.');
} catch (error) {
Alert.alert('Clear failed', 'Could not clear app data.');
}
},
},
]
);
}
function confirmDelete(label, onConfirm) {
Alert.alert('Confirm delete', `Delete this ${label}?`, [
{ text: 'Cancel', style: 'cancel' },
{ text: 'Delete', style: 'destructive', onPress: onConfirm },
]);
}
function buildInvoiceHtml(invoice) {
const notesHtml = invoice.notes
? `<div class="section"><div class="section-title">Notes</div><div
class="muted">${escapeHtml(invoice.notes)}</div></div>`
: '';
const lineRows = invoice.lines
.map(
(line, index) => `
<tr>
<td>${index + 1}</td>
<td>${escapeHtml(line.serviceDate ? formatDate(line.serviceDate) :
'')}</td>
<td>${escapeHtml(line.itemLabel)}</td>
<td>${escapeHtml(line.quantity)}</td>
<td>${escapeHtml(line.unitType)}</td>
<td>${escapeHtml(currency(line.rate))}</td>
<td>${escapeHtml(currency(line.lineTotal))}</td>
</tr>
`
)
.join('');
return `
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>
body {
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
color: #1e293b;
padding: 28px;
font-size: 12px;
}
.header {
display: flex;
justify-content: space-between;
align-items: flex-start;
margin-bottom: 24px;
}
.title {
font-size: 28px;
font-weight: 700;
color: #0f172a;
margin-bottom: 6px;
}
.muted {
color: #475569;
white-space: pre-line;
line-height: 1.5;
}
.grid {
display: flex;
gap: 24px;
margin-bottom: 20px;
}
.box {
flex: 1;
border: 1px solid #dbe4ee;
border-radius: 12px;
padding: 14px;
}
.section {
margin-top: 20px;
}
.section-title {
font-size: 13px;
font-weight: 700;
margin-bottom: 10px;
color: #0f172a;
}
table {
width: 100%;
border-collapse: collapse;
margin-top: 10px;
}
th, td {
border: 1px solid #dbe4ee;
padding: 10px 8px;
text-align: left;
font-size: 12px;
}
th {
background: #eff6ff;
color: #0f172a;
}
.total-wrap {
margin-top: 18px;
display: flex;
justify-content: flex-end;
}
.total-box {
width: 220px;
border: 1px solid #dbe4ee;
border-radius: 12px;
padding: 14px;
}
.total-row {
display: flex;
justify-content: space-between;
font-size: 14px;
font-weight: 700;
color: #0f172a;
}
</style>
</head>
<body>
<div class="header">
<div>
<div class="title">Invoice</div>
<div class="muted">
${escapeHtml(BUSINESS.name)}
${BUSINESS.abn ? `\n${escapeHtml(BUSINESS.abn)}` : ''}
${BUSINESS.address ? `\n${escapeHtml(BUSINESS.address)}` : ''}
${BUSINESS.phone ? `\n${escapeHtml(BUSINESS.phone)}` : ''}
${BUSINESS.email ? `\n${escapeHtml(BUSINESS.email)}` : ''}
</div>
</div>
<div class="box" style="max-width: 260px;">
<div class="muted"><strong>Invoice No:</strong>
${escapeHtml(invoice.invoiceNumber)}</div>
<div class="muted"><strong>Issue Date:</strong>
${escapeHtml(formatDate(invoice.issueDate))}</div>
<div class="muted"><strong>Due Date:</strong>
${escapeHtml(formatDate(invoice.dueDate))}</div>
<div class="muted"><strong>Status:</strong>
${escapeHtml(invoice.status)}</div>
</div>
</div>
<div class="grid">
<div class="box">
<div class="section-title">Billed To</div>
<div class="muted">
${escapeHtml(invoice.clientName)}
${invoice.ndisNumber ? `\nNDIS: ${escapeHtml(invoice.ndisNumber)}` : ''}
${invoice.clientAddress ? `\n${escapeHtml(invoice.clientAddress)}` : ''}
${invoice.clientPhone ? `\n${escapeHtml(invoice.clientPhone)}` : ''}
${invoice.clientEmail ? `\n${escapeHtml(invoice.clientEmail)}` : ''}
</div>
</div>
<div class="box">
<div class="section-title">Payment Details</div>
<div class="muted">${escapeHtml(BUSINESS.paymentDetails)}</div>
</div>
</div>
<div class="section">
<div class="section-title">Services</div>
<table>
<thead>
<tr>
<th>#</th>
<th>Date</th>
<th>Service</th>
<th>Qty</th>
<th>Unit</th>
<th>Rate</th>
<th>Line Total</th>
</tr>
</thead>
<tbody>
${lineRows}
</tbody>
</table>
</div>
<div class="total-wrap">
<div class="total-box">
<div class="total-row">
<span>Total</span>
<span>${escapeHtml(currency(invoice.total))}</span>
</div>
</div>
</div>
${notesHtml}
</body>
</html>
`;
}
async function handleExportInvoicePdf(invoice) {
try {
setExportingInvoiceId(invoice.id);
const html = buildInvoiceHtml(invoice);
const { uri } = await Print.printToFileAsync({ html });
const canShare = await Sharing.isAvailableAsync();
const safeClient = (invoice.clientName || 'Client')
.trim()
.replace(/\s+/g, '-')
.replace(/[^a-zA-Z0-9-_]/g, '');
const fileName = `LGDS_${safeClient}_${invoice.invoiceNumber}.pdf`;
if (canShare) {
await Sharing.shareAsync(uri, {
mimeType: 'application/pdf',
dialogTitle: fileName,
UTI: 'com.adobe.pdf',
});
} else {
Alert.alert('PDF created', `Invoice PDF created at:\n${uri}`);
}
} catch (error) {
Alert.alert('PDF export failed', 'Could not generate the PDF invoice.');
} finally {
setExportingInvoiceId('');
}
}
const recentInvoices = invoices.slice(0, 5);
const recentTransactions = transactions.slice(0, 5);
return (
<SafeAreaView style={styles.safeArea}>
<View style={styles.container}>
<Text style={styles.title}>LG-Flow</Text>
<Text style={styles.subtitle}>Clients, invoices, income, and
expenses.</Text>
<View style={styles.tabRow}>
{Object.values(TABS).map((tab) => (
<TouchableOpacity
key={tab}
style={[styles.tabButton, activeTab === tab && styles.tabButtonActive]}
onPress={() => setActiveTab(tab)}
>
<Text style={[styles.tabButtonText, activeTab === tab &&
styles.tabButtonTextActive]}>
{tab}
</Text>
</TouchableOpacity>
))}
</View>
<ScrollView contentContainerStyle={styles.scrollContent}
showsVerticalScrollIndicator={false}>
{activeTab === TABS.DASHBOARD && (
<DashboardScreen
totals={totals}
recentInvoices={recentInvoices}
recentTransactions={recentTransactions}
/>
)}
{activeTab === TABS.CLIENTS && (
<ClientsScreen
form={clientForm}
setForm={setClientForm}
clients={clients}
onAdd={handleAddClient}
onDelete={(id) => confirmDelete('client', () => handleDeleteClient(id))}
onEdit={handleEditClient}
onArchive={handleArchiveClient}
editingClientId={editingClientId}
onCancelEdit={handleCancelEditClient}
/>
)}
{activeTab === TABS.INVOICES && (
<InvoicesScreen
form={invoiceForm}
setForm={setInvoiceForm}
clients={clients.filter((client) => !client.archived)}
invoices={invoices}
onAdd={handleGenerateInvoice}
onDelete={(id) => confirmDelete('invoice', () =>
handleDeleteInvoice(id))}
onItemChange={handleInvoiceItemChange}
onLineChange={handleInvoiceLineChange}
onAddLine={handleAddInvoiceLine}
onRemoveLine={handleRemoveInvoiceLine}
onExportPdf={handleExportInvoicePdf}
exportingInvoiceId={exportingInvoiceId}
editingInvoiceId={editingInvoiceId}
onEdit={handleEditInvoice}
onCancelEdit={handleCancelEditInvoice}
/>
)}
{activeTab === TABS.TRANSACTIONS && (
<TransactionsScreen
form={transactionForm}
setForm={setTransactionForm}
clients={clients.filter((client) => !client.archived)}
transactions={transactions}
onAdd={handleAddTransaction}
onDelete={(id) => confirmDelete('transaction', () =>
handleDeleteTransaction(id))}
onEdit={handleEditTransaction}
editingTransactionId={editingTransactionId}
onCancelEdit={handleCancelEditTransaction}
/>
)}
{activeTab === TABS.SETTINGS && (
<SettingsScreen
clients={clients}
invoices={invoices}
transactions={transactions}
backupJsonText={backupJsonText}
setBackupJsonText={setBackupJsonText}
onExportBackup={handleExportBackup}
onImportBackup={handleImportBackup}
onImportPastedBackup={handleImportPastedBackup}
onClearAllData={handleClearAllData}
/>
)}
</ScrollView>
</View>
</SafeAreaView>
);
}
function DashboardScreen({ totals, recentInvoices, recentTransactions })
{
return (
<View>
<View style={styles.statsGrid}>
<StatCard
label="Active Clients"
value={String(totals.clients)}
cardStyle={styles.statCardClients}
valueStyle={styles.statValueClients}
labelStyle={styles.statLabelClients}
/>
<StatCard
label="Invoices"
value={String(totals.invoices)}
cardStyle={styles.statCardInvoices}
valueStyle={styles.statValueInvoices}
labelStyle={styles.statLabelInvoices}
/>
<StatCard
label="Income Received"
value={currency(totals.income)}
cardStyle={styles.statCardIncome}
valueStyle={styles.statValueIncome}
labelStyle={styles.statLabelIncome}
/>
<StatCard
label="Expenses"
value={currency(totals.expenses)}
cardStyle={styles.statCardExpenses}
valueStyle={styles.statValueExpenses}
labelStyle={styles.statLabelExpenses}
/>
<StatCard
label="Net Position"
value={currency(totals.net)}
cardStyle={[
styles.statCardNet,
totals.net < 0 ? styles.statCardNetNegative :
styles.statCardNetPositive,
]}
valueStyle={totals.net < 0 ? styles.statValueNetNegative :
styles.statValueNetPositive}
labelStyle={totals.net < 0 ? styles.statLabelNetNegative :
styles.statLabelNetPositive}
/>
</View>
<Card title="Recent Invoices">
{recentInvoices.length === 0 ? (
<Text style={styles.emptyText}>No invoices yet.</Text>
) : (
recentInvoices.map((invoice) => (
<View key={invoice.id} style={styles.listRow}>
<View style={{ flex: 1 }}>
<Text style={styles.listTitle}>
{invoice.invoiceNumber} • {invoice.clientName}
</Text>
<Text style={styles.listMeta}>
{invoice.lines?.length || 0} service line{invoice.lines?.length === 1 ?
'' : 's'} •{' '}
{formatDate(invoice.issueDate)}
</Text>
</View>
<Text style={styles.amountText}>{currency(invoice.total)}</Text>
</View>
))
)}
</Card>
<Card title="Recent Transactions">
{recentTransactions.length === 0 ? (
<Text style={styles.emptyText}>No transactions yet.</Text>
) : (
recentTransactions.map((txn) => (
<View key={txn.id} style={styles.listRow}>
<View style={{ flex: 1 }}>
<Text style={styles.listTitle}>{txn.description}</Text>
<Text style={styles.listMeta}>
{(txn.clientName || 'No Client')} • {txn.type.toUpperCase()} •
{(txn.status || 'paid').toUpperCase()} • {txn.category || 'General'} •
{formatDate(txn.date)}
</Text>
</View>
<Text style={styles.amountText}>{currency(txn.amount)}</Text>
</View>
))
)}
</Card>
</View>
);
}
function ClientsScreen({
form,
setForm,
clients,
onAdd,
onDelete,
onEdit,
onArchive,
editingClientId,
onCancelEdit,
}) {
const [expanded, setExpanded] = useState(false);
const activeClients = clients.filter((client) => !client.archived);
const archivedClients = clients.filter((client) => client.archived);
return (
<View>
<Card>
<TouchableOpacity
onPress={() => setExpanded((prev) => !prev)}
style={styles.collapsibleHeader}
activeOpacity={0.8}
>
<Text style={styles.cardTitle}>
{editingClientId ? 'Edit NDIS Client' : 'Add NDIS Client'}
</Text>
<Text style={styles.collapseIcon}>{expanded ? '−' : '+'}</Text>
</TouchableOpacity>
{expanded && (
<>
<LabeledInput
label="Client Name"
value={form.name}
onChangeText={(v) => setForm((p) => ({ ...p, name: v }))}
/>
<LabeledInput
label="NDIS Number"
value={form.ndisNumber}
onChangeText={(v) => setForm((p) => ({ ...p, ndisNumber: v }))}
/>
<LabeledInput
label="Email"
value={form.email}
onChangeText={(v) => setForm((p) => ({ ...p, email: v }))}
keyboardType="email-address"
/>
<LabeledInput
label="Phone"
value={form.phone}
onChangeText={(v) => setForm((p) => ({ ...p, phone: v }))}
keyboardType="phone-pad"
/>
<LabeledInput
label="Address"
value={form.address}
onChangeText={(v) => setForm((p) => ({ ...p, address: v }))}
multiline
/>
<PrimaryButton
title={editingClientId ? 'Update Client' : 'Save Client'}
onPress={() => {
const success = onAdd();
if (success) {
setExpanded(false);
}
}}
/>
{editingClientId ? (
<TouchableOpacity
style={styles.cancelButton}
onPress={() => {
onCancelEdit();
setExpanded(false);
}}
>
<Text style={styles.cancelButtonText}>Cancel Edit</Text>
</TouchableOpacity>
) : null}
</>
)}
</Card>
<Card title="Saved Clients">
{activeClients.length === 0 ? (
<Text style={styles.emptyText}>No active clients added yet.</Text>
) : (
activeClients.map((client) => (
<View key={client.id} style={styles.recordCard}>
<Text style={styles.recordTitle}>{client.name}</Text>
<Text style={styles.recordMeta}>NDIS: {client.ndisNumber || '-'}</Text>
<Text style={styles.recordMeta}>Email: {client.email || '-'}</Text>
<Text style={styles.recordMeta}>Phone: {client.phone || '-'}</Text>
<Text style={styles.recordMeta}>Address: {client.address || '-'}</Text>
<View style={styles.actionRow}>
<TouchableOpacity
style={styles.editButton}
onPress={() => {
onEdit(client);
setExpanded(true);
}}
>
<Text style={styles.editButtonText}>Edit</Text>
</TouchableOpacity>
<TouchableOpacity style={styles.archiveButton} onPress={() =>
onArchive(client.id)}>
<Text style={styles.archiveButtonText}>Archive</Text>
</TouchableOpacity>
<TouchableOpacity style={styles.deleteButton} onPress={() =>
onDelete(client.id)}>
<Text style={styles.deleteButtonText}>Delete</Text>
</TouchableOpacity>
</View>
</View>
))
)}
</Card>
<Card title="Archived Clients">
{archivedClients.length === 0 ? (
<Text style={styles.emptyText}>No archived clients.</Text>
) : (
archivedClients.map((client) => (
<View key={client.id} style={[styles.recordCard, styles.archivedCard]}>
<Text style={styles.recordTitle}>{client.name}</Text>
<Text style={styles.recordMeta}>NDIS: {client.ndisNumber || '-'}</Text>
<Text style={styles.recordMeta}>Email: {client.email || '-'}</Text>
<Text style={styles.recordMeta}>Phone: {client.phone || '-'}</Text>
<Text style={styles.recordMeta}>Address: {client.address || '-'}</Text>
<View style={styles.actionRow}>
<TouchableOpacity
style={styles.editButton}
onPress={() => {
onEdit(client);
setExpanded(true);
}}
>
<Text style={styles.editButtonText}>Edit</Text>
</TouchableOpacity>
<TouchableOpacity style={styles.archiveButton} onPress={() =>
onArchive(client.id)}>
<Text style={styles.archiveButtonText}>Unarchive</Text>
</TouchableOpacity>
<TouchableOpacity style={styles.deleteButton} onPress={() =>
onDelete(client.id)}>
<Text style={styles.deleteButtonText}>Delete</Text>
</TouchableOpacity>
</View>
</View>
))
)}
</Card>
</View>
);
}
function InvoicesScreen({
form,
setForm,
clients,
invoices,
onAdd,
onDelete,
onItemChange,
onLineChange,
onAddLine,
onRemoveLine,
onExportPdf,
exportingInvoiceId,
editingInvoiceId,
onEdit,
onCancelEdit,
}) {
const [formExpanded, setFormExpanded] = useState(false);
const [expandedInvoiceIds, setExpandedInvoiceIds] = useState({});
const previewTotal = form.lines.reduce((sum, line) => {
const qty = Number(line.quantity || 0);
const rate = Number(line.rate || 0);
return sum + qty * rate;
}, 0);
function toggleInvoiceExpanded(invoiceId) {
setExpandedInvoiceIds((prev) => ({
...prev,
[invoiceId]: !prev[invoiceId],
}));
}
return (
<View>
<Card>
<TouchableOpacity
onPress={() => setFormExpanded((prev) => !prev)}
style={styles.collapsibleHeader}
activeOpacity={0.8}
>
<Text style={styles.cardTitle}>Generate Invoice</Text>
<Text style={styles.collapseIcon}>{formExpanded ? '−' : '+'}</Text>
</TouchableOpacity>
{formExpanded && (
<>
<Text style={styles.label}>Client</Text>
<View style={styles.pickerWrap}>
<ScrollView horizontal showsHorizontalScrollIndicator={false}>
{clients.length === 0 ? (
<Text style={styles.emptyText}>Add an active client first.</Text>
) : (
clients.map((client) => {
const selected = form.clientId === client.id;
return (
<TouchableOpacity
key={client.id}
style={[styles.chip, selected && styles.chipActive]}
onPress={() => setForm((p) => ({ ...p, clientId: client.id }))}
>
<Text style={[styles.chipText, selected && styles.chipTextActive]}>
{client.name}
</Text>
</TouchableOpacity>
);
})
)}
</ScrollView>
</View>
<DatePickerField
label="Due Date"
value={form.dueDate}
onChange={(date) => setForm((p) => ({ ...p, dueDate: date }))}
/>
<Text style={styles.previewText}>Service Lines</Text>
{form.lines.map((line, index) => (
<View key={line.id} style={styles.invoiceLineCard}>
<View style={styles.invoiceLineHeader}>
<Text style={styles.invoiceLineTitle}>Service Line {index + 1}</Text>
<TouchableOpacity
style={styles.smallDeleteButton}
onPress={() => onRemoveLine(line.id)}
>
<Text style={styles.smallDeleteButtonText}>Remove</Text>
</TouchableOpacity>
</View>
<Text style={styles.label}>Support Item</Text>
<View style={styles.pickerWrap}>
<ScrollView horizontal showsHorizontalScrollIndicator={false}>
{INVOICE_ITEMS.map((item) => {
const selected = line.itemLabel === item.label;
return (
<TouchableOpacity
key={`${line.id}_${item.label}`}
style={[styles.chip, selected && styles.chipActive]}
onPress={() => onItemChange(line.id, item.label)}
>
<Text style={[styles.chipText, selected && styles.chipTextActive]}>
{item.label}
</Text>
</TouchableOpacity>
);
})}
</ScrollView>
</View>
<DatePickerField
label="Service Date"
value={line.serviceDate || ''}
onChange={(date) => onLineChange(line.id, 'serviceDate', date)}
/>
<LabeledInput
label="Unit Type"
value={line.unitType}
onChangeText={(v) => onLineChange(line.id, 'unitType', v)}
/>
<LabeledInput
label="Quantity"
value={line.quantity}
onChangeText={(v) => onLineChange(line.id, 'quantity', v)}
keyboardType="numeric"
/>
<LabeledInput
label="Rate"
value={line.rate}
onChangeText={(v) => onLineChange(line.id, 'rate', v)}
keyboardType="numeric"
/>
<Text style={styles.lineSubtotalText}>
{`${line.serviceDate ? formatDate(line.serviceDate) : 'No date'} • `}
{currency(Number(line.quantity || 0) * Number(line.rate || 0))}
</Text>
</View>
))}
<TouchableOpacity style={styles.secondaryButton} onPress={onAddLine}>
<Text style={styles.secondaryButtonText}>+ Add Another Service</Text>
</TouchableOpacity>
<LabeledInput
label="Notes"
value={form.notes}
onChangeText={(v) => setForm((p) => ({ ...p, notes: v }))}
multiline
/>
<Text style={styles.previewText}>Invoice total:
{currency(previewTotal)}</Text>
<PrimaryButton
title={editingInvoiceId ? 'Update Invoice' : 'Generate Invoice'}
onPress={() => {
onAdd();
setFormExpanded(false);
}}
/>
</>
)}
</Card>
<Card title="Invoice Register">
{invoices.length === 0 ? (
<Text style={styles.emptyText}>No invoices created yet.</Text>
) : (
invoices.map((invoice) => {
const expanded = !!expandedInvoiceIds[invoice.id];
const serviceCount = invoice.lines?.length || 0;
const firstLine = invoice.lines?.[0];
return (
<TouchableOpacity
key={invoice.id}
activeOpacity={0.85}
style={styles.recordCard}
onPress={() => toggleInvoiceExpanded(invoice.id)}
>
<View style={styles.savedInvoiceHeader}>
<View style={{ flex: 1, paddingRight: 10 }}>
<Text style={styles.recordTitle}>
{invoice.invoiceNumber} • {invoice.clientName}
</Text>
<Text style={styles.recordMeta}>
{formatDate(invoice.issueDate)} • {currency(invoice.total)}
</Text>
<Text style={styles.recordMeta}>
{serviceCount} service line{serviceCount === 1 ? '' : 's'}
{firstLine ? ` • ${firstLine.itemLabel}` : ''}
</Text>
</View>
<Text style={styles.collapseHint}>
{expanded ? 'Show less' : 'Show more'}
</Text>
</View>
{expanded && (
<>
<Text style={styles.recordMeta}>NDIS: {invoice.ndisNumber || '-'}</Text>
<Text style={styles.recordMeta}>Issue Date:
{formatDate(invoice.issueDate)}</Text>
<Text style={styles.recordMeta}>Due Date:
{formatDate(invoice.dueDate)}</Text>
<Text style={styles.recordMeta}>Status: {invoice.status ||
'Generated'}</Text>
{invoice.lines.map((line, lineIndex) => (
<Text
key={line.id || `${invoice.id}_${lineIndex}`}
style={styles.recordMeta}
>
{lineIndex + 1}. {line.itemLabel}
{line.serviceDate ? ` • ${formatDate(line.serviceDate)}` : ''}
{' • '}
{line.quantity} {line.unitType} @ {currency(line.rate)} =
{currency(line.lineTotal)}
</Text>
))}
{invoice.notes ? (
<Text style={styles.recordMeta}>Notes: {invoice.notes}</Text>
) : null}
<Text style={styles.recordAmount}>Total:
{currency(invoice.total)}</Text>
<View style={styles.invoiceActionRow}>
<TouchableOpacity
style={styles.editButton}
onPress={() => {
onEdit(invoice);
setFormExpanded(true);
}}
>
<Text style={styles.editButtonText}>Edit</Text>
</TouchableOpacity>
<TouchableOpacity
style={styles.exportButton}
onPress={() => onExportPdf(invoice)}
>
<Text style={styles.exportButtonText}>Export PDF</Text>
</TouchableOpacity>
<TouchableOpacity
style={styles.deleteButton}
onPress={() => onDelete(invoice.id)}
>
<Text style={styles.deleteButtonText}>Delete</Text>
</TouchableOpacity>
</View>
</>
)}
</TouchableOpacity>
);
})
)}
</Card>
</View>
);
}
function TransactionsScreen({
form,
setForm,
clients,
transactions,
onAdd,
onDelete,
onEdit,
editingTransactionId,
onCancelEdit,
}) {
const [expanded, setExpanded] = useState(false);
const [typeFilter, setTypeFilter] = useState('all');
const [statusFilter, setStatusFilter] = useState('all');
const [clientFilter, setClientFilter] = useState('all');
const [showRegisterTools, setShowRegisterTools] = useState(false);
const [sortBy, setSortBy] = useState('date_desc');
const filteredTransactions = useMemo(() => {
let data = [...transactions];
if (typeFilter !== 'all') {
data = data.filter((txn) => txn.type === typeFilter);
}
if (statusFilter !== 'all') {
data = data.filter((txn) => (txn.status || 'paid') === statusFilter);
}
if (clientFilter !== 'all') {
if (clientFilter === 'none') {
data = data.filter((txn) => !txn.clientName);
} else {
data = data.filter((txn) => txn.clientId === clientFilter);
}
}
data.sort((a, b) => {
if (sortBy === 'date_desc') {
return new Date(b.date || 0) - new Date(a.date || 0);
}
if (sortBy === 'date_asc') {
return new Date(a.date || 0) - new Date(b.date || 0);
}
if (sortBy === 'status') {
const order = { pending: 0, paid: 1 };
return (order[a.status || 'paid'] ?? 99) - (order[b.status || 'paid'] ??
99);
}
return 0;
});
return data;
}, [transactions, typeFilter, statusFilter, clientFilter, sortBy]);
const transactionSummary = useMemo(() => {
const income = filteredTransactions
.filter((txn) => txn.type === 'income')
.reduce((sum, txn) => sum + Number(txn.amount || 0), 0);
const expenses = filteredTransactions
.filter((txn) => txn.type === 'expense')
.reduce((sum, txn) => sum + Number(txn.amount || 0), 0);
const pendingCount = filteredTransactions.filter(
(txn) => (txn.status || 'paid') === 'pending'
).length;
const completedCount = filteredTransactions.filter(
(txn) => (txn.status || 'paid') === 'paid'
).length;
return {
income,
expenses,
net: income - expenses,
pendingCount,
completedCount,
};
}, [filteredTransactions]);
return (
<View>
<Card>
<TouchableOpacity
onPress={() => setExpanded((prev) => !prev)}
style={styles.collapsibleHeader}
activeOpacity={0.8}
>
<Text style={styles.cardTitle}>
{editingTransactionId ? 'Edit Business Transaction' : 'Record Business
Transaction'}
</Text>
<Text style={styles.collapseIcon}>{expanded ? '−' : '+'}</Text>
</TouchableOpacity>
{expanded && (
<>
<Text style={styles.label}>Client</Text>
<View style={styles.pickerWrap}>
<ScrollView horizontal showsHorizontalScrollIndicator={false}>
<TouchableOpacity
style={[styles.chip, !form.clientId && styles.chipActive]}
onPress={() => setForm((p) => ({ ...p, clientId: '' }))}
>
<Text style={[styles.chipText, !form.clientId &&
styles.chipTextActive]}>
No Client
</Text>
</TouchableOpacity>
{clients.map((client) => {
const selected = form.clientId === client.id;
return (
<TouchableOpacity
key={client.id}
style={[styles.chip, selected && styles.chipActive]}
onPress={() => setForm((p) => ({ ...p, clientId: client.id }))}
>
<Text style={[styles.chipText, selected && styles.chipTextActive]}>
{client.name}
</Text>
</TouchableOpacity>
);
})}
</ScrollView>
</View>
<Text style={styles.label}>Type</Text>
<View style={styles.segmentRow}>
{['expense', 'income'].map((type) => {
const selected = form.type === type;
return (
<TouchableOpacity
key={type}
style={[styles.segmentButton, selected && styles.segmentButtonActive]}
onPress={() => setForm((p) => ({ ...p, type }))}
>
<Text
style={[
styles.segmentButtonText,
selected && styles.segmentButtonTextActive,
]}
>
{type.charAt(0).toUpperCase() + type.slice(1)}
</Text>
</TouchableOpacity>
);
})}
</View>
<Text style={styles.label}>Status</Text>
<View style={styles.segmentRow}>
{['pending', 'paid'].map((status) => {
const selected = form.status === status;
return (
<TouchableOpacity
key={status}
style={[styles.segmentButton, selected && styles.segmentButtonActive]}
onPress={() => setForm((p) => ({ ...p, status }))}
>
<Text
style={[
styles.segmentButtonText,
selected && styles.segmentButtonTextActive,
]}
>
{status.charAt(0).toUpperCase() + status.slice(1)}
</Text>
</TouchableOpacity>
);
})}
</View>
<LabeledInput
label="Category"
value={form.category}
onChangeText={(v) => setForm((p) => ({ ...p, category: v }))}
/>
<LabeledInput
label="Description"
value={form.description}
onChangeText={(v) => setForm((p) => ({ ...p, description: v }))}
/>
<LabeledInput
label="Amount"
value={form.amount}
onChangeText={(v) => setForm((p) => ({ ...p, amount: v }))}
keyboardType="numeric"
/>
<DatePickerField
label="Date"
value={form.date}
onChange={(date) => setForm((p) => ({ ...p, date }))}
/>
<PrimaryButton
title={editingTransactionId ? 'Update Transaction' : 'Save Transaction'}
onPress={() => {
const success = onAdd();
if (success) {
setExpanded(false);
}
}}
/>
{editingTransactionId ? (
<TouchableOpacity
style={styles.cancelButton}
onPress={() => {
onCancelEdit();
setExpanded(false);
}}
>
<Text style={styles.cancelButtonText}>Cancel Edit</Text>
</TouchableOpacity>
) : null}
</>
)}
</Card>
<Card title="Filtered Summary">
<View style={styles.transactionSummaryGrid}>
<View style={[styles.transactionSummaryItem,
styles.transactionSummaryIncome]}>
<Text style={[styles.transactionSummaryValue,
styles.transactionSummaryIncomeText]}>
{currency(transactionSummary.income)}
</Text>
<Text style={[styles.transactionSummaryLabel,
styles.transactionSummaryIncomeText]}>
Income
</Text>
</View>
<View style={[styles.transactionSummaryItem,
styles.transactionSummaryExpense]}>
<Text style={[styles.transactionSummaryValue,
styles.transactionSummaryExpenseText]}>
{currency(transactionSummary.expenses)}
</Text>
<Text style={[styles.transactionSummaryLabel,
styles.transactionSummaryExpenseText]}>
Expense
</Text>
</View>
<View
style={[
styles.transactionSummaryItem,
transactionSummary.net < 0
? styles.transactionSummaryNetNegative
: styles.transactionSummaryNetPositive,
]}
>
<Text
style={[
styles.transactionSummaryValue,
transactionSummary.net < 0
? styles.transactionSummaryNetNegativeText
: styles.transactionSummaryNetPositiveText,
]}
>
{currency(transactionSummary.net)}
</Text>
<Text
style={[
styles.transactionSummaryLabel,
transactionSummary.net < 0
? styles.transactionSummaryNetNegativeText
: styles.transactionSummaryNetPositiveText,
]}
>
Net
</Text>
</View>
<View style={[styles.transactionSummaryItem,
styles.transactionSummaryCompleted]}>
<Text style={[styles.transactionSummaryValue,
styles.transactionSummaryCompletedText]}>
{transactionSummary.completedCount}
</Text>
<Text style={[styles.transactionSummaryLabel,
styles.transactionSummaryCompletedText]}>
Completed
</Text>
</View>
<View style={[styles.transactionSummaryItem,
styles.transactionSummaryPending]}>
<Text style={[styles.transactionSummaryValue,
styles.transactionSummaryPendingText]}>
{transactionSummary.pendingCount}
</Text>
<Text style={[styles.transactionSummaryLabel,
styles.transactionSummaryPendingText]}>
Pending
</Text>
</View>
</View>
</Card>
<Card title="Transaction Register">
<View style={styles.toolsHeaderRow}>
<TouchableOpacity
style={styles.toolsToggleButton}
onPress={() => setShowRegisterTools((prev) => !prev)}
>
<Text style={styles.toolsToggleButtonText}>
{showRegisterTools ? 'Hide Filters' : 'Show Filters'}
</Text>
</TouchableOpacity>
<TouchableOpacity
style={styles.toolsClearButton}
onPress={() => {
setTypeFilter('all');
setStatusFilter('all');
setClientFilter('all');
setSortBy('date_desc');
}}
>
<Text style={styles.toolsClearButtonText}>Reset</Text>
</TouchableOpacity>
</View>
{!showRegisterTools ? (
<Text style={styles.activeFilterText}>
{`Type: ${typeFilter} • Status: ${statusFilter} • Client: ${
clientFilter === 'all'
? 'all'
: clientFilter === 'none'
? 'no client'
: 'selected'
} • Sort: ${sortBy}`}
</Text>
) : (
<View style={styles.compactToolsWrap}>
<View style={styles.compactToolRow}>
<Text style={styles.compactToolLabel}>Type</Text>
<ScrollView horizontal showsHorizontalScrollIndicator={false}>
{[
{ label: 'All', value: 'all' },
{ label: 'Income', value: 'income' },
{ label: 'Expense', value: 'expense' },
].map((item) => (
<TouchableOpacity
key={item.value}
style={[styles.miniChip, typeFilter === item.value &&
styles.miniChipActive]}
onPress={() => setTypeFilter(item.value)}
>
<Text
style={[
styles.miniChipText,
typeFilter === item.value && styles.miniChipTextActive,
]}
>
{item.label}
</Text>
</TouchableOpacity>
))}
</ScrollView>
</View>
<View style={styles.compactToolRow}>
<Text style={styles.compactToolLabel}>Status</Text>
<ScrollView horizontal showsHorizontalScrollIndicator={false}>
{[
{ label: 'All', value: 'all' },
{ label: 'Pending', value: 'pending' },
{ label: 'paid', value: 'paid' },
].map((item) => (
<TouchableOpacity
key={item.value}
style={[styles.miniChip, statusFilter === item.value &&
styles.miniChipActive]}
onPress={() => setStatusFilter(item.value)}
>
<Text
style={[
styles.miniChipText,
statusFilter === item.value && styles.miniChipTextActive,
]}
>
{item.label}
</Text>
</TouchableOpacity>
))}
</ScrollView>
</View>
<View style={styles.compactToolRow}>
<Text style={styles.compactToolLabel}>Client</Text>
<ScrollView horizontal showsHorizontalScrollIndicator={false}>
<TouchableOpacity
style={[styles.miniChip, clientFilter === 'all' &&
styles.miniChipActive]}
onPress={() => setClientFilter('all')}
>
<Text
style={[
styles.miniChipText,
clientFilter === 'all' && styles.miniChipTextActive,
]}
>
All
</Text>
</TouchableOpacity>
<TouchableOpacity
style={[styles.miniChip, clientFilter === 'none' &&
styles.miniChipActive]}
onPress={() => setClientFilter('none')}
>
<Text
style={[
styles.miniChipText,
clientFilter === 'none' && styles.miniChipTextActive,
]}
>
No Client
</Text>
</TouchableOpacity>
{clients.map((client) => (
<TouchableOpacity
key={client.id}
style={[styles.miniChip, clientFilter === client.id &&
styles.miniChipActive]}
onPress={() => setClientFilter(client.id)}
>
<Text
style={[
styles.miniChipText,
clientFilter === client.id && styles.miniChipTextActive,
]}
>
{client.name}
</Text>
</TouchableOpacity>
))}
</ScrollView>
</View>
<View style={styles.compactToolRow}>
<Text style={styles.compactToolLabel}>Sort</Text>
<ScrollView horizontal showsHorizontalScrollIndicator={false}>
{[
{ label: 'Newest', value: 'date_desc' },
{ label: 'Oldest', value: 'date_asc' },
{ label: 'Status', value: 'status' },
].map((item) => (
<TouchableOpacity
key={item.value}
style={[styles.miniChip, sortBy === item.value &&
styles.miniChipActive]}
onPress={() => setSortBy(item.value)}
>
<Text
style={[
styles.miniChipText,
sortBy === item.value && styles.miniChipTextActive,
]}
>
{item.label}
</Text>
</TouchableOpacity>
))}
</ScrollView>
</View>
</View>
)}
{filteredTransactions.length === 0 ? (
<Text style={styles.emptyText}>No matching transactions found.</Text>
) : (
filteredTransactions.map((txn) => {
const isExpense = txn.type === 'expense';
const isPending = (txn.status || 'paid') === 'pending';
return (
<View key={txn.id} style={styles.compactRecordCard}>
<View style={styles.compactTopRow}>
<View style={{ flex: 1, paddingRight: 10 }}>
<Text numberOfLines={1} style={styles.compactTitle}>
{txn.description}
</Text>
<Text numberOfLines={1} style={styles.compactSubtext}>
{txn.clientName || 'No Client'}
</Text>
</View>
<Text
style={[
styles.compactAmount,
isExpense ? styles.compactAmountExpense : styles.compactAmountIncome,
]}
>
{isExpense ? '-' : '+'}
{currency(txn.amount)}
</Text>
</View>
<View style={styles.compactBottomRow}>
<View style={styles.compactMetaWrap}>
<Text style={styles.compactMeta}>
{formatDate(txn.date)} • {txn.category || 'General'}
</Text>
<View style={styles.badgeRow}>
<View
style={[
styles.compactBadge,
isExpense ? styles.expenseBadge : styles.incomeBadge,
]}
>
<Text
style={[
styles.compactBadgeText,
isExpense ? styles.expenseBadgeText : styles.incomeBadgeText,
]}
>
{txn.type}
</Text>
</View>
<View
style={[
styles.compactBadge,
isPending ? styles.pendingBadge : styles.completedBadge,
]}
>
<Text
style={[
styles.compactBadgeText,
isPending ? styles.pendingBadgeText : styles.completedBadgeText,
]}
>
{txn.status || 'paid'}
</Text>
</View>
</View>
</View>
<View style={styles.compactActionRow}>
<TouchableOpacity
style={styles.compactEditButton}
onPress={() => {
onEdit(txn);
setExpanded(true);
}}
>
<Text style={styles.compactEditButtonText}>Edit</Text>
</TouchableOpacity>
<TouchableOpacity
style={styles.compactDeleteButton}
onPress={() => onDelete(txn.id)}
>
<Text style={styles.compactDeleteButtonText}>Delete</Text>
</TouchableOpacity>
</View>
</View>
</View>
);
})
)}
</Card>
</View>
);
}
function SettingsScreen({
clients,
invoices,
transactions,
backupJsonText,
setBackupJsonText,
onExportBackup,
onImportBackup,
onImportPastedBackup,
onClearAllData,
}) {
return (
<View>
<Card title="Backup & Restore">
<Text style={styles.recordMeta}>
Export a backup, import from a JSON file, or paste JSON directly below.
</Text>
<TouchableOpacity style={styles.secondaryButton}
onPress={onExportBackup}>
<Text style={styles.secondaryButtonText}>Export Backup</Text>
</TouchableOpacity>
<TouchableOpacity style={styles.secondaryButton}
onPress={onImportBackup}>
<Text style={styles.secondaryButtonText}>Import Backup File</Text>
</TouchableOpacity>
<Text style={styles.label}>Paste Backup JSON</Text>
<TextInput
value={backupJsonText}
onChangeText={setBackupJsonText}
multiline
placeholder="Paste exported backup JSON here"
placeholderTextColor="#7d8b99"
style={[styles.input, styles.inputMultiline, { minHeight: 180 }]}
/>
<TouchableOpacity style={styles.secondaryButton}
onPress={onImportPastedBackup}>
<Text style={styles.secondaryButtonText}>Import Pasted JSON</Text>
</TouchableOpacity>
</Card>
<Card title="Data Summary">
<Text style={styles.recordMeta}>Clients: {clients.length}</Text>
<Text style={styles.recordMeta}>Invoices: {invoices.length}</Text>
<Text style={styles.recordMeta}>Transactions:
{transactions.length}</Text>
</Card>
<Card title="Danger Zone">
<Text style={styles.recordMeta}>
Clear all stored data from this device. This cannot be undone unless you
have a backup.
</Text>
<TouchableOpacity style={styles.deleteButton} onPress={onClearAllData}>
<Text style={styles.deleteButtonText}>Clear All Data</Text>
</TouchableOpacity>
</Card>
</View>
);
}
function Card({ title, children }) {
return (
<View style={styles.card}>
{title ? <Text style={styles.cardTitle}>{title}</Text> : null}
{children}
</View>
);
}
function StatCard({ label, value, cardStyle, valueStyle, labelStyle }) {
return (
<View style={[styles.statCard, cardStyle]}>
<Text style={[styles.statValue, valueStyle]}>{value}</Text>
<Text style={[styles.statLabel, labelStyle]}>{label}</Text>
</View>
);
}
function DatePickerField({ label, value, onChange }) {
const startDate = value ? new Date(value) : new Date();
const [visible, setVisible] = useState(false);
const [viewYear, setViewYear] = useState(startDate.getFullYear());
const [viewMonth, setViewMonth] = useState(startDate.getMonth());
const monthName = new Date(viewYear,
viewMonth).toLocaleString('default', {
month: 'long',
});
const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
const firstDay = new Date(viewYear, viewMonth, 1).getDay();
function toISO(day) {
return `${viewYear}-${String(viewMonth + 1).padStart(2,
'0')}-${String(day).padStart(2, '0')}`;
}
function changeMonth(amount) {
const next = new Date(viewYear, viewMonth + amount, 1);
setViewYear(next.getFullYear());
setViewMonth(next.getMonth());
}
function selectDate(day) {
onChange(toISO(day));
setVisible(false);
}
return (
<View style={styles.inputWrap}>
<Text style={styles.label}>{label}</Text>
<TouchableOpacity style={styles.input} onPress={() => setVisible(true)}>
<Text style={{ color: '#0f172a', fontSize: 15 }}>
{value ? formatDate(value) : 'Select Date'}
</Text>
</TouchableOpacity>
<Modal visible={visible} transparent animationType="slide">
<View style={{
flex: 1,
backgroundColor: 'rgba(0,0,0,0.4)',
justifyContent: 'center',
padding: 20,
}}>
<View style={{
backgroundColor: '#fff',
borderRadius: 16,
padding: 20,
}}>
<View style={{
flexDirection: 'row',
justifyContent: 'space-between',
alignItems: 'center',
marginBottom: 15,
}}>
<TouchableOpacity onPress={() => changeMonth(-1)}>
<Text style={{ fontSize: 24, fontWeight: '800' }}>‹</Text>
</TouchableOpacity>
<Text style={{ fontSize: 18, fontWeight: '800' }}>
{monthName} {viewYear}
</Text>
<TouchableOpacity onPress={() => changeMonth(1)}>
<Text style={{ fontSize: 24, fontWeight: '800' }}>›</Text>
</TouchableOpacity>
</View>
<View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
<Text key={d} style={{
width: '14.28%',
textAlign: 'center',
fontWeight: '800',
marginBottom: 8,
color: '#64748b',
}}>
{d}
</Text>
))}
{Array.from({ length: firstDay }).map((_, i) => (
<View key={`blank-${i}`} style={{ width: '14.28%', padding: 6 }} />
))}
{Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
const selected = value === toISO(day);
return (
<TouchableOpacity
key={day}
onPress={() => selectDate(day)}
style={{
width: '14.28%',
padding: 6,
}}
>
<View style={{
backgroundColor: selected ? '#1d4ed8' : '#eef2f7',
borderRadius: 10,
paddingVertical: 10,
alignItems: 'center',
}}>
<Text style={{
color: selected ? '#fff' : '#0f172a',
fontWeight: '700',
}}>
{day}
</Text>
</View>
</TouchableOpacity>
);
})}
</View>
<TouchableOpacity
onPress={() => setVisible(false)}
style={{
marginTop: 15,
padding: 12,
backgroundColor: '#fee2e2',
borderRadius: 10,
alignItems: 'center',
}}
>
<Text style={{ color: '#b91c1c', fontWeight: '800' }}>
Cancel
</Text>
</TouchableOpacity>
</View>
</View>
</Modal>
</View>
);
}
function LabeledInput({ label, multiline, ...props }) {
return (
<View style={styles.inputWrap}>
<Text style={styles.label}>{label}</Text>
<TextInput
{...props}
multiline={multiline}
style={[styles.input, multiline && styles.inputMultiline]}
placeholderTextColor="#7d8b99"
/>
</View>
);
}
function PrimaryButton({ title, onPress }) {
return (
<TouchableOpacity style={styles.primaryButton} onPress={onPress}>
<Text style={styles.primaryButtonText}>{title}</Text>
</TouchableOpacity>
);
}
const styles = StyleSheet.create({
safeArea: {
flex: 1,
backgroundColor: '#f4f7fb',
paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight || 16 :
0,
},
container: {
flex: 1,
paddingHorizontal: 16,
paddingTop: 18,
},
scrollContent: {
paddingBottom: 40,
},
title: {
fontSize: 28,
fontWeight: '800',
color: '#16202a',
},
subtitle: {
marginTop: 4,
marginBottom: 16,
fontSize: 14,
color: '#5e6b78',
},
tabRow: {
flexDirection: 'row',
flexWrap: 'wrap',
marginBottom: 12,
},
tabButton: {
paddingVertical: 10,
paddingHorizontal: 14,
backgroundColor: '#e9eef5',
borderRadius: 12,
marginRight: 8,
marginBottom: 8,
},
tabButtonActive: {
backgroundColor: '#1d4ed8',
},
tabButtonText: {
color: '#334155',
fontWeight: '700',
},
tabButtonTextActive: {
color: '#ffffff',
},
card: {
backgroundColor: '#ffffff',
borderRadius: 18,
padding: 16,
marginBottom: 14,
shadowColor: '#000',
shadowOpacity: 0.06,
shadowOffset: { width: 0, height: 4 },
shadowRadius: 10,
elevation: 2,
},
cardTitle: {
fontSize: 18,
fontWeight: '800',
color: '#16202a',
marginBottom: 14,
},
collapsibleHeader: {
flexDirection: 'row',
justifyContent: 'space-between',
alignItems: 'center',
},
collapseIcon: {
fontSize: 22,
fontWeight: '800',
color: '#16202a',
},
statsGrid: {
flexDirection: 'row',
flexWrap: 'wrap',
justifyContent: 'space-between',
marginBottom: 2,
},
statCard: {
width: '48.5%',
backgroundColor: '#ffffff',
borderRadius: 18,
padding: 16,
marginBottom: 12,
shadowColor: '#000',
shadowOpacity: 0.06,
shadowOffset: { width: 0, height: 4 },
shadowRadius: 10,
elevation: 2,
},
statValue: {
fontSize: 22,
fontWeight: '800',
color: '#0f172a',
},
statLabel: {
marginTop: 6,
fontSize: 13,
color: '#64748b',
fontWeight: '600',
},
inputWrap: {
marginBottom: 12,
},
label: {
fontSize: 13,
fontWeight: '700',
color: '#334155',
marginBottom: 6,
},
input: {
backgroundColor: '#f8fafc',
borderWidth: 1,
borderColor: '#d8e0ea',
borderRadius: 12,
paddingHorizontal: 12,
paddingVertical: 12,
fontSize: 15,
color: '#0f172a',
},
inputMultiline: {
minHeight: 88,
textAlignVertical: 'top',
},
primaryButton: {
marginTop: 6,
backgroundColor: '#1d4ed8',
borderRadius: 12,
paddingVertical: 14,
alignItems: 'center',
},
primaryButtonText: {
color: '#ffffff',
fontWeight: '800',
fontSize: 15,
},
cancelButton: {
marginTop: 10,
alignSelf: 'flex-start',
backgroundColor: '#e5e7eb',
paddingHorizontal: 12,
paddingVertical: 8,
borderRadius: 10,
},
cancelButtonText: {
color: '#334155',
fontWeight: '800',
},
emptyText: {
color: '#64748b',
fontSize: 14,
},
pickerWrap: {
marginBottom: 12,
},
chip: {
paddingVertical: 10,
paddingHorizontal: 12,
backgroundColor: '#eef2f7',
borderRadius: 999,
marginRight: 8,
},
chipActive: {
backgroundColor: '#dbeafe',
borderWidth: 1,
borderColor: '#60a5fa',
},
chipText: {
color: '#334155',
fontWeight: '700',
},
chipTextActive: {
color: '#1d4ed8',
},
previewText: {
marginBottom: 10,
fontSize: 15,
fontWeight: '800',
color: '#0f172a',
},
listRow: {
flexDirection: 'row',
alignItems: 'center',
paddingVertical: 10,
borderBottomWidth: 1,
borderBottomColor: '#edf2f7',
},
listTitle: {
fontSize: 14,
fontWeight: '700',
color: '#0f172a',
},
listMeta: {
fontSize: 12,
color: '#64748b',
marginTop: 2,
},
amountText: {
fontSize: 14,
fontWeight: '800',
color: '#0f172a',
marginLeft: 10,
},
recordCard: {
padding: 14,
borderWidth: 1,
borderColor: '#e5ebf2',
borderRadius: 14,
marginBottom: 10,
backgroundColor: '#fbfdff',
},
archivedCard: {
opacity: 0.75,
},
recordTitle: {
fontSize: 16,
fontWeight: '800',
color: '#0f172a',
marginBottom: 6,
},
recordMeta: {
fontSize: 13,
color: '#475569',
marginBottom: 3,
},
recordAmount: {
marginTop: 8,
fontSize: 15,
fontWeight: '800',
color: '#0f172a',
},
actionRow: {
flexDirection: 'row',
flexWrap: 'wrap',
gap: 10,
marginTop: 10,
alignItems: 'center',
},
editButton: {
marginTop: 10,
alignSelf: 'flex-start',
backgroundColor: '#dbeafe',
paddingHorizontal: 12,
paddingVertical: 8,
borderRadius: 10,
},
editButtonText: {
color: '#1d4ed8',
fontWeight: '800',
},
archiveButton: {
marginTop: 10,
alignSelf: 'flex-start',
backgroundColor: '#e0ecff',
paddingHorizontal: 12,
paddingVertical: 8,
borderRadius: 10,
},
archiveButtonText: {
color: '#1d4ed8',
fontWeight: '800',
},
deleteButton: {
marginTop: 10,
alignSelf: 'flex-start',
backgroundColor: '#fee2e2',
paddingHorizontal: 12,
paddingVertical: 8,
borderRadius: 10,
},
deleteButtonText: {
color: '#b91c1c',
fontWeight: '800',
},
segmentRow: {
flexDirection: 'row',
marginBottom: 12,
},
segmentButton: {
flex: 1,
paddingVertical: 12,
alignItems: 'center',
backgroundColor: '#eef2f7',
borderRadius: 12,
marginRight: 8,
},
segmentButtonActive: {
backgroundColor: '#dbeafe',
borderWidth: 1,
borderColor: '#60a5fa',
},
segmentButtonText: {
color: '#334155',
fontWeight: '800',
},
segmentButtonTextActive: {
color: '#1d4ed8',
},
invoiceLineCard: {
borderWidth: 1,
borderColor: '#dbe4ee',
backgroundColor: '#f8fbff',
borderRadius: 14,
padding: 12,
marginBottom: 12,
},
invoiceLineHeader: {
flexDirection: 'row',
justifyContent: 'space-between',
alignItems: 'center',
marginBottom: 8,
},
invoiceLineTitle: {
fontSize: 15,
fontWeight: '800',
color: '#0f172a',
},
lineSubtotalText: {
marginTop: 4,
fontSize: 14,
fontWeight: '800',
color: '#0f172a',
},
secondaryButton: {
marginBottom: 12,
backgroundColor: '#e0ecff',
borderRadius: 12,
paddingVertical: 12,
alignItems: 'center',
},
secondaryButtonText: {
color: '#1d4ed8',
fontWeight: '800',
fontSize: 14,
},
smallDeleteButton: {
backgroundColor: '#fee2e2',
paddingHorizontal: 10,
paddingVertical: 6,
borderRadius: 8,
},
smallDeleteButtonText: {
color: '#b91c1c',
fontWeight: '800',
fontSize: 12,
},
invoiceActionRow: {
flexDirection: 'row',
flexWrap: 'wrap',
gap: 10,
marginTop: 10,
alignItems: 'center',
},
exportButton: {
marginTop: 10,
alignSelf: 'flex-start',
backgroundColor: '#dbeafe',
paddingHorizontal: 12,
paddingVertical: 8,
borderRadius: 10,
},
exportButtonText: {
color: '#1d4ed8',
fontWeight: '800',
},
compactRecordCard: {
paddingVertical: 10,
paddingHorizontal: 12,
borderWidth: 1,
borderColor: '#e5ebf2',
borderRadius: 12,
marginBottom: 8,
backgroundColor: '#fbfdff',
},
compactTopRow: {
flexDirection: 'row',
alignItems: 'center',
justifyContent: 'space-between',
},
compactBottomRow: {
marginTop: 6,
flexDirection: 'row',
alignItems: 'center',
justifyContent: 'space-between',
},
compactTitle: {
fontSize: 14,
fontWeight: '800',
color: '#0f172a',
},
compactSubtext: {
fontSize: 12,
color: '#64748b',
marginTop: 2,
},
compactMeta: {
flex: 1,
fontSize: 11,
color: '#64748b',
marginRight: 10,
},
compactAmount: {
fontSize: 14,
fontWeight: '800',
color: '#0f172a',
},
compactActionRow: {
flexDirection: 'row',
alignItems: 'center',
},
compactEditButton: {
backgroundColor: '#dbeafe',
paddingHorizontal: 10,
paddingVertical: 6,
borderRadius: 8,
marginLeft: 6,
},
compactEditButtonText: {
color: '#1d4ed8',
fontWeight: '800',
fontSize: 12,
},
compactDeleteButton: {
backgroundColor: '#fee2e2',
paddingHorizontal: 10,
paddingVertical: 6,
borderRadius: 8,
marginLeft: 6,
},
compactDeleteButtonText: {
color: '#b91c1c',
fontWeight: '800',
fontSize: 12,
},
compactMetaWrap: {
flex: 1,
marginRight: 10,
},
badgeRow: {
flexDirection: 'row',
flexWrap: 'wrap',
marginTop: 4,
},
compactBadge: {
paddingHorizontal: 8,
paddingVertical: 3,
borderRadius: 999,
marginRight: 6,
marginTop: 4,
},
compactBadgeText: {
fontSize: 10,
fontWeight: '800',
textTransform: 'capitalize',
},
incomeBadge: {
backgroundColor: '#dcfce7',
},
incomeBadgeText: {
color: '#166534',
},
expenseBadge: {
backgroundColor: '#fee2e2',
},
expenseBadgeText: {
color: '#991b1b',
},
pendingBadge: {
backgroundColor: '#fef3c7',
},
pendingBadgeText: {
color: '#92400e',
},
completedBadge: {
backgroundColor: '#dbeafe',
},
completedBadgeText: {
color: '#1d4ed8',
},
compactAmountIncome: {
color: '#166534',
},
compactAmountExpense: {
color: '#b91c1c',
},
statCardClients: {
backgroundColor: '#ede9fe',
},
statValueClients: {
color: '#5b21b6',
},
statLabelClients: {
color: '#6d28d9',
},
statCardInvoices: {
backgroundColor: '#e0f2fe',
},
statValueInvoices: {
color: '#0369a1',
},
statLabelInvoices: {
color: '#0284c7',
},
statCardIncome: {
backgroundColor: '#dcfce7',
},
statValueIncome: {
color: '#166534',
},
statLabelIncome: {
color: '#15803d',
},
statCardExpenses: {
backgroundColor: '#fee2e2',
},
statValueExpenses: {
color: '#b91c1c',
},
statLabelExpenses: {
color: '#dc2626',
},
statCardNet: {
},
statCardNetPositive: {
backgroundColor: '#dbeafe',
},
statCardNetNegative: {
backgroundColor: '#fef3c7',
},
statValueNetPositive: {
color: '#1d4ed8',
},
statLabelNetPositive: {
color: '#2563eb',
},
statValueNetNegative: {
color: '#b45309',
},
statLabelNetNegative: {
color: '#d97706',
},
toolsHeaderRow: {
flexDirection: 'row',
justifyContent: 'space-between',
alignItems: 'center',
marginBottom: 8,
},
toolsToggleButton: {
backgroundColor: '#eef2f7',
paddingHorizontal: 12,
paddingVertical: 8,
borderRadius: 10,
},
toolsToggleButtonText: {
color: '#334155',
fontWeight: '800',
fontSize: 12,
},
toolsClearButton: {
backgroundColor: '#fee2e2',
paddingHorizontal: 12,
paddingVertical: 8,
borderRadius: 10,
},
toolsClearButtonText: {
color: '#b91c1c',
fontWeight: '800',
fontSize: 12,
},
activeFilterText: {
fontSize: 11,
color: '#64748b',
marginBottom: 10,
},
compactToolsWrap: {
marginBottom: 10,
},
compactToolRow: {
marginBottom: 8,
},
compactToolLabel: {
fontSize: 11,
fontWeight: '700',
color: '#64748b',
marginBottom: 4,
},
miniChip: {
paddingHorizontal: 10,
paddingVertical: 6,
backgroundColor: '#eef2f7',
borderRadius: 999,
marginRight: 6,
},
miniChipActive: {
backgroundColor: '#dbeafe',
borderWidth: 1,
borderColor: '#60a5fa',
},
miniChipText: {
fontSize: 11,
color: '#334155',
fontWeight: '700',
},
miniChipTextActive: {
color: '#1d4ed8',
},
transactionSummaryGrid: {
flexDirection: 'row',
flexWrap: 'wrap',
justifyContent: 'space-between',
},
transactionSummaryItem: {
width: '48.5%',
borderRadius: 14,
paddingVertical: 12,
paddingHorizontal: 12,
marginBottom: 10,
},
transactionSummaryValue: {
fontSize: 16,
fontWeight: '800',
},
transactionSummaryLabel: {
marginTop: 4,
fontSize: 12,
fontWeight: '700',
},
transactionSummaryIncome: {
backgroundColor: '#dcfce7',
},
transactionSummaryIncomeText: {
color: '#166534',
},
transactionSummaryExpense: {
backgroundColor: '#fee2e2',
},
transactionSummaryExpenseText: {
color: '#991b1b',
},
transactionSummaryNetPositive: {
backgroundColor: '#dbeafe',
},
transactionSummaryNetPositiveText: {
color: '#1d4ed8',
},
transactionSummaryNetNegative: {
backgroundColor: '#fef3c7',
},
transactionSummaryNetNegativeText: {
color: '#b45309',
},
transactionSummaryCompleted: {
backgroundColor: '#e0f2fe',
},
transactionSummaryCompletedText: {
color: '#0369a1',
},
transactionSummaryPending: {
backgroundColor: '#fef3c7',
},
transactionSummaryPendingText: {
color: '#92400e',
},
savedInvoiceHeader: {
flexDirection: 'row',
alignItems: 'flex-start',
justifyContent: 'space-between',
},
collapseHint: {
fontSize: 12,
fontWeight: '800',
color: '#1d4ed8',
marginTop: 2,
},
});
