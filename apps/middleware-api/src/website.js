import { randomUUID } from 'node:crypto';
import { Router, json } from 'express';
import { getPool } from './db.js';

const inquiryTypes = new Set(['DEMO', 'CONTACT', 'IMPLEMENTATION']);

// Public website requests are deliberately separate from workshop/accounting data.
export async function initWebsiteInquiries(database = getPool()) {
  await database.query(`CREATE TABLE IF NOT EXISTS website_inquiries (
    id UUID PRIMARY KEY,
    reference VARCHAR(40) NOT NULL UNIQUE,
    inquiry_type VARCHAR(20) NOT NULL CHECK (inquiry_type IN ('DEMO', 'CONTACT', 'IMPLEMENTATION')),
    name VARCHAR(120) NOT NULL,
    email VARCHAR(254) NOT NULL,
    company VARCHAR(160),
    phone VARCHAR(32),
    message TEXT NOT NULL CHECK (char_length(message) BETWEEN 10 AND 3000),
    consent_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
}

export function validateWebsiteInquiry(body) {
  const fields = {}, value = {};
  const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  function text(key, min, max, optional = false) {
    const raw = input[key];
    if (optional && (raw === undefined || raw === null || raw === '')) return '';
    if (typeof raw !== 'string') { fields[key] = 'Vui lòng nhập thông tin hợp lệ.'; return ''; }
    const result = raw.trim();
    const controls = key === 'message' ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/;
    if (result.length < min || result.length > max || controls.test(result)) fields[key] = `Vui lòng nhập từ ${min} đến ${max} ký tự hợp lệ.`;
    return result;
  }
  value.name = text('name', 2, 120);
  value.email = text('email', 3, 254).toLowerCase();
  value.company = text('company', 0, 160, true);
  value.phone = text('phone', 0, 32, true);
  value.message = text('message', 10, 3000);
  if (!fields.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) fields.email = 'Địa chỉ email chưa hợp lệ.';
  if (value.phone && !fields.phone && (!/^[+\d().\s-]+$/.test(value.phone) || !/^\d{7,15}$/.test(value.phone.replace(/\D/g, '')))) fields.phone = 'Số điện thoại cần từ 7 đến 15 chữ số.';
  if (typeof input.type !== 'string' || !inquiryTypes.has(input.type)) fields.type = 'Vui lòng chọn loại yêu cầu hợp lệ.';
  else value.type = input.type;
  if (input.consent !== true) fields.consent = 'Cần đồng ý để FinWorkshop lưu và xử lý thông tin yêu cầu.';
  return { value, fields };
}

export function websiteInquiryRateLimit({ max = 10, windowMs = 15 * 60 * 1000, now = Date.now } = {}) {
  const buckets = new Map();
  return (req, res, next) => {
    const time = now(), key = String(req.ip || req.socket?.remoteAddress || 'unknown');
    let bucket = buckets.get(key);
    if (!bucket || time - bucket.startedAt >= windowMs) {
      if (buckets.size >= 5000) buckets.delete(buckets.keys().next().value);
      bucket = { startedAt: time, count: 0 };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > max) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((windowMs - (time - bucket.startedAt)) / 1000))));
      return res.status(429).json({ error: 'Bạn gửi yêu cầu quá nhanh. Vui lòng thử lại sau ít phút.' });
    }
    next();
  };
}

export function createWebsiteRouter({ database = getPool, rateLimit = websiteInquiryRateLimit() } = {}) {
  const router = Router();
  router.post('/inquiries', rateLimit, json({ limit: '16kb' }), async (req, res, next) => {
    const { value, fields } = validateWebsiteInquiry(req.body);
    if (Object.keys(fields).length) return res.status(400).json({ error: 'Vui lòng kiểm tra thông tin gửi yêu cầu.', fields });
    const id = randomUUID(), reference = `FW-${id.toUpperCase()}`, receivedAt = new Date().toISOString();
    try {
      await database().query(`INSERT INTO website_inquiries
        (id, reference, inquiry_type, name, email, company, phone, message, consent_at, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)`,
      [id, reference, value.type, value.name, value.email, value.company || null, value.phone || null, value.message, receivedAt]);
      res.status(201).json({ ok: true, reference, receivedAt, message: 'Yêu cầu đã được ghi nhận.' });
    } catch (error) { next(error); }
  });
  return router;
}
