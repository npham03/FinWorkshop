import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import pg from 'pg';
import fs from 'node:fs/promises';
import { createWebsiteRouter, initWebsiteInquiries, validateWebsiteInquiry, websiteInquiryRateLimit } from '../../apps/middleware-api/src/website.js';

const sample = { name: 'QA Website Tester', email: 'qa.website@example.invalid', company: 'QA website fixture', phone: '+84 901 234 567', type: 'CONTACT', message: 'Tôi muốn tìm hiểu giải pháp cho xưởng của mình.', consent: true };
test('validates all inquiry types and normalizes contact details', () => {
  for (const type of ['DEMO', 'CONTACT', 'IMPLEMENTATION']) {
    const result = validateWebsiteInquiry({ ...sample, name: '  QA Tester  ', email: 'QA@Example.Invalid ', type });
    assert.deepEqual(result.fields, {});
    assert.equal(result.value.name, 'QA Tester');
    assert.equal(result.value.email, 'qa@example.invalid');
  }
  assert.deepEqual(validateWebsiteInquiry({ ...sample, phone: '', company: undefined }).fields, {});
});
test('rejects invalid fields, wrong JSON types, missing consent and control characters', () => {
  for (const [field, value] of [ ['name', 'x'], ['name', 'x'.repeat(121)], ['name', {}], ['email', 'bad-email'], ['email', 'x'.repeat(255)], ['company', 'x'.repeat(161)], ['phone', 'abc1234567'], ['phone', '1234567890123456'], ['message', 'short'], ['message', 'x'.repeat(3001)], ['message', 'invalid\0message'], ['type', 'OTHER'], ['consent', false], ['consent', 'true'] ]) {
    assert.ok(validateWebsiteInquiry({ ...sample, [field]: value }).fields[field], field);
  }
  assert.ok(validateWebsiteInquiry(null).fields.name);
  assert.ok(validateWebsiteInquiry([sample]).fields.name);
});
test('rate limiter returns Retry-After and resets its own window', () => {
  let time = 1000, passed = 0, status, retryAfter;
  const limiter = websiteInquiryRateLimit({ max: 2, windowMs: 5000, now: () => time });
  const response = { set: (_key, value) => { retryAfter = value; }, status: code => { status = code; return response; }, json: () => response };
  for (let i = 0; i < 3; i++) limiter({ ip: 'qa-test-ip' }, response, () => passed++);
  assert.equal(passed, 2); assert.equal(status, 429); assert.equal(retryAfter, '5');
  time += 5000;
  limiter({ ip: 'qa-test-ip' }, response, () => passed++);
  assert.equal(passed, 3);
});

test('real PostgreSQL + HTTP: durable writes, negative cases and no public read', { skip: process.env.RUN_WEBSITE_DB_TEST !== 'true' }, async () => {
  const pool = new pg.Pool();
  let server;
  const result = { executedAt: new Date().toISOString(), cases: [], references: [] };
  try {
    const database = (await pool.query('SELECT current_database() AS name')).rows[0].name;
    assert.match(database, /^finworkshop_(qa_|website_test)/, 'Only an isolated QA database is allowed.');
    await initWebsiteInquiries(pool);
    // DDL is repeatable and does not depend on a workshop or any financial entity.
    await initWebsiteInquiries(pool);
    const columns = (await pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='website_inquiries'")).rows.map(r => r.column_name);
    assert.ok(!columns.includes('workshop_id'));
    const financialBefore = Number((await pool.query('SELECT COUNT(*) AS total FROM records')).rows[0].total);
    const app = express();
    app.use('/api/website', createWebsiteRouter({ database: () => pool, rateLimit: websiteInquiryRateLimit({ max: 30 }) }));
    app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.status ? error.message : 'Database unavailable.' }));
    server = await new Promise(resolve => { const value = app.listen(0, '127.0.0.1', () => resolve(value)); });
    const url = `http://127.0.0.1:${server.address().port}/api/website/inquiries`;
    const post = async body => { const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) }); return { status: response.status, data: await response.json() }; };
    const runTag = `QA-WEBSITE-${Date.now()}`;
    for (const type of ['DEMO', 'CONTACT', 'IMPLEMENTATION']) {
      const response = await post({ ...sample, type, company: runTag });
      assert.equal(response.status, 201);
      assert.equal(response.data.ok, true);
      assert.match(response.data.reference, /^FW-[A-F0-9-]{36}$/);
      result.references.push(response.data.reference);
      const stored = (await pool.query('SELECT * FROM website_inquiries WHERE reference=$1', [response.data.reference])).rows[0];
      assert.equal(stored.inquiry_type, type); assert.equal(stored.email, sample.email); assert.ok(stored.consent_at);
      assert.equal(stored.created_at.toISOString(), response.data.receivedAt);
      result.cases.push({ name: `${type}: HTTP 201 + SQL persistence`, passed: true });
    }
    const company = `${runTag}'; DROP TABLE website_inquiries;--`;
    const literal = await post({ ...sample, name: "QA O'Neil", company });
    assert.equal(literal.status, 201);
    assert.equal((await pool.query('SELECT company FROM website_inquiries WHERE reference=$1', [literal.data.reference])).rows[0].company, company);
    result.references.push(literal.data.reference);
    result.cases.push({ name: 'Parameterized literal quote/SQL text remains data', passed: true });
    const count = Number((await pool.query('SELECT COUNT(*) AS total FROM website_inquiries')).rows[0].total);
    for (const patch of [{ consent: false }, { email: 'invalid' }, { message: 'short' }, { type: 'OTHER' }]) {
      const response = await post({ ...sample, ...patch });
      assert.equal(response.status, 400); assert.ok(Object.keys(response.data.fields).length);
    }
    assert.equal(Number((await pool.query('SELECT COUNT(*) AS total FROM website_inquiries')).rows[0].total), count);
    result.cases.push({ name: 'Invalid input HTTP 400 does not persist', passed: true });
    assert.equal((await post('{broken')).status, 400);
    assert.equal((await post({ ...sample, message: 'x'.repeat(20000) })).status, 413);
    assert.equal((await fetch(url)).status, 404);
    assert.equal((await fetch(`${url}/${result.references[0]}`)).status, 404);
    result.cases.push({ name: 'Malformed/oversize JSON and public list/detail blocked', passed: true });
    assert.equal(Number((await pool.query('SELECT COUNT(*) AS total FROM records')).rows[0].total), financialBefore);
    result.cases.push({ name: 'Financial records untouched', passed: true });
    const secondConnection = await pool.connect();
    try { assert.equal(Number((await secondConnection.query('SELECT COUNT(*) AS total FROM website_inquiries WHERE reference=ANY($1::text[])', [result.references])).rows[0].total), 4); }
    finally { secondConnection.release(); }
    result.cases.push({ name: 'Records visible through another SQL connection', passed: true });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await pool.end();
    await fs.writeFile(new URL('./inquiry-test-results.json', import.meta.url), JSON.stringify(result, null, 2));
  }
});
