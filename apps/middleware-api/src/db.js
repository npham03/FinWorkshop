import pg from 'pg';
import { randomUUID } from 'node:crypto';

const { Pool } = pg;
let pool;

export const odooSyncEntities = [
  'branches', 'cash-accounts', 'customers', 'suppliers', 'materials', 'products', 'boms',
  'quotations', 'production-orders', 'stock-movements', 'labor-logs', 'transactions',
  'invoices', 'payments', 'payment-allocations', 'reconciliations', 'alerts',
  'classification-rules', 'tax-rules', 'tax-periods', 'users', 'role-permissions',
  'audit-logs', 'file-assets',
];

const hasOdooConfig = () => Boolean(process.env.ODOO_URL && process.env.ODOO_DB && process.env.ODOO_USERNAME && process.env.ODOO_PASSWORD);

export function adaptSqlAndParams(sql, params = []) {
  let convertedSql = sql
    .replace(/JSON_UNQUOTE\s*\(\s*JSON_EXTRACT\s*\(\s*([a-zA-Z0-9_]+)\s*,\s*'\$\.([^']+)'\s*\)\s*\)/gi, '($1->>\'$2\')')
    .replace(/CAST\s*\(\s*\?\s*AS\s*JSON\s*\)/gi, '?::jsonb')
    .replace(/ON DUPLICATE KEY UPDATE\s+data\s*=\s*VALUES\(data\),\s*sync_status\s*=\s*VALUES\(sync_status\),\s*updated_by\s*=\s*VALUES\(updated_by\)/gi,
      'ON CONFLICT (entity, record_id) DO UPDATE SET data = EXCLUDED.data, sync_status = EXCLUDED.sync_status, updated_by = EXCLUDED.updated_by, updated_at = CURRENT_TIMESTAMP')
    .replace(/ON DUPLICATE KEY UPDATE\s+password_hash\s*=\s*VALUES\(password_hash\)/gi,
      'ON CONFLICT (id) DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = CURRENT_TIMESTAMP')
    .replace(/ON DUPLICATE KEY UPDATE\s+entities\s*=\s*VALUES\(entities\),\s*actions\s*=\s*VALUES\(actions\)/gi,
      'ON CONFLICT (role) DO UPDATE SET entities = EXCLUDED.entities, actions = EXCLUDED.actions, updated_at = CURRENT_TIMESTAMP')
    .replace(/INSERT IGNORE INTO role_permissions/gi, 'INSERT INTO role_permissions');

  if (/INSERT INTO role_permissions/i.test(convertedSql) && !/ON CONFLICT/i.test(convertedSql)) {
    convertedSql += ' ON CONFLICT (role) DO NOTHING';
  }

  if (/INSERT INTO audit_logs/i.test(convertedSql) && !/RETURNING/i.test(convertedSql)) {
    convertedSql += ' RETURNING id';
  }

  const flatParams = [];
  let paramIdx = 0;

  // Handle IN (?) where parameter is an array
  convertedSql = convertedSql.replace(/IN\s*\(\s*\?\s*\)/gi, () => {
    const val = params[paramIdx++];
    if (Array.isArray(val)) {
      if (val.length === 0) {
        flatParams.push(null);
        return `IN ($${flatParams.length})`;
      }
      const placeholders = val.map((item) => {
        flatParams.push(item);
        return `$${flatParams.length}`;
      });
      return `IN (${placeholders.join(', ')})`;
    } else {
      flatParams.push(val);
      return `IN ($${flatParams.length})`;
    }
  });

  // Replace remaining '?' placeholders
  convertedSql = convertedSql.replace(/\?/g, () => {
    if (paramIdx >= params.length) return '?';
    const val = params[paramIdx++];
    flatParams.push(val);
    return `$${flatParams.length}`;
  });

  return { sql: convertedSql, params: flatParams };
}

async function executeQuery(executor, sql, params = []) {
  const { sql: adaptedSql, params: adaptedParams } = adaptSqlAndParams(sql, params);
  const result = await executor.query(adaptedSql, adaptedParams);

  const rows = result.rows || [];
  rows.rowCount = result.rowCount ?? rows.length;
  rows.affectedRows = result.rowCount ?? rows.length;
  rows.insertId = rows[0]?.id;

  return [rows, result.fields || []];
}

export async function initDb() {
  const host = process.env.DB_HOST || process.env.PGHOST || '127.0.0.1';
  const port = Number(process.env.DB_PORT || process.env.PGPORT || 5433);
  const user = process.env.DB_USER || process.env.PGUSER || 'odoo';
  const password = process.env.DB_PASSWORD || process.env.PGPASSWORD || 'odoo_local';
  const targetDb = process.env.DB_NAME || process.env.PGDATABASE || 'finworkshop';

  // Ensure target database exists
  try {
    const adminPool = new Pool({ host, port, user, password, database: 'postgres', connectionTimeoutMillis: 5000 });
    const checkDb = await adminPool.query('SELECT 1 FROM pg_database WHERE datname = $1', [targetDb]);
    if (checkDb.rows.length === 0) {
      console.info(`Creating database "${targetDb}" in PostgreSQL...`);
      await adminPool.query(`CREATE DATABASE "${targetDb}"`);
    }
    await adminPool.end();
  } catch (err) {
    console.warn(`Database verification note: ${err.message}`);
  }

  pool = new Pool({
    host,
    port,
    user,
    password,
    database: targetDb,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  pool.getConnection = async () => {
    const client = await pool.connect();
    client.beginTransaction = async () => client.query('BEGIN');
    client.commit = async () => client.query('COMMIT');
    client.rollback = async () => client.query('ROLLBACK');
    const origQuery = client.query.bind(client);
    client.query = (sql, params) => executeQuery({ query: origQuery }, sql, params);
    return client;
  };

  const origPoolQuery = pool.query.bind(pool);
  pool.query = (sql, params) => executeQuery({ query: origPoolQuery }, sql, params);

  // Create schemas for FinTax tables
  await pool.query(`CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(36) PRIMARY KEY,
    email VARCHAR(190) NOT NULL UNIQUE,
    full_name VARCHAR(190) NOT NULL,
    role VARCHAR(40) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS records (
    id BIGSERIAL PRIMARY KEY,
    entity VARCHAR(64) NOT NULL,
    record_id VARCHAR(36) NOT NULL,
    data JSONB NOT NULL,
    sync_status VARCHAR(32) NOT NULL DEFAULT 'LOCAL_DEMO',
    created_by VARCHAR(36) NULL,
    updated_by VARCHAR(36) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_entity_record UNIQUE (entity, record_id)
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS ix_records_entity_updated ON records (entity, updated_at)');

  await pool.query(`CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    actor_id VARCHAR(36) NOT NULL,
    actor_name VARCHAR(190) NOT NULL,
    action VARCHAR(80) NOT NULL,
    entity VARCHAR(64) NOT NULL,
    record_id VARCHAR(36) NULL,
    before_data JSONB NULL,
    after_data JSONB NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS ix_audit_created ON audit_logs (created_at)');
  await pool.query('CREATE INDEX IF NOT EXISTS ix_audit_entity ON audit_logs (entity, record_id)');

  await pool.query(`CREATE TABLE IF NOT EXISTS imports (
    id VARCHAR(36) PRIMARY KEY,
    actor_id VARCHAR(36) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    preview_data JSONB NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS file_assets (
    file_id VARCHAR(255) PRIMARY KEY,
    stored_name VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(120) NOT NULL,
    size_bytes BIGINT NOT NULL,
    owner_id VARCHAR(36) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS ix_file_owner ON file_assets (owner_id, created_at)');

  await pool.query(`CREATE TABLE IF NOT EXISTS role_permissions (
    role VARCHAR(40) PRIMARY KEY,
    entities JSONB NOT NULL,
    actions JSONB NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS odoo_sync_jobs (
    id VARCHAR(36) PRIMARY KEY,
    entity VARCHAR(64) NOT NULL,
    record_id VARCHAR(255) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    attempts INT NOT NULL DEFAULT 0,
    last_error TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS ix_sync_status ON odoo_sync_jobs (status, created_at)');
  await pool.query('CREATE INDEX IF NOT EXISTS ix_sync_record ON odoo_sync_jobs (entity, record_id)');
}

export function getPool() {
  if (!pool) throw new Error('Database chưa được khởi tạo');
  return pool;
}

export function decodeData(value) {
  if (value && typeof value === 'object' && !Buffer.isBuffer(value)) return value;
  return JSON.parse(Buffer.isBuffer(value) ? value.toString('utf8') : value);
}

export async function listRecords(entity, executor = getPool()) {
  const [rows] = await executor.query('SELECT record_id, data, sync_status, updated_at FROM records WHERE entity = ? ORDER BY updated_at DESC', [entity]);
  return rows.map((row) => ({ ...decodeData(row.data), id: row.record_id, syncStatus: row.sync_status }));
}

export async function getRecord(entity, id, executor = getPool()) {
  const [rows] = await executor.query('SELECT record_id, data, sync_status FROM records WHERE entity = ? AND record_id = ? LIMIT 1', [entity, id]);
  return rows[0] ? { ...decodeData(rows[0].data), id: rows[0].record_id, syncStatus: rows[0].sync_status } : null;
}

export async function getRecordForUpdate(entity, id, executor) {
  if (!executor) throw new Error('getRecordForUpdate requires a transaction connection.');
  const [rows] = await executor.query('SELECT record_id, data, sync_status FROM records WHERE entity = ? AND record_id = ? LIMIT 1 FOR UPDATE', [entity, id]);
  return rows[0] ? { ...decodeData(rows[0].data), id: rows[0].record_id, syncStatus: rows[0].sync_status } : null;
}

export async function saveRecord(entity, data, actorId, syncStatus = 'LOCAL_DEMO', executor = getPool()) {
  const id = data.id || randomUUID();
  const value = { ...data, id };
  const syncable = odooSyncEntities.includes(entity);
  const shouldSync = syncable && hasOdooConfig() && syncStatus !== 'DEMO_SEED';
  const effectiveStatus = shouldSync ? 'PENDING_ODOO' : syncStatus;
  await executor.query(`INSERT INTO records (entity, record_id, data, sync_status, created_by, updated_by)
    VALUES (?, ?, CAST(? AS JSON), ?, ?, ?)
    ON DUPLICATE KEY UPDATE data = VALUES(data), sync_status = VALUES(sync_status), updated_by = VALUES(updated_by)`,
  [entity, id, JSON.stringify(value), effectiveStatus, actorId || null, actorId || null]);
  if (shouldSync) await enqueueOdooSync(entity, id, value, executor);
  return { ...value, syncStatus: effectiveStatus };
}

export async function enqueueOdooSync(entity, recordId, payload, executor = getPool()) {
  if (!hasOdooConfig() || !odooSyncEntities.includes(entity)) return false;
  const id = String(recordId ?? payload?.id ?? '');
  if (!id) throw new Error(`A source ID is required to sync ${entity} to Odoo.`);
  if (id.length > 255) throw new Error(`Source ID for ${entity} exceeds the Odoo sync limit.`);
  const [pending] = await executor.query(
    "SELECT id FROM odoo_sync_jobs WHERE entity = ? AND record_id = ? AND status IN ('PENDING', 'PENDING_RETRY', 'PENDING_MAPPING') ORDER BY created_at DESC LIMIT 1",
    [entity, id],
  );
  const json = JSON.stringify({ ...payload, id });
  if (pending[0]) {
    await executor.query('UPDATE odoo_sync_jobs SET payload = CAST(? AS JSON), status = ?, last_error = NULL WHERE id = ?', [json, 'PENDING', pending[0].id]);
  } else {
    await executor.query('INSERT INTO odoo_sync_jobs (id, entity, record_id, payload, status) VALUES (?, ?, ?, CAST(? AS JSON), ?)', [randomUUID(), entity, id, json, 'PENDING']);
  }
  return true;
}

export async function createAudit({ actor, action, entity, recordId = null, beforeData = null, afterData = null }) {
  const [result] = await getPool().query(`INSERT INTO audit_logs (actor_id, actor_name, action, entity, record_id, before_data, after_data)
    VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`, [actor.id, actor.name, action, entity, recordId, beforeData ? JSON.stringify(beforeData) : null, afterData ? JSON.stringify(afterData) : null]);
  const insertId = result.insertId || result[0]?.id;
  await enqueueOdooSync('audit-logs', String(insertId), {
    id: String(insertId), actorId: actor.id, actorName: actor.name, action, entity, recordId,
    beforeData, afterData, createdAt: new Date().toISOString(),
  });
}

export async function ensureUuidRecordId(entity, data, actorId, status) {
  const record = { ...data, id: data.id || randomUUID() };
  return saveRecord(entity, record, actorId, status);
}
