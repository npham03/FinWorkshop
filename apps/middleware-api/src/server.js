import 'dotenv/config';
import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import * as XLSX from 'xlsx';
import axios from 'axios';
import { createHash, randomBytes, createHmac, randomInt, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, getPool, listRecords, getRecord, getRecordForUpdate, saveRecord, createAudit, decodeData, enqueueOdooSync, odooSyncEntities, DEFAULT_WORKSHOP_ID, DEFAULT_WORKSHOP_NAME, getWorkshop } from './db.js';
import { seedDemoData,seedWorkshopCatalog } from './seed.js';
import { businessError, active, invoiceDirection, businessDate } from './accounting.js';
import { normalizeInvoice, updateInvoicePartner, allocatePayment, unallocatePayment, voidInvoice, reviseQuotation, transaction } from './workflows.js';
import { buildBooks } from './ledgers.js';
import { dashboardSnapshot } from './dashboard.js';
import { recordRevision, assertOpenPeriod } from './db.js';
import { validateMaster, normalizeBom, normalizeQuotation, createOpeningBalance, createStockMovement, cancelStockMovement, productionAction, operationalView } from './operations.js';
import { companyForWorkshop,provisionCompany } from './odoo-company.js';
import {migrateBaselines} from './migrate-baselines.js';
import { buildSmeReport } from './sme-reports.js';
import { consumeOdooPasswordReset, createOdooAuthAccount, executeOdoo, findOdooAuthAccount, hasOdooConfig, odooStatus, updateOdooAuthAccount } from './odoo.js';
import { sendResetCodeEmail, smtpStatus } from './mailer.js';
import {currencyStatus,configureOdooVnd} from './odoo-currency.js';
import { syncOdooInvoice, syncOdooPayment, syncOdooQuotation, syncOdooAdjustment, syncOdooAllocation } from './odoo-documents.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.resolve(__dirname, '../uploads');
const app = express();
const port = Number(process.env.PORT || 3001);
const jwtSecret = process.env.JWT_SECRET || 'local-development-secret-change-me';
const taxApiUrl = process.env.TAX_API_URL || 'http://127.0.0.1:4000';
const allowedEntities = new Set(['dashboard', 'branches', 'cash-accounts', 'customers', 'suppliers', 'materials', 'products', 'boms', 'quotations', 'production-orders', 'stock-movements', 'labor-logs', 'transactions', 'invoices', 'payments', 'payment-allocations', 'reconciliations', 'alerts', 'classification-rules', 'tax-rules', 'tax-periods', 'opening-balances']);
const roles = {
  OWNER: { label: 'Chủ doanh nghiệp', entities: '*', actions: '*' },
  ACCOUNTANT: { label: 'Kế toán', entities: ['dashboard', 'branches', 'cash-accounts', 'customers', 'suppliers', 'materials', 'products', 'boms', 'quotations', 'production-orders', 'stock-movements', 'labor-logs', 'transactions', 'invoices', 'payments', 'payment-allocations', 'reconciliations', 'alerts', 'classification-rules', 'tax-rules', 'tax-periods'], actions: ['create', 'update', 'read', 'submit-for-approval', 'mark-sent', 'accept', 'create-production', 'simulate-code', 'classify', 'resolve', 'start', 'complete', 'confirm', 'revise', 'unallocate'] },
  WORKSHOP: { label: 'Thợ xưởng', entities: ['production-orders', 'stock-movements', 'materials', 'labor-logs'], actions: ['read', 'start', 'complete', 'progress', 'record-movement', 'record-labor'] },
};
roles.ACCOUNTANT.actions.push('receive-finished');
roles.WAREHOUSE = { label: 'Thủ kho', entities: ['production-orders','stock-movements','materials','products'], actions: ['read','record-movement','receive-finished'] };
const tenantPermissions = new Map();
function permissionsFor(role, wid = DEFAULT_WORKSHOP_ID) { return tenantPermissions.get(`${wid}:${role}`) || { entities: roles[role]?.entities || [], actions: roles[role]?.actions || [] }; }
const roleCaps = Object.fromEntries(['ACCOUNTANT', 'WAREHOUSE', 'WORKSHOP'].map((role) => [role, { entities: [...roles[role].entities], actions: [...roles[role].actions] }]));
const transactionClassifications = new Set(['BUSINESS_INCOME', 'BUSINESS_EXPENSE', 'PERSONAL', 'INTERNAL_TRANSFER', 'OWNER_FUNDING', 'OWNER_DRAW', 'UNCLASSIFIED']);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: process.env.WEB_ORIGIN?.split(',') || ['http://localhost:5173'], credentials: false }));
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 1 } });

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) throw new Error('JWT_SECRET bắt buộc phải được cấu hình ở production.');

const userView = (user) => ({
  id: user.id,
  email: user.email,
  name: user.full_name,
  role: user.role,
  roleLabel: roles[user.role]?.label || user.role,
  workshopId: user.workshop_id || DEFAULT_WORKSHOP_ID,
  workshopName: user.workshop_name || DEFAULT_WORKSHOP_NAME,
  permissions: permissionsFor(user.role, user.workshop_id),
});
async function hydrateRolePermissions() {
  const [rows] = await getPool().query('SELECT workshop_id, role, entities, actions FROM workshop_role_permissions');
  for (const row of rows) {
    const cap = roleCaps[row.role];
    if (cap) tenantPermissions.set(`${row.workshop_id}:${row.role}`, { entities: decodeData(row.entities).filter(item => cap.entities.includes(item)), actions: decodeData(row.actions).filter(item => cap.actions.includes(item)) });
  }
}

async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Vui lòng đăng nhập để tiếp tục.' });
  try { req.user = jwt.verify(token, jwtSecret); } catch { return res.status(401).json({ error: 'Phiên đăng nhập hết hạn.' }); }
  try { const [users] = await getPool().query('SELECT active, role FROM users WHERE id = ? AND workshop_id = ?', [req.user.id, req.user.workshopId || DEFAULT_WORKSHOP_ID]); if (!users[0]?.active || users[0].role !== req.user.role) return res.status(401).json({ error: 'Tài khoản đã bị khóa hoặc quyền đã thay đổi.' }); const wid = req.user.workshopId || DEFAULT_WORKSHOP_ID;
    const [permissions] = await getPool().query('SELECT entities, actions FROM workshop_role_permissions WHERE workshop_id = ? AND role = ?', [wid, req.user.role]);
    if (permissions[0] && roleCaps[req.user.role]) tenantPermissions.set(`${wid}:${req.user.role}`, { entities: decodeData(permissions[0].entities).filter(item => roleCaps[req.user.role].entities.includes(item)), actions: decodeData(permissions[0].actions).filter(item => roleCaps[req.user.role].actions.includes(item)) });
    req.user.roleLabel=roles[req.user.role]?.label; req.user.permissions = permissionsFor(req.user.role, wid); next(); }
  catch (error) { next(error); }
}
function requireOwner(req, res, next) {
  if (req.user?.role !== 'OWNER') return res.status(403).json({ error: 'Bạn không có quyền thực hiện thao tác này.' });
  next();
}
function canEntity(subject, entity) {
  const permission = typeof subject === 'string' ? roles[subject] : subject.permissions || permissionsFor(subject.role, subject.workshopId);
  return permission && (permission.entities === '*' || permission.entities.includes(entity));
}
function requireEntity(req, res, next) {
  const entity = req.params.entity;
  if (!allowedEntities.has(entity)) return res.status(404).json({ error: 'Không tìm thấy phân hệ.' });
  if (!canEntity(req.user, entity)) return res.status(403).json({ error: 'Vai trò hiện tại không được truy cập phân hệ này.' });
  next();
}
function canAct(req, action) {
  const permission = req.user.permissions || permissionsFor(req.user.role, req.user.workshopId);
  return permission?.actions === '*' || permission?.actions.includes(action);
}
function auditActor(user) { return { id: user.id, name: user.name, workshopId: user.workshopId || DEFAULT_WORKSHOP_ID, role: user.role }; }
function authRateLimit({ max = 5, windowMs = 15 * 60 * 1000 } = {}) {
  const buckets = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = String(req.ip || req.socket.remoteAddress || 'unknown');
    let bucket = buckets.get(key);
    if (!bucket || now - bucket.startedAt >= windowMs) {
      bucket = { startedAt: now, count: 0 };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > max) return res.status(429).json({ error: 'Bạn thao tác quá nhiều lần. Vui lòng thử lại sau ít phút.' });
    if (buckets.size > 5000) for (const [entry, value] of buckets) if (now - value.startedAt >= windowMs) buckets.delete(entry);
    next();
  };
}
const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const validEmail = (value) => value.length <= 190 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const odooDateTime = (date) => date.toISOString().slice(0, 19).replace('T', ' ');
const resetOtpHash = (email, code) => createHmac('sha256', jwtSecret).update(`${email}:${code}`).digest('hex');
const resetOtpMinutes = Math.max(1, Number(process.env.PASSWORD_RESET_OTP_MINUTES || 10));
const authSignupLimit = authRateLimit({ max: 5 });
const authResetRequestLimit = authRateLimit({ max: 4 });
const authResetLimit = authRateLimit({ max: 10 });
async function findOrProvisionOdooAuthAccount(email) {
  const account = await findOdooAuthAccount(email);
  if (account) return account;

  // Accounts created before Odoo auth was enabled still have a valid bcrypt
  // hash in MySQL. Copy that hash to Odoo on first use so reset works for them.
  const [rows] = await getPool().query(
    'SELECT id, email, full_name, role, password_hash, active FROM users WHERE email = ? LIMIT 1',
    [email],
  );
  const local = rows[0];
  if (!local) return null;
  const odooId = await createOdooAuthAccount({
    id: local.id,
    email: local.email,
    name: local.full_name,
    role: local.role,
    passwordHash: local.password_hash,
    approved: Boolean(local.active),
  });
  return {
    id: Number(odooId),
    source_id: local.id,
    email: local.email,
    name: local.full_name,
    role: local.role,
    password_hash: local.password_hash,
    is_approved: Boolean(local.active),
  };
}
function finiteAmount(value) { const number = Number(value); return Number.isFinite(number) ? number : 0; }
function classificationCompatible(direction, classification) {
  if (!transactionClassifications.has(classification) || classification === 'INTERNAL_TRANSFER') return false;
  if (['BUSINESS_INCOME', 'OWNER_FUNDING'].includes(classification)) return direction === 'INCOME';
  if (['BUSINESS_EXPENSE', 'OWNER_DRAW'].includes(classification)) return direction === 'EXPENSE';
  return ['INCOME', 'EXPENSE'].includes(direction);
}
function liveRows(rows) { return rows.filter((row) => row.status !== 'CANCELLED'); }
async function updateCashAccount(executor, actorId, { accountId, accountName, delta }, workshopId = DEFAULT_WORKSHOP_ID) {
  const wid = workshopId || DEFAULT_WORKSHOP_ID;
  const accounts = await listRecords('cash-accounts', wid, executor);
  const match = accounts.find((row) => (accountId && row.id === accountId) || (accountName && row.name === accountName));
  const account = match ? await getRecordForUpdate('cash-accounts', match.id, wid, executor) : null;
  if (!account) return null;
  const updated = await saveRecord('cash-accounts', { ...account, balance: Math.round(finiteAmount(account.balance) + delta), workshopId: wid }, actorId, wid, 'LOCAL_DEMO', executor);
  const alertCode = `NEGATIVE_BALANCE_${account.id}`;
  const alerts = await listRecords('alerts', wid, executor);
  const existing = alerts.find((item) => item.alertCode === alertCode && item.status === 'OPEN');
  if (updated.balance < 0 && !existing) await saveRecord('alerts', { alertCode, type: 'HIGH', title: 'Số dư tài khoản âm', description: `${account.name} đang thấp hơn 0 ₫ sau khi ghi nhận giao dịch. Hãy kiểm tra sao kê và số dư đầu kỳ.`, reference: account.id, recommendedAction: 'Đối chiếu sao kê và số dư đầu kỳ.', status: 'OPEN', createdAt: new Date().toISOString(), workshopId: wid }, actorId, wid, 'LOCAL_DEMO', executor);
  if (updated.balance >= 0 && existing) await saveRecord('alerts', { ...existing, status: 'RESOLVED', workshopId: wid, resolvedAt: new Date().toISOString(), resolutionNote: 'Số dư đã được điều chỉnh về không âm.' }, actorId, wid, 'LOCAL_DEMO', executor);
  return updated;
}
function parseImportedAmount(value) {
  if (typeof value === 'number') return value;
  const raw = String(value ?? '').trim().replace(/[₫đ\s]/gi, '').replace(/[()]/g, (match) => match === '(' ? '-' : '');
  if (!raw) return 0;
  const normalized = raw.includes(',') && /,\d{1,2}$/.test(raw) && !/\.\d{3}(?:,|$)/.test(raw)
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw.replace(/[.,]/g, '');
  return Number(normalized);
}
function parseImportedDate(value) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number' && value > 0) return XLSX.SSF.parse_date_code(value)?.y ? `${XLSX.SSF.parse_date_code(value).y}-${String(XLSX.SSF.parse_date_code(value).m).padStart(2, '0')}-${String(XLSX.SSF.parse_date_code(value).d).padStart(2, '0')}` : '';
  const raw = String(value ?? '').trim();
  const iso = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (iso) return `${iso[1]}-${String(iso[2]).padStart(2, '0')}-${String(iso[3]).padStart(2, '0')}`;
  const local = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  return local ? `${local[3]}-${String(local[2]).padStart(2, '0')}-${String(local[1]).padStart(2, '0')}` : '';
}
async function classifyWithRules(record, workshopId = DEFAULT_WORKSHOP_ID) {
  const wid = workshopId || record.workshopId || DEFAULT_WORKSHOP_ID;
  if (record.classification && record.classification !== 'UNCLASSIFIED') return record;
  const rules = (await listRecords('classification-rules', wid)).filter((rule) => rule.active !== false && rule.status !== 'INACTIVE');
  for (const rule of rules) {
    const field = ['description', 'counterparty', 'accountName'].includes(rule.matchField) ? rule.matchField : 'description';
    const needle = String(rule.keyword || '').trim().toLocaleLowerCase('vi');
    if (needle && String(record[field] || '').toLocaleLowerCase('vi').includes(needle) && classificationCompatible(record.direction, rule.classification)) {
      return { ...record, classification: rule.classification, classificationSource: 'RULE', classificationReason: rule.name || `Khớp từ khóa “${rule.keyword}”`, classificationConfidence: Math.min(100, Math.max(0, finiteAmount(rule.confidence) || 80)), status: 'CONFIRMED' };
    }
  }
  return { ...record, classification: 'UNCLASSIFIED', classificationSource: 'NEEDS_REVIEW', classificationConfidence: 0 };
}
function normalizeRecord(record) {
  const value = { ...record };
  const moneyFields = new Set(['amount', 'total', 'subtotal', 'taxAmount', 'unitPrice', 'costEstimate', 'materialCost', 'laborRate', 'laborCost', 'machineCost', 'unitCost', 'allocatedAmount']);
  for (const field of ['amount', 'total', 'subtotal', 'taxAmount', 'unitPrice', 'quantity', 'costEstimate', 'materialCost', 'laborHours', 'laborRate', 'laborCost', 'machineCost', 'unitCost', 'wasteRate', 'marginRate', 'stock', 'minStock', 'hours', 'allocatedAmount', 'openingBalance']) {
    if (value[field] !== undefined && value[field] !== '' && !Number.isFinite(Number(value[field]))) throw new Error(`Trường ${field} phải là số hợp lệ.`);
    if (value[field] !== undefined && Number(value[field]) < 0) throw new Error(`Trường ${field} không được âm.`);
    if (value[field] !== undefined && value[field] !== '') value[field] = moneyFields.has(field) ? Math.round(Number(value[field])) : Number(value[field]);
  }
  if (value.items && Array.isArray(value.items)) {
    for (const item of value.items) {
      const q = finiteAmount(item.quantity); const p = finiteAmount(item.unitPrice ?? item.unitCost);
      if (q < 0 || p < 0) throw new Error('Số lượng và đơn giá không được âm.');
      if (item.amount === undefined) item.amount = Math.round(q * p);
    }
  }
  if (value.quantity !== undefined && value.unitPrice !== undefined && value.total === undefined) {
    value.subtotal = Math.round(finiteAmount(value.quantity) * finiteAmount(value.unitPrice));
    value.total = value.subtotal + finiteAmount(value.taxAmount);
  }
  if (value.laborHours !== undefined || value.materialCost !== undefined || value.machineCost !== undefined) {
    const laborCost = Math.round(finiteAmount(value.laborHours) * finiteAmount(value.laborRate));
    const baseCost = finiteAmount(value.materialCost) + laborCost + finiteAmount(value.machineCost);
    const wasteRate = finiteAmount(value.wasteRate) >= 1 ? finiteAmount(value.wasteRate) / 100 : finiteAmount(value.wasteRate);
    const marginRate = finiteAmount(value.marginRate) >= 1 ? finiteAmount(value.marginRate) / 100 : finiteAmount(value.marginRate);
    const estimatedUnitCost = Math.round(baseCost * (1 + wasteRate));
    value.laborCost = laborCost;
    value.estimatedUnitCost = estimatedUnitCost;
    value.suggestedPrice = marginRate >= 1 ? 0 : Math.round(estimatedUnitCost / (1 - marginRate));
    value.wasteRate = wasteRate;
    value.marginRate = marginRate;
  }
  return value;
}
async function listAudit(workshopId = DEFAULT_WORKSHOP_ID, limit = 100) {
  const wid = workshopId || DEFAULT_WORKSHOP_ID;
  const [rows] = await getPool().query('SELECT id, actor_id, actor_name, actor_role, reason, action, entity, record_id, before_data, after_data, created_at FROM audit_logs WHERE workshop_id = ? ORDER BY created_at DESC LIMIT ?', [wid, limit]);
  return rows.map((row) => ({ id: row.id, actorId: row.actor_id, actorName: row.actor_name, role: row.actor_role, reason: row.reason, action: row.action, entity: row.entity, recordId: row.record_id, beforeData: row.before_data ? decodeData(row.before_data) : null, afterData: row.after_data ? decodeData(row.after_data) : null, createdAt: row.created_at }));
}
async function getCounts(workshopId = DEFAULT_WORKSHOP_ID) {
  const wid = workshopId || DEFAULT_WORKSHOP_ID;
  const entities = ['transactions', 'invoices', 'quotations', 'production-orders', 'alerts', 'customers', 'suppliers', 'materials', 'payments', 'reconciliations', 'branches', 'tax-periods', 'labor-logs', 'accounting-adjustments', 'payment-allocations','products','stock-movements','opening-balances'];
  entities.push('cash-accounts');
  const [rows] = await getPool().query('SELECT entity, record_id, data, created_at FROM records WHERE workshop_id = ? AND entity IN (?) ORDER BY updated_at DESC', [wid, entities]);
  const data = Object.fromEntries(entities.map((entity) => [entity, []]));
  for (const row of rows) data[row.entity].push({ createdAt: row.created_at, ...decodeData(row.data), id: row.record_id });
  return data;
}
async function syncOdooJob(job) {
  if (job.entity === 'users') await syncRegisteredUser(job.record_id, job.workshop_id || DEFAULT_WORKSHOP_ID);
  let data = decodeData(job.payload);
  if (!['users','audit-logs','file-assets','role-permissions'].includes(job.entity) && ![DEFAULT_WORKSHOP_ID,'00000000-0000-0000-0000-000000000002'].includes(job.workshop_id)) await companyForWorkshop(job.workshop_id);
  if (job.entity === 'invoices') {
    data = await getRecord('invoices', job.record_id, job.workshop_id) || data;
    if (active(data) && invoiceDirection(data) === 'OUTPUT' && !data.mockTaxCode) {
      const response = await axios.post(`${taxApiUrl}/api/v1/invoices/issue`, { invoiceId: data.id, invoiceCode: data.code, total: data.total, invoiceDate: data.date }, { timeout: 5000 });
      const sourceTotal = data.total;
      data = await transaction(job.workshop_id, async (connection) => {
        const current = await getRecordForUpdate('invoices', job.record_id, job.workshop_id, connection);
        if (!current || !active(current) || current.mockTaxCode) return current || data;
        if (current.total !== sourceTotal) throw new Error('Invoice changed during mock tax coding; retry required.');
        const updated = { ...current, mockTaxCode: response.data.mockTaxCode, simulatedAt: response.data.issuedAt, tax_authority_code: response.data.mockTaxCode, verification: 'Đã mô phỏng' };
        await connection.query('UPDATE records SET data = CAST(? AS JSON) WHERE workshop_id = ? AND entity = ? AND record_id = ?', [JSON.stringify(updated), job.workshop_id, 'invoices', job.record_id]);
        return updated;
      });
    }
  }
  if (!odooSyncEntities.includes(job.entity)) {
    const error = new Error(`No Odoo mirror mapping for ${job.entity}.`);
    error.code = 'PENDING_MAPPING';
    throw error;
  }

  const sourceId = String(job.record_id);
  const sourceKey = `${job.entity}:${sourceId}`;
  const pick = (...values) => values.find((value) => value !== undefined && value !== null && String(value).trim() !== '');
  const dateValue = pick(data.date, data.issueDate, data.dueDate, data.createdAt, data.created_at);
  const eventDate = /^\d{4}-\d{2}-\d{2}/.test(String(dateValue || '')) ? String(dateValue).slice(0, 10) : false;
  const name = String(pick(data.name, data.title, data.code, data.alertCode, data.original_name, data.originalName, data.description, data.email, data.action, data.role, `${job.entity} ${sourceId}`));
  const reference = pick(data.code, data.reference, data.alertCode, data.externalReference, data.file_id, data.id);
  const counterparty = pick(data.counterparty, data.customerName, data.supplierName, data.partnerName, data.employeeName, data.accountName, data.materialName, data.productName, data.actorName);
  const amount = finiteAmount(pick(data.total, data.amount, data.balance, data.allocatedAmount, data.costEstimate, data.openingBalance, data.materialCost, data.unitCost, 0));
  const mirrorValues = {
    name,
    entity: job.entity,
    source_id: sourceId,
    source_key: sourceKey,
    reference: reference ? String(reference) : false,
    status: pick(data.status, data.paymentStatus, data.role, data.active === undefined ? '' : (data.active ? 'ACTIVE' : 'INACTIVE')) || false,
    event_date: eventDate,
    amount,
    counterparty: counterparty ? String(counterparty) : false,
    payload_json: JSON.stringify(data, null, 2),
    source_created_at: String(pick(data.createdAt, data.created_at, '') || ''),
    synced_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
  };

  let nativeModel = '';
  let nativeId = 0;
  if (job.entity === 'customers' || job.entity === 'suppliers') {
    nativeModel = 'res.partner';
    const values = {
      name: String(pick(data.name, data.email, `FinTax ${sourceId}`)),
      fintax_source_key: sourceKey,
      ref: `FTX:${sourceKey}`,
      vat: data.taxCode || false,
      phone: data.phone || false,
      email: data.email || false,
      street: data.address || false,
    };
    const found = await executeOdoo(nativeModel, 'search_read', [[['fintax_source_key', '=', sourceKey]]], { fields: ['id'], limit: 1, context: { active_test: false } });
    nativeId = found?.length ? Number(found[0].id) : Number(await executeOdoo(nativeModel, 'create', [values]));
    if (found?.length) await executeOdoo(nativeModel, 'write', [[nativeId], values]);
  } else if (job.entity === 'users') {
    nativeModel = 'res.partner';
    const values = {
      name: String(pick(data.name, data.email, `FinTax user ${sourceId}`)),
      fintax_source_key: sourceKey,
      ref: `FTX:${sourceKey}`,
      email: data.email || false,
      active: data.active !== false,
      company_type: 'person',
    };
    const found = await executeOdoo(nativeModel, 'search_read', [[['fintax_source_key', '=', sourceKey]]], { fields: ['id'], limit: 1, context: { active_test: false } });
    nativeId = found?.length ? Number(found[0].id) : Number(await executeOdoo(nativeModel, 'create', [values]));
    if (found?.length) await executeOdoo(nativeModel, 'write', [[nativeId], values]);
  } else if (job.entity === 'products' || job.entity === 'materials') {
    nativeModel = 'product.template';
    const values = {
      name: String(pick(data.name, data.code, `FinTax ${sourceId}`)),
      fintax_source_key: sourceKey,
      default_code: data.code || false,
      list_price: finiteAmount(data.price ?? data.suggestedPrice),
      standard_price: finiteAmount(data.cost ?? data.unitCost ?? data.estimatedUnitCost),
      type: 'consu',
    };
    const found = await executeOdoo(nativeModel, 'search_read', [[['fintax_source_key', '=', sourceKey]]], { fields: ['id'], limit: 1 });
    nativeId = found?.length ? Number(found[0].id) : Number(await executeOdoo(nativeModel, 'create', [values]));
    if (found?.length) await executeOdoo(nativeModel, 'write', [[nativeId], values]);
  } else if (job.entity === 'quotations') {
    const native = await syncOdooQuotation(data, sourceKey);
    nativeModel = native.model;
    nativeId = native.id;
  } else if (job.entity === 'invoices') {
    const native = await syncOdooInvoice(data, sourceKey);
    nativeModel = native.model;
    nativeId = native.id;
  } else if (job.entity === 'accounting-adjustments') { const native = await syncOdooAdjustment(data, sourceKey); nativeModel = native.model; nativeId = native.id;
  } else if (job.entity === 'payment-allocations') { const native = await syncOdooAllocation(data, sourceKey); nativeModel = native.model; nativeId = native.id;
  } else if (job.entity === 'payments') {
    const native = await syncOdooPayment(data, sourceKey);
    nativeModel = native.model;
    nativeId = native.id;
  }

  if (nativeModel) {
    mirrorValues.native_model = nativeModel;
    mirrorValues.native_id = nativeId;
  }
  const foundMirror = await executeOdoo('fintax.sync.record', 'search_read', [[['source_key', '=', sourceKey]]], { fields: ['id'], limit: 1 });
  const mirrorId = foundMirror?.length
    ? Number(foundMirror[0].id)
    : Number(await executeOdoo('fintax.sync.record', 'create', [mirrorValues]));
  if (foundMirror?.length) await executeOdoo('fintax.sync.record', 'write', [[mirrorId], mirrorValues]);

  if (job.entity === 'file-assets') {
    const storedName = path.basename(String(pick(data.stored_name, data.storedName, sourceId)));
    const baseDir = path.resolve(uploadDir);
    const filePath = path.resolve(baseDir, storedName);
    if (!filePath.startsWith(`${baseDir}${path.sep}`)) throw new Error('Invalid attachment path.');
    const content = await readFile(filePath);
    await executeOdoo('fintax.sync.record', 'write', [[mirrorId], {
      file_content: content.toString('base64'),
      file_filename: String(pick(data.original_name, data.originalName, storedName)),
      synced_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
    }]);
  }

  const current = await getRecord(job.entity, job.record_id, job.workshop_id);
  if (current) {
    const updated = { ...current, odooMirrorId: mirrorId };
    if (nativeId) {
      updated.odooId = nativeId;
      updated.odooModel = nativeModel;
      const baseUrl = String(process.env.ODOO_URL || '').replace(/\/$/, '');
      if (['sale.order', 'account.move', 'account.payment'].includes(nativeModel) && baseUrl) updated.odooUrl = `${baseUrl}/web#id=${nativeId}&model=${encodeURIComponent(nativeModel)}&view_type=form`;
      else delete updated.odooUrl;
    } else {
      delete updated.odooId;
      delete updated.odooModel;
      delete updated.odooUrl;
    }
    await getPool().query('UPDATE records SET data = CAST(? AS JSON), sync_status = ? WHERE entity = ? AND record_id = ? AND workshop_id = ?', [JSON.stringify(updated), 'SYNCED', job.entity, job.record_id, job.workshop_id]);
  }
  await getPool().query('UPDATE odoo_sync_jobs SET status = ?, last_error = NULL, attempts = attempts + 1 WHERE id = ?', ['SYNCED', job.id]);
  return { id: job.id, entity: job.entity, recordId: job.record_id, status: 'SYNCED', odooMirrorId: mirrorId, nativeModel: nativeModel || null, nativeId: nativeId || null };
}

let odooWorkerRunning = false;
async function syncOdooJobs({ statuses, limit = 50, workshopId = null }) {
  const connection = await odooStatus();
  if (!connection.connected) throw new Error(`Odoo chưa sẵn sàng: ${connection.label}.`);
  const [jobs] = await getPool().query(
    `SELECT * FROM odoo_sync_jobs WHERE status IN (?) ${workshopId ? 'AND workshop_id = ?' : ''} ORDER BY CASE WHEN entity = 'users' THEN 0 ELSE 1 END, created_at ASC LIMIT ?`,
    workshopId ? [statuses, workshopId, limit] : [statuses, limit],
  );
  const results = [];
  for (const job of jobs) {
    const [claim] = await getPool().query(
      'UPDATE odoo_sync_jobs SET status = ? WHERE id = ? AND status IN (?)',
      ['PROCESSING', job.id, statuses],
    );
    if (!claim.affectedRows) continue;
    try {
      results.push(await syncOdooJob(job));
    } catch (error) {
      const state = error.code === 'PENDING_MAPPING' ? 'PENDING_MAPPING' : 'PENDING_RETRY';
      await getPool().query('UPDATE odoo_sync_jobs SET status = ?, attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP, last_error = ? WHERE id = ?', [state, String(error.message).slice(0, 1000), job.id]);
      await getPool().query('UPDATE records SET sync_status = ? WHERE entity = ? AND record_id = ? AND workshop_id = ?', [state, job.entity, job.record_id, job.workshop_id]);
      results.push({ id: job.id, entity: job.entity, recordId: job.record_id, status: state, error: error.message });
    }
  }
  return { attempted: results.length, results };
}

async function enqueueFullOdooBackfill(wid = DEFAULT_WORKSHOP_ID) {
  const db = getPool();
  const standaloneEntities = ['users', 'role-permissions', 'audit-logs', 'file-assets'];
  const recordEntities = odooSyncEntities.filter((entity) => !standaloneEntities.includes(entity));
  const counts = {};
  let queued = 0;
  const count = (entity) => { counts[entity] = (counts[entity] || 0) + 1; queued += 1; };

  const [records] = await db.query(
    'SELECT entity, record_id, data, sync_status FROM records WHERE entity IN (?) AND sync_status <> ? AND workshop_id = ? ORDER BY entity, record_id',
    [recordEntities, 'DEMO_SEED', wid],
  );
  for (const record of records) {
    const payload = decodeData(record.data);
    if (await enqueueOdooSync(record.entity, record.record_id, payload, wid, db)) {
      await db.query('UPDATE records SET sync_status = ? WHERE entity = ? AND record_id = ? AND workshop_id = ?', ['PENDING_ODOO', record.entity, record.record_id, wid]);
      count(record.entity);
    }
  }

  const [users] = await db.query('SELECT id, email, full_name, role, active, created_at, updated_at FROM users WHERE workshop_id = ? ORDER BY created_at, id', [wid]);
  for (const user of users) {
    if (await enqueueOdooSync('users', user.id, { id: user.id, email: user.email, name: user.full_name, role: user.role, active: Boolean(user.active), createdAt: user.created_at, updatedAt: user.updated_at }, wid, db)) count('users');
  }

  const [permissions] = await db.query('SELECT role, entities, actions, updated_at FROM workshop_role_permissions WHERE workshop_id = ? ORDER BY role',[wid]);
  for (const permission of permissions) {
    if (await enqueueOdooSync('role-permissions', permission.role, { id: permission.role, role: permission.role, entities: decodeData(permission.entities), actions: decodeData(permission.actions), updatedAt: permission.updated_at }, wid, db)) count('role-permissions');
  }

  const [audits] = await db.query('SELECT id, actor_id, actor_name, action, entity, record_id, before_data, after_data, created_at FROM audit_logs WHERE workshop_id = ? ORDER BY id', [wid]);
  for (const row of audits) {
    const payload = { id: String(row.id), actorId: row.actor_id, actorName: row.actor_name, role: row.actor_role, reason: row.reason, action: row.action, entity: row.entity, recordId: row.record_id, beforeData: row.before_data ? decodeData(row.before_data) : null, afterData: row.after_data ? decodeData(row.after_data) : null, createdAt: row.created_at };
    if (await enqueueOdooSync('audit-logs', payload.id, payload, wid, db)) count('audit-logs');
  }

  const [files] = await db.query('SELECT file_id, stored_name, original_name, mime_type, size_bytes, owner_id, created_at FROM file_assets WHERE workshop_id = ? ORDER BY created_at, file_id', [wid]);
  for (const file of files) {
    const payload = { id: file.file_id, file_id: file.file_id, stored_name: file.stored_name, original_name: file.original_name, mime_type: file.mime_type, size_bytes: Number(file.size_bytes), owner_id: file.owner_id, created_at: file.created_at };
    if (await enqueueOdooSync('file-assets', file.file_id, payload, wid, db)) count('file-assets');
  }

  return { queued, counts };
}

async function autoSyncOdooQueue() {
  if (odooWorkerRunning) return;
  const configured = process.env.ODOO_URL && process.env.ODOO_DB && process.env.ODOO_USERNAME && process.env.ODOO_PASSWORD;
  if (!configured) return;
  odooWorkerRunning = true;
  try {
    const [pending] = await getPool().query("SELECT id FROM odoo_sync_jobs WHERE status = 'PENDING' OR (status = 'PENDING_RETRY' AND updated_at < CURRENT_TIMESTAMP - INTERVAL '30 seconds') LIMIT 1");
    if (!pending.length) return;
    const result = await syncOdooJobs({ statuses: ['PENDING', 'PENDING_RETRY'], limit: 10 });
    if (result.attempted) console.info(`Odoo auto-sync: ${result.results.filter((item) => item.status === 'SYNCED').length}/${result.attempted} records synced.`);
  } catch (error) {
    console.warn(`Odoo auto-sync paused: ${error.message}`);
  } finally {
    odooWorkerRunning = false;
  }
}

app.get('/api/health', async (_req, res) => {
  try { await getPool().query('SELECT 1'); res.json({ ok: true, service: 'middleware-api', database: 'connected' }); }
  catch { res.status(503).json({ ok: false, service: 'middleware-api', database: 'unavailable' }); }
});

app.post('/api/auth/register', authSignupLimit, async (req, res) => {
  const email = normalizeEmail(req.body?.email), name = String(req.body?.name || '').trim(), password = String(req.body?.password || '');
  if (!validEmail(email) || name.length < 2 || name.length > 190 || password.length < 10 || Buffer.byteLength(password, 'utf8') > 72) return res.status(400).json({ error: 'Nhập tên, email và mật khẩu từ 10 ký tự (tối đa 72 byte UTF-8).' });
  const inviteToken = String(req.body?.inviteToken || '');
  const companyName = String(req.body?.workshopName || '').trim();
  const newCompany = !inviteToken && (req.body?.mode === 'CREATE_WORKSHOP' || Boolean(companyName));
  if (newCompany && companyName.length < 2) throw businessError('Nhập tên doanh nghiệp từ 2 ký tự.');
  const id = randomUUID(), passwordHash = await bcrypt.hash(password, 12);
  let wid = newCompany ? randomUUID() : DEFAULT_WORKSHOP_ID;
  let registrationRole = newCompany ? 'OWNER' : 'ACCOUNTANT';
  let approved = newCompany || Boolean(inviteToken);
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    if (inviteToken) {
      const [invitations] = await connection.query('SELECT * FROM user_invitations WHERE token_hash = ? FOR UPDATE', [createHash('sha256').update(inviteToken).digest('hex')]);
      const invitation = invitations[0];
      if (!invitation || invitation.used_at || new Date(invitation.expires_at) <= new Date() || invitation.email !== email) throw businessError('Lời mời không hợp lệ, đã dùng hoặc hết hạn.', 400);
      wid = invitation.workshop_id; registrationRole = invitation.role;
      await connection.query('UPDATE user_invitations SET used_at = CURRENT_TIMESTAMP WHERE id = ?', [invitation.id]);
    }
    if (newCompany) await connection.query("INSERT INTO workshops (id,name,code,owner_id,settings) VALUES (?,?,?, ?, CAST(? AS JSON))", [wid,companyName,`DN-${wid.slice(0,8).toUpperCase()}`,id,JSON.stringify({ accountingRegime: 'TT133', taxMethod: 'VAT_CREDIT', currency: 'VND', fiscalYearStart: '01-01', inventoryCostMethod: 'MOVING_AVERAGE', defaultWarehouse: 'Kho chính' })]);
    await connection.query("INSERT INTO users (id, workshop_id, email, full_name, role, password_hash, active, approval_status, odoo_sync_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_SYNC')", [id, wid, email, name, registrationRole, passwordHash, approved, approved ? 'APPROVED' : 'PENDING_OWNER']);
    await enqueueOdooSync('users', id, { id, email, operation: 'REGISTER_USER' }, wid, connection);
    await createAudit({ actor: { id, name, role: registrationRole, workshopId: wid }, action: 'USER_REGISTERED', entity: 'users', recordId: id, afterData: { email, active: false, approvalStatus: approved ? 'APPROVED' : 'PENDING_OWNER', odooSyncStatus: 'PENDING_SYNC', registrationRole, newCompany, requestedWorkshopName: String(req.body?.workshopName || '') }, executor: connection });
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    if (error.code === '23505') return res.status(409).json({ error: 'Email đã được đăng ký.' });
    throw error;
  } finally { connection.release(); }
  if(newCompany) await seedWorkshopCatalog(wid);
  try {
    if (hasOdooConfig()) await syncRegisteredUser(id, wid);
  } catch (error) {
    await getPool().query("UPDATE odoo_sync_jobs SET status = 'PENDING_RETRY', operation = 'REGISTER_USER', last_error = ? WHERE entity = 'users' AND record_id = ? AND workshop_id = ? AND status <> 'SYNCED'", [error.message, id, wid]);
  }
  const [rows] = await getPool().query('SELECT odoo_sync_status FROM users WHERE id = ?', [id]);
  res.status(201).json({ ok: true, workshopId: wid, approvalStatus: approved ? 'APPROVED' : 'PENDING_OWNER', odooSyncStatus: rows[0].odoo_sync_status, message: approved ? 'Đã tạo không gian làm việc. Bạn có thể đăng nhập; ERP sẽ đồng bộ nền.' : 'Yêu cầu tham gia đang chờ chủ doanh nghiệp duyệt.' });
});

async function syncRegisteredUser(id, wid) {
  const [rows] = await getPool().query('SELECT * FROM users WHERE id = ? AND workshop_id = ?', [id, wid]);
  const user = rows[0];
  if (!user) throw businessError('Tài khoản không tồn tại.', 404);
  const approved = user.approval_status === 'APPROVED';
  const account = await findOdooAuthAccount(user.email);
  if (account) {
    if (account.source_id !== user.id) throw businessError('Email đã thuộc tài khoản ERP khác.', 409);
    await updateOdooAuthAccount(account.id, { is_approved: approved, role: user.role, name: user.full_name, password_hash: user.password_hash });
  } else await createOdooAuthAccount({ id: user.id, email: user.email, name: user.full_name, role: user.role, passwordHash: user.password_hash, approved });
  await getPool().query("UPDATE users SET odoo_sync_status = 'SYNCED', active = ? WHERE id = ? AND workshop_id = ? AND approval_status = ?", [approved, id, wid, user.approval_status]);
}

app.post('/api/auth/forgot-password', authResetRequestLimit, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!validEmail(email)) return res.status(400).json({ error: 'Nhập địa chỉ email hợp lệ.' });
  if (!hasOdooConfig()) return res.status(503).json({ error: 'Odoo chưa được cấu hình để đặt lại mật khẩu.' });

  try {
    const account = await findOrProvisionOdooAuthAccount(email);
    if (account) {
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const codeHash = resetOtpHash(email, code);
      const expiresAt = new Date(Date.now() + resetOtpMinutes * 60 * 1000);
      await updateOdooAuthAccount(account.id, {
        reset_token_hash: codeHash,
        reset_token_expires_at: odooDateTime(expiresAt),
      });

      try {
        await sendResetCodeEmail({ to: email, code, expiresInMinutes: resetOtpMinutes });
      } catch (error) {
        console.warn('FinTax password reset code email could not be sent:', error.message);
        if (process.env.NODE_ENV === 'production') {
          await updateOdooAuthAccount(account.id, { reset_token_hash: false, reset_token_expires_at: false });
          return res.status(503).json({ error: 'Chưa gửi được mã khôi phục. Kiểm tra cấu hình Gmail SMTP trong máy chủ.' });
        }
        return res.json({
          ok: true,
          message: 'Gmail SMTP chưa gửi được thư; mã thử nghiệm bên dưới chỉ dùng trong môi trường phát triển.',
          debugCode: code,
        });
      }
    }
  } catch (error) {
    console.warn('FinTax password reset request failed:', error.message);
    return res.status(503).json({ error: 'Odoo hiện chưa sẵn sàng để tạo mã khôi phục.' });
  }

  res.json({ ok: true, message: 'Nếu email tồn tại, mã đặt lại mật khẩu sẽ được gửi.' });
});

app.post('/api/auth/reset-password', authResetLimit, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const code = String(req.body?.code || '').trim();
  const newPassword = String(req.body?.newPassword || '');
  if (!validEmail(email) || !/^\d{6}$/.test(code) || newPassword.length < 10 || Buffer.byteLength(newPassword, 'utf8') > 72) {
    return res.status(400).json({ error: 'Email hoặc mã không hợp lệ, hoặc mật khẩu chưa đạt 10 ký tự (tối đa 72 byte UTF-8).' });
  }
  if (!hasOdooConfig()) return res.status(503).json({ error: 'Odoo hiện chưa sẵn sàng.' });

  const codeHash = resetOtpHash(email, code);
  const passwordHash = await bcrypt.hash(newPassword, 12);
  let account;
  try { account = await consumeOdooPasswordReset(codeHash, passwordHash); }
  catch (error) {
    console.warn('Odoo password reset could not consume the code:', error.message);
    return res.status(503).json({ error: 'Odoo hiện chưa sẵn sàng. Vui lòng thử lại sau.' });
  }
  if (!account) return res.status(400).json({ error: 'Mã đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.' });

  const localVerifier = passwordHash;
  await getPool().query(
    'INSERT INTO users (id, email, full_name, role, password_hash, active) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)',
    [account.source_id, account.email, account.name, account.role, localVerifier, Boolean(account.is_approved)],
  );
  await createAudit({ actor: { id: account.source_id, name: account.name }, action: 'PASSWORD_RESET', entity: 'users', recordId: account.source_id });
  res.json({ ok: true, message: 'Đã đặt lại mật khẩu. Bạn có thể đăng nhập.' });
});
app.post('/api/auth/login', async (req, res) => {
  const email = normalizeEmail(req.body?.email), password = String(req.body?.password || '');
  if (!email || !password) return res.status(400).json({ error: 'Nhập email và mật khẩu.' });
  const [rows] = await getPool().query('SELECT u.*, w.name AS workshop_name FROM users u JOIN workshops w ON u.workshop_id = w.id AND w.active = TRUE WHERE u.email = ? LIMIT 1', [email]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'Email hoặc mật khẩu chưa chính xác.' });
  if (!user.active) return res.status(403).json({ error: 'Tài khoản đang chờ duyệt hoặc đã bị khóa.' });
  const view = userView(user), token = jwt.sign(view, jwtSecret, { expiresIn: '12h', issuer: 'fintax-middleware' });
  res.json({ token, user: view });
});

app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: { ...req.user, permissions: permissionsFor(req.user.role, req.user.workshopId) } }));
app.post('/api/auth/password', requireAuth, async (req, res) => {
  const currentPassword = String(req.body?.currentPassword || ''); const newPassword = String(req.body?.newPassword || '');
  if (newPassword.length < 8) return res.status(400).json({ error: 'Mật khẩu mới cần ít nhất 8 ký tự.' });
  if (currentPassword === newPassword) return res.status(400).json({ error: 'Mật khẩu mới cần khác mật khẩu hiện tại.' });
  const [rows] = await getPool().query('SELECT password_hash FROM users WHERE id = ? AND active = TRUE LIMIT 1', [req.user.id]);
  if (!rows[0]) return res.status(400).json({ error: 'Mật khẩu hiện tại chưa chính xác.' });
  let odooAccount = null;
  if (hasOdooConfig()) {
    try { odooAccount = await findOdooAuthAccount(req.user.email); }
    catch (error) { console.warn('Could not look up the FinTax account in Odoo:', error.message); return res.status(503).json({ error: 'Odoo hiện chưa sẵn sàng để đổi mật khẩu.' }); }
  }
  if (!(await bcrypt.compare(currentPassword, odooAccount?.password_hash || rows[0].password_hash))) return res.status(400).json({ error: 'Mật khẩu hiện tại chưa chính xác.' });
  const passwordHash = await bcrypt.hash(newPassword, 12);
  if (odooAccount) {
    try { await updateOdooAuthAccount(odooAccount.id, { password_hash: passwordHash, reset_token_hash: false, reset_token_expires_at: false }); }
    catch (error) { return res.status(503).json({ error: 'Chưa cập nhật được mật khẩu trong Odoo. Vui lòng thử lại.' }); }
  } else {
    await getPool().query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, req.user.id]);
  }
  await getPool().query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, req.user.id]);
  await createAudit({ actor: auditActor(req.user), action: 'PASSWORD_CHANGED', entity: 'users', recordId: req.user.id });
  res.json({ ok: true });
});

app.get('/api/workshop', requireAuth, async (req, res) => {
  const workshop = await getWorkshop(req.user.workshopId);
  if (!workshop) return res.status(404).json({ error: 'Không tìm thấy thông tin xưởng.' });
  res.json(workshop);
});

app.put('/api/workshop', requireAuth, requireOwner, async (req, res) => {
  const wid = req.user.workshopId || DEFAULT_WORKSHOP_ID;
  const name = String(req.body?.name || '').trim();
  const taxId = req.body?.taxId !== undefined ? String(req.body.taxId).trim() : null;
  const code = req.body?.code !== undefined ? String(req.body.code).trim() : null;
  if (name && name.length < 2) return res.status(400).json({ error: 'Tên xưởng cần tối thiểu 2 ký tự.' });
  const current = await getWorkshop(wid);
  if (!current) return res.status(404).json({ error: 'Không tìm thấy thông tin xưởng.' });
  const updatedName = name || current.name;
  const updatedTaxId = taxId !== null ? taxId : current.tax_id;
  const updatedCode = code !== null ? code : current.code;
  await getPool().query(
    'UPDATE workshops SET name = ?, tax_id = ?, code = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [updatedName, updatedTaxId, updatedCode, wid]
  );
  const requestedSettings=req.body.settings||{};
  const settings = { ...current.settings, ...Object.fromEntries(['accountingRegime','taxMethod','defaultWarehouse'].filter(key=>requestedSettings[key]!==undefined).map(key=>[key,requestedSettings[key]])), currency: 'VND', inventoryCostMethod: 'MOVING_AVERAGE' };
  if (req.body.settings) {
    if (!['TT133','HKD_TT152','DEMO'].includes(settings.accountingRegime) || !['VAT_CREDIT','HKD_REVENUE',...(settings.accountingRegime==='DEMO'?['MIXED_DEMO']:[])].includes(settings.taxMethod)) throw businessError('Chọn chế độ kế toán và phương pháp thuế được hỗ trợ.');
    if ((settings.accountingRegime === 'TT133') !== (settings.taxMethod === 'VAT_CREDIT') && settings.accountingRegime !== 'DEMO') throw businessError('Phương pháp thuế không khớp chế độ kế toán.');
    const invoices = await listRecords('invoices', wid);
    if (invoices.some(active) && current.settings?.accountingRegime && (settings.accountingRegime !== current.settings.accountingRegime || settings.taxMethod !== current.settings.taxMethod)) throw businessError('Đã có hóa đơn. Cần chuyển đổi số dư/chế độ theo kỳ trước khi đổi phương pháp.', 409);
    await getPool().query('UPDATE workshops SET settings = CAST(? AS JSON) WHERE id = ?', [JSON.stringify(settings),wid]);
  }
  const updated = await getWorkshop(wid);
  await createAudit({ actor: auditActor(req.user), action: 'WORKSHOP_UPDATED', entity: 'workshops', recordId: wid, workshopId: wid, beforeData: current, afterData: updated });
  res.json(updated);
});

app.get('/api/users', requireAuth, requireOwner, async (req, res) => {
  const wid = req.user.workshopId || DEFAULT_WORKSHOP_ID;
  const [rows] = await getPool().query(
    `SELECT u.id, u.email, u.full_name, u.role, u.active, u.approval_status, u.odoo_sync_status, u.workshop_id, u.created_at, w.name AS workshop_name
     FROM users u
     LEFT JOIN workshops w ON u.workshop_id = w.id
     WHERE u.workshop_id = ?
     ORDER BY u.created_at`,
    [wid]
  );
  res.json(rows.map((row) => ({ ...userView(row), active: Boolean(row.active), approvalStatus: row.approval_status, odooSyncStatus: row.odoo_sync_status, createdAt: row.created_at })));
});
app.post('/api/users', requireAuth, requireOwner, async (req, res) => {
  const { email, name, role, password } = req.body;
  if (!validEmail(email) || !name || !roles[role] || !password || password.length < 10) return res.status(400).json({ error: 'Vui lòng nhập tên, email, vai trò và mật khẩu tối thiểu 10 ký tự.' });
  const id = randomUUID();
  const hash = await bcrypt.hash(password, 12);
  const wid = req.user.workshopId || DEFAULT_WORKSHOP_ID;
  try {
    await getPool().query('INSERT INTO users (id, email, full_name, role, password_hash, active, workshop_id) VALUES (?, ?, ?, ?, ?, TRUE, ?)', [id, String(email).toLowerCase(), name, role, hash, wid]);
    const user = { id, email: String(email).toLowerCase(), name, role, roleLabel: roles[role].label, workshopId: wid, workshopName: req.user.workshopName };
    if (hasOdooConfig()) {
      try { await createOdooAuthAccount({ id, email: user.email, name, role, passwordHash: hash, approved: true }); }
      catch (odooError) { console.warn('Could not save the administrator-created account to Odoo:', odooError.message); }
    }
    await enqueueOdooSync('users', id, { id, email: user.email, name, role, active: true, createdAt: new Date().toISOString() }, wid);
    await createAudit({ actor: auditActor(req.user), action: 'USER_CREATED', entity: 'users', recordId: id, workshopId: wid, afterData: { email: user.email, name, role, workshopId: wid } });
    res.status(201).json(user);
  } catch (error) { res.status(409).json({ error: error.code === 'ER_DUP_ENTRY' || error.code === '23505' ? 'Email đã được sử dụng.' : 'Không thể tạo tài khoản.' }); }
});
app.patch('/api/users/:id/status', requireAuth, requireOwner, async (req, res) => {
  const active = Boolean(req.body.active);
  if (req.params.id === req.user.id && !active) return res.status(400).json({ error: 'Bạn không thể tự khóa tài khoản đang đăng nhập.' });
  const wid = req.user.workshopId || DEFAULT_WORKSHOP_ID;
  const [userRows] = await getPool().query('SELECT id, email, full_name, role, password_hash, active, created_at, updated_at FROM users WHERE id = ? AND workshop_id = ? LIMIT 1', [req.params.id, wid]);
  const changedUser = userRows[0];
  if (!changedUser) return res.status(404).json({ error: 'Không tìm thấy tài khoản trong xưởng của bạn.' });
  await getPool().query('UPDATE users SET approval_status = ?, active = FALSE, odoo_sync_status = ? WHERE id = ? AND workshop_id = ?', [active ? 'APPROVED' : 'SUSPENDED', 'PENDING_SYNC', changedUser.id, wid]);
  await enqueueOdooSync('users', changedUser.id, { id: changedUser.id, email: changedUser.email, operation: 'REGISTER_USER' }, wid);
  try { if (hasOdooConfig()) await syncRegisteredUser(changedUser.id, wid); }
  catch (error) { console.warn('Account approval queued:', error.message); }
  await createAudit({ actor: auditActor(req.user), action: active ? 'USER_ACTIVATED' : 'USER_SUSPENDED', entity: 'users', recordId: req.params.id, workshopId: wid, afterData: { active } });
  const [state] = await getPool().query('SELECT active, approval_status, odoo_sync_status FROM users WHERE id = ? AND workshop_id = ?', [changedUser.id, wid]);
  res.json({ ok: true, active: state[0].active, approvalStatus: state[0].approval_status, odooSyncStatus: state[0].odoo_sync_status });
});
app.get('/api/role-permissions', requireAuth, requireOwner, (req, res) => res.json(Object.entries(roleCaps).map(([role, capability]) => ({ role, label: roles[role].label, ...permissionsFor(role, req.user.workshopId), availableEntities: capability.entities, availableActions: capability.actions }))));
app.put('/api/role-permissions/:role', requireAuth, requireOwner, async (req,res) => {
  const role = req.params.role, cap = roleCaps[role], wid = req.user.workshopId;
  if (!cap) throw businessError('Vai trò không được tùy chỉnh.');
  const entities = [...new Set(req.body.entities || [])], actions = [...new Set(req.body.actions || [])];
  if (entities.some(item => !cap.entities.includes(item)) || actions.some(item => !cap.actions.includes(item))) throw businessError('Không cấp quyền vượt vai trò.');
  await getPool().query('INSERT INTO workshop_role_permissions (workshop_id,role,entities,actions) VALUES (?,?,CAST(? AS JSON),CAST(? AS JSON)) ON CONFLICT (workshop_id,role) DO UPDATE SET entities=EXCLUDED.entities,actions=EXCLUDED.actions,updated_at=CURRENT_TIMESTAMP', [wid,role,JSON.stringify(entities),JSON.stringify(actions)]);
  tenantPermissions.set(`${wid}:${role}`,{entities,actions});
  await createAudit({ actor:auditActor(req.user), action:'ROLE_PERMISSIONS_UPDATED',entity:'role_permissions',recordId:role,workshopId:wid,afterData:{role,entities,actions} });
  res.json({role,entities,actions});
});
app.post('/api/invitations',requireAuth,requireOwner,async(req,res)=>{
  const email=normalizeEmail(req.body.email),role=String(req.body.role||'');
  if (!validEmail(email)||!['ACCOUNTANT','WAREHOUSE','WORKSHOP'].includes(role)) throw businessError('Nhập email và vai trò nhân viên.');
  const token=randomBytes(32).toString('hex'),id=randomUUID();
  await getPool().query("INSERT INTO user_invitations (id,workshop_id,email,role,token_hash,expires_at,created_by) VALUES (?,?,?,?,?,CURRENT_TIMESTAMP + INTERVAL '7 days',?)",[id,req.user.workshopId,email,role,createHash('sha256').update(token).digest('hex'),req.user.id]);
  await createAudit({actor:auditActor(req.user),action:'MEMBER_INVITED',entity:'users',recordId:id,afterData:{email,role}});
  res.status(201).json({path:`/register?invite=${token}`,email,role,expiresInDays:7});
});
app.get('/api/invitations/:token',async(req,res)=>{
  const [rows]=await getPool().query('SELECT i.email,i.role,w.name FROM user_invitations i JOIN workshops w ON w.id=i.workshop_id WHERE i.token_hash=? AND i.used_at IS NULL AND i.expires_at>CURRENT_TIMESTAMP',[createHash('sha256').update(req.params.token).digest('hex')]);
  if(!rows[0]) throw businessError('Lời mời đã dùng hoặc hết hạn.',404);
  res.json({email:rows[0].email,role:rows[0].role,workshopName:rows[0].name});
});
app.get('/api/stock-references',requireAuth,async(req,res)=>{
  if(!canEntity(req.user,'stock-movements')||!canAct(req,'read')) throw businessError('Không có quyền xem tham chiếu kho.',403);
  const invoices=(await listRecords('invoices',req.user.workshopId)).filter(active);
  res.json(invoices.map(row=>({id:row.id,code:row.code,direction:row.direction,counterparty:row.counterparty,items:(row.items||[]).map(item=>({name:item.name,materialId:item.materialId,productId:item.productId,quantity:item.quantity,unit:item.unit}))})));
});
app.get('/api/reports/sme',requireAuth,async(req,res)=>{
  if(!['OWNER','ACCOUNTANT'].includes(req.user.role)||!canEntity(req.user,'transactions')||!canAct(req,'read')) throw businessError('Không có quyền xem báo cáo.',403);
  res.json(await buildSmeReport(req.user.workshopId,String(req.query.from||''),String(req.query.to||'')));
});


const dashboardCache = new Map();
app.get('/api/dashboard', requireAuth, async (req, res) => {
  if (!canAct(req, 'read') || !canEntity(req.user, 'dashboard')) return res.status(403).json({ error: 'Bạn không có quyền xem bảng điều hành.' });
  const wid = req.user.workshopId || DEFAULT_WORKSHOP_ID;
  const query = Object.fromEntries(['from', 'to', 'chartFrom', 'chartTo', 'chartMode'].map((key) => [key, String(req.query[key] || '')]));
  const cacheKey = JSON.stringify([wid, query]);
  const cached = dashboardCache.get(cacheKey);
  if (cached && cached.expires > Date.now() && cached.revision === recordRevision(wid)) return res.json(cached.value);
  const revision = recordRevision(wid);
  const [data, queue, odoo] = await Promise.all([
    getCounts(wid),
    getPool().query("SELECT COUNT(*) AS total FROM odoo_sync_jobs WHERE status IN ('PENDING', 'PENDING_RETRY', 'PENDING_MAPPING') AND workshop_id = ?", [wid]),
    odooStatus(),
  ]);
  const value = dashboardSnapshot(data, query, { odoo, pendingOdoo: Number(queue[0][0]?.total || 0) });
  dashboardCache.set(cacheKey, { value, expires: Date.now() + 45000, revision });
  if (dashboardCache.size > 500) dashboardCache.delete(dashboardCache.keys().next().value);
  res.json(value);
});

app.get('/api/integrations/odoo/status', requireAuth, async (_req, res) => res.json(await odooStatus()));
app.get('/api/integrations/status', requireAuth, async (_req, res) => {
  const wid = _req.user?.workshopId || DEFAULT_WORKSHOP_ID;
  const status = await odooStatus();
  const [queue] = await getPool().query("SELECT status, COUNT(*) AS total FROM odoo_sync_jobs WHERE workshop_id = ? GROUP BY status", [wid]);
  const company = status.connected ? await companyForWorkshop(wid).catch(()=>null) : null;
  const currency = company ? await currencyStatus(company.id).catch((error) => ({ready:false,message:error.message})) : null;
  res.json({ odoo: status, company, currency, smtp: smtpStatus(), odooQueue: Object.fromEntries(queue.map((row) => [row.status, Number(row.total)])), tax: { type: 'MOCK', label: 'API thuế giả lập', url: taxApiUrl }, mode: 'DEMO' });
});
app.post('/api/integrations/odoo/company',requireAuth,requireOwner,async(req,res)=>{
  try { const result=await provisionCompany(auditActor(req.user)); await createAudit({actor:auditActor(req.user),action:'ODOO_COMPANY_LINKED',entity:'integrations',afterData:result}); res.json(result); }catch(error){ if(error.code==='ECONNREFUSED'||!error.status) throw businessError('Odoo chưa sẵn sàng. Dữ liệu trong ứng dụng đã được giữ lại.',409); throw error; }
});
app.post('/api/integrations/odoo/currency/refresh', requireAuth, requireOwner, async (req,res) => {
  try { const company=await companyForWorkshop(req.user.workshopId); const result=await configureOdooVnd({companyId:company.id}); await createAudit({actor:auditActor(req.user),action:'ODOO_CURRENCY_CONFIGURED',entity:'integrations',workshopId:req.user.workshopId,afterData:result}); res.json(result); }
  catch(error){res.status(409).json({error:`Chưa cập nhật tỷ giá: ${error.message}`});}
});
app.get('/api/integrations/odoo/queue', requireAuth, requireOwner, async (req, res) => {
  const wid = req.user.workshopId || DEFAULT_WORKSHOP_ID;
  const [rows] = await getPool().query("SELECT q.id,q.operation,q.entity,q.record_id,q.status,q.attempts,q.last_error,q.created_at,q.updated_at,r.data AS record_data,u.full_name FROM odoo_sync_jobs q LEFT JOIN records r ON r.workshop_id=q.workshop_id AND r.entity=q.entity AND r.record_id=q.record_id LEFT JOIN users u ON q.entity='users' AND u.workshop_id=q.workshop_id AND u.id=q.record_id WHERE q.workshop_id=? ORDER BY q.created_at DESC",[wid]);
  res.json(rows.map(({record_data,full_name,...row}) => { const value = record_data ? decodeData(record_data) : {}; return {...row,recordCode:value.code || value.name || full_name}; }));
});
app.post('/api/integrations/odoo/enqueue-unsynced', requireAuth, requireOwner, async (req, res) => {
  const connection = await odooStatus();
  if (!connection.connected) return res.status(409).json({ error: `Odoo is not ready: ${connection.label}.` });
  const result = await enqueueFullOdooBackfill(req.user.workshopId);
  await createAudit({ actor: auditActor(req.user), action: 'ODOO_BACKFILL_ENQUEUED', entity: 'odoo_sync_jobs', afterData: result });
  res.json(result);
});
app.post('/api/integrations/odoo/sync-pending', requireAuth, requireOwner, async (_req, res) => {
  let result;
  try { result = await syncOdooJobs({ statuses: ['PENDING', 'PENDING_RETRY', 'PENDING_MAPPING'], limit: 50, workshopId: _req.user.workshopId }); }
  catch (error) { return res.status(409).json({ error: error.message }); }
  await createAudit({ actor: auditActor(_req.user), action: 'ODOO_SYNC_ATTEMPT', entity: 'odoo_sync_jobs', afterData: result });
  res.json(result);
});

app.get('/api/audit-logs', requireAuth, requireOwner, async (req, res) => res.json(await listAudit(req.user.workshopId || DEFAULT_WORKSHOP_ID, Math.min(100000, Math.max(1, Number(req.query.limit || 100000))))));

app.post('/api/transfers', requireAuth, async (req, res) => {
  if (req.user.role === 'WORKSHOP') return res.status(403).json({ error: 'Vai trò hiện tại không được ghi nhận chuyển tiền.' });
  if (!canEntity(req.user, 'transactions') || !canAct(req, 'create')) return res.status(403).json({ error: 'Vai trò hiện tại không được tạo giao dịch.' });
  const amount = Math.round(finiteAmount(req.body?.amount));
  const fromId = String(req.body?.fromAccountId || ''); const toId = String(req.body?.toAccountId || '');
  if (!fromId || !toId || fromId === toId || amount <= 0) return res.status(400).json({ error: 'Chọn hai tài khoản khác nhau và nhập số tiền lớn hơn 0.' });
  const wid = req.user.workshopId || DEFAULT_WORKSHOP_ID;
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const accounts = await listRecords('cash-accounts', wid, connection);
    const from = accounts.find((row) => row.id === fromId); const to = accounts.find((row) => row.id === toId);
    if (!from || !to) { await connection.rollback(); return res.status(404).json({ error: 'Không tìm thấy tài khoản tiền.' }); }
    if ((from.ownerScope || 'BUSINESS') !== (to.ownerScope || 'BUSINESS')) { await connection.rollback(); return res.status(400).json({ error: 'Chuyển nội bộ chỉ áp dụng giữa hai tài khoản cùng phạm vi. Tiền chủ nạp/rút hoặc chi cá nhân cần phân loại riêng.' }); }
    const group = randomUUID(); const date = String(req.body.date || businessDate());
    const common = { amount, date, direction: 'TRANSFER', classification: 'INTERNAL_TRANSFER', status: 'CONFIRMED', transferGroup: group, description: String(req.body.note || 'Chuyển tiền nội bộ'), workshopId: wid };
    const outgoing = await saveRecord('transactions', { ...common, accountId: from.id, accountName: from.name, counterparty: to.name, transferSide: 'OUT' }, req.user.id, wid, 'LOCAL_DEMO', connection);
    const incoming = await saveRecord('transactions', { ...common, accountId: to.id, accountName: to.name, counterparty: from.name, transferSide: 'IN' }, req.user.id, wid, 'LOCAL_DEMO', connection);
    await updateCashAccount(connection, req.user.id, { accountId: from.id, delta: -amount }, wid);
    await updateCashAccount(connection, req.user.id, { accountId: to.id, delta: amount }, wid);
    await connection.commit();
    await createAudit({ actor: auditActor(req.user), action: 'INTERNAL_TRANSFER_CREATED', entity: 'transactions', recordId: group, workshopId: wid, afterData: { outgoing, incoming } });
    res.status(201).json({ transferGroup: group, transactions: [outgoing, incoming] });
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
});

app.get('/api/reports/books', requireAuth, async (req, res) => {
  if (!['OWNER', 'ACCOUNTANT'].includes(req.user.role) || !canAct(req, 'read')) return res.status(403).json({ error: 'Không có quyền xem sổ kế toán.' });
  res.json(await buildBooks(req.user.workshopId, String(req.query.from || ''), String(req.query.to || '')));
});

app.get('/api/workshop-members', requireAuth, async (req, res) => {
  if (!canEntity(req.user, 'production-orders') || !canAct(req, 'read')) return res.status(403).json({ error: 'Không có quyền xem người phụ trách.' });
  const [rows] = await getPool().query("SELECT id, full_name FROM users WHERE workshop_id = ? AND active = TRUE AND approval_status = 'APPROVED' ORDER BY full_name", [req.user.workshopId || DEFAULT_WORKSHOP_ID]);
  res.json(rows.map((row) => ({ id: row.id, name: row.full_name })));
});

app.get('/api/:entity/:id/details', requireAuth, requireEntity, async (req, res) => {
  if (!canAct(req, 'read')) return res.status(403).json({ error: 'Bạn không có quyền xem chứng từ.' });
  const { entity, id } = req.params, wid = req.user.workshopId || DEFAULT_WORKSHOP_ID;
  let record = await getRecord(entity, id, wid);
  if (!record) return res.status(404).json({ error: 'Không tìm thấy chứng từ.' });
  if (['WORKSHOP','WAREHOUSE'].includes(req.user.role)) {
    const job = entity === 'production-orders' ? record : record.productionOrderId ? await getRecord('production-orders', record.productionOrderId, wid) : null;
    if (req.user.role === 'WORKSHOP' && entity !== 'materials' && (!job || ![req.user.id, req.user.name].includes(job.assignedTo))) return res.status(403).json({ error: 'Bạn chỉ được xem lệnh và chứng từ được phân công.' });
    const fields = ['materials','products'].includes(entity) ? ['id','code','name','unit','stock','minStock','category','trackInventory'] : entity === 'production-orders' ? ['id','code','productId','bom','productName','quantity','stage','progress','laborHours','dueDate','status','assignedTo'] : entity === 'labor-logs' ? ['id','productionOrderId','employeeName','stage','hours','date','note'] : ['id','code','materialId','materialName','quantity','unit','type','productionOrderId','date','status','note'];
    record = Object.fromEntries(fields.filter((key) => record[key] !== undefined).map((key) => [key, record[key]]));
  }
  if (['WORKSHOP','WAREHOUSE'].includes(req.user.role) && ['production-orders','stock-movements','labor-logs'].includes(entity)) record=operationalView(entity,record,req.user.role);
  const refIds = [...new Set(['counterpartyId', 'customerId', 'supplierId', 'productionOrderId', 'paymentId', 'invoiceId', 'accountId', 'quotationId', 'materialId', 'bomId', 'parentQuoteId'].map((key) => record[key]).filter(Boolean))];
  const [references] = refIds.length ? await getPool().query('SELECT entity, record_id, data FROM records WHERE workshop_id = ? AND record_id IN (?)', [wid, refIds]) : [[]];
  const lookup = Object.fromEntries(references.map((row) => { const value = decodeData(row.data); return [row.record_id, { code: value.code, name: value.name || value.productName || value.counterparty, taxCode: value.taxCode }]; }));
  const [history] = await getPool().query('SELECT id, actor_name, actor_role, action, reason, created_at FROM audit_logs WHERE workshop_id = ? AND entity = ? AND record_id = ? ORDER BY created_at DESC LIMIT 100', [wid, entity, id]);
  let allocations = [];
  if (['invoices', 'payments'].includes(entity)) {
    const field = entity === 'invoices' ? 'invoiceId' : 'paymentId';
    const [rows] = await getPool().query(`SELECT a.record_id, a.data, p.data AS payment_data, i.data AS invoice_data FROM records a LEFT JOIN records p ON p.workshop_id = a.workshop_id AND p.entity = 'payments' AND p.record_id = a.data->>'paymentId' LEFT JOIN records i ON i.workshop_id = a.workshop_id AND i.entity = 'invoices' AND i.record_id = a.data->>'invoiceId' WHERE a.workshop_id = ? AND a.entity = 'payment-allocations' AND a.data->>'${field}' = ? ORDER BY a.created_at DESC`, [wid, id]);
    allocations = rows.map((row) => ({ ...decodeData(row.data), id: row.record_id, paymentCode: row.payment_data ? decodeData(row.payment_data).code : 'Phiếu thanh toán', invoiceCode: row.invoice_data ? decodeData(row.invoice_data).code : 'Hóa đơn' }));
  }
  res.json({ record, references: lookup, allocations, history: history.map((row) => ({ id: row.id, actorName: row.actor_name, role: row.actor_role, action: row.action, reason: row.reason, createdAt: row.created_at })) });
});

app.get('/api/:entity', requireAuth, requireEntity, async (req, res) => {
  if (!canAct(req, 'read')) return res.status(403).json({ error: 'Vai trò hiện tại không có quyền xem.' });
  const wid = req.user.workshopId || DEFAULT_WORKSHOP_ID;
  let rows = await listRecords(req.params.entity, wid);
  const q = String(req.query.q || '').trim().toLowerCase();
  const status = String(req.query.status || '');
  if (req.user.role === 'WORKSHOP' && req.params.entity === 'production-orders') {
    rows = rows.filter((row) => row.assignedTo === req.user.name || row.assignedTo === req.user.id)
;
  }
  if (req.user.role === 'WORKSHOP' && ['stock-movements', 'labor-logs'].includes(req.params.entity)) {
    const jobs = await listRecords('production-orders', wid);
    const assignedIds = new Set(jobs.filter((job) => job.assignedTo === req.user.name || job.assignedTo === req.user.id).map((job) => job.id));
    rows = rows.filter((row) => assignedIds.has(row.productionOrderId));
    if (req.params.entity === 'labor-logs') rows = rows.map(({ id, productionOrderId, employeeName, stage, hours, date, note }) => ({ id, productionOrderId, employeeName, stage, hours, date, note }));
    else rows = rows.map(({ id, code, materialId, materialName, quantity, unit, type, productionOrderId, date, status, note, attachmentName }) => ({ id, code, materialId, materialName, quantity, unit, type, productionOrderId, date, status, note, attachmentName }));
  }
  if (['WORKSHOP','WAREHOUSE'].includes(req.user.role) && ['materials','products'].includes(req.params.entity)) rows = rows.map(({ id, code, name, unit, stock, minStock, category, trackInventory }) => ({ id, code, name, unit, stock, minStock, category, trackInventory }));
  const referenceKeys = { invoiceId: 'invoiceCode', paymentId: 'paymentCode', productionOrderId: 'productionOrderCode', quotationId: 'quotationCode', materialId: 'materialCode', accountId: 'accountName', bomId: 'bomCode', parentQuoteId: 'parentQuoteCode', counterpartyId: 'counterparty' };
  const referenceIds = [...new Set(rows.flatMap((row) => Object.keys(referenceKeys).map((key) => row[key]).filter(Boolean)))];
  if (referenceIds.length) {
    const [references] = await getPool().query('SELECT record_id, data FROM records WHERE workshop_id = ? AND record_id IN (?)', [wid, referenceIds]);
    const lookup = new Map(references.map((row) => [row.record_id, decodeData(row.data)]));
    rows = rows.map((row) => { const value = { ...row }; for (const [key, label] of Object.entries(referenceKeys)) { const ref = lookup.get(row[key]); if (ref) value[label] = label === 'accountName' || label === 'counterparty' ? ref.name : ref.code || ref.name || ref.productName; } return value; });
  }
  if (req.user.role === 'WAREHOUSE' && req.params.entity === 'production-orders') rows=rows.map(({laborRate,costEstimate,plannedMachineCost,totalCost,unitCost,...row})=>({...row,bom:row.bom?{...row.bom,items:(row.bom.items||[]).map(({unitCost,amount,...item})=>item),laborRate:undefined,materialCost:undefined,machineCost:undefined}:null}));
  rows=rows.filter(row=>row.status!=='DEMO_ARCHIVED');
  if (req.user.role === 'WAREHOUSE' && req.params.entity === 'stock-movements') rows=rows.map(({unitCost,amount,stockValueBefore,stockValueAfter,...row})=>row);
  if (q) rows = rows.filter((row) => JSON.stringify(row).toLowerCase().includes(q));
  if (status) rows = rows.filter((row) => row.status === status);
if(['WORKSHOP','WAREHOUSE'].includes(req.user.role)&&['production-orders','stock-movements','labor-logs'].includes(req.params.entity)) rows=rows.map(row=>operationalView(req.params.entity,row,req.user.role));
res.json(rows);
});

app.post('/api/:entity', requireAuth, requireEntity, async (req, res) => {
  const entity = req.params.entity;
  if (entity === 'tax-rules' && req.user.role !== 'OWNER') return res.status(403).json({ error: 'Chỉ Chủ xưởng được sửa quy tắc thuế.' });
  const workshopMovement = entity === 'stock-movements' && ['WORKSHOP','WAREHOUSE'].includes(req.user.role);
  const workshopLaborLog = entity === 'labor-logs' && req.user.role === 'WORKSHOP';
  const requiredCreateAction = workshopMovement ? 'record-movement' : workshopLaborLog ? 'record-labor' : 'create';
  if (!canAct(req, requiredCreateAction)) return res.status(403).json({ error: 'Vai trò hiện tại không được tạo dữ liệu ở phân hệ này.' });
  const wid = req.user.workshopId || DEFAULT_WORKSHOP_ID;
  if (entity === 'stock-movements') return res.status(201).json(operationalView(entity,await createStockMovement(req.body,auditActor(req.user)),req.user.role));
  if (entity === 'opening-balances') return res.status(201).json(await createOpeningBalance(req.body,auditActor(req.user)));
  let value;
  try { value = normalizeRecord({ ...req.body, id: undefined, workshopId: wid }); }
  catch (error) { return res.status(400).json({ error: error.message }); }
  value = await validateMaster(entity,value,null,auditActor(req.user));
  if (entity === 'boms') value = await normalizeBom(value,wid);
  if (entity === 'tax-rules') { value.vatRate = Number(value.vatRate || 0); value.pitRate = Number(value.pitRate || 0); value.taxRate = value.vatRate + (value.taxMode === 'HKD_REVENUE' ? value.pitRate : 0); if (!Number.isFinite(value.taxRate) || value.taxRate < 0 || value.taxRate > 100) throw businessError('Thuế suất không hợp lệ.'); }
  if (entity === 'quotations') value = await normalizeQuotation(value,wid);

  if (entity === 'invoices') {
    value = await normalizeInvoice({ ...req.body, workshopId: wid }, wid);
    value.paidAmount = 0; value.settledAmount = 0; value.openBalance = finiteAmount(value.total); value.paymentStatus = 'UNPAID';
    value.status = 'REVIEW_REQUIRED'; value.verification ||= 'Chờ rà soát thủ công';
    value.statusHistory = [{ status: value.status, at: new Date().toISOString(), actor: req.user.name, note: 'Tạo hóa đơn; chờ rà soát thủ công.' }];
  }
  if (entity === 'tax-periods' && (req.user.role !== 'OWNER' || value.status === 'LOCKED')) throw businessError('Chỉ Chủ xưởng tạo kỳ mở; dùng thao tác khóa kỳ.', 403);
  if (entity === 'quotations') { value.status = 'DRAFT'; value.version = 1; }
  if (entity === 'production-orders') {
    if(value.assignedTo){const [assigned]=await getPool().query('SELECT id FROM users WHERE workshop_id=? AND active=TRUE AND (id=? OR full_name=?)',[wid,value.assignedTo,value.assignedTo]);if(!assigned[0])throw businessError('Người phụ trách không thuộc doanh nghiệp.');}
    if(value.productId){const product=await getRecord('products',value.productId,wid);if(!product)throw businessError('Sản phẩm không thuộc doanh nghiệp.');value.productName=product.name;}
    if(value.bomId){const bom=await getRecord('boms',value.bomId,wid);if(!bom||!active(bom)||bom.productId&&bom.productId!==value.productId)throw businessError('Định mức không khớp sản phẩm.');value.bom=structuredClone(bom);value.laborRate=bom.laborRate;value.plannedLaborHours=Number(bom.laborHours||0)*Number(value.quantity||0);value.plannedMachineCost=Number(bom.machineCost||0)*Number(value.quantity||0);}
    value.quantity=value.quantity??1;if(!Number.isFinite(Number(value.quantity))||Number(value.quantity)<=0)throw businessError('Số lượng lệnh phải lớn hơn 0.');if(!String(value.productName||'').trim())throw businessError('Nhập sản phẩm hoặc dịch vụ cho lệnh.');value.code ||= `SX-${Date.now()}`;
    value.status='DRAFT'; value.progress=0; value.laborHours=0; value.date ||= businessDate(); if(value.productId && !(await getRecord('products',value.productId,wid))) throw businessError('Sản phẩm không thuộc doanh nghiệp.'); }
  if (entity === 'payments') { value.allocatedAmount = 0; value.unallocatedAmount = finiteAmount(value.amount); value.status = 'CONFIRMED'; if (finiteAmount(value.amount) <= 0) throw businessError('Số tiền phải lớn hơn 0.'); }
  if (['transactions', 'payments', 'invoices', 'stock-movements', 'labor-logs', 'payment-allocations', 'reconciliations'].includes(entity)) value.date ||= businessDate();
  if (entity === 'tax-periods') { if (!/^\d{4}-\d{2}-\d{2}$/.test(value.startDate || '') || !/^\d{4}-\d{2}-\d{2}$/.test(value.endDate || '') || value.endDate < value.startDate) throw businessError('Nhập ngày bắt đầu/kết thúc kỳ hợp lệ.'); value.status = 'OPEN'; }
  if (entity === 'reconciliations') value.status = 'UNRESOLVED';
  if (entity === 'cash-accounts') {
    value.openingBalance = Math.round(finiteAmount(value.openingBalance ?? value.balance));
    value.balance = value.openingBalance;
  }
  if (entity === 'transactions' && !['INCOME', 'EXPENSE', 'TRANSFER'].includes(value.direction)) return res.status(400).json({ error: 'Chọn loại giao dịch thu, chi hoặc chuyển nội bộ.' });
  if (entity === 'payments' && !['RECEIVED', 'PAID'].includes(value.direction)) return res.status(400).json({ error: 'Chọn chiều thanh toán thu hoặc chi.' });
  if (['transactions', 'payments'].includes(entity) && !value.accountId) return res.status(400).json({ error: 'Chọn tài khoản tiền để cập nhật số dư.' });
  let saved;
  if (entity === 'invoices') {
    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      saved = await saveRecord(entity, value, req.user.id, wid, 'LOCAL_DEMO', connection);
      await updateInvoicePartner(connection, req.user.id, saved, finiteAmount(saved.total), wid);
      await connection.commit();
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  } else if (entity === 'payment-allocations') {
    saved = await allocatePayment(value, auditActor(req.user));
  } else if (entity === 'transactions' || entity === 'payments' || entity === 'labor-logs') {
    if (entity === 'transactions' && value.direction === 'TRANSFER') return res.status(400).json({ error: 'Để chuyển tiền nội bộ, hãy dùng thao tác “Chuyển nội bộ” để tạo cặp giao dịch cân bằng.' });
    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      if (entity === 'transactions') {
        const selectedAccount = value.accountId ? await getRecord('cash-accounts', value.accountId, wid, connection) : null;
        if (value.accountId && !selectedAccount) { await connection.rollback(); return res.status(400).json({ error: 'Không tìm thấy tài khoản tiền đã chọn.' }); }
        if (selectedAccount) value.accountName = selectedAccount.name;
        if (!value.classification || value.classification === 'UNCLASSIFIED') value = await classifyWithRules(value, wid);
        value.classification ||= 'UNCLASSIFIED';
        if (!classificationCompatible(value.direction, value.classification)) { await connection.rollback(); return res.status(400).json({ error: 'Nhóm phân loại không khớp chiều thu/chi.' }); }
        value.status ||= 'NEEDS_REVIEW';
        saved = await saveRecord(entity, value, req.user.id, wid, 'LOCAL_DEMO', connection);
        const delta = value.direction === 'INCOME' ? finiteAmount(value.amount) : -finiteAmount(value.amount);
        if (value.accountId || value.accountName) await updateCashAccount(connection, req.user.id, { accountId: value.accountId, accountName: value.accountName, delta }, wid);
      } else if (entity === 'payments') {
        const selectedAccount = value.accountId ? await getRecord('cash-accounts', value.accountId, wid, connection) : null;
        if (value.accountId && !selectedAccount) { await connection.rollback(); return res.status(400).json({ error: 'Không tìm thấy tài khoản tiền đã chọn.' }); }
        if (selectedAccount) value.accountName = selectedAccount.name;
        saved = await saveRecord(entity, value, req.user.id, wid, 'LOCAL_DEMO', connection);
        const isReceipt = value.direction === 'RECEIVED';
        const transaction = await saveRecord('transactions', { date: value.date, description: `Thanh toán ${value.code || saved.id} · ${value.counterparty || ''}`, counterparty: value.counterparty, amount: finiteAmount(value.amount), direction: isReceipt ? 'INCOME' : 'EXPENSE', classification: 'UNCLASSIFIED', status: 'NEEDS_REVIEW', accountId: value.accountId || '', accountName: value.accountName || '', paymentId: saved.id, source: 'PAYMENT', workshopId: wid }, req.user.id, wid, 'LOCAL_DEMO', connection);
        saved = { ...saved, transactionId: transaction.id };
        await saveRecord(entity, saved, req.user.id, wid, 'LOCAL_DEMO', connection);
        if (value.accountId || value.accountName) await updateCashAccount(connection, req.user.id, { accountId: value.accountId, accountName: value.accountName, delta: (isReceipt ? 1 : -1) * finiteAmount(value.amount) }, wid);
      } else {
        const job = value.productionOrderId ? await getRecordForUpdate('production-orders', value.productionOrderId, wid, connection) : null;
        if (!job) { await connection.rollback(); return res.status(404).json({ error: 'Chọn lệnh sản xuất hợp lệ.' }); }
        if (workshopLaborLog && job.assignedTo !== req.user.name && job.assignedTo !== req.user.id) { await connection.rollback(); return res.status(403).json({ error: 'Bạn chỉ được ghi giờ công cho lệnh được phân công.' }); }
        const hours = finiteAmount(value.hours);
        if (hours <= 0) { await connection.rollback(); return res.status(400).json({ error: 'Số giờ công phải lớn hơn 0.' }); }
        if (!['DRAFT','IN_PROGRESS'].includes(job.status)) throw businessError('Lệnh không nhận thêm giờ công.',409);
        const approvedRate = finiteAmount(job.laborRate);
        if (req.user.role === 'WORKSHOP' && value.hourlyRate !== undefined && Number(value.hourlyRate) !== approvedRate) throw businessError('Thợ chỉ ghi giờ công; đơn giá lấy từ lệnh đã duyệt.',403);
        if (value.hourlyRate !== undefined && (!Number.isFinite(Number(value.hourlyRate)) || Number(value.hourlyRate)<0)) throw businessError('Đơn giá giờ công phải không âm.');
        const daily=(await listRecords('labor-logs',wid,connection)).filter(row=>active(row)&&row.employeeName===req.user.name&&row.date===(value.date||businessDate())).reduce((sum,row)=>sum+finiteAmount(row.hours),0);
        if (hours > 24 || daily+hours>24) throw businessError('Tổng giờ công của một người trong ngày không quá 24 giờ.');
        value.hourlyRate = req.user.role === 'WORKSHOP' ? approvedRate : finiteAmount(value.hourlyRate ?? job.laborRate); value.employeeName = req.user.name; value.date ||= businessDate();
        saved = await saveRecord(entity, value, req.user.id, wid, 'LOCAL_DEMO', connection);
        await saveRecord('production-orders', { ...job, laborHours: finiteAmount(job.laborHours) + hours, workshopId: wid }, req.user.id, wid, 'LOCAL_DEMO', connection);
      }
      await connection.commit();
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  } else saved = await saveRecord(entity, value, req.user.id, wid, 'LOCAL_DEMO');
  await createAudit({ actor: auditActor(req.user), action: 'RECORD_CREATED', entity, recordId: saved.id, workshopId: wid, afterData: saved });
  res.status(201).json(operationalView(entity,saved,req.user.role));
});

app.put('/api/:entity/:id', requireAuth, requireEntity, async (req, res) => {
  if (!canAct(req, 'update')) return res.status(403).json({ error: 'Vai trò hiện tại không được sửa dữ liệu này.' });
  const entity = req.params.entity;
  if (entity === 'tax-rules' && req.user.role !== 'OWNER') return res.status(403).json({ error: 'Chỉ Chủ xưởng được sửa quy tắc thuế.' });
  if (['transactions', 'payments', 'payment-allocations', 'stock-movements', 'labor-logs','opening-balances'].includes(entity)) return res.status(409).json({ error: 'Bản ghi đã ghi sổ không sửa trực tiếp. Hãy dùng thao tác phân loại, điều chỉnh hoặc hủy có lưu vết.' });
  if (entity === 'tax-periods' && req.user.role !== 'OWNER') return res.status(403).json({ error: 'Chỉ chủ xưởng được quản lý trạng thái kỳ.' });
  const wid = req.user.workshopId || DEFAULT_WORKSHOP_ID;
  const before = await getRecord(entity, req.params.id, wid);
  if (!before) return res.status(404).json({ error: 'Không tìm thấy dữ liệu.' });
  if (!active(before)) throw businessError('Không sửa dữ liệu đã hủy.', 409);
  if (before.status === 'LOCKED' || before.periodStatus === 'LOCKED') return res.status(409).json({ error: 'Dữ liệu thuộc kỳ đã khóa. Hãy mở khóa theo quy trình được cấp quyền.' });
  let value;
  try { value = normalizeRecord({ ...before, ...req.body, id: before.id, workshopId: wid }); }
  catch (error) { return res.status(400).json({ error: error.message }); }
  if (entity === 'production-orders') {
    if (req.body.productId) {const product=await getRecord('products',req.body.productId,wid);if(!product||!active(product))throw businessError('Sản phẩm không thuộc doanh nghiệp.');value.productName=product.name;}
    if (req.body.bomId && before.status==='DRAFT') {const bom=await getRecord('boms',req.body.bomId,wid);if(!bom||!active(bom)||bom.productId&&bom.productId!==value.productId)throw businessError('Định mức không khớp sản phẩm.');value.bom=structuredClone(bom);value.laborRate=bom.laborRate;value.plannedLaborHours=Number(bom.laborHours||0)*Number(value.quantity||0);value.plannedMachineCost=Number(bom.machineCost||0)*Number(value.quantity||0);}
    if (req.body.status && req.body.status !== before.status || ['progress','laborHours','actualMaterialCost','actualLaborCost','totalCost','finishedReceiptId'].some(key => Object.hasOwn(req.body,key)&&req.body[key]!==before[key])) throw businessError('Cập nhật lệnh bằng thao tác tiến độ/nghiệm thu.',409);
    if (before.status !== 'DRAFT' && ['productId','quantity','bom','bomId','laborRate','plannedMachineCost'].some(key=>Object.hasOwn(req.body,key)&&JSON.stringify(req.body[key])!==JSON.stringify(before[key]))) throw businessError('Lệnh đã bắt đầu; không sửa định mức/đơn giá trực tiếp.',409);
  }
  if (entity === 'reconciliations') { if (before.status === 'MATCHED') throw businessError('Chủ xưởng cần mở lại đối soát trước khi sửa.', 409); value.status = 'UNRESOLVED'; }
  if (entity === 'tax-periods' && req.body.status !== undefined && req.body.status !== before.status) return res.status(409).json({ error: 'Dùng thao tác khóa/mở kỳ để lưu lý do và audit log đầy đủ.' });
  value = await validateMaster(entity,value,before,auditActor(req.user));
  if (entity === 'boms') value = await normalizeBom(value,wid);
  if (entity === 'quotations') value = await normalizeQuotation(value,wid,req.body);
  if (entity === 'quotations' && ['APPROVED', 'ACCEPTED', 'SENT', 'REJECTED'].includes(before.status)) return res.status(201).json(await reviseQuotation(before.id, auditActor(req.user), value));
  if (entity === 'quotations' && req.body.status !== undefined && req.body.status !== before.status) return res.status(409).json({ error: 'Dùng thao tác gửi duyệt hoặc duyệt để đổi trạng thái báo giá.' });
  if (entity === 'invoices') {
    if ((await listRecords('stock-movements',wid)).some(row=>active(row)&&row.invoiceId===before.id)) throw businessError('Hóa đơn đã gắn phiếu kho; xử lý phiếu kho trước khi sửa.',409);
    if (!active(before)) throw businessError('Không sửa hóa đơn đã hủy.', 409);
    if (finiteAmount(before.settledAmount ?? before.paidAmount) > 0) throw businessError('Gỡ phân bổ trước khi sửa hóa đơn.', 409);
    const merged = { ...before, ...req.body };
    if (req.body.total === undefined && req.body.totalAmount === undefined) { delete merged.total; delete merged.totalAmount; }
    if (req.body.taxAmount === undefined) delete merged.taxAmount;
    value = await normalizeInvoice(merged, wid);
    if (finiteAmount(value.total) < finiteAmount(before.paidAmount)) return res.status(409).json({ error: 'Tổng hóa đơn không thể thấp hơn các khoản thanh toán đã phân bổ.' });
    const duplicate = liveRows(await listRecords(entity, wid)).some((row) => row.id !== before.id && row.code === value.code);
    if (duplicate) return res.status(409).json({ error: 'Số hóa đơn đã được sử dụng.' });
    value.status = before.status; value.statusHistory = before.statusHistory || [];
    value.paidAmount = finiteAmount(before.paidAmount); value.openBalance = finiteAmount(value.total) - value.paidAmount; value.paymentStatus = before.paymentStatus || 'UNPAID';
  }
  if (['products', 'materials'].includes(entity)) { if (req.body.inputTaxRate !== undefined) value.inputTaxRuleId = null; if (req.body.outputTaxRate !== undefined) value.outputTaxRuleId = null; }
  if (entity === 'tax-rules') { value.vatRate = Number(value.vatRate || 0); value.pitRate = Number(value.pitRate || 0); value.taxRate = value.vatRate + (value.taxMode === 'HKD_REVENUE' ? value.pitRate : 0); if (!Number.isFinite(value.taxRate) || value.taxRate < 0 || value.taxRate > 100) throw businessError('Thuế suất không hợp lệ.'); }
  if (entity === 'cash-accounts' && req.body.openingBalance !== undefined) {
    const priorOpening = finiteAmount(before.openingBalance ?? before.balance);
    const nextOpening = finiteAmount(value.openingBalance);
    value.openingBalance = nextOpening;
    value.balance = Math.round(finiteAmount(before.balance) + nextOpening - priorOpening);
  }
  let saved;
  if (entity === 'invoices') {
    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      await connection.query('SELECT pg_advisory_xact_lock(hashtext(?))', [`period:${wid}`]);
      const current = await getRecordForUpdate(entity, before.id, wid, connection);
      if (!current || !active(current) || finiteAmount(current.settledAmount ?? current.paidAmount) > 0 || current.total !== before.total || current.direction !== before.direction || current.counterparty !== before.counterparty) throw businessError('Hóa đơn vừa thay đổi. Tải lại trước khi sửa.', 409);
      saved = await saveRecord(entity, value, req.user.id, wid, 'LOCAL_DEMO', connection);
      await updateInvoicePartner(connection, req.user.id, before, -finiteAmount(before.openBalance ?? before.total), wid);
      await updateInvoicePartner(connection, req.user.id, saved, finiteAmount(saved.openBalance ?? saved.total), wid);
      await connection.commit();
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  } else if(['materials','products','customers','suppliers'].includes(entity)) saved=await transaction(wid,async connection=>{const current=await getRecordForUpdate(entity,before.id,wid,connection);if(!current)throw businessError('Danh mục không tồn tại.',404);const updated=await validateMaster(entity,{...current,...req.body,id:current.id,workshopId:wid},current,auditActor(req.user));return saveRecord(entity,updated,req.user.id,wid,connection);});
  else saved = await saveRecord(entity, value, req.user.id, wid, 'LOCAL_DEMO');
  await createAudit({ actor: auditActor(req.user), action: 'RECORD_UPDATED', entity, recordId: saved.id, workshopId: wid, beforeData: before, afterData: saved });
  res.json(saved);
});

app.delete('/api/:entity/:id', requireAuth, requireEntity, async (req, res) => {
  if (req.user.role !== 'OWNER') return res.status(403).json({ error: 'Chỉ Chủ xưởng được hủy chứng từ.' });
  const entity = req.params.entity;
  if (['payment-allocations', 'labor-logs', 'tax-periods'].includes(entity)) return res.status(409).json({ error: 'Chứng từ này cần xử lý theo luồng điều chỉnh.' });
  const wid = req.user.workshopId || DEFAULT_WORKSHOP_ID;
  const before = await getRecord(entity, req.params.id, wid);
  if (!before) return res.status(404).json({ error: 'Không tìm thấy chứng từ.' });
  if (entity === 'stock-movements') return res.json(await cancelStockMovement(before.id,auditActor(req.user),req.body.reason));
  if (entity === 'opening-balances') throw businessError('Số dư đầu kỳ cần quy trình điều chỉnh, không hủy trực tiếp.',409);
  if (entity === 'production-orders' && (before.finishedReceiptId || (await listRecords('stock-movements',wid)).some(row=>active(row)&&row.productionOrderId===before.id) || (await listRecords('labor-logs',wid)).some(row=>active(row)&&row.productionOrderId===before.id))) throw businessError('Lệnh đã phát sinh vật tư/giờ công; xử lý phát sinh trước khi hủy.',409);
  if (before.status === 'CANCELLED') return res.status(409).json({ error: 'Chứng từ đã được hủy.' });
  if (before.status === 'LOCKED' || before.periodStatus === 'LOCKED') return res.status(409).json({ error: 'Không hủy chứng từ trong kỳ đã khóa.' });
  if (['customers', 'suppliers', 'materials', 'products', 'boms', 'cash-accounts', 'branches', 'tax-rules', 'quotations', 'production-orders'].includes(entity)) {
    const [references] = await getPool().query('SELECT entity, data FROM records WHERE workshop_id = ? AND entity IN (?)', [wid, ['invoices', 'payments', 'stock-movements', 'quotations', 'boms', 'production-orders', 'transactions', 'products', 'materials']]);
    const fields = entity === 'cash-accounts' ? ['accountId', 'fromAccountId', 'toAccountId'] : entity === 'tax-rules' ? ['taxRuleId', 'inputTaxRuleId', 'outputTaxRuleId'] : entity === 'materials' ? ['materialId'] : entity === 'products' ? ['productId'] : entity === 'boms' ? ['bomId'] : entity === 'quotations' ? ['quotationId'] : entity === 'production-orders' ? ['productionOrderId'] : entity === 'branches' ? ['branchId'] : ['counterpartyId', 'customerId', 'supplierId'];
    const matches = (value) => value && typeof value === 'object' && Object.entries(value).some(([key, nested]) => fields.includes(key) && nested === before.id || typeof nested === 'object' && (Array.isArray(nested) ? nested.some(matches) : matches(nested)));
    if (references.some((reference) => { const row = decodeData(reference.data); return row.id !== before.id && active(row) && (matches(row) || ['customers', 'suppliers'].includes(entity) && row.counterparty === before.name); })) throw businessError('Danh mục đang được chứng từ sử dụng; điều chỉnh liên kết trước khi hủy.', 409);
  }
  const now = new Date().toISOString();
  const reason = String(req.body?.reason || '').trim();
  if (!reason) throw businessError('Bắt buộc nhập lý do hủy.');
  if (entity === 'invoices') return res.json(await voidInvoice(before.id, auditActor(req.user), reason, req.body?.autoUnallocate === true));
  let saved;
  if (['transactions', 'payments', 'stock-movements'].includes(entity) || entity === 'invoices') {
    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      if (entity === 'transactions') {
        const locked = await getRecordForUpdate(entity, before.id, wid, connection);
        if (!locked || locked.status === 'CANCELLED') { await connection.rollback(); return res.status(409).json({ error: 'Giao dịch đã hủy hoặc đã thay đổi.' }); }
        if (locked.status === 'LOCKED' || locked.periodStatus === 'LOCKED') { await connection.rollback(); return res.status(409).json({ error: 'Không hủy chứng từ trong kỳ đã khóa.' }); }
        if (locked.paymentId || locked.allocationId) throw businessError('Hủy phiếu thanh toán hoặc gỡ phân bổ để điều chỉnh giao dịch liên kết.', 409);
        const pair = locked.transferGroup ? liveRows(await listRecords(entity, wid, connection)).filter((row) => row.transferGroup === locked.transferGroup) : [locked];
        for (const candidate of pair) {
          const row = candidate.id === locked.id ? locked : await getRecordForUpdate(entity, candidate.id, wid, connection);
          if (!row || row.status === 'CANCELLED') continue;
          if (row.status === 'LOCKED' || row.periodStatus === 'LOCKED') { await connection.rollback(); return res.status(409).json({ error: 'Không hủy cặp chuyển tiền trong kỳ đã khóa.' }); }
          const cancelled = { ...row, status: 'CANCELLED', cancelledAt: now, cancellationReason: reason, workshopId: wid };
          await saveRecord(entity, cancelled, req.user.id, wid, 'LOCAL_DEMO', connection);
          const delta = row.direction === 'INCOME' ? -finiteAmount(row.amount) : row.direction === 'EXPENSE' ? finiteAmount(row.amount) : row.transferSide === 'IN' ? -finiteAmount(row.amount) : finiteAmount(row.amount);
          await updateCashAccount(connection, req.user.id, { accountId: row.accountId, accountName: row.accountName, delta }, wid);
        }
        saved = { ...locked, status: 'CANCELLED', cancelledAt: now, cancellationReason: reason, transferGroup: locked.transferGroup || '', workshopId: wid };
      } else if (entity === 'payments') {
        const payment = await getRecordForUpdate(entity, before.id, wid, connection);
        if (!payment || payment.status === 'CANCELLED' || payment.status === 'LOCKED' || payment.periodStatus === 'LOCKED') { await connection.rollback(); return res.status(409).json({ error: 'Phiếu thanh toán đã hủy, khóa hoặc thay đổi.' }); }
        const [allocRows] = await connection.query("SELECT data FROM records WHERE entity = ? AND workshop_id = ? AND JSON_UNQUOTE(JSON_EXTRACT(data, '$.paymentId')) = ?", ['payment-allocations', wid, payment.id]);
        const allocated = allocRows.filter((row) => active(decodeData(row.data))).reduce((sum, row) => sum + finiteAmount(decodeData(row.data).allocatedAmount), 0);
        if (allocated > 0 || finiteAmount(payment.allocatedAmount) > 0) { await connection.rollback(); return res.status(409).json({ error: 'Gỡ các khoản phân bổ trước khi hủy phiếu thanh toán.' }); }
        const linkedTransaction = payment.transactionId ? await getRecordForUpdate('transactions', payment.transactionId, wid, connection) : null;
        saved = { ...payment, status: 'CANCELLED', cancelledAt: now, cancellationReason: reason, workshopId: wid };
        await saveRecord(entity, saved, req.user.id, wid, 'LOCAL_DEMO', connection);
        if (linkedTransaction && linkedTransaction.status !== 'CANCELLED') await saveRecord('transactions', { ...linkedTransaction, status: 'CANCELLED', cancelledAt: now, cancellationReason: reason, workshopId: wid }, req.user.id, wid, 'LOCAL_DEMO', connection);
        const delta = payment.direction === 'RECEIVED' ? -finiteAmount(payment.amount) : finiteAmount(payment.amount);
        await updateCashAccount(connection, req.user.id, { accountId: payment.accountId, accountName: payment.accountName, delta }, wid);
      } else if (entity === 'stock-movements') {
        const movement = await getRecordForUpdate(entity, before.id, wid, connection);
        if (!movement || movement.status === 'CANCELLED' || movement.status === 'LOCKED' || movement.periodStatus === 'LOCKED') { await connection.rollback(); return res.status(409).json({ error: 'Phiếu kho đã hủy, khóa hoặc thay đổi.' }); }
        const materialMatch = movement.materialId ? { id: movement.materialId } : (await listRecords('materials', wid, connection)).find((row) => row.name === movement.materialName);
        const material = materialMatch ? await getRecordForUpdate('materials', materialMatch.id, wid, connection) : null;
        if (!material) { await connection.rollback(); return res.status(409).json({ error: 'Không tìm thấy vật tư để hoàn lại tồn kho.' }); }
        const delta = movement.type === 'RETURN' ? -finiteAmount(movement.quantity) : finiteAmount(movement.quantity);
        if (finiteAmount(material.stock) + delta < 0) { await connection.rollback(); return res.status(409).json({ error: 'Không hủy phiếu trả vì số vật tư đã được xuất dùng tiếp.' }); }
        saved = { ...movement, status: 'CANCELLED', cancelledAt: now, cancellationReason: reason, workshopId: wid };
        await saveRecord(entity, saved, req.user.id, wid, 'LOCAL_DEMO', connection);
        await saveRecord('materials', { ...material, stock: finiteAmount(material.stock) + delta, workshopId: wid }, req.user.id, wid, 'LOCAL_DEMO', connection);
      } else {
        const invoice = await getRecordForUpdate(entity, before.id, wid, connection);
        if (!invoice || invoice.status === 'CANCELLED' || invoice.status === 'LOCKED' || invoice.periodStatus === 'LOCKED') { await connection.rollback(); return res.status(409).json({ error: 'Hóa đơn đã hủy, khóa hoặc thay đổi.' }); }
        if (finiteAmount(invoice.paidAmount) > 0) { await connection.rollback(); return res.status(409).json({ error: 'Gỡ phân bổ thanh toán trước khi hủy hóa đơn.' }); }
        saved = { ...invoice, status: 'CANCELLED', cancelledAt: now, cancellationReason: reason, statusHistory: [...(invoice.statusHistory || []), { status: 'CANCELLED', at: now, actor: req.user.name, note: reason }], workshopId: wid };
        await saveRecord(entity, saved, req.user.id, wid, 'LOCAL_DEMO', connection);
        await updateInvoicePartner(connection, req.user.id, invoice, -finiteAmount(invoice.total), wid);
      }
      await connection.commit();
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  } else {
    saved = { ...before, status: 'CANCELLED', cancelledAt: now, cancellationReason: reason, workshopId: wid };
    await saveRecord(entity, saved, req.user.id, wid, 'LOCAL_DEMO');
  }
  await createAudit({ actor: auditActor(req.user), action: 'RECORD_CANCELLED', entity, recordId: saved.id, workshopId: wid, beforeData: before, afterData: saved });
  res.json(saved);
});

app.post('/api/:entity/:id/actions/:action', requireAuth, requireEntity, async (req, res) => {
  const { entity, id, action } = req.params;
  if (!canAct(req, action)) return res.status(403).json({ error: 'Bạn không có quyền thực hiện thao tác này.' });
  if (entity === 'production-orders' && ['start','progress','complete','receive-finished','reopen'].includes(action)) return res.json(operationalView(entity,await productionAction(id,action,req.body,auditActor(req.user)),req.user.role));
  const wid = req.user.workshopId || DEFAULT_WORKSHOP_ID;
  const before = await getRecord(entity, id, wid);
  if (!before) return res.status(404).json({ error: 'Không tìm thấy dữ liệu.' });
  if (req.user.role === 'WORKSHOP' && entity === 'production-orders' && before.assignedTo !== req.user.name && before.assignedTo !== req.user.id) return res.status(403).json({ error: 'Bạn chỉ được cập nhật lệnh sản xuất được phân công.' });
  if (entity === 'quotations' && action === 'revise') return res.status(201).json(await reviseQuotation(id, auditActor(req.user),await normalizeQuotation(before,wid,{})));
  if (entity === 'payment-allocations' && action === 'unallocate') return res.json(await unallocatePayment(id, auditActor(req.user), req.body?.reason || req.body?.note));
  if (!active(before) && action !== 'unlock') throw businessError('Không thao tác chứng từ đã hủy.', 409);
  let after = { ...before, workshopId: wid };
  let createdProduction = null;
  if (action === 'submit-for-approval' && entity === 'quotations' && before.status === 'DRAFT') after.status = 'PENDING_APPROVAL';
  else if (action === 'approve' && entity === 'quotations' && req.user.role === 'OWNER' && before.status === 'PENDING_APPROVAL') after.status = 'APPROVED';
  else if (action === 'reject' && entity === 'quotations' && req.user.role === 'OWNER' && before.status === 'PENDING_APPROVAL') { if (!String(req.body?.note || '').trim()) throw businessError('Bắt buộc nhập lý do từ chối.'); after.status = 'REJECTED'; after.rejectionNote = String(req.body?.note || ''); }
  else if (action === 'mark-sent' && entity === 'quotations' && ['OWNER', 'ACCOUNTANT'].includes(req.user.role) && before.status === 'APPROVED') { after.status = 'SENT'; after.sentAt = new Date().toISOString(); }
  else if (action === 'accept' && entity === 'quotations' && ['OWNER', 'ACCOUNTANT'].includes(req.user.role) && before.status === 'SENT') { after.status = 'ACCEPTED'; after.acceptedAt = new Date().toISOString(); }
  else if (action === 'create-production' && entity === 'quotations' && ['OWNER', 'ACCOUNTANT'].includes(req.user.role) && before.status === 'ACCEPTED') {
    if (before.productionOrderId) return res.status(409).json({ error: 'Báo giá này đã được chuyển thành lệnh sản xuất.' });
    if(req.body.assignedTo){const [assigned]=await getPool().query('SELECT id FROM users WHERE workshop_id=? AND active=TRUE AND (id=? OR full_name=?)',[wid,req.body.assignedTo,req.body.assignedTo]);if(!assigned[0])throw businessError('Người phụ trách không thuộc doanh nghiệp.');}
    const code = `SX-${new Date().getFullYear()}-${randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase()}`;
    createdProduction = { id: randomUUID(), code, quotationId: before.id, quotationCode: before.code, productName: before.title, customerName: before.customerName, quantity: finiteAmount(before.quantity), productId: before.productId || before.bom?.productId || null, bomId: before.bomId || null, bom: before.bom ? structuredClone(before.bom) : null, items: structuredClone(before.items || []), laborRate: finiteAmount(before.laborRate), plannedLaborHours: finiteAmount(before.laborHours)*finiteAmount(before.quantity), laborHours: 0, plannedMachineCost: finiteAmount(before.machineCost)*finiteAmount(before.quantity), costEstimate: finiteAmount(before.costEstimate)*finiteAmount(before.quantity), date: businessDate(), assignedTo: String(req.body?.assignedTo || ''), stage: 'Chờ phân công', progress: 0, status: 'DRAFT', dueDate: String(req.body?.dueDate || ''), workshopId: wid };
    after.productionOrderId = createdProduction.id; after.productionCreatedAt = new Date().toISOString();
  }
  else if (action === 'simulate-code' && entity === 'invoices' && invoiceDirection(before) === 'OUTPUT') {
    try {
      const response = await axios.post(`${taxApiUrl}/api/v1/invoices/issue`, { invoiceId: id, invoiceCode: before.code, total: before.total }, { timeout: 5000 });
      after.status = 'DEMO_CODE_ISSUED'; after.mockTaxCode = response.data.mockTaxCode; after.simulatedAt = response.data.issuedAt; after.verification = 'Đã mô phỏng';
    } catch { return res.status(502).json({ error: 'Không kết nối được Mock Tax API. Hóa đơn chưa được mô phỏng cấp mã.' }); }
  }
  else if (action === 'classify' && entity === 'transactions') {
    if (!classificationCompatible(before.direction, req.body?.classification)) return res.status(400).json({ error: 'Nhóm phân loại không khớp chiều thu/chi. Chuyển tiền nội bộ cần tạo qua thao tác riêng.' });
    after.classification = req.body.classification; after.category = req.body.category || after.category; after.status = 'CONFIRMED'; after.classificationSource = 'MANUAL';
  }
  else if (action === 'resolve' && entity === 'alerts') { after.status = 'RESOLVED'; after.resolutionNote = String(req.body?.note || ''); after.resolvedAt = new Date().toISOString(); }
  else if (action === 'start' && entity === 'production-orders') { after.status = 'IN_PROGRESS'; after.stage = req.body?.stage || after.stage || 'Đang sản xuất'; }
  else if (action === 'progress' && entity === 'production-orders') {
    const progress = Number(req.body?.progress);
    if (!Number.isInteger(progress) || progress < 0 || progress > 100) return res.status(400).json({ error: 'Tiến độ phải là số nguyên từ 0 đến 100.' });
    after.progress = progress; after.stage = String(req.body?.stage || after.stage || 'Đang sản xuất').trim();
    if (progress === 100) after.status = 'COMPLETED'; else if (progress > 0 && after.status === 'DRAFT') after.status = 'IN_PROGRESS';
  }
  else if (action === 'complete' && entity === 'production-orders') { after.status = 'COMPLETED'; after.progress = 100; after.stage = 'Hoàn thành'; }
  else if (action === 'reopen' && entity === 'reconciliations' && req.user.role === 'OWNER') { if (!String(req.body?.note || '').trim()) throw businessError('Nhập lý do mở lại đối soát.'); after.status = 'UNRESOLVED'; after.reopenReason = req.body.note; }
  else if (action === 'confirm' && entity === 'reconciliations') { if (before.invoiceId) { const invoice = await getRecord('invoices', before.invoiceId, wid); if (!invoice || !active(invoice) || Number(invoice.openBalance) !== 0) throw businessError('Hóa đơn chưa tất toán; cần phân bổ hoặc xử lý chênh lệch trước.', 409); after.invoiceAmount = invoice.total; after.paymentAmount = invoice.settledAmount ?? invoice.paidAmount; } else if (Number(before.invoiceAmount) !== Number(before.paymentAmount)) throw businessError('Số tiền chưa khớp; hãy xử lý chênh lệch trước khi xác nhận.', 409); after.status = 'MATCHED'; after.confirmedBy = req.user.name; after.confirmedAt = new Date().toISOString(); }
  else if (action === 'lock' && entity === 'tax-periods' && req.user.role === 'OWNER') { after.status = 'LOCKED'; after.lockedBy = req.user.name; after.lockedAt = new Date().toISOString(); }
  else if (action === 'unlock' && entity === 'tax-periods' && req.user.role === 'OWNER') {
    if (!String(req.body?.note || '').trim()) return res.status(400).json({ error: 'Nhập lý do mở khóa để lưu audit.' });
    after.status = 'OPEN'; after.unlockedBy = req.user.name; after.unlockNote = req.body.note; after.unlockedAt = new Date().toISOString();
  }
  else return res.status(400).json({ error: 'Thao tác chưa được hỗ trợ cho dữ liệu này.' });
  if (entity === 'invoices' && after.status !== before.status) after.statusHistory = [...(before.statusHistory || []), { status: after.status, at: new Date().toISOString(), actor: req.user.name, note: after.verification || after.mockTaxCode || action }];
  const saved = await transaction(wid, async (connection) => {
    const current = await getRecordForUpdate(entity, id, wid, connection);
    if (!current || current.status !== before.status || current.productionOrderId !== before.productionOrderId) throw businessError('Bản ghi vừa thay đổi; hãy tải lại.', 409);
    if (createdProduction) await saveRecord('production-orders', createdProduction, req.user.id, wid, connection);
    const value = await saveRecord(entity, after, req.user.id, wid, connection);
    await createAudit({ actor: auditActor(req.user), action: action.toUpperCase(), entity, recordId: id, workshopId: wid, beforeData: before, afterData: value, executor: connection });
    return value;
  });
  res.json(createdProduction ? { ...saved, createdProduction } : saved);
});

app.post('/api/import/transactions/preview', requireAuth, upload.single('file'), async (req, res) => {
  if (req.user.role === 'WORKSHOP' || !canEntity(req.user, 'transactions') || !canAct(req, 'create')) return res.status(403).json({ error: 'Không đủ quyền import sao kê.' });
  if (!req.file) return res.status(400).json({ error: 'Chọn file CSV hoặc XLSX.' });
  const extension = path.extname(req.file.originalname).toLowerCase();
  if (!['.csv', '.xlsx', '.xls'].includes(extension)) return res.status(415).json({ error: 'Chỉ hỗ trợ file CSV, XLS hoặc XLSX.' });
  let workbook;
  try { workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true }); }
  catch { return res.status(400).json({ error: 'Không đọc được file. Hãy kiểm tra định dạng và thử lại.' }); }
  const wid = req.user.workshopId || DEFAULT_WORKSHOP_ID;
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const sourceRows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
  const existing = liveRows(await listRecords('transactions', wid));
  const seenReferences = new Set(existing.map((item) => item.externalReference).filter(Boolean));
  const seenFingerprints = new Set(existing.map((item) => `${item.date}|${item.amount}|${String(item.description || '').trim().toLocaleLowerCase('vi')}`));
  const rows = [];
  for (const [index, row] of sourceRows.entries()) {
    const normalized = Object.fromEntries(Object.entries(row).map(([key, value]) => [key.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, ''), value]));
    const credit = parseImportedAmount(normalized.credit ?? normalized.tienvao ?? normalized.ghico);
    const debit = parseImportedAmount(normalized.debit ?? normalized.tienra ?? normalized.ghino);
    const rawAmount = normalized.amount ?? normalized.sotien ?? normalized.giaodich;
    const amount = parseImportedAmount(rawAmount || (credit > 0 ? credit : debit));
    const rawDate = normalized.date ?? normalized.ngaygiaodich ?? normalized.ngay ?? '';
    const date = parseImportedDate(rawDate);
    const description = String(normalized.description ?? normalized.noidung ?? normalized.diengiai ?? normalized.remark ?? '').trim();
    const reference = String(normalized.reference ?? normalized.transactionid ?? normalized.magiaodich ?? normalized.sogiaodich ?? '').trim();
    const rawDirection = String(normalized.direction ?? normalized.loai ?? normalized.type ?? '').toLocaleLowerCase('vi');
    const direction = credit > 0 || /thu|income|credit|ghi co|ghi có|cr\b/.test(rawDirection) ? 'INCOME' : debit > 0 || /chi|expense|debit|ghi no|ghi nợ|dr\b/.test(rawDirection) ? 'EXPENSE' : '';
    const fingerprint = `${date}|${amount}|${description.toLocaleLowerCase('vi')}`;
    const duplicate = Boolean(reference && seenReferences.has(reference)) || seenFingerprints.has(fingerprint);
    if (reference) seenReferences.add(reference); seenFingerprints.add(fingerprint);
    const candidate = { rowNumber: index + 2, date, description, amount, direction, externalReference: reference, classification: 'UNCLASSIFIED', status: 'NEEDS_REVIEW', duplicate, workshopId: wid, errors: [!date ? 'Thiếu ngày giao dịch hoặc định dạng ngày chưa hỗ trợ' : '', !description ? 'Thiếu nội dung' : '', !(amount > 0) ? 'Số tiền không hợp lệ' : '', !direction ? 'Không xác định được chiều thu/chi' : ''].filter(Boolean) };
    rows.push(await classifyWithRules(candidate, wid));
  }
  const importId = randomUUID();
  await getPool().query('INSERT INTO imports (id, workshop_id, actor_id, original_name, preview_data) VALUES (?,?,?,?,?)', [importId, wid, req.user.id, req.file.originalname, JSON.stringify(rows)]);
  res.json({ importId, fileName: req.file.originalname, total: rows.length, duplicateCount: rows.filter((row) => row.duplicate).length, errorCount: rows.filter((row) => row.errors.length).length, rows: rows.slice(0, 100) });
});
app.post('/api/import/transactions/:importId/commit', requireAuth, async (req, res) => {
  if (req.user.role === 'WORKSHOP' || !canEntity(req.user, 'transactions') || !canAct(req, 'create')) return res.status(403).json({ error: 'Không đủ quyền import sao kê.' });
  const wid = req.user.workshopId || DEFAULT_WORKSHOP_ID;
  const [imports] = await getPool().query('SELECT preview_data FROM imports WHERE id = ? AND actor_id = ? AND workshop_id = ?', [req.params.importId, req.user.id, wid]);
  if (!imports[0]) return res.status(404).json({ error: 'Không tìm thấy phiên import hoặc phiên đã hết hạn.' });
  const rows = decodeData(imports[0].preview_data);
  const includeDuplicates = Boolean(req.body.includeDuplicates);
  const accountId = String(req.body.accountId || '');
  if (!accountId) return res.status(400).json({ error: 'Chọn tài khoản tiền sẽ nhận các dòng sao kê.' });
  const connection = await getPool().getConnection(); const inserted = []; let skippedDuplicates = 0; let skippedInvalid = 0;
  try {
    await connection.beginTransaction();
    const account = await getRecord('cash-accounts', accountId, wid, connection);
    if (!account) { await connection.rollback(); return res.status(404).json({ error: 'Không tìm thấy tài khoản tiền đã chọn.' }); }
    let current = liveRows(await listRecords('transactions', wid, connection));
    for (const row of rows) {
      if (row.errors.length) { skippedInvalid += 1; continue; }
      const duplicate = Boolean(row.externalReference && current.some((item) => item.externalReference === row.externalReference)) || current.some((item) => item.date === row.date && Number(item.amount) === Number(row.amount) && String(item.description || '').trim().toLocaleLowerCase('vi') === row.description.toLocaleLowerCase('vi'));
      if (duplicate && !includeDuplicates) { skippedDuplicates += 1; continue; }
      const value = { ...row, id: randomUUID(), source: 'IMPORT', accountId, accountName: account.name, importedAt: new Date().toISOString(), duplicate: false, workshopId: wid };
      const savedRow = await saveRecord('transactions', value, req.user.id, wid, 'LOCAL_DEMO', connection);
      inserted.push(savedRow); current.push(savedRow);
      await updateCashAccount(connection, req.user.id, { accountId, delta: row.direction === 'INCOME' ? row.amount : -row.amount }, wid);
    }
    await connection.query('DELETE FROM imports WHERE id = ? AND workshop_id = ?', [req.params.importId, wid]);
    if (inserted.some((item) => item.classification === 'UNCLASSIFIED')) {
      await saveRecord('alerts', { type: 'MEDIUM', title: 'Giao dịch sao kê cần phân loại', description: `${inserted.filter((item) => item.classification === 'UNCLASSIFIED').length} dòng import đang chờ người dùng rà soát.`, reference: req.params.importId, status: 'OPEN', createdAt: new Date().toISOString(), workshopId: wid }, req.user.id, wid, 'LOCAL_DEMO', connection);
    }
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
  await createAudit({ actor: auditActor(req.user), action: 'STATEMENT_IMPORTED', entity: 'transactions', workshopId: wid, afterData: { createdCount: inserted.length, skippedDuplicates, skippedInvalid, accountId, workshopId: wid } });
  res.json({ createdCount: inserted.length, skippedDuplicates, skippedInvalid, records: inserted });
});

app.post('/api/files', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Chọn file cần tải lên.' });
  const extension = path.extname(req.file.originalname).toLowerCase();
  const fileTypes = { '.pdf': ['application/pdf', req.file.buffer.subarray(0, 5).toString() === '%PDF-'], '.png': ['image/png', req.file.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))], '.jpg': ['image/jpeg', req.file.buffer[0] === 0xff && req.file.buffer[1] === 0xd8 && req.file.buffer[2] === 0xff], '.jpeg': ['image/jpeg', req.file.buffer[0] === 0xff && req.file.buffer[1] === 0xd8 && req.file.buffer[2] === 0xff], '.webp': ['image/webp', req.file.buffer.subarray(0, 4).toString() === 'RIFF' && req.file.buffer.subarray(8, 12).toString() === 'WEBP'] };
  const expected = fileTypes[extension];
  if (!expected || req.file.mimetype !== expected[0] || !expected[1]) return res.status(415).json({ error: 'Chỉ hỗ trợ PDF, PNG, JPEG hoặc WEBP đúng định dạng.' });
  const wid = req.user.workshopId || DEFAULT_WORKSHOP_ID;
  const safeName = `${randomUUID()}${extension}`;
  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, safeName), req.file.buffer);
  await getPool().query('INSERT INTO file_assets (file_id, workshop_id, stored_name, original_name, mime_type, size_bytes, owner_id) VALUES (?,?,?,?,?,?,?)', [safeName, wid, safeName, path.basename(req.file.originalname), req.file.mimetype, req.file.size, req.user.id]);
  await enqueueOdooSync('file-assets', safeName, {
    id: safeName,
    file_id: safeName,
    stored_name: safeName,
    original_name: path.basename(req.file.originalname),
    mime_type: req.file.mimetype,
    size_bytes: req.file.size,
    owner_id: req.user.id,
    created_at: new Date().toISOString(),
  }, wid);
  res.status(201).json({ id: safeName, name: req.file.originalname, size: req.file.size, status: 'OCR_REVIEW_REQUIRED', message: 'Tệp đã lưu. OCR chưa cấu hình; cần nhập và rà soát thông tin thủ công.' });
});
app.get('/api/files/:id', requireAuth, async (req, res) => {
  const wid = req.user.workshopId || DEFAULT_WORKSHOP_ID;
  const name = path.basename(req.params.id);
  const [rows] = await getPool().query('SELECT stored_name, original_name, mime_type, owner_id FROM file_assets WHERE file_id = ? AND workshop_id = ? LIMIT 1', [name, wid]);
  const file = rows[0];
  if (!file || (req.user.role === 'WORKSHOP' && file.owner_id !== req.user.id)) return res.status(404).json({ error: 'Không tìm thấy tệp.' });
  res.type(file.mime_type).sendFile(path.join(uploadDir, path.basename(file.stored_name)), (error) => { if (error && !res.headersSent) res.status(404).json({ error: 'Không tìm thấy tệp.' }); });
});

app.use((error, _req, res, _next) => {
  console.error(error);
  if (error instanceof multer.MulterError) return res.status(400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'Tệp vượt quá 15MB.' : 'Tệp tải lên không hợp lệ.' });
  res.status(error.status || 500).json({ error: error.status ? error.message : 'Đã có lỗi hệ thống. Vui lòng thử lại.' });
});

await initDb();
await hydrateRolePermissions();
await seedDemoData();
await migrateBaselines();
await mkdir(uploadDir, { recursive: true });
if (process.env.ODOO_URL && process.env.ODOO_DB && process.env.ODOO_USERNAME && process.env.ODOO_PASSWORD) {
  const backfill = process.env.ODOO_BACKFILL_ON_START === 'true' ? await enqueueFullOdooBackfill() : { queued: 0, counts: {} };
  console.info(`Odoo backfill queued: ${backfill.queued} records (${JSON.stringify(backfill.counts)}).`);
}
app.listen(port, () => console.log(`FinTax Middleware API listening at http://localhost:${port}`));
if (process.env.ODOO_SYNC_WORKER !== 'false') setInterval(() => { void autoSyncOdooQueue(); }, 5000);
