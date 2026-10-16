import pg from 'pg';
import bcrypt from 'bcryptjs';
import { config } from './config.js';

const { Pool } = pg;

export const pool = new Pool(
  config.database.host && config.database.user
    ? {
        host: config.database.host,
        port: config.database.port,
        user: config.database.user,
        password: config.database.password,
        database: config.database.database,
      }
    : { connectionString: config.database.connectionString }
);

pool.on('error', (err) => {
  console.error('[DB] Unexpected error on idle PostgreSQL client:', err);
});

export const query = (text, params) => pool.query(text, params);

const initSchema = async () => {
  const ddl = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(100) UNIQUE NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(50) DEFAULT 'accountant',
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS transaction_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(20) NOT NULL,
      category VARCHAR(50) NOT NULL,
      description TEXT NOT NULL,
      amount NUMERIC(15, 2) NOT NULL,
      accounting_entry JSONB,
      attachment_note TEXT,
      odoo_sync_status VARCHAR(30) DEFAULT 'pending_sync',
      odoo_move_id INTEGER DEFAULT NULL,
      tax_alert JSONB,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS invoice_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      invoice_number VARCHAR(100) UNIQUE NOT NULL,
      invoice_date DATE NOT NULL,
      seller_tax_code VARCHAR(20) NOT NULL,
      buyer_name VARCHAR(255),
      buyer_tax_code VARCHAR(20),
      buyer_address TEXT,
      items JSONB NOT NULL DEFAULT '[]'::jsonb,
      subtotal NUMERIC(15, 2) NOT NULL,
      vat_rate NUMERIC(5, 4) DEFAULT 0.1,
      vat_amount NUMERIC(15, 2) NOT NULL,
      total_amount NUMERIC(15, 2) NOT NULL,
      tax_authority_code VARCHAR(100) DEFAULT NULL,
      tax_code_status VARCHAR(30) DEFAULT 'pending',
      tax_rejection_reason TEXT DEFAULT NULL,
      odoo_sync_status VARCHAR(30) DEFAULT 'pending_sync',
      odoo_invoice_id INTEGER DEFAULT NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_trans_user_id ON transaction_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_trans_created_at ON transaction_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_invoice_user_id ON invoice_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_invoice_number ON invoice_logs(invoice_number);
  `;

  await pool.query(ddl);

  // Seed default demo users if users table is empty
  const userCount = await pool.query('SELECT COUNT(*) FROM users');
  if (parseInt(userCount.rows[0].count, 10) === 0) {
    const adminPassHash = await bcrypt.hash('admin123', 12);
    const accPassHash = await bcrypt.hash('acc123', 12);
    await pool.query(
      `INSERT INTO users (username, email, password_hash, role)
       VALUES 
        ('admin', 'admin@fin.com', $1, 'admin'),
        ('accountant', 'accountant@fin.com', $2, 'accountant')
       ON CONFLICT DO NOTHING;`,
      [adminPassHash, accPassHash]
    );
    console.log('[DB] Đã khởi tạo người dùng mẫu: admin@fin.com (pass: admin123) / accountant@fin.com (pass: acc123)');
  }
};

export const connectDB = async () => {
  try {
    const res = await pool.query('SELECT current_database(), current_user, version()');
    const { current_database, current_user } = res.rows[0];
    console.log(`[DB] PostgreSQL kết nối thành công: DB "${current_database}" với user "${current_user}"`);
    await initSchema();
    console.log('[DB] Schemas & Tables đã sẵn sàng.');
  } catch (err) {
    console.error(`[DB] PostgreSQL kết nối thất bại: ${err.message}`);
    process.exit(1);
  }
};
