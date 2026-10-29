import dotenv from 'dotenv';
dotenv.config();

import { initDb, getRecord } from './src/db.js';
import { syncOdooInvoice } from './src/odoo-documents.js';

async function main() {
  await initDb();
  const invoice = await getRecord('invoices', '50f19b11-61d5-4552-867e-83ee4031ff56', '00000000-0000-0000-0000-000000000002');
  console.log('Invoice found:', invoice ? invoice.code : 'NOT FOUND');
  if (invoice) {
    try {
      const res = await syncOdooInvoice(invoice, 'invoices:50f19b11-61d5-4552-867e-83ee4031ff56');
      console.log('SYNC SUCCESS:', res);
    } catch (err) {
      console.error('SYNC FAILED WITH ERROR:', err);
    }
  }
  process.exit(0);
}

main().catch(console.error);
