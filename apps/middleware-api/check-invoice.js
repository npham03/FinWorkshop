import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 5433),
  user: process.env.DB_USER || 'odoo',
  password: process.env.DB_PASSWORD || 'odoo_local',
  database: process.env.DB_NAME || 'finworkshop',
});

async function main() {
  const invRes = await pool.query("SELECT record_id, data, sync_status FROM records WHERE entity = 'invoices'");
  console.log(`Found ${invRes.rows.length} invoices:`);
  for (const row of invRes.rows) {
    const d = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
    console.log({
      id: row.record_id,
      number: d.number,
      partner: d.partnerName || d.customerName,
      status: d.status,
      taxAuthorityCode: d.taxAuthorityCode,
      taxSimulation: d.taxSimulation,
      sync_status: row.sync_status,
      odooInvoiceId: d.odooInvoiceId,
      odooId: d.odooId,
    });
  }

  const jobsRes = await pool.query("SELECT * FROM odoo_sync_jobs ORDER BY id DESC LIMIT 10");
  console.log(`Found ${jobsRes.rows.length} odoo_sync_jobs:`);
  for (const job of jobsRes.rows) {
    console.log({
      id: job.id,
      operation: job.operation,
      entity: job.entity,
      record_id: job.record_id,
      status: job.status,
      attempts: job.attempts,
      last_error: job.last_error,
    });
  }

  await pool.end();
}

main().catch(console.error);
