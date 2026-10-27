import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { businessError } from './accounting.js';

const revisions = new Map();
export const recordRevision = (wid) => revisions.get(wid) || 0;
const datedEntities = new Set(['transactions', 'invoices', 'payments', 'payment-allocations', 'stock-movements', 'labor-logs', 'reconciliations', 'accounting-adjustments', 'opening-balances']);

const { Pool } = pg;
let pool;

export const DEFAULT_WORKSHOP_ID = '00000000-0000-0000-0000-000000000001';
export const DEFAULT_WORKSHOP_NAME = 'Xưởng Mẫu FinTax Demo';

export const odooSyncEntities = [
  'branches', 'cash-accounts', 'customers', 'suppliers', 'materials', 'products', 'boms',
  'quotations', 'production-orders', 'stock-movements', 'labor-logs', 'transactions',
  'invoices', 'payments', 'payment-allocations', 'reconciliations', 'alerts',
  'classification-rules', 'tax-rules', 'tax-periods', 'users', 'role-permissions',
  'audit-logs', 'file-assets', 'accounting-adjustments',
];

const hasOdooConfig = () => Boolean(process.env.ODOO_URL && process.env.ODOO_DB && process.env.ODOO_USERNAME && process.env.ODOO_PASSWORD);

export function adaptSqlAndParams(sql, params = []) {
  if (!sql.includes('?')) return { sql, params };
  let convertedSql = sql
    .replace(/JSON_UNQUOTE\s*\(\s*JSON_EXTRACT\s*\(\s*([a-zA-Z0-9_]+)\s*,\s*'\$\.([^']+)'\s*\)\s*\)/gi, '($1->>\'$2\')')
    .replace(/CAST\s*\(\s*\?\s*AS\s*JSON\s*\)/gi, '?::jsonb')
    .replace(/ON DUPLICATE KEY UPDATE\s+data\s*=\s*VALUES\(data\),\s*sync_status\s*=\s*VALUES\(sync_status\),\s*updated_by\s*=\s*VALUES\(updated_by\)/gi,
      'ON CONFLICT (workshop_id, entity, record_id) DO UPDATE SET data = EXCLUDED.data, sync_status = EXCLUDED.sync_status, updated_by = EXCLUDED.updated_by, updated_at = CURRENT_TIMESTAMP')
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

  convertedSql = convertedSql.replace(/IN\s*\(\s*\?\s*\)|\?/gi, (placeholder) => {
    const val = params[paramIdx++];
    if (/^IN/i.test(placeholder)) {
      const values = Array.isArray(val) && val.length ? val : [Array.isArray(val) ? null : val];
      return `IN (${values.map((item) => { flatParams.push(item); return `$${flatParams.length}`; }).join(', ')})`;
    }
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
    client.beginTransaction = async () => { client.changedWorkshops = new Set(); return client.query('BEGIN'); };
    client.commit = async () => { const result = await client.query('COMMIT'); for (const wid of client.changedWorkshops || []) revisions.set(wid, recordRevision(wid) + 1); client.changedWorkshops = new Set(); return result; };
    client.rollback = async () => client.query('ROLLBACK');
    const origQuery = client.query.bind(client);
    const origRelease = client.release.bind(client);
    client.release = (...args) => { client.query = origQuery; return origRelease(...args); };
    client.query = (sql, params) => executeQuery({ query: origQuery }, sql, params);
    return client;
  };

  const origPoolQuery = pool.query.bind(pool);
  pool.query = (sql, params) => executeQuery({ query: origPoolQuery }, sql, params);

  // 1. Create workshops (tenants) table
  await pool.query(`CREATE TABLE IF NOT EXISTS workshops (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(190) NOT NULL,
    code VARCHAR(50),
    tax_id VARCHAR(50),
    owner_id VARCHAR(36),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  // Ensure default demo workshop
  await pool.query(`INSERT INTO workshops (id, name, code, active)
    VALUES ('${DEFAULT_WORKSHOP_ID}', '${DEFAULT_WORKSHOP_NAME}', 'DEMO', TRUE)
    ON CONFLICT (id) DO NOTHING`);

  // 2. Users table (with workshop_id)
  await pool.query(`CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(36) PRIMARY KEY,
    workshop_id VARCHAR(36) NOT NULL DEFAULT '${DEFAULT_WORKSHOP_ID}',
    email VARCHAR(190) NOT NULL UNIQUE,
    full_name VARCHAR(190) NOT NULL,
    role VARCHAR(40) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS workshop_id VARCHAR(36) DEFAULT '${DEFAULT_WORKSHOP_ID}'`);
  await pool.query(`UPDATE users SET workshop_id = '${DEFAULT_WORKSHOP_ID}' WHERE workshop_id IS NULL`);
  await pool.query('CREATE INDEX IF NOT EXISTS ix_users_workshop ON users (workshop_id)');

  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS approval_status VARCHAR(32) NOT NULL DEFAULT 'APPROVED'");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS odoo_sync_status VARCHAR(32) NOT NULL DEFAULT 'PENDING_SYNC'");

  // 3. Records table (with workshop_id)
  await pool.query(`CREATE TABLE IF NOT EXISTS records (
    id BIGSERIAL PRIMARY KEY,
    workshop_id VARCHAR(36) NOT NULL DEFAULT '${DEFAULT_WORKSHOP_ID}',
    entity VARCHAR(64) NOT NULL,
    record_id VARCHAR(36) NOT NULL,
    data JSONB NOT NULL,
    sync_status VARCHAR(32) NOT NULL DEFAULT 'LOCAL_DEMO',
    created_by VARCHAR(36) NULL,
    updated_by VARCHAR(36) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query(`ALTER TABLE records ADD COLUMN IF NOT EXISTS workshop_id VARCHAR(36) DEFAULT '${DEFAULT_WORKSHOP_ID}'`);
  await pool.query(`UPDATE records SET workshop_id = '${DEFAULT_WORKSHOP_ID}' WHERE workshop_id IS NULL`);

  // Migrate unique constraint to include workshop_id
  await pool.query(`DO $$
  BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_entity_record') THEN
      ALTER TABLE records DROP CONSTRAINT uq_entity_record;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_workshop_entity_record') THEN
      ALTER TABLE records ADD CONSTRAINT uq_workshop_entity_record UNIQUE (workshop_id, entity, record_id);
    END IF;
  END $$;`);
  await pool.query('CREATE INDEX IF NOT EXISTS ix_records_workshop_entity ON records (workshop_id, entity, updated_at)');

  // 4. Audit logs table (with workshop_id)
  await pool.query(`CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    workshop_id VARCHAR(36) NOT NULL DEFAULT '${DEFAULT_WORKSHOP_ID}',
    actor_id VARCHAR(36) NOT NULL,
    actor_name VARCHAR(190) NOT NULL,
    action VARCHAR(80) NOT NULL,
    entity VARCHAR(64) NOT NULL,
    record_id VARCHAR(36) NULL,
    before_data JSONB NULL,
    after_data JSONB NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS workshop_id VARCHAR(36) DEFAULT '${DEFAULT_WORKSHOP_ID}'`);
  await pool.query(`UPDATE audit_logs SET workshop_id = '${DEFAULT_WORKSHOP_ID}' WHERE workshop_id IS NULL`);
  await pool.query('CREATE INDEX IF NOT EXISTS ix_audit_created ON audit_logs (created_at)');
  await pool.query('CREATE INDEX IF NOT EXISTS ix_audit_workshop ON audit_logs (workshop_id, created_at)');

  await pool.query('ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_role VARCHAR(40)');
  await pool.query('ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS reason TEXT');

  // 5. Imports table (with workshop_id)
  await pool.query(`CREATE TABLE IF NOT EXISTS imports (
    id VARCHAR(36) PRIMARY KEY,
    workshop_id VARCHAR(36) NOT NULL DEFAULT '${DEFAULT_WORKSHOP_ID}',
    actor_id VARCHAR(36) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    preview_data JSONB NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query(`ALTER TABLE imports ADD COLUMN IF NOT EXISTS workshop_id VARCHAR(36) DEFAULT '${DEFAULT_WORKSHOP_ID}'`);
  await pool.query(`UPDATE imports SET workshop_id = '${DEFAULT_WORKSHOP_ID}' WHERE workshop_id IS NULL`);

  // 6. File assets table (with workshop_id)
  await pool.query(`CREATE TABLE IF NOT EXISTS file_assets (
    file_id VARCHAR(255) PRIMARY KEY,
    workshop_id VARCHAR(36) NOT NULL DEFAULT '${DEFAULT_WORKSHOP_ID}',
    stored_name VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(120) NOT NULL,
    size_bytes BIGINT NOT NULL,
    owner_id VARCHAR(36) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query(`ALTER TABLE file_assets ADD COLUMN IF NOT EXISTS workshop_id VARCHAR(36) DEFAULT '${DEFAULT_WORKSHOP_ID}'`);
  await pool.query(`UPDATE file_assets SET workshop_id = '${DEFAULT_WORKSHOP_ID}' WHERE workshop_id IS NULL`);
  await pool.query('CREATE INDEX IF NOT EXISTS ix_file_owner ON file_assets (owner_id, created_at)');

  // 7. Role permissions table
  await pool.query(`CREATE TABLE IF NOT EXISTS role_permissions (
    role VARCHAR(40) PRIMARY KEY,
    entities JSONB NOT NULL,
    actions JSONB NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query('ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS permissions_version INT NOT NULL DEFAULT 1');
  await pool.query(`CREATE TABLE IF NOT EXISTS workshop_role_permissions (
    workshop_id VARCHAR(36) NOT NULL, role VARCHAR(40) NOT NULL, entities JSONB NOT NULL, actions JSONB NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (workshop_id, role))`);
  await pool.query(`INSERT INTO workshop_role_permissions (workshop_id, role, entities, actions)
    SELECT '${DEFAULT_WORKSHOP_ID}', role, entities, actions FROM role_permissions ON CONFLICT DO NOTHING`);
  await pool.query(`ALTER TABLE workshops ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb`);
  await pool.query(`CREATE TABLE IF NOT EXISTS user_invitations (
    id VARCHAR(36) PRIMARY KEY, workshop_id VARCHAR(36) NOT NULL, email VARCHAR(190) NOT NULL, role VARCHAR(40) NOT NULL,
    token_hash VARCHAR(64) NOT NULL UNIQUE, expires_at TIMESTAMP NOT NULL, used_at TIMESTAMP, created_by VARCHAR(36) NOT NULL)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS record_business_keys (
    workshop_id VARCHAR(36) NOT NULL, entity VARCHAR(64) NOT NULL, business_key TEXT NOT NULL, record_id VARCHAR(255) NOT NULL,
    PRIMARY KEY (workshop_id, entity, business_key))`);

  // 8. Odoo sync jobs table
  await pool.query(`CREATE TABLE IF NOT EXISTS odoo_sync_jobs (
    id VARCHAR(36) PRIMARY KEY,
    workshop_id VARCHAR(36) NOT NULL DEFAULT '${DEFAULT_WORKSHOP_ID}',
    entity VARCHAR(64) NOT NULL,
    record_id VARCHAR(255) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    attempts INT NOT NULL DEFAULT 0,
    last_error TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query(`ALTER TABLE odoo_sync_jobs ADD COLUMN IF NOT EXISTS workshop_id VARCHAR(36) DEFAULT '${DEFAULT_WORKSHOP_ID}'`);
  await pool.query(`UPDATE odoo_sync_jobs SET workshop_id = '${DEFAULT_WORKSHOP_ID}' WHERE workshop_id IS NULL`);
  await pool.query('CREATE INDEX IF NOT EXISTS ix_sync_status ON odoo_sync_jobs (status, created_at)');
  await pool.query('CREATE INDEX IF NOT EXISTS ix_sync_record ON odoo_sync_jobs (entity, record_id)');
  await pool.query("ALTER TABLE odoo_sync_jobs ADD COLUMN IF NOT EXISTS operation VARCHAR(40) DEFAULT 'UPSERT'");
  await pool.query('CREATE INDEX IF NOT EXISTS ix_records_invoice_alloc ON records (workshop_id, entity, (data->>\'invoiceId\'))');
  await pool.query('CREATE INDEX IF NOT EXISTS ix_records_payment_alloc ON records (workshop_id, entity, (data->>\'paymentId\'))');
}

export function getPool() {
  if (!pool) throw new Error('Database chưa được khởi tạo');
  return pool;
}

export function decodeData(value) {
  if (value && typeof value === 'object' && !Buffer.isBuffer(value)) return value;
  return JSON.parse(Buffer.isBuffer(value) ? value.toString('utf8') : value);
}

export async function createWorkshop({ id = randomUUID(), name, code, taxId = null, ownerId = null }) {
  const generatedCode = code || name.trim().slice(0, 10).toUpperCase().replace(/[^A-Z0-9]/g, '') || 'WS';
  await getPool().query(
    'INSERT INTO workshops (id, name, code, tax_id, owner_id) VALUES (?, ?, ?, ?, ?)',
    [id, name.trim(), generatedCode, taxId, ownerId]
  );
  return { id, name: name.trim(), code: generatedCode, taxId, ownerId };
}

export async function getWorkshop(id) {
  const wid = id || DEFAULT_WORKSHOP_ID;
  const [rows] = await getPool().query('SELECT id, name, code, tax_id, owner_id, active, settings, created_at FROM workshops WHERE id = ? LIMIT 1', [wid]);
  return rows[0] || null;
}

export async function listRecords(entity, workshopIdOrExecutor = DEFAULT_WORKSHOP_ID, maybeExecutor = null) {
  let wid = DEFAULT_WORKSHOP_ID;
  let executor = getPool();
  if (workshopIdOrExecutor && typeof workshopIdOrExecutor === 'object' && workshopIdOrExecutor.query) {
    executor = workshopIdOrExecutor;
  } else {
    wid = workshopIdOrExecutor || DEFAULT_WORKSHOP_ID;
    if (maybeExecutor && maybeExecutor.query) executor = maybeExecutor;
  }
  const [rows] = await executor.query(
    'SELECT record_id, data, sync_status, updated_at FROM records WHERE entity = ? AND workshop_id = ? ORDER BY updated_at DESC',
    [entity, wid]
  );
  return rows.map((row) => ({ ...decodeData(row.data), id: row.record_id, syncStatus: row.sync_status }));
}

export async function getRecord(entity, id, workshopIdOrExecutor = DEFAULT_WORKSHOP_ID, maybeExecutor = null) {
  let wid = DEFAULT_WORKSHOP_ID;
  let executor = getPool();
  if (workshopIdOrExecutor && typeof workshopIdOrExecutor === 'object' && workshopIdOrExecutor.query) {
    executor = workshopIdOrExecutor;
  } else {
    wid = workshopIdOrExecutor || DEFAULT_WORKSHOP_ID;
    if (maybeExecutor && maybeExecutor.query) executor = maybeExecutor;
  }
  const [rows] = await executor.query(
    'SELECT record_id, data, sync_status FROM records WHERE entity = ? AND record_id = ? AND workshop_id = ? LIMIT 1',
    [entity, id, wid]
  );
  return rows[0] ? { ...decodeData(rows[0].data), id: rows[0].record_id, syncStatus: rows[0].sync_status } : null;
}

export async function getRecordForUpdate(entity, id, workshopIdOrExecutor, maybeExecutor = null) {
  let wid = DEFAULT_WORKSHOP_ID;
  let executor = null;
  if (workshopIdOrExecutor && typeof workshopIdOrExecutor === 'object' && workshopIdOrExecutor.query) {
    executor = workshopIdOrExecutor;
  } else {
    wid = workshopIdOrExecutor || DEFAULT_WORKSHOP_ID;
    executor = maybeExecutor;
  }
  if (!executor) throw new Error('getRecordForUpdate requires a transaction connection.');
  const [rows] = await executor.query(
    'SELECT record_id, data, sync_status FROM records WHERE entity = ? AND record_id = ? AND workshop_id = ? LIMIT 1 FOR UPDATE',
    [entity, id, wid]
  );
  return rows[0] ? { ...decodeData(rows[0].data), id: rows[0].record_id, syncStatus: rows[0].sync_status } : null;
}

export async function saveRecord(entity, data, actorId, ...rest) {
  let wid = data.workshopId || null;
  let syncStatus = 'LOCAL_DEMO';
  let executor = getPool();

  for (const arg of rest) {
    if (!arg) continue;
    if (typeof arg === 'object' && typeof arg.query === 'function') {
      executor = arg;
    } else if (typeof arg === 'string') {
      if (arg === 'LOCAL_DEMO' || arg === 'DEMO_SEED' || arg === 'PENDING_ODOO') {
        syncStatus = arg;
      } else {
        wid = arg;
      }
    }
  }

  wid = wid || data.workshopId || DEFAULT_WORKSHOP_ID;
  if (executor === getPool()) {
    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      const saved = await saveRecord(entity, data, actorId, wid, syncStatus, connection);
      await connection.commit();
      return saved;
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  }
  await executor.query('SELECT pg_advisory_xact_lock(hashtext(?))', [`period:${wid}`]);
  if (datedEntities.has(entity)) {
    const before = data.id ? await getRecord(entity, data.id, wid, executor) : null;
    await assertOpenPeriod(data, wid, executor);
    if (before) await assertOpenPeriod(before, wid, executor);
  }
  (executor.changedWorkshops ||= new Set()).add(wid);
  const id = data.id || randomUUID();
  const value = { ...data, id, workshopId: wid };
  const keyed = new Set(['invoices','quotations','customers','suppliers','materials','products','boms','production-orders','cash-accounts']);
  if (keyed.has(entity) && String(value.code || '').trim()) {
    const code = String(value.code).trim().toUpperCase();
    const party = value.counterpartyId || value.taxCode || String(value.counterparty || '').trim().toUpperCase();
    const key = entity === 'invoices' ? `${value.direction || value.type}:${party}:${value.series || ''}:${code}` : code;
    // Reserve inside the document transaction. The unique database key also protects concurrent requests.
    const [prior] = await executor.query('SELECT record_id FROM record_business_keys WHERE workshop_id = ? AND entity = ? AND business_key = ?', [wid, entity, key]);
    if (prior[0] && prior[0].record_id !== id) throw businessError('Mã đã tồn tại trong doanh nghiệp.', 409);
    const [legacy] = await executor.query('SELECT record_id, data FROM records WHERE workshop_id = ? AND entity = ? AND record_id <> ? AND UPPER(TRIM(data->>\'code\')) = ?', [wid, entity, id, code]);
    if (legacy.some(row => entity !== 'invoices' || (() => { const other = decodeData(row.data); return (other.direction || other.type) === (value.direction || value.type) && (other.counterpartyId || other.taxCode || String(other.counterparty || '').trim().toUpperCase()) === party && (other.series || '') === (value.series || ''); })())) throw businessError('Mã đã tồn tại trong doanh nghiệp.', 409);
    await executor.query('INSERT INTO record_business_keys (workshop_id, entity, business_key, record_id) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING', [wid, entity, key, id]);
    const [reserved] = await executor.query('SELECT record_id FROM record_business_keys WHERE workshop_id = ? AND entity = ? AND business_key = ?', [wid, entity, key]);
    if (reserved[0]?.record_id !== id) throw businessError('Yêu cầu trùng chứng từ; tải lại danh sách.', 409);
  }
  const syncable = odooSyncEntities.includes(entity);
  const shouldSync = syncable && hasOdooConfig() && syncStatus !== 'DEMO_SEED';
  const effectiveStatus = shouldSync ? 'PENDING_ODOO' : syncStatus;
  await executor.query(`INSERT INTO records (workshop_id, entity, record_id, data, sync_status, created_by, updated_by)
    VALUES (?, ?, ?, CAST(? AS JSON), ?, ?, ?)
    ON CONFLICT (workshop_id, entity, record_id) DO UPDATE SET data = EXCLUDED.data, sync_status = EXCLUDED.sync_status, updated_by = EXCLUDED.updated_by, updated_at = CURRENT_TIMESTAMP`,
  [wid, entity, id, JSON.stringify(value), effectiveStatus, actorId || null, actorId || null]);
  if (shouldSync) await enqueueOdooSync(entity, id, value, wid, executor);
  return { ...value, syncStatus: effectiveStatus };
}

export async function enqueueOdooSync(entity, recordId, payload, workshopId = DEFAULT_WORKSHOP_ID, executor = getPool()) {
  if ((!hasOdooConfig() && entity !== 'users') || !odooSyncEntities.includes(entity)) return false;
  const id = String(recordId ?? payload?.id ?? '');
  const wid = workshopId || DEFAULT_WORKSHOP_ID;
  if (!id) throw new Error(`A source ID is required to sync ${entity} to Odoo.`);
  if (id.length > 255) throw new Error(`Source ID for ${entity} exceeds the Odoo sync limit.`);
  const [pending] = await executor.query(
    "SELECT id FROM odoo_sync_jobs WHERE entity = ? AND record_id = ? AND workshop_id = ? AND status IN ('PENDING', 'PENDING_RETRY', 'PENDING_MAPPING') ORDER BY created_at DESC LIMIT 1",
    [entity, id, wid],
  );
  const json = JSON.stringify({ ...payload, id });
  if (pending[0]) {
    await executor.query('UPDATE odoo_sync_jobs SET payload = CAST(? AS JSON), status = ?, operation = ?, last_error = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [json, 'PENDING', entity === 'users' ? 'REGISTER_USER' : 'UPSERT', pending[0].id]);
  } else {
    await executor.query('INSERT INTO odoo_sync_jobs (id, workshop_id, entity, record_id, payload, status, operation) VALUES (?, ?, ?, ?, CAST(? AS JSON), ?, ?)', [randomUUID(), wid, entity, id, json, 'PENDING', entity === 'users' ? 'REGISTER_USER' : 'UPSERT']);
  }
  return true;
}

export async function createAudit({ actor, action, entity, recordId = null, workshopId = null, beforeData = null, afterData = null, reason = null, executor = getPool() }) {
  const wid = workshopId || actor?.workshopId || DEFAULT_WORKSHOP_ID;
  const [result] = await executor.query(`INSERT INTO audit_logs (workshop_id, actor_id, actor_name, actor_role, action, entity, record_id, before_data, after_data, reason)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`, [wid, actor.id, actor.name || 'System', actor.role || null, action, entity, recordId, beforeData ? JSON.stringify(beforeData) : null, afterData ? JSON.stringify(afterData) : null, reason || afterData?.cancellationReason || afterData?.writeOffReason || afterData?.rejectionNote || afterData?.unlockNote || null]);
  const insertId = result.insertId || result[0]?.id;
  await enqueueOdooSync('audit-logs', String(insertId), {
    id: String(insertId), actorId: actor.id, actorName: actor.name, action, entity, recordId,
    role: actor.role, reason, beforeData, afterData, createdAt: new Date().toISOString(),
  }, wid, executor);
}

export async function ensureUuidRecordId(entity, data, actorId, workshopId, status) {
  const record = { ...data, id: data.id || randomUUID() };
  return saveRecord(entity, record, actorId, workshopId, status);
}

export async function assertOpenPeriod(record, wid, executor = getPool()) {
  const date = String(record.date || record.issueDate || record.startDate || record.createdAt || new Date().toISOString()).slice(0, 10);
  const [periods] = await executor.query("SELECT data FROM records WHERE workshop_id = ? AND entity = 'tax-periods' AND data->>'status' = 'LOCKED'", [wid]);
  if (record.periodStatus === 'LOCKED' || periods.some(({ data }) => { const p = decodeData(data); return p.startDate <= date && p.endDate >= date; })) {
    throw businessError('Chứng từ thuộc kỳ đã khóa. Chủ xưởng phải mở khóa kỳ và nhập lý do trước khi thay đổi.', 409);
  }
}
