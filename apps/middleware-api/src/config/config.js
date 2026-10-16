import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  database: {
    connectionString: process.env.DATABASE_URL || 'postgresql://Pnghia:Nghia030306@localhost:5432/finworkshop',
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432', 10),
    user: process.env.PGUSER || 'Pnghia',
    password: process.env.PGPASSWORD || 'Nghia030306@',
    database: process.env.PGDATABASE || 'finworkshop',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'finworkshop-super-secret-jwt-key-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  },
  odoo: {
    url: process.env.ODOO_URL || 'http://localhost:8069',
    db: process.env.ODOO_DB || 'finworkshop_db',
    username: process.env.ODOO_USERNAME || 'admin@fin.com',
    password: process.env.ODOO_PASSWORD || 'admin',
  },
  taxApi: {
    url: process.env.TAX_API_URL || 'http://localhost:4000',
  },
};
