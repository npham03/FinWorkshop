import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { getPool } from './db.js';

// Keep authentication available on a fresh local database without inserting
// sample customers, invoices, transactions, products, or other business data.
export async function seedDemoData() {
  const db = getPool();
  const [existing] = await db.query('SELECT COUNT(*) AS total FROM users');
  if (Number(existing[0].total) > 0) return;

  const demoPassword = await bcrypt.hash(process.env.DEMO_PASSWORD || 'FinTax@2026', 12);
  const users = [
    ['owner@fintax.demo', 'FinTax Owner', 'OWNER'],
    ['accountant@fintax.demo', 'FinTax Accountant', 'ACCOUNTANT'],
    ['warehouse@fintax.demo', 'FinTax Workshop', 'WORKSHOP'],
  ];
  for (const [email, name, role] of users) {
    await db.query('INSERT INTO users (id, email, full_name, role, password_hash) VALUES (?, ?, ?, ?, ?)', [randomUUID(), email, name, role, demoPassword]);
  }
}
