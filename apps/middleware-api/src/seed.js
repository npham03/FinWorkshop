import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { getPool, saveRecord, listRecords, DEFAULT_WORKSHOP_ID, DEFAULT_WORKSHOP_NAME } from './db.js';

import { taxRules, catalog } from './tax-catalog.js';

export async function seedDemoData() {
  const db = getPool();

  // Ensure default workshop exists
  await db.query(
    'INSERT INTO workshops (id, name, code, active) VALUES (?, ?, ?, TRUE) ON CONFLICT (id) DO NOTHING',
    [DEFAULT_WORKSHOP_ID, DEFAULT_WORKSHOP_NAME, 'DEMO']
  );

  const [existing] = await db.query('SELECT COUNT(*) AS total FROM users');
  if (Number(existing[0].total) > 0) { await seedAllCatalogs(); await seedDemoTimeline(); return; }

  const demoPassword = await bcrypt.hash(process.env.DEMO_PASSWORD || 'FinTax@2026', 12);
  const users = [
    ['owner@fintax.demo', 'FinTax Owner', 'OWNER'],
    ['accountant@fintax.demo', 'FinTax Accountant', 'ACCOUNTANT'],
    ['warehouse@fintax.demo', 'FinTax Workshop', 'WORKSHOP'],
  ];
  for (const [email, name, role] of users) {
    await db.query(
      'INSERT INTO users (id, workshop_id, email, full_name, role, password_hash) VALUES (?, ?, ?, ?, ?, ?)',
      [randomUUID(), DEFAULT_WORKSHOP_ID, email, name, role, demoPassword]
    );
  }
  await seedAllCatalogs();
  await seedDemoTimeline();
}

export async function seedWorkshopCatalog(wid = DEFAULT_WORKSHOP_ID, { demo = false } = {}) {
  const actor = 'system-seed';
  const rules = await listRecords('tax-rules', wid);
  for (const rule of taxRules) {
    if (!rules.some((row) => row.code === rule.code)) rules.push(await saveRecord('tax-rules', { ...rule, id: randomUUID(), version: 1, status: 'REVIEW_REQUIRED', seeded: true }, actor, wid, 'DEMO_SEED'));
  }
  if (!demo) return;
  for (const entity of ['products', 'materials']) {
    const existing = await listRecords(entity, wid);
    for (const [kind, code, name, unit, price, ruleCode] of catalog.filter(([kind]) => kind === entity)) {
      if (existing.some((row) => row.code === code)) continue;
      const rule = rules.find((row) => row.code === ruleCode);
      const trackInventory = !code.startsWith('EXP-') && !code.startsWith('SVC-');
      const stock = trackInventory && entity === 'materials' ? 1000 : 0;
      await saveRecord(kind, { id: randomUUID(), code, name, unit, price, unitCost: price, cost: Math.round(price * 0.7), stock, stockValue: stock * price, trackInventory, minStock: trackInventory ? 10 : 0, category: code.startsWith('EXP-') ? 'Chi phí dịch vụ' : entity === 'materials' ? 'Vật tư xưởng' : 'Thành phẩm/dịch vụ', inputTaxRuleId: rule.id, outputTaxRuleId: rule.id, inputTaxRate: rule.taxRate, outputTaxRate: rule.taxRate, status: 'ACTIVE', seeded: true }, actor, wid, 'DEMO_SEED');
    }
  }
}

async function seedAllCatalogs() {
  const [workshops] = await getPool().query('SELECT id FROM workshops WHERE active = TRUE');
  for (const workshop of workshops) await seedWorkshopCatalog(workshop.id);
}

async function seedDemoTimeline() {
  if (process.env.SEED_DEMO_DATA === 'false') return;
  const { seedWorkflows, WORKFLOW_DEMO_ID } = await import('./seed-workflows.js');
  const { seedThirtyDays } = await import('./seed-thirty-days.js');
  await seedWorkflows();
  await seedThirtyDays(WORKFLOW_DEMO_ID);
}
