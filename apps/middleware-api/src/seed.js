import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { getPool, DEFAULT_WORKSHOP_ID, DEFAULT_WORKSHOP_NAME } from './db.js';

export async function seedDemoData() {
  const db = getPool();

  // Ensure default workshop exists
  await db.query(
    'INSERT INTO workshops (id, name, code, active) VALUES (?, ?, ?, TRUE) ON CONFLICT (id) DO NOTHING',
    [DEFAULT_WORKSHOP_ID, DEFAULT_WORKSHOP_NAME, 'DEMO']
  );

  const [existing] = await db.query('SELECT COUNT(*) AS total FROM users');
  if (Number(existing[0].total) > 0) return;

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
}
