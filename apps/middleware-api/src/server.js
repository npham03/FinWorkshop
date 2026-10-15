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
import { createHmac, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, getPool, listRecords, getRecord, getRecordForUpdate, saveRecord, createAudit, decodeData, enqueueOdooSync, odooSyncEntities } from './db.js';
import { seedDemoData } from './seed.js';
import { consumeOdooPasswordReset, createOdooAuthAccount, deleteOdooAuthAccount, executeOdoo, findOdooAuthAccount, hasOdooConfig, odooStatus, updateOdooAuthAccount } from './odoo.js';
import { sendResetCodeEmail, smtpStatus } from './mailer.js';
import { syncOdooInvoice, syncOdooPayment, syncOdooQuotation } from './odoo-documents.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.resolve(__dirname, '../uploads');
const app = express();
const port = Number(process.env.PORT || 3001);
const jwtSecret = process.env.JWT_SECRET || 'local-development-secret-change-me';
const taxApiUrl = process.env.TAX_API_URL || 'http://127.0.0.1:4000';
const allowedEntities = new Set(['dashboard', 'branches', 'cash-accounts', 'customers', 'suppliers', 'materials', 'products', 'boms', 'quotations', 'production-orders', 'stock-movements', 'labor-logs', 'transactions', 'invoices', 'payments', 'payment-allocations', 'reconciliations', 'alerts', 'classification-rules', 'tax-rules', 'tax-periods']);
const roles = {
  OWNER: { label: 'Chủ xưởng', entities: '*', actions: '*' },
  ACCOUNTANT: { label: 'Kế toán / Bán hàng', entities: ['dashboard', 'branches', 'cash-accounts', 'customers', 'suppliers', 'materials', 'products', 'boms', 'quotations', 'production-orders', 'stock-movements', 'labor-logs', 'transactions', 'invoices', 'payments', 'payment-allocations', 'reconciliations', 'alerts', 'classification-rules', 'tax-periods'], actions: ['create', 'update', 'read', 'submit-for-approval', 'mark-sent', 'accept', 'create-production', 'simulate-code', 'classify', 'resolve', 'start', 'complete', 'confirm'] },
  WORKSHOP: { label: 'Thủ kho / Thợ xưởng', entities: ['production-orders', 'stock-movements', 'materials', 'labor-logs'], actions: ['read', 'start', 'complete', 'progress', 'record-movement', 'record-labor'] },
};
const roleCaps = Object.fromEntries(['ACCOUNTANT', 'WORKSHOP'].map((role) => [role, { entities: [...roles[role].entities], actions: [...roles[role].actions] }]));
const transactionClassifications = new Set(['BUSINESS_INCOME', 'BUSINESS_EXPENSE', 'PERSONAL', 'INTERNAL_TRANSFER', 'OWNER_FUNDING', 'OWNER_DRAW', 'UNCLASSIFIED']);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: process.env.WEB_ORIGIN?.split(',') || ['http://localhost:5173'], credentials: false }));
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 1 } });

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) throw new Error('JWT_SECRET bắt buộc phải được cấu hình ở production.');

const permissionsFor = (role) => ({ entities: roles[role]?.entities === '*' ? '*' : [...(roles[role]?.entities || [])], actions: roles[role]?.actions === '*' ? '*' : [...(roles[role]?.actions || [])] });
const userView = (user) => ({ id: user.id, email: user.email, name: user.full_name, role: user.role, roleLabel: roles[user.role]?.label || user.role, permissions: permissionsFor(user.role) });
async function hydrateRolePermissions() {
  const [rows] = await getPool().query('SELECT role, entities, actions FROM role_permissions');
  for (const row of rows) {
    const baseline = roleCaps[row.role];
    if (!baseline) continue;
    const entities = decodeData(row.entities); const actions = decodeData(row.actions);
    roles[row.role] = { ...roles[row.role], entities: entities.filter((item) => baseline.entities.includes(item)), actions: actions.filter((item) => baseline.actions.includes(item)) };
  }
  for (const [role, baseline] of Object.entries(roleCaps)) {
    await getPool().query('INSERT IGNORE INTO role_permissions (role, entities, actions) VALUES (?, CAST(? AS JSON), CAST(? AS JSON))', [role, JSON.stringify(baseline.entities), JSON.stringify(baseline.actions)]);
  }
}
function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Vui lòng đăng nhập để tiếp tục.' });
  try { req.user = jwt.verify(token, jwtSecret); next(); }
  catch { return res.status(401).json({ error: 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.' }); }
}
function requireOwner(req, res, next) {
  if (req.user?.role !== 'OWNER') return res.status(403).json({ error: 'Bạn không có quyền thực hiện thao tác này.' });
  next();
}
function canEntity(role, entity) {
  const permission = roles[role];
  return permission && (permission.entities === '*' || permission.entities.includes(entity));
}
function requireEntity(req, res, next) {
  const entity = req.params.entity;
  if (!allowedEntities.has(entity)) return res.status(404).json({ error: 'Không tìm thấy phân hệ.' });
  if (!canEntity(req.user.role, entity)) return res.status(403).json({ error: 'Vai trò hiện tại không được truy cập phân hệ này.' });
  next();
}
function canAct(req, action) {
  const permission = roles[req.user.role];
  return permission?.actions === '*' || permission?.actions.includes(action);
}
function auditActor(user) { return { id: user.id, name: user.name }; }
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
const unusablePasswordHash = async () => bcrypt.hash(randomBytes(32).toString('hex'), 12);
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
async function updateCashAccount(executor, actorId, { accountId, accountName, delta }) {
  const accounts = await listRecords('cash-accounts', executor);
  const match = accounts.find((row) => (accountId && row.id === accountId) || (accountName && row.name === accountName));
  const account = match ? await getRecordForUpdate('cash-accounts', match.id, executor) : null;
  if (!account) return null;
  const updated = await saveRecord('cash-accounts', { ...account, balance: Math.round(finiteAmount(account.balance) + delta) }, actorId, 'LOCAL_DEMO', executor);
  const alertCode = `NEGATIVE_BALANCE_${account.id}`;
  const alerts = await listRecords('alerts', executor);
  const existing = alerts.find((item) => item.alertCode === alertCode && item.status === 'OPEN');
  if (updated.balance < 0 && !existing) await saveRecord('alerts', { alertCode, type: 'HIGH', title: 'Số dư tài khoản âm', description: `${account.name} đang thấp hơn 0 ₫ sau khi ghi nhận giao dịch. Hãy kiểm tra sao kê và số dư đầu kỳ.`, reference: account.id, recommendedAction: 'Đối chiếu sao kê và số dư đầu kỳ.', status: 'OPEN', createdAt: new Date().toISOString() }, actorId, 'LOCAL_DEMO', executor);
  if (updated.balance >= 0 && existing) await saveRecord('alerts', { ...existing, status: 'RESOLVED', resolvedAt: new Date().toISOString(), resolutionNote: 'Số dư đã được điều chỉnh về không âm.' }, actorId, 'LOCAL_DEMO', executor);
  return updated;
}
async function updateInvoicePartner(executor, actorId, invoice, delta) {
  const entity = invoice.direction === 'OUTPUT' ? 'customers' : 'suppliers';
  const balanceField = invoice.direction === 'OUTPUT' ? 'receivable' : 'payable';
  const partners = await listRecords(entity, executor);
  const match = partners.find((row) => (invoice.counterpartyId && row.id === invoice.counterpartyId) || (invoice.taxCode && row.taxCode === invoice.taxCode) || row.name === invoice.counterparty);
  const partner = match ? await getRecordForUpdate(entity, match.id, executor) : null;
  if (!partner) return null;
  return saveRecord(entity, { ...partner, [balanceField]: Math.max(0, Math.round(finiteAmount(partner[balanceField]) + delta)) }, actorId, 'LOCAL_DEMO', executor);
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
async function classifyWithRules(record) {
  if (record.classification && record.classification !== 'UNCLASSIFIED') return record;
  const rules = (await listRecords('classification-rules')).filter((rule) => rule.active !== false && rule.status !== 'INACTIVE');
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
async function listAudit(limit = 100) {
  const [rows] = await getPool().query('SELECT id, actor_id, actor_name, action, entity, record_id, before_data, after_data, created_at FROM audit_logs ORDER BY created_at DESC LIMIT ?', [limit]);
  return rows.map((row) => ({ id: row.id, actorId: row.actor_id, actorName: row.actor_name, action: row.action, entity: row.entity, recordId: row.record_id, beforeData: row.before_data ? decodeData(row.before_data) : null, afterData: row.after_data ? decodeData(row.after_data) : null, createdAt: row.created_at }));
}
async function getCounts() {
  const entities = ['transactions', 'invoices', 'quotations', 'production-orders', 'alerts', 'customers', 'suppliers', 'materials', 'payments', 'reconciliations', 'branches'];
  const data = await Promise.all(entities.map(async (entity) => [entity, await listRecords(entity)]));
  return Object.fromEntries(data);
}
async function syncSystemAlert(alertCode, condition, details) {
  const alerts = await listRecords('alerts');
  const existing = alerts.find((alert) => alert.alertCode === alertCode && alert.status === 'OPEN');
  if (condition && existing) return saveRecord('alerts', { ...existing, ...details, status: 'OPEN' }, null, 'LOCAL_DEMO');
  if (condition) return saveRecord('alerts', { ...details, alertCode, status: 'OPEN', createdAt: new Date().toISOString() }, null, 'LOCAL_DEMO');
  if (existing) return saveRecord('alerts', { ...existing, status: 'RESOLVED', resolvedAt: new Date().toISOString(), resolutionNote: 'Điều kiện phát sinh cảnh báo không còn tồn tại.' }, null, 'LOCAL_DEMO');
  return null;
}
async function syncOdooJob(job) {
  const data = decodeData(job.payload);
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

  const current = await getRecord(job.entity, job.record_id);
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
    await getPool().query('UPDATE records SET data = CAST(? AS JSON), sync_status = ? WHERE entity = ? AND record_id = ?', [JSON.stringify(updated), 'SYNCED', job.entity, job.record_id]);
  }
  await getPool().query('UPDATE odoo_sync_jobs SET status = ?, last_error = NULL, attempts = attempts + 1 WHERE id = ?', ['SYNCED', job.id]);
  return { id: job.id, entity: job.entity, recordId: job.record_id, status: 'SYNCED', odooMirrorId: mirrorId, nativeModel: nativeModel || null, nativeId: nativeId || null };
}

let odooWorkerRunning = false;
async function syncOdooJobs({ statuses, limit = 50 }) {
  const connection = await odooStatus();
  if (!connection.connected) throw new Error(`Odoo chưa sẵn sàng: ${connection.label}.`);
  const [jobs] = await getPool().query(
    'SELECT * FROM odoo_sync_jobs WHERE status IN (?) ORDER BY created_at ASC LIMIT ?',
    [statuses, limit],
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
      await getPool().query('UPDATE odoo_sync_jobs SET status = ?, attempts = attempts + 1, last_error = ? WHERE id = ?', [state, String(error.message).slice(0, 1000), job.id]);
      await getPool().query('UPDATE records SET sync_status = ? WHERE entity = ? AND record_id = ?', [state, job.entity, job.record_id]);
      results.push({ id: job.id, entity: job.entity, recordId: job.record_id, status: state, error: error.message });
    }
  }
  return { attempted: results.length, results };
}

async function enqueueFullOdooBackfill() {
  const db = getPool();
  const standaloneEntities = ['users', 'role-permissions', 'audit-logs', 'file-assets'];
  const recordEntities = odooSyncEntities.filter((entity) => !standaloneEntities.includes(entity));
  const counts = {};
  let queued = 0;
  const count = (entity) => { counts[entity] = (counts[entity] || 0) + 1; queued += 1; };

  const [records] = await db.query(
    'SELECT entity, record_id, data, sync_status FROM records WHERE entity IN (?) AND sync_status <> ? ORDER BY entity, record_id',
    [recordEntities, 'DEMO_SEED'],
  );
  for (const record of records) {
    const payload = decodeData(record.data);
    if (await enqueueOdooSync(record.entity, record.record_id, payload, db)) {
      await db.query('UPDATE records SET sync_status = ? WHERE entity = ? AND record_id = ?', ['PENDING_ODOO', record.entity, record.record_id]);
      count(record.entity);
    }
  }

  const [users] = await db.query('SELECT id, email, full_name, role, active, created_at, updated_at FROM users ORDER BY created_at, id');
  for (const user of users) {
    if (await enqueueOdooSync('users', user.id, { id: user.id, email: user.email, name: user.full_name, role: user.role, active: Boolean(user.active), createdAt: user.created_at, updatedAt: user.updated_at }, db)) count('users');
  }

  const [permissions] = await db.query('SELECT role, entities, actions, updated_at FROM role_permissions ORDER BY role');
  for (const permission of permissions) {
    if (await enqueueOdooSync('role-permissions', permission.role, { id: permission.role, role: permission.role, entities: decodeData(permission.entities), actions: decodeData(permission.actions), updatedAt: permission.updated_at }, db)) count('role-permissions');
  }

  const [audits] = await db.query('SELECT id, actor_id, actor_name, action, entity, record_id, before_data, after_data, created_at FROM audit_logs ORDER BY id');
  for (const row of audits) {
    const payload = { id: String(row.id), actorId: row.actor_id, actorName: row.actor_name, action: row.action, entity: row.entity, recordId: row.record_id, beforeData: row.before_data ? decodeData(row.before_data) : null, afterData: row.after_data ? decodeData(row.after_data) : null, createdAt: row.created_at };
    if (await enqueueOdooSync('audit-logs', payload.id, payload, db)) count('audit-logs');
  }

  const [files] = await db.query('SELECT file_id, stored_name, original_name, mime_type, size_bytes, owner_id, created_at FROM file_assets ORDER BY created_at, file_id');
  for (const file of files) {
    const payload = { id: file.file_id, file_id: file.file_id, stored_name: file.stored_name, original_name: file.original_name, mime_type: file.mime_type, size_bytes: Number(file.size_bytes), owner_id: file.owner_id, created_at: file.created_at };
    if (await enqueueOdooSync('file-assets', file.file_id, payload, db)) count('file-assets');
  }

  return { queued, counts };
}

async function autoSyncOdooQueue() {
  if (odooWorkerRunning) return;
  const configured = process.env.ODOO_URL && process.env.ODOO_DB && process.env.ODOO_USERNAME && process.env.ODOO_PASSWORD;
  if (!configured) return;
  odooWorkerRunning = true;
  try {
    const [pending] = await getPool().query("SELECT id FROM odoo_sync_jobs WHERE status = 'PENDING' LIMIT 1");
    if (!pending.length) return;
    const result = await syncOdooJobs({ statuses: ['PENDING'], limit: 10 });
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
  const email = normalizeEmail(req.body?.email);
  const name = String(req.body?.name || '').trim();
  const password = String(req.body?.password || '');
  if (!validEmail(email) || name.length < 2 || name.length > 190 || password.length < 10 || Buffer.byteLength(password, 'utf8') > 72) {
    return res.status(400).json({ error: 'Nhập tên, email hợp lệ và mật khẩu từ 10 ký tự (tối đa 72 byte UTF-8).' });
  }
  if (!hasOdooConfig()) return res.status(503).json({ error: 'Odoo chưa được cấu hình. Hãy cấu hình Odoo trước khi đăng ký tài khoản.' });

  const [existing] = await getPool().query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
  let existingOdooAccount;
  try { existingOdooAccount = await findOdooAuthAccount(email); }
  catch (error) {
    console.warn('FinTax signup could not read Odoo accounts:', error.message);
    return res.status(503).json({ error: 'Odoo chưa sẵn sàng hoặc module FinTax Integration chưa được cập nhật.' });
  }
  if (existing.length || existingOdooAccount) return res.status(409).json({ error: 'Email đã được đăng ký.' });

  const id = randomUUID();
  const passwordHash = await bcrypt.hash(password, 12);
  let odooId;
  try {
    odooId = await createOdooAuthAccount({ id, email, name, role: 'ACCOUNTANT', passwordHash, approved: false });
  } catch (error) {
    console.warn('FinTax signup could not create the Odoo account:', error.message);
    return res.status(503).json({ error: 'Chưa lưu được tài khoản vào Odoo. Kiểm tra kết nối và cài module FinTax Integration.' });
  }
  try {
    await getPool().query('INSERT INTO users (id, email, full_name, role, password_hash, active) VALUES (?, ?, ?, ?, ?, FALSE)', [id, email, name, 'ACCOUNTANT', await unusablePasswordHash()]);
  } catch (error) {
    try { await deleteOdooAuthAccount(odooId); } catch (cleanupError) { console.warn('Could not roll back the Odoo signup record:', cleanupError.message); }
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Email đã được đăng ký.' });
    throw error;
  }
  await enqueueOdooSync('users', id, { id, email, name, role: 'ACCOUNTANT', active: false, createdAt: new Date().toISOString() });
  await createAudit({ actor: { id, name }, action: 'USER_REGISTERED', entity: 'users', recordId: id, afterData: { email, role: 'ACCOUNTANT', active: false } });
  res.status(201).json({ ok: true, message: 'Đã tạo tài khoản. Tài khoản sẽ dùng được sau khi chủ xưởng duyệt.' });
});

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

  const localVerifier = await unusablePasswordHash();
  await getPool().query(
    'INSERT INTO users (id, email, full_name, role, password_hash, active) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)',
    [account.source_id, account.email, account.name, account.role, localVerifier, Boolean(account.is_approved)],
  );
  await createAudit({ actor: { id: account.source_id, name: account.name }, action: 'PASSWORD_RESET', entity: 'users', recordId: account.source_id });
  res.json({ ok: true, message: 'Đã đặt lại mật khẩu. Bạn có thể đăng nhập.' });
});
app.post('/api/auth/login', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || '');
  if (!email || !password) return res.status(400).json({ error: 'Nhập email và mật khẩu.' });

  let odooAccount = null;
  let odooLookupFailed = false;
  if (hasOdooConfig()) {
    try { odooAccount = await findOdooAuthAccount(email); }
    catch (error) { odooLookupFailed = true; console.warn('Odoo account lookup failed; checking the local account cache:', error.message); }
  }

  let user;
  if (odooAccount) {
    if (!(await bcrypt.compare(password, odooAccount.password_hash || ''))) return res.status(401).json({ error: 'Email hoặc mật khẩu chưa chính xác.' });
    if (!odooAccount.is_approved) return res.status(403).json({ error: 'Tài khoản đang chờ chủ xưởng duyệt hoặc đã bị khóa.' });
    const [rows] = await getPool().query('SELECT * FROM users WHERE id = ? LIMIT 1', [odooAccount.source_id]);
    user = rows[0];
    if (!user) {
      await getPool().query('INSERT INTO users (id, email, full_name, role, password_hash, active) VALUES (?, ?, ?, ?, ?, TRUE)', [odooAccount.source_id, email, odooAccount.name, odooAccount.role, odooAccount.password_hash]);
      const [created] = await getPool().query('SELECT * FROM users WHERE id = ? LIMIT 1', [odooAccount.source_id]);
      user = created[0];
    }
  } else {
    const [rows] = await getPool().query('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
    user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      if (odooLookupFailed) return res.status(503).json({ error: 'Odoo chưa sẵn sàng để xác thực tài khoản này. Vui lòng thử lại.' });
      return res.status(401).json({ error: 'Email hoặc mật khẩu chưa chính xác.' });
    }
    if (hasOdooConfig()) {
      try {
        await createOdooAuthAccount({ id: user.id, email: user.email, name: user.full_name, role: user.role, passwordHash: user.password_hash, approved: Boolean(user.active) });
        await getPool().query('UPDATE users SET password_hash = ? WHERE id = ?', [await unusablePasswordHash(), user.id]);
      } catch (error) {
        console.warn('Could not mirror the existing FinTax account to Odoo:', error.message);
      }
    }
  }

  if (!user?.active) return res.status(403).json({ error: 'Tài khoản đang chờ chủ xưởng duyệt hoặc đã bị khóa.' });
  const view = userView(user);
  const token = jwt.sign(view, jwtSecret, { expiresIn: '12h', issuer: 'fintax-middleware' });
  res.json({ token, user: view });
});

app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: { ...req.user, permissions: permissionsFor(req.user.role) } }));
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
  await createAudit({ actor: auditActor(req.user), action: 'PASSWORD_CHANGED', entity: 'users', recordId: req.user.id });
  res.json({ ok: true });
});

app.get('/api/users', requireAuth, requireOwner, async (_req, res) => {
  const [rows] = await getPool().query('SELECT id, email, full_name, role, active, created_at FROM users ORDER BY created_at');
  res.json(rows.map((row) => ({ ...userView(row), active: Boolean(row.active), createdAt: row.created_at })));
});
app.post('/api/users', requireAuth, requireOwner, async (req, res) => {
  const { email, name, role, password } = req.body;
  if (!email || !name || !roles[role] || !password || password.length < 8) return res.status(400).json({ error: 'Vui lòng nhập tên, email, vai trò và mật khẩu tối thiểu 8 ký tự.' });
  const id = randomUUID();
  const hash = await bcrypt.hash(password, 12);
  try {
    await getPool().query('INSERT INTO users (id,email,full_name,role,password_hash) VALUES (?,?,?,?,?)', [id, String(email).toLowerCase(), name, role, hash]);
    const user = { id, email: String(email).toLowerCase(), name, role, roleLabel: roles[role].label };
    if (hasOdooConfig()) {
      try { await createOdooAuthAccount({ id, email: user.email, name, role, passwordHash: hash, approved: true }); }
      catch (odooError) { console.warn('Could not save the administrator-created account to Odoo:', odooError.message); }
    }
    await enqueueOdooSync('users', id, { id, email: user.email, name, role, active: true, createdAt: new Date().toISOString() });
    await createAudit({ actor: auditActor(req.user), action: 'USER_CREATED', entity: 'users', recordId: id, afterData: { email: user.email, name, role } });
    res.status(201).json(user);
  } catch (error) { res.status(409).json({ error: error.code === 'ER_DUP_ENTRY' ? 'Email đã được sử dụng.' : 'Không thể tạo tài khoản.' }); }
});
app.patch('/api/users/:id/status', requireAuth, requireOwner, async (req, res) => {
  const active = Boolean(req.body.active);
  if (req.params.id === req.user.id && !active) return res.status(400).json({ error: 'Bạn không thể tự khóa tài khoản đang đăng nhập.' });
  const [userRows] = await getPool().query('SELECT id, email, full_name, role, password_hash, active, created_at, updated_at FROM users WHERE id = ? LIMIT 1', [req.params.id]);
  const changedUser = userRows[0];
  if (changedUser && hasOdooConfig()) {
    try {
      const account = await findOdooAuthAccount(changedUser.email);
      if (account) await updateOdooAuthAccount(account.id, { is_approved: active, role: changedUser.role, name: changedUser.full_name });
    } catch (error) { return res.status(503).json({ error: 'Chưa cập nhật được quyền tài khoản trong Odoo. Vui lòng thử lại.' }); }
  }
  const [result] = await getPool().query('UPDATE users SET active = ? WHERE id = ?', [active, req.params.id]);
  if (!result.affectedRows) return res.status(404).json({ error: 'Không tìm thấy tài khoản.' });
  if (changedUser) await enqueueOdooSync('users', changedUser.id, { id: changedUser.id, email: changedUser.email, name: changedUser.full_name, role: changedUser.role, active, createdAt: changedUser.created_at, updatedAt: new Date().toISOString() });
  await createAudit({ actor: auditActor(req.user), action: active ? 'USER_ACTIVATED' : 'USER_SUSPENDED', entity: 'users', recordId: req.params.id, afterData: { active } });
  res.json({ ok: true, active });
});
app.get('/api/role-permissions', requireAuth, requireOwner, (_req, res) => res.json(Object.entries(roleCaps).map(([role, capability]) => ({ role, label: roles[role].label, entities: roles[role].entities, actions: roles[role].actions, availableEntities: capability.entities, availableActions: capability.actions }))));
app.put('/api/role-permissions/:role', requireAuth, requireOwner, async (req, res) => {
  const role = String(req.params.role);
  const capability = roleCaps[role];
  if (!capability) return res.status(400).json({ error: 'Chỉ có thể tùy chỉnh quyền của Kế toán/Bán hàng hoặc Thủ kho/Thợ xưởng.' });
  const entities = Array.isArray(req.body?.entities) ? [...new Set(req.body.entities.map(String))] : [];
  const actions = Array.isArray(req.body?.actions) ? [...new Set(req.body.actions.map(String))] : [];
  if (entities.some((item) => !capability.entities.includes(item)) || actions.some((item) => !capability.actions.includes(item))) return res.status(400).json({ error: 'Không thể cấp quyền vượt quá bộ quyền tối đa của vai trò.' });
  await getPool().query('INSERT INTO role_permissions (role, entities, actions) VALUES (?, CAST(? AS JSON), CAST(? AS JSON)) ON DUPLICATE KEY UPDATE entities = VALUES(entities), actions = VALUES(actions)', [role, JSON.stringify(entities), JSON.stringify(actions)]);
  roles[role] = { ...roles[role], entities, actions };
  await enqueueOdooSync('role-permissions', role, { id: role, role, entities, actions, updatedAt: new Date().toISOString() });
  await createAudit({ actor: auditActor(req.user), action: 'ROLE_PERMISSIONS_UPDATED', entity: 'role_permissions', recordId: role, afterData: { role, entities, actions } });
  res.json({ role, label: roles[role].label, entities, actions });
});

app.get('/api/dashboard', requireAuth, async (req, res) => {
  if (!canAct(req, 'read')) return res.status(403).json({ error: 'Dashboard read access is disabled for this role.' });
  if (!canEntity(req.user.role, 'dashboard')) return res.status(403).json({ error: 'Vai trò hiện tại không được truy cập bảng điều hành.' });
  const data = await getCounts();
  const from = req.query.from ? String(req.query.from) : '';
  const to = req.query.to ? String(req.query.to) : '';
  const txns = liveRows(data.transactions).filter((item) => (!from || item.date >= from) && (!to || item.date <= to));
  const allLiveTransactions = liveRows(data.transactions);
  const unclassifiedAll = allLiveTransactions.filter((item) => ['UNCLASSIFIED', 'NEEDS_REVIEW'].includes(item.classification) || item.status === 'NEEDS_REVIEW');
  const overdueInvoices = liveRows(data.invoices).filter((invoice) => finiteAmount(invoice.openBalance ?? invoice.total) > 0 && invoice.dueDate && invoice.dueDate < new Date().toISOString().slice(0, 10));
  const reviewInvoices = liveRows(data.invoices).filter((invoice) => ['REVIEW_REQUIRED', 'NEEDS_REVIEW'].includes(invoice.status));
  const businessAccounts = new Set(allLiveTransactions.filter((item) => item.classification?.startsWith('BUSINESS_')).map((item) => item.accountId).filter(Boolean));
  const personalMix = allLiveTransactions.filter((item) => item.classification === 'PERSONAL' && businessAccounts.has(item.accountId));
  await syncSystemAlert('UNCLASSIFIED_TRANSACTIONS', unclassifiedAll.length > 0, { type: 'MEDIUM', title: 'Giao dịch cần phân loại', description: `${unclassifiedAll.length} giao dịch đang chờ xác nhận nhóm dòng tiền.`, reference: `${unclassifiedAll.length} giao dịch`, recommendedAction: 'Mở sổ quỹ và xác nhận từng giao dịch.' });
  await syncSystemAlert('OVERDUE_INVOICES', overdueInvoices.length > 0, { type: 'HIGH', title: 'Công nợ hóa đơn quá hạn', description: `${overdueInvoices.length} hóa đơn đã quá hạn và còn số dư phải theo dõi.`, reference: overdueInvoices.map((invoice) => invoice.code).join(', '), recommendedAction: 'Kiểm tra thanh toán và cập nhật trạng thái công nợ.' });
  await syncSystemAlert('INVOICES_NEED_REVIEW', reviewInvoices.length > 0, { type: 'HIGH', title: 'Hóa đơn cần rà soát', description: `${reviewInvoices.length} hóa đơn đang chờ kiểm tra thông tin và chứng từ.`, reference: reviewInvoices.map((invoice) => invoice.code).join(', '), recommendedAction: 'Mở hóa đơn và rà soát dữ liệu thủ công.' });
  await syncSystemAlert('PERSONAL_BUSINESS_MIX', personalMix.length > 0, { type: 'MEDIUM', title: 'Tài khoản có dòng tiền cá nhân và kinh doanh', description: `${personalMix.length} giao dịch cá nhân được ghi nhận ở tài khoản cũng có giao dịch kinh doanh.`, reference: `${personalMix.length} giao dịch`, recommendedAction: 'Rà soát phân loại và đối chiếu sao kê.' });
  data.alerts = await listRecords('alerts');
  const businessIncome = txns.filter((t) => t.classification === 'BUSINESS_INCOME').reduce((sum, t) => sum + finiteAmount(t.amount), 0);
  const businessExpense = txns.filter((t) => t.classification === 'BUSINESS_EXPENSE').reduce((sum, t) => sum + finiteAmount(t.amount), 0);
  const cashIn = txns.filter((t) => t.direction === 'INCOME' && t.classification !== 'PERSONAL').reduce((sum, t) => sum + finiteAmount(t.amount), 0);
  const cashOut = txns.filter((t) => t.direction === 'EXPENSE' && t.classification !== 'PERSONAL').reduce((sum, t) => sum + finiteAmount(t.amount), 0);
  const openAlerts = data.alerts.filter((a) => a.status === 'OPEN');
  const unclassified = txns.filter((t) => ['UNCLASSIFIED', 'NEEDS_REVIEW'].includes(t.classification) || t.status === 'NEEDS_REVIEW');
  const receivable = data.customers.reduce((sum, customer) => sum + finiteAmount(customer.receivable), 0);
  const payable = data.suppliers.reduce((sum, supplier) => sum + finiteAmount(supplier.payable), 0);
  const byDay = new Map();
  for (const txn of txns) {
    const key = txn.date;
    const point = byDay.get(key) || { date: key, thu: 0, chi: 0 };
    if (txn.direction === 'INCOME' && txn.classification !== 'PERSONAL' && !['OWNER_FUNDING'].includes(txn.classification)) point.thu += finiteAmount(txn.amount);
    if (txn.direction === 'EXPENSE' && txn.classification !== 'PERSONAL') point.chi += finiteAmount(txn.amount);
    byDay.set(key, point);
  }
  const trend = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-7);
  const totalBalances = (await listRecords('cash-accounts')).filter((account) => account.ownerScope !== 'PERSONAL').reduce((sum, account) => sum + finiteAmount(account.balance), 0);
  const [queueRows] = await getPool().query("SELECT COUNT(*) AS total FROM odoo_sync_jobs WHERE status IN ('PENDING', 'PENDING_RETRY', 'PENDING_MAPPING')");
  const odoo = await odooStatus();
  res.json({
    metrics: { revenue: businessIncome, expenses: businessExpense, netCash: cashIn - cashOut, receivable, payable, balance: totalBalances, estimatedMargin: businessIncome - businessExpense, alertCount: openAlerts.length, reviewCount: unclassified.length },
    trend,
    integrations: { odoo, pendingOdoo: Number(queueRows[0]?.total || 0) },
    alerts: openAlerts.slice(0, 5),
    recentTransactions: txns.slice(0, 6),
    production: data['production-orders'].slice(0, 4),
    quotations: data.quotations.slice(0, 4),
    invoices: data.invoices.slice(0, 4),
    dataMode: 'DEMO',
  });
});

app.get('/api/integrations/odoo/status', requireAuth, async (_req, res) => res.json(await odooStatus()));
app.get('/api/integrations/status', requireAuth, async (_req, res) => {
  const status = await odooStatus();
  const [queue] = await getPool().query("SELECT status, COUNT(*) AS total FROM odoo_sync_jobs GROUP BY status");
  res.json({ odoo: status, smtp: smtpStatus(), odooQueue: Object.fromEntries(queue.map((row) => [row.status, Number(row.total)])), tax: { type: 'MOCK', label: 'API thuế giả lập', url: taxApiUrl }, mode: 'DEMO' });
});
app.get('/api/integrations/odoo/queue', requireAuth, requireOwner, async (_req, res) => {
  const [rows] = await getPool().query('SELECT id, entity, record_id, status, attempts, last_error, created_at, updated_at FROM odoo_sync_jobs ORDER BY created_at DESC LIMIT 100');
  res.json(rows);
});
app.post('/api/integrations/odoo/enqueue-unsynced', requireAuth, requireOwner, async (req, res) => {
  const connection = await odooStatus();
  if (!connection.connected) return res.status(409).json({ error: `Odoo is not ready: ${connection.label}.` });
  const result = await enqueueFullOdooBackfill();
  await createAudit({ actor: auditActor(req.user), action: 'ODOO_BACKFILL_ENQUEUED', entity: 'odoo_sync_jobs', afterData: result });
  res.json(result);
});app.post('/api/integrations/odoo/sync-pending', requireAuth, requireOwner, async (_req, res) => {
  let result;
  try { result = await syncOdooJobs({ statuses: ['PENDING', 'PENDING_RETRY', 'PENDING_MAPPING'], limit: 50 }); }
  catch (error) { return res.status(409).json({ error: error.message }); }
  await createAudit({ actor: auditActor(_req.user), action: 'ODOO_SYNC_ATTEMPT', entity: 'odoo_sync_jobs', afterData: result });
  res.json(result);
});

app.get('/api/audit-logs', requireAuth, requireOwner, async (req, res) => res.json(await listAudit(Math.min(250, Math.max(1, Number(req.query.limit || 100))))));

app.post('/api/transfers', requireAuth, async (req, res) => {
  if (req.user.role === 'WORKSHOP') return res.status(403).json({ error: 'Vai trò hiện tại không được ghi nhận chuyển tiền.' });
  if (!canEntity(req.user.role, 'transactions') || !canAct(req, 'create')) return res.status(403).json({ error: 'Vai trò hiện tại không được tạo giao dịch.' });
  const amount = Math.round(finiteAmount(req.body?.amount));
  const fromId = String(req.body?.fromAccountId || ''); const toId = String(req.body?.toAccountId || '');
  if (!fromId || !toId || fromId === toId || amount <= 0) return res.status(400).json({ error: 'Chọn hai tài khoản khác nhau và nhập số tiền lớn hơn 0.' });
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const accounts = await listRecords('cash-accounts', connection);
    const from = accounts.find((row) => row.id === fromId); const to = accounts.find((row) => row.id === toId);
    if (!from || !to) { await connection.rollback(); return res.status(404).json({ error: 'Không tìm thấy tài khoản tiền.' }); }
    if ((from.ownerScope || 'BUSINESS') !== (to.ownerScope || 'BUSINESS')) { await connection.rollback(); return res.status(400).json({ error: 'Chuyển nội bộ chỉ áp dụng giữa hai tài khoản cùng phạm vi. Tiền chủ nạp/rút hoặc chi cá nhân cần phân loại riêng.' }); }
    const group = randomUUID(); const date = String(req.body.date || new Date().toISOString().slice(0, 10));
    const common = { amount, date, direction: 'TRANSFER', classification: 'INTERNAL_TRANSFER', status: 'CONFIRMED', transferGroup: group, description: String(req.body.note || 'Chuyển tiền nội bộ') };
    const outgoing = await saveRecord('transactions', { ...common, accountId: from.id, accountName: from.name, counterparty: to.name, transferSide: 'OUT' }, req.user.id, 'LOCAL_DEMO', connection);
    const incoming = await saveRecord('transactions', { ...common, accountId: to.id, accountName: to.name, counterparty: from.name, transferSide: 'IN' }, req.user.id, 'LOCAL_DEMO', connection);
    await updateCashAccount(connection, req.user.id, { accountId: from.id, delta: -amount });
    await updateCashAccount(connection, req.user.id, { accountId: to.id, delta: amount });
    await connection.commit();
    await createAudit({ actor: auditActor(req.user), action: 'INTERNAL_TRANSFER_CREATED', entity: 'transactions', recordId: group, afterData: { outgoing, incoming } });
    res.status(201).json({ transferGroup: group, transactions: [outgoing, incoming] });
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
});

app.get('/api/:entity', requireAuth, requireEntity, async (req, res) => {
  if (!canAct(req, 'read')) return res.status(403).json({ error: 'Read access is disabled for this role.' });
  let rows = await listRecords(req.params.entity);
  const q = String(req.query.q || '').trim().toLowerCase();
  const status = String(req.query.status || '');
  if (req.user.role === 'WORKSHOP' && req.params.entity === 'production-orders') {
    rows = rows.filter((row) => row.assignedTo === req.user.name || row.assignedTo === req.user.id)
      .map(({ id, code, productName, quantity, progress, status, dueDate, assignedTo, stage, laborHours, quotationCode }) => ({ id, code, productName, quantity, progress, status, dueDate, assignedTo, stage, laborHours, quotationCode }));
  }
  if (req.user.role === 'WORKSHOP' && ['stock-movements', 'labor-logs'].includes(req.params.entity)) {
    const jobs = await listRecords('production-orders');
    const assignedIds = new Set(jobs.filter((job) => job.assignedTo === req.user.name || job.assignedTo === req.user.id).map((job) => job.id));
    rows = rows.filter((row) => assignedIds.has(row.productionOrderId));
    if (req.params.entity === 'labor-logs') rows = rows.map(({ id, productionOrderId, employeeName, stage, hours, date, note }) => ({ id, productionOrderId, employeeName, stage, hours, date, note }));
    else rows = rows.map(({ id, code, materialId, materialName, quantity, unit, type, productionOrderId, date, status, note, attachmentName }) => ({ id, code, materialId, materialName, quantity, unit, type, productionOrderId, date, status, note, attachmentName }));
  }
  if (req.user.role === 'WORKSHOP' && req.params.entity === 'materials') rows = rows.map(({ id, code, name, unit, stock, minStock, category }) => ({ id, code, name, unit, stock, minStock, category }));
  if (q) rows = rows.filter((row) => JSON.stringify(row).toLowerCase().includes(q));
  if (status) rows = rows.filter((row) => row.status === status);
  res.json(rows);
});

app.post('/api/:entity', requireAuth, requireEntity, async (req, res) => {
  const entity = req.params.entity;
  const workshopMovement = entity === 'stock-movements' && req.user.role === 'WORKSHOP';
  const workshopLaborLog = entity === 'labor-logs' && req.user.role === 'WORKSHOP';
  const requiredCreateAction = workshopMovement ? 'record-movement' : workshopLaborLog ? 'record-labor' : 'create';
  if (!canAct(req, requiredCreateAction)) return res.status(403).json({ error: 'Vai trò hiện tại không được tạo dữ liệu ở phân hệ này.' });
  let value;
  try { value = normalizeRecord(req.body || {}); }
  catch (error) { return res.status(400).json({ error: error.message }); }
  if (entity === 'quotations') {
    if (value.materialCost !== undefined || value.laborHours !== undefined || value.machineCost !== undefined) {
      const laborCost = Math.round(finiteAmount(value.laborHours) * finiteAmount(value.laborRate));
      const wasteRate = finiteAmount(value.wasteRate) >= 1 ? finiteAmount(value.wasteRate) / 100 : finiteAmount(value.wasteRate);
      const marginRate = finiteAmount(value.marginRate) >= 1 ? finiteAmount(value.marginRate) / 100 : finiteAmount(value.marginRate);
      value.costEstimate = Math.round((finiteAmount(value.materialCost) + laborCost + finiteAmount(value.machineCost)) * (1 + wasteRate));
      value.suggestedUnitPrice = marginRate >= 1 ? 0 : Math.round(value.costEstimate / (1 - marginRate));
      if (!value.unitPrice) value.unitPrice = value.suggestedUnitPrice;
      value.marginRate = marginRate;
    }
    const calculated = Math.round(finiteAmount(value.quantity) * finiteAmount(value.unitPrice));
    value.subtotal = value.subtotal ?? calculated;
    value.total = value.total ?? value.subtotal + finiteAmount(value.taxAmount);
    value.items = value.items || (value.quantity && value.unitPrice ? [{ name: value.title, quantity: value.quantity, unitPrice: value.unitPrice, amount: calculated }] : []);
  }
  if (['quotations', 'invoices'].includes(entity) && value.code) {
    const duplicate = (await listRecords(entity)).some((row) => row.code === value.code);
    if (duplicate) return res.status(409).json({ error: 'Mã chứng từ đã tồn tại.' });
  }
  if (entity === 'invoices') {
    if (!value.subtotal && !value.taxAmount && value.total > 0) value.subtotal = value.total;
    if (Math.abs(finiteAmount(value.subtotal) + finiteAmount(value.taxAmount) - finiteAmount(value.total)) > 1) return res.status(400).json({ error: 'Tổng tiền phải bằng tiền hàng cộng tiền thuế.' });
    value.paidAmount = 0; value.openBalance = finiteAmount(value.total); value.paymentStatus = 'UNPAID';
    value.status ||= 'REVIEW_REQUIRED'; value.verification ||= 'Chờ rà soát thủ công';
    value.statusHistory = [{ status: value.status, at: new Date().toISOString(), actor: req.user.name, note: 'Tạo hóa đơn; chờ rà soát thủ công.' }];
  }
  if (entity === 'cash-accounts') {
    value.openingBalance = Math.round(finiteAmount(value.openingBalance ?? value.balance));
    value.balance = value.openingBalance;
  }
  if (entity === 'transactions' && !['INCOME', 'EXPENSE', 'TRANSFER'].includes(value.direction)) return res.status(400).json({ error: 'Chọn loại giao dịch thu, chi hoặc chuyển nội bộ.' });
  if (entity === 'payments' && !['RECEIVED', 'PAID'].includes(value.direction)) return res.status(400).json({ error: 'Chọn chiều thanh toán thu hoặc chi.' });
  if (['transactions', 'payments'].includes(entity) && !value.accountId) return res.status(400).json({ error: 'Chọn tài khoản tiền để cập nhật số dư.' });
  let saved;
  if (entity === 'stock-movements') {
    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      const materialMatch = (await listRecords('materials', connection)).find((item) => (value.materialId && item.id === value.materialId) || (value.materialName && String(item.name).toLowerCase() === String(value.materialName).toLowerCase()));
      if (!materialMatch) { await connection.rollback(); return res.status(400).json({ error: 'Material not found in inventory.' }); }
      const material = await getRecordForUpdate('materials', materialMatch.id, connection);
      if (!material) { await connection.rollback(); return res.status(404).json({ error: 'Material changed; please retry.' }); }
      if (workshopMovement) {
        const job = value.productionOrderId ? await getRecordForUpdate('production-orders', value.productionOrderId, connection) : null;
        if (!job || (job.assignedTo !== req.user.name && job.assignedTo !== req.user.id)) { await connection.rollback(); return res.status(403).json({ error: 'This production order is not assigned to you.' }); }
      }
      const quantity = finiteAmount(value.quantity);
      const delta = value.type === 'RETURN' ? quantity : -quantity;
      if (!['ISSUE', 'RETURN', 'WASTE'].includes(value.type) || quantity <= 0 || finiteAmount(material.stock) + delta < 0) { await connection.rollback(); return res.status(409).json({ error: 'Invalid movement or insufficient stock.' }); }
      value.materialId = material.id; value.materialName = material.name;
      saved = await saveRecord(entity, value, req.user.id, 'LOCAL_DEMO', connection);
      await saveRecord('materials', { ...material, stock: finiteAmount(material.stock) + delta }, req.user.id, 'LOCAL_DEMO', connection);
      await connection.commit();
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  } else if (entity === 'invoices') {
    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      saved = await saveRecord(entity, value, req.user.id, 'LOCAL_DEMO', connection);
      await updateInvoicePartner(connection, req.user.id, saved, finiteAmount(saved.total));
      await connection.commit();
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  } else if (entity === 'payment-allocations') {
    const amount = finiteAmount(value.allocatedAmount);
    if (amount <= 0) return res.status(400).json({ error: 'Số tiền phân bổ phải lớn hơn 0.' });
    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      const payment = await getRecordForUpdate('payments', value.paymentId, connection);
      if (!payment) { await connection.rollback(); return res.status(404).json({ error: 'Không tìm thấy khoản thanh toán.' }); }
      const [allocRows] = await connection.query("SELECT data FROM records WHERE entity = ? AND JSON_UNQUOTE(JSON_EXTRACT(data, '$.paymentId')) = ?", ['payment-allocations', value.paymentId]);
      const alreadyAllocated = allocRows.reduce((sum, row) => sum + finiteAmount(decodeData(row.data).allocatedAmount), 0);
      if (amount > finiteAmount(payment.amount) - alreadyAllocated) { await connection.rollback(); return res.status(400).json({ error: 'Số tiền phân bổ vượt quá số dư thanh toán.' }); }
      const invoice = value.invoiceId ? await getRecordForUpdate('invoices', value.invoiceId, connection) : null;
      if (value.invoiceId && !invoice) { await connection.rollback(); return res.status(404).json({ error: 'Không tìm thấy hóa đơn cần phân bổ.' }); }
      if (invoice && ((payment.direction === 'RECEIVED' && invoice.direction !== 'OUTPUT') || (payment.direction === 'PAID' && invoice.direction !== 'INPUT'))) { await connection.rollback(); return res.status(409).json({ error: 'Chiều thanh toán không khớp với loại hóa đơn.' }); }
      let invoiceAllocated = 0;
      if (invoice) {
        const [invoiceAllocRows] = await connection.query("SELECT data FROM records WHERE entity = ? AND JSON_UNQUOTE(JSON_EXTRACT(data, '$.invoiceId')) = ?", ['payment-allocations', value.invoiceId]);
        invoiceAllocated = invoiceAllocRows.reduce((sum, row) => sum + finiteAmount(decodeData(row.data).allocatedAmount), 0);
        if (amount > finiteAmount(invoice.total) - invoiceAllocated) { await connection.rollback(); return res.status(400).json({ error: 'Số tiền phân bổ vượt quá công nợ còn lại của hóa đơn.' }); }
      }
      saved = await saveRecord(req.params.entity, value, req.user.id, 'LOCAL_DEMO', connection);
      const newAllocated = alreadyAllocated + amount;
      await saveRecord('payments', { ...payment, allocatedAmount: newAllocated, status: newAllocated >= finiteAmount(payment.amount) ? 'ALLOCATED' : 'PARTIAL' }, req.user.id, 'LOCAL_DEMO', connection);
      if (invoice) {
        const paidAmount = invoiceAllocated + amount;
        await updateInvoicePartner(connection, req.user.id, invoice, -amount);
        const history = [...(invoice.statusHistory || []), { status: paidAmount >= finiteAmount(invoice.total) ? 'PAID' : 'PARTIAL', at: new Date().toISOString(), actor: req.user.name, note: `Phân bổ thanh toán ${amount} VND.` }];
        await saveRecord('invoices', { ...invoice, paidAmount, openBalance: Math.max(0, finiteAmount(invoice.total) - paidAmount), paymentStatus: paidAmount >= finiteAmount(invoice.total) ? 'PAID' : 'PARTIAL', statusHistory: history }, req.user.id, 'LOCAL_DEMO', connection);
      }
      await connection.commit();
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  } else if (entity === 'transactions' || entity === 'payments' || entity === 'labor-logs') {
    if (entity === 'transactions' && value.direction === 'TRANSFER') return res.status(400).json({ error: 'Để chuyển tiền nội bộ, hãy dùng thao tác “Chuyển nội bộ” để tạo cặp giao dịch cân bằng.' });
    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      if (entity === 'transactions') {
        const selectedAccount = value.accountId ? await getRecord('cash-accounts', value.accountId, connection) : null;
        if (value.accountId && !selectedAccount) { await connection.rollback(); return res.status(400).json({ error: 'Không tìm thấy tài khoản tiền đã chọn.' }); }
        if (selectedAccount) value.accountName = selectedAccount.name;
        if (!value.classification || value.classification === 'UNCLASSIFIED') value = await classifyWithRules(value);
        value.classification ||= 'UNCLASSIFIED';
        if (!classificationCompatible(value.direction, value.classification)) { await connection.rollback(); return res.status(400).json({ error: 'Nhóm phân loại không khớp chiều thu/chi.' }); }
        value.status ||= 'NEEDS_REVIEW';
        saved = await saveRecord(entity, value, req.user.id, 'LOCAL_DEMO', connection);
        const delta = value.direction === 'INCOME' ? finiteAmount(value.amount) : -finiteAmount(value.amount);
        if (value.accountId || value.accountName) await updateCashAccount(connection, req.user.id, { accountId: value.accountId, accountName: value.accountName, delta });
      } else if (entity === 'payments') {
        const selectedAccount = value.accountId ? await getRecord('cash-accounts', value.accountId, connection) : null;
        if (value.accountId && !selectedAccount) { await connection.rollback(); return res.status(400).json({ error: 'Không tìm thấy tài khoản tiền đã chọn.' }); }
        if (selectedAccount) value.accountName = selectedAccount.name;
        saved = await saveRecord(entity, value, req.user.id, 'LOCAL_DEMO', connection);
        const isReceipt = value.direction === 'RECEIVED';
        const transaction = await saveRecord('transactions', { date: value.date, description: `Thanh toán ${value.code || saved.id} · ${value.counterparty || ''}`, counterparty: value.counterparty, amount: finiteAmount(value.amount), direction: isReceipt ? 'INCOME' : 'EXPENSE', classification: 'UNCLASSIFIED', status: 'NEEDS_REVIEW', accountId: value.accountId || '', accountName: value.accountName || '', paymentId: saved.id, source: 'PAYMENT' }, req.user.id, 'LOCAL_DEMO', connection);
        saved = { ...saved, transactionId: transaction.id };
        await saveRecord(entity, saved, req.user.id, 'LOCAL_DEMO', connection);
        if (value.accountId || value.accountName) await updateCashAccount(connection, req.user.id, { accountId: value.accountId, accountName: value.accountName, delta: (isReceipt ? 1 : -1) * finiteAmount(value.amount) });
      } else {
        const job = value.productionOrderId ? await getRecordForUpdate('production-orders', value.productionOrderId, connection) : null;
        if (!job) { await connection.rollback(); return res.status(404).json({ error: 'Chọn lệnh sản xuất hợp lệ.' }); }
        if (workshopLaborLog && job.assignedTo !== req.user.name && job.assignedTo !== req.user.id) { await connection.rollback(); return res.status(403).json({ error: 'Bạn chỉ được ghi giờ công cho lệnh được phân công.' }); }
        const hours = finiteAmount(value.hours);
        if (hours <= 0) { await connection.rollback(); return res.status(400).json({ error: 'Số giờ công phải lớn hơn 0.' }); }
        value.employeeName = req.user.name; value.date ||= new Date().toISOString().slice(0, 10);
        saved = await saveRecord(entity, value, req.user.id, 'LOCAL_DEMO', connection);
        await saveRecord('production-orders', { ...job, laborHours: finiteAmount(job.laborHours) + hours }, req.user.id, 'LOCAL_DEMO', connection);
      }
      await connection.commit();
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  } else saved = await saveRecord(entity, value, req.user.id, 'LOCAL_DEMO');
  await createAudit({ actor: auditActor(req.user), action: 'RECORD_CREATED', entity, recordId: saved.id, afterData: saved });
  res.status(201).json(saved);
});

app.put('/api/:entity/:id', requireAuth, requireEntity, async (req, res) => {
  if (!canAct(req, 'update')) return res.status(403).json({ error: 'Vai trò hiện tại không được sửa dữ liệu này.' });
  const entity = req.params.entity;
  if (['transactions', 'payments', 'payment-allocations', 'stock-movements', 'labor-logs', 'reconciliations'].includes(entity)) return res.status(409).json({ error: 'Bản ghi đã ghi sổ không sửa trực tiếp. Hãy dùng thao tác phân loại, điều chỉnh hoặc hủy có lưu vết.' });
  if (entity === 'tax-periods' && req.user.role !== 'OWNER') return res.status(403).json({ error: 'Chỉ chủ xưởng được quản lý trạng thái kỳ.' });
  const before = await getRecord(entity, req.params.id);
  if (!before) return res.status(404).json({ error: 'Không tìm thấy dữ liệu.' });
  if (before.status === 'LOCKED' || before.periodStatus === 'LOCKED') return res.status(409).json({ error: 'Dữ liệu thuộc kỳ đã khóa. Hãy mở khóa theo quy trình được cấp quyền.' });
  let value;
  try { value = normalizeRecord({ ...before, ...req.body, id: before.id }); }
  catch (error) { return res.status(400).json({ error: error.message }); }
  if (entity === 'tax-periods' && req.body.status !== undefined && req.body.status !== before.status) return res.status(409).json({ error: 'Dùng thao tác khóa/mở kỳ để lưu lý do và audit log đầy đủ.' });
  if (entity === 'quotations' && ['APPROVED', 'ACCEPTED'].includes(before.status)) {
    const version = finiteAmount(before.version) + 1;
    value = { ...value, id: randomUUID(), code: `${before.code}-V${version}`, version, status: 'DRAFT', previousVersionId: before.id, createdFromApprovedVersion: true };
    const savedVersion = await saveRecord(entity, value, req.user.id, 'LOCAL_DEMO');
    await createAudit({ actor: auditActor(req.user), action: 'QUOTATION_VERSION_CREATED', entity, recordId: savedVersion.id, beforeData: before, afterData: savedVersion });
    return res.status(201).json(savedVersion);
  }
  if (entity === 'quotations' && req.body.status !== undefined && req.body.status !== before.status) return res.status(409).json({ error: 'Dùng thao tác gửi duyệt hoặc duyệt để đổi trạng thái báo giá.' });
  if (entity === 'invoices') {
    if (Math.abs(finiteAmount(value.subtotal) + finiteAmount(value.taxAmount) - finiteAmount(value.total)) > 1) return res.status(400).json({ error: 'Tổng tiền phải bằng tiền hàng cộng tiền thuế.' });
    if (finiteAmount(value.total) < finiteAmount(before.paidAmount)) return res.status(409).json({ error: 'Tổng hóa đơn không thể thấp hơn các khoản thanh toán đã phân bổ.' });
    const duplicate = liveRows(await listRecords(entity)).some((row) => row.id !== before.id && row.code === value.code);
    if (duplicate) return res.status(409).json({ error: 'Số hóa đơn đã được sử dụng.' });
    value.status = before.status; value.statusHistory = before.statusHistory || [];
    value.paidAmount = finiteAmount(before.paidAmount); value.openBalance = finiteAmount(value.total) - value.paidAmount; value.paymentStatus = before.paymentStatus || 'UNPAID';
  }
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
      saved = await saveRecord(entity, value, req.user.id, 'LOCAL_DEMO', connection);
      await updateInvoicePartner(connection, req.user.id, before, finiteAmount(saved.total) - finiteAmount(before.total));
      await connection.commit();
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  } else saved = await saveRecord(entity, value, req.user.id, 'LOCAL_DEMO');
  await createAudit({ actor: auditActor(req.user), action: 'RECORD_UPDATED', entity, recordId: saved.id, beforeData: before, afterData: saved });
  res.json(saved);
});

app.delete('/api/:entity/:id', requireAuth, requireEntity, async (req, res) => {
  if (req.user.role !== 'OWNER') return res.status(403).json({ error: 'Only the owner can cancel records.' });
  const entity = req.params.entity;
  if (['payment-allocations', 'labor-logs', 'reconciliations', 'tax-periods'].includes(entity)) return res.status(409).json({ error: 'This record requires its adjustment workflow.' });
  const before = await getRecord(entity, req.params.id);
  if (!before) return res.status(404).json({ error: 'Record not found.' });
  if (before.status === 'CANCELLED') return res.status(409).json({ error: 'Record already cancelled.' });
  if (before.status === 'LOCKED' || before.periodStatus === 'LOCKED') return res.status(409).json({ error: 'Records in a locked period cannot be cancelled.' });
  const now = new Date().toISOString();
  const reason = String(req.body?.reason || 'H?y theo y?u c?u ng??i d?ng');
  let saved;
  if (['transactions', 'payments', 'stock-movements'].includes(entity) || entity === 'invoices') {
    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      if (entity === 'transactions') {
        const locked = await getRecordForUpdate(entity, before.id, connection);
        if (!locked || locked.status === 'CANCELLED') { await connection.rollback(); return res.status(409).json({ error: 'Transaction cancelled or changed.' }); }
        if (locked.status === 'LOCKED' || locked.periodStatus === 'LOCKED') { await connection.rollback(); return res.status(409).json({ error: 'Records in a locked period cannot be cancelled.' }); }
        const pair = locked.transferGroup ? liveRows(await listRecords(entity, connection)).filter((row) => row.transferGroup === locked.transferGroup) : [locked];
        for (const candidate of pair) {
          const row = candidate.id === locked.id ? locked : await getRecordForUpdate(entity, candidate.id, connection);
          if (!row || row.status === 'CANCELLED') continue;
          if (row.status === 'LOCKED' || row.periodStatus === 'LOCKED') { await connection.rollback(); return res.status(409).json({ error: 'Cannot cancel a transfer pair in a locked period.' }); }
          const cancelled = { ...row, status: 'CANCELLED', cancelledAt: now, cancellationReason: reason };
          await saveRecord(entity, cancelled, req.user.id, 'LOCAL_DEMO', connection);
          const delta = row.direction === 'INCOME' ? -finiteAmount(row.amount) : row.direction === 'EXPENSE' ? finiteAmount(row.amount) : row.transferSide === 'IN' ? -finiteAmount(row.amount) : finiteAmount(row.amount);
          await updateCashAccount(connection, req.user.id, { accountId: row.accountId, accountName: row.accountName, delta });
        }
        saved = { ...locked, status: 'CANCELLED', cancelledAt: now, cancellationReason: reason, transferGroup: locked.transferGroup || '' };
      } else if (entity === 'payments') {
        const payment = await getRecordForUpdate(entity, before.id, connection);
        if (!payment || payment.status === 'CANCELLED' || payment.status === 'LOCKED' || payment.periodStatus === 'LOCKED') { await connection.rollback(); return res.status(409).json({ error: 'Payment cancelled, locked, or changed.' }); }
        const [allocRows] = await connection.query("SELECT data FROM records WHERE entity = ? AND JSON_UNQUOTE(JSON_EXTRACT(data, '$.paymentId')) = ?", ['payment-allocations', payment.id]);
        const allocated = allocRows.reduce((sum, row) => sum + finiteAmount(decodeData(row.data).allocatedAmount), 0);
        if (allocated > 0 || finiteAmount(payment.allocatedAmount) > 0) { await connection.rollback(); return res.status(409).json({ error: 'Payment has allocations; post an adjustment first.' }); }
        const linkedTransaction = payment.transactionId ? await getRecordForUpdate('transactions', payment.transactionId, connection) : null;
        saved = { ...payment, status: 'CANCELLED', cancelledAt: now, cancellationReason: reason };
        await saveRecord(entity, saved, req.user.id, 'LOCAL_DEMO', connection);
        if (linkedTransaction && linkedTransaction.status !== 'CANCELLED') await saveRecord('transactions', { ...linkedTransaction, status: 'CANCELLED', cancelledAt: now, cancellationReason: reason }, req.user.id, 'LOCAL_DEMO', connection);
        const delta = payment.direction === 'RECEIVED' ? -finiteAmount(payment.amount) : finiteAmount(payment.amount);
        await updateCashAccount(connection, req.user.id, { accountId: payment.accountId, accountName: payment.accountName, delta });
      } else if (entity === 'stock-movements') {
        const movement = await getRecordForUpdate(entity, before.id, connection);
        if (!movement || movement.status === 'CANCELLED' || movement.status === 'LOCKED' || movement.periodStatus === 'LOCKED') { await connection.rollback(); return res.status(409).json({ error: 'Stock movement cancelled, locked, or changed.' }); }
        const materialMatch = movement.materialId ? { id: movement.materialId } : (await listRecords('materials', connection)).find((row) => row.name === movement.materialName);
        const material = materialMatch ? await getRecordForUpdate('materials', materialMatch.id, connection) : null;
        if (!material) { await connection.rollback(); return res.status(409).json({ error: 'Material missing; inventory could not be restored.' }); }
        const delta = movement.type === 'RETURN' ? -finiteAmount(movement.quantity) : finiteAmount(movement.quantity);
        if (finiteAmount(material.stock) + delta < 0) { await connection.rollback(); return res.status(409).json({ error: 'Cannot cancel this return because its stock was issued again.' }); }
        saved = { ...movement, status: 'CANCELLED', cancelledAt: now, cancellationReason: reason };
        await saveRecord(entity, saved, req.user.id, 'LOCAL_DEMO', connection);
        await saveRecord('materials', { ...material, stock: finiteAmount(material.stock) + delta }, req.user.id, 'LOCAL_DEMO', connection);
      } else {
        const invoice = await getRecordForUpdate(entity, before.id, connection);
        if (!invoice || invoice.status === 'CANCELLED' || invoice.status === 'LOCKED' || invoice.periodStatus === 'LOCKED') { await connection.rollback(); return res.status(409).json({ error: 'Invoice cancelled, locked, or changed.' }); }
        if (finiteAmount(invoice.paidAmount) > 0) { await connection.rollback(); return res.status(409).json({ error: 'Invoice has payments; post an adjustment or refund instead.' }); }
        saved = { ...invoice, status: 'CANCELLED', cancelledAt: now, cancellationReason: reason, statusHistory: [...(invoice.statusHistory || []), { status: 'CANCELLED', at: now, actor: req.user.name, note: reason }] };
        await saveRecord(entity, saved, req.user.id, 'LOCAL_DEMO', connection);
        await updateInvoicePartner(connection, req.user.id, invoice, -finiteAmount(invoice.total));
      }
      await connection.commit();
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  } else {
    saved = { ...before, status: 'CANCELLED', cancelledAt: now, cancellationReason: reason };
    await saveRecord(entity, saved, req.user.id, 'LOCAL_DEMO');
  }
  await createAudit({ actor: auditActor(req.user), action: 'RECORD_CANCELLED', entity, recordId: saved.id, beforeData: before, afterData: saved });
  res.json(saved);
});

app.post('/api/:entity/:id/actions/:action', requireAuth, requireEntity, async (req, res) => {
  const { entity, id, action } = req.params;
  if (!canAct(req, action)) return res.status(403).json({ error: 'Bạn không có quyền thực hiện thao tác này.' });
  const before = await getRecord(entity, id);
  if (!before) return res.status(404).json({ error: 'Không tìm thấy dữ liệu.' });
  if (req.user.role === 'WORKSHOP' && entity === 'production-orders' && before.assignedTo !== req.user.name && before.assignedTo !== req.user.id) return res.status(403).json({ error: 'Bạn chỉ được cập nhật lệnh sản xuất được phân công.' });
  let after = { ...before };
  let createdProduction = null;
  if (action === 'submit-for-approval' && entity === 'quotations') after.status = 'PENDING_APPROVAL';
  else if (action === 'approve' && entity === 'quotations' && req.user.role === 'OWNER') after.status = 'APPROVED';
  else if (action === 'reject' && entity === 'quotations' && req.user.role === 'OWNER') { after.status = 'REJECTED'; after.rejectionNote = String(req.body?.note || ''); }
  else if (action === 'mark-sent' && entity === 'quotations' && ['OWNER', 'ACCOUNTANT'].includes(req.user.role) && before.status === 'APPROVED') { after.status = 'SENT'; after.sentAt = new Date().toISOString(); }
  else if (action === 'accept' && entity === 'quotations' && ['OWNER', 'ACCOUNTANT'].includes(req.user.role) && before.status === 'SENT') { after.status = 'ACCEPTED'; after.acceptedAt = new Date().toISOString(); }
  else if (action === 'create-production' && entity === 'quotations' && ['OWNER', 'ACCOUNTANT'].includes(req.user.role) && before.status === 'ACCEPTED') {
    if (before.productionOrderId) return res.status(409).json({ error: 'Báo giá này đã được chuyển thành lệnh sản xuất.' });
    const code = `SX-${new Date().getFullYear()}-${randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase()}`;
    createdProduction = await saveRecord('production-orders', { code, quotationId: before.id, quotationCode: before.code, productName: before.title, customerName: before.customerName, quantity: finiteAmount(before.quantity), assignedTo: String(req.body?.assignedTo || ''), stage: 'Chờ phân công', progress: 0, status: 'DRAFT', dueDate: String(req.body?.dueDate || '') }, req.user.id, 'LOCAL_DEMO');
    after.productionOrderId = createdProduction.id; after.productionCreatedAt = new Date().toISOString();
  }
  else if (action === 'simulate-code' && entity === 'invoices') {
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
  else if (action === 'confirm' && entity === 'reconciliations') { after.status = 'MATCHED'; after.confirmedBy = req.user.name; after.confirmedAt = new Date().toISOString(); }
  else if (action === 'lock' && entity === 'tax-periods' && req.user.role === 'OWNER') { after.status = 'LOCKED'; after.lockedBy = req.user.name; after.lockedAt = new Date().toISOString(); }
  else if (action === 'unlock' && entity === 'tax-periods' && req.user.role === 'OWNER') {
    if (!String(req.body?.note || '').trim()) return res.status(400).json({ error: 'Nhập lý do mở khóa để lưu audit.' });
    after.status = 'OPEN'; after.unlockedBy = req.user.name; after.unlockNote = req.body.note; after.unlockedAt = new Date().toISOString();
  }
  else return res.status(400).json({ error: 'Thao tác chưa được hỗ trợ cho dữ liệu này.' });
  if (entity === 'invoices' && after.status !== before.status) after.statusHistory = [...(before.statusHistory || []), { status: after.status, at: new Date().toISOString(), actor: req.user.name, note: after.verification || after.mockTaxCode || action }];
  const saved = await saveRecord(entity, after, req.user.id, 'LOCAL_DEMO');
  await createAudit({ actor: auditActor(req.user), action: action.toUpperCase(), entity, recordId: id, beforeData: before, afterData: saved });
  res.json(createdProduction ? { ...saved, createdProduction } : saved);
});

app.post('/api/import/transactions/preview', requireAuth, upload.single('file'), async (req, res) => {
  if (req.user.role === 'WORKSHOP' || !canEntity(req.user.role, 'transactions') || !canAct(req, 'create')) return res.status(403).json({ error: 'Không đủ quyền import sao kê.' });
  if (!req.file) return res.status(400).json({ error: 'Chọn file CSV hoặc XLSX.' });
  const extension = path.extname(req.file.originalname).toLowerCase();
  if (!['.csv', '.xlsx', '.xls'].includes(extension)) return res.status(415).json({ error: 'Chỉ hỗ trợ file CSV, XLS hoặc XLSX.' });
  let workbook;
  try { workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true }); }
  catch { return res.status(400).json({ error: 'Không đọc được file. Hãy kiểm tra định dạng và thử lại.' }); }
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const sourceRows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
  const existing = liveRows(await listRecords('transactions'));
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
    const candidate = { rowNumber: index + 2, date, description, amount, direction, externalReference: reference, classification: 'UNCLASSIFIED', status: 'NEEDS_REVIEW', duplicate, errors: [!date ? 'Thiếu ngày giao dịch hoặc định dạng ngày chưa hỗ trợ' : '', !description ? 'Thiếu nội dung' : '', !(amount > 0) ? 'Số tiền không hợp lệ' : '', !direction ? 'Không xác định được chiều thu/chi' : ''].filter(Boolean) };
    rows.push(await classifyWithRules(candidate));
  }
  const importId = randomUUID();
  await getPool().query('INSERT INTO imports (id, actor_id, original_name, preview_data) VALUES (?,?,?,?)', [importId, req.user.id, req.file.originalname, JSON.stringify(rows)]);
  res.json({ importId, fileName: req.file.originalname, total: rows.length, duplicateCount: rows.filter((row) => row.duplicate).length, errorCount: rows.filter((row) => row.errors.length).length, rows: rows.slice(0, 100) });
});
app.post('/api/import/transactions/:importId/commit', requireAuth, async (req, res) => {
  if (req.user.role === 'WORKSHOP' || !canEntity(req.user.role, 'transactions') || !canAct(req, 'create')) return res.status(403).json({ error: 'Không đủ quyền import sao kê.' });
  const [imports] = await getPool().query('SELECT preview_data FROM imports WHERE id = ? AND actor_id = ?', [req.params.importId, req.user.id]);
  if (!imports[0]) return res.status(404).json({ error: 'Không tìm thấy phiên import hoặc phiên đã hết hạn.' });
  const rows = decodeData(imports[0].preview_data);
  const includeDuplicates = Boolean(req.body.includeDuplicates);
  const accountId = String(req.body.accountId || '');
  if (!accountId) return res.status(400).json({ error: 'Chọn tài khoản tiền sẽ nhận các dòng sao kê.' });
  const connection = await getPool().getConnection(); const inserted = []; let skippedDuplicates = 0; let skippedInvalid = 0;
  try {
    await connection.beginTransaction();
    const account = await getRecord('cash-accounts', accountId, connection);
    if (!account) { await connection.rollback(); return res.status(404).json({ error: 'Không tìm thấy tài khoản tiền đã chọn.' }); }
    let current = liveRows(await listRecords('transactions', connection));
    for (const row of rows) {
      if (row.errors.length) { skippedInvalid += 1; continue; }
      const duplicate = Boolean(row.externalReference && current.some((item) => item.externalReference === row.externalReference)) || current.some((item) => item.date === row.date && Number(item.amount) === Number(row.amount) && String(item.description || '').trim().toLocaleLowerCase('vi') === row.description.toLocaleLowerCase('vi'));
      if (duplicate && !includeDuplicates) { skippedDuplicates += 1; continue; }
      const value = { ...row, id: randomUUID(), source: 'IMPORT', accountId, accountName: account.name, importedAt: new Date().toISOString(), duplicate: false };
      const savedRow = await saveRecord('transactions', value, req.user.id, 'LOCAL_DEMO', connection);
      inserted.push(savedRow); current.push(savedRow);
      await updateCashAccount(connection, req.user.id, { accountId, delta: row.direction === 'INCOME' ? row.amount : -row.amount });
    }
    await connection.query('DELETE FROM imports WHERE id = ?', [req.params.importId]);
    if (inserted.some((item) => item.classification === 'UNCLASSIFIED')) {
      await saveRecord('alerts', { type: 'MEDIUM', title: 'Giao dịch sao kê cần phân loại', description: `${inserted.filter((item) => item.classification === 'UNCLASSIFIED').length} dòng import đang chờ người dùng rà soát.`, reference: req.params.importId, status: 'OPEN', createdAt: new Date().toISOString() }, req.user.id, 'LOCAL_DEMO', connection);
    }
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
  await createAudit({ actor: auditActor(req.user), action: 'STATEMENT_IMPORTED', entity: 'transactions', afterData: { createdCount: inserted.length, skippedDuplicates, skippedInvalid, accountId } });
  res.json({ createdCount: inserted.length, skippedDuplicates, skippedInvalid, records: inserted });
});

app.post('/api/files', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Chọn file cần tải lên.' });
  const extension = path.extname(req.file.originalname).toLowerCase();
  const fileTypes = { '.pdf': ['application/pdf', req.file.buffer.subarray(0, 5).toString() === '%PDF-'], '.png': ['image/png', req.file.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))], '.jpg': ['image/jpeg', req.file.buffer[0] === 0xff && req.file.buffer[1] === 0xd8 && req.file.buffer[2] === 0xff], '.jpeg': ['image/jpeg', req.file.buffer[0] === 0xff && req.file.buffer[1] === 0xd8 && req.file.buffer[2] === 0xff], '.webp': ['image/webp', req.file.buffer.subarray(0, 4).toString() === 'RIFF' && req.file.buffer.subarray(8, 12).toString() === 'WEBP'] };
  const expected = fileTypes[extension];
  if (!expected || req.file.mimetype !== expected[0] || !expected[1]) return res.status(415).json({ error: 'Chỉ hỗ trợ PDF, PNG, JPEG hoặc WEBP đúng định dạng.' });
  const safeName = `${randomUUID()}${extension}`;
  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, safeName), req.file.buffer);
  await getPool().query('INSERT INTO file_assets (file_id, stored_name, original_name, mime_type, size_bytes, owner_id) VALUES (?,?,?,?,?,?)', [safeName, safeName, path.basename(req.file.originalname), req.file.mimetype, req.file.size, req.user.id]);
  await enqueueOdooSync('file-assets', safeName, {
    id: safeName,
    file_id: safeName,
    stored_name: safeName,
    original_name: path.basename(req.file.originalname),
    mime_type: req.file.mimetype,
    size_bytes: req.file.size,
    owner_id: req.user.id,
    created_at: new Date().toISOString(),
  });
  res.status(201).json({ id: safeName, name: req.file.originalname, size: req.file.size, status: 'OCR_REVIEW_REQUIRED', message: 'Tệp đã lưu. OCR chưa cấu hình; cần nhập và rà soát thông tin thủ công.' });
});
app.get('/api/files/:id', requireAuth, async (req, res) => {
  const name = path.basename(req.params.id);
  const [rows] = await getPool().query('SELECT stored_name, original_name, mime_type, owner_id FROM file_assets WHERE file_id = ? LIMIT 1', [name]);
  const file = rows[0];
  if (!file || (req.user.role === 'WORKSHOP' && file.owner_id !== req.user.id)) return res.status(404).json({ error: 'Không tìm thấy tệp.' });
  res.type(file.mime_type).sendFile(path.join(uploadDir, path.basename(file.stored_name)), (error) => { if (error && !res.headersSent) res.status(404).json({ error: 'Không tìm thấy tệp.' }); });
});

app.use((error, _req, res, _next) => {
  console.error(error);
  if (error instanceof multer.MulterError) return res.status(400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'Tệp vượt quá 15MB.' : 'Tệp tải lên không hợp lệ.' });
  res.status(500).json({ error: 'Đã có lỗi hệ thống. Vui lòng thử lại.' });
});

await initDb();
await hydrateRolePermissions();
await seedDemoData();
await mkdir(uploadDir, { recursive: true });
if (process.env.ODOO_URL && process.env.ODOO_DB && process.env.ODOO_USERNAME && process.env.ODOO_PASSWORD) {
  const backfill = await enqueueFullOdooBackfill();
  console.info(`Odoo backfill queued: ${backfill.queued} records (${JSON.stringify(backfill.counts)}).`);
}
app.listen(port, () => console.log(`FinTax Middleware API listening at http://localhost:${port}`));
setInterval(() => { void autoSyncOdooQueue(); }, 2500);
