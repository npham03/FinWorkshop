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
  const invRes = await pool.query("SELECT * FROM records WHERE record_id = '50f19b11-61d5-4552-867e-83ee4031ff56'");
  if (invRes.rows[0]) {
    console.log('--- INVOICE DATA ---');
    console.log(invRes.rows[0].data);
  }

  const jobRes = await pool.query("SELECT * FROM odoo_sync_jobs WHERE record_id = '50f19b11-61d5-4552-867e-83ee4031ff56'");
  if (jobRes.rows[0]) {
    console.log('--- SYNC JOB LAST ERROR ---');
    console.log(jobRes.rows[0].last_error);
  }

  await pool.end();
}

main().catch(console.error);
