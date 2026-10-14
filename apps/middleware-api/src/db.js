import mysql from 'mysql2/promise';
import { randomUUID } from 'node:crypto';

let pool;

export const odooSyncEntities = [
  'branches', 'cash-accounts', 'customers', 'suppliers', 'materials', 'products', 'boms',
  'quotations', 'production-orders', 'stock-movements', 'labor-logs', 'transactions',
  'invoices', 'payments', 'payment-allocations', 'reconciliations', 'alerts',
  'classification-rules', 'tax-rules', 'tax-periods', 'users', 'role-permissions',
  'audit-logs', 'file-assets',
];

const hasOdooConfig = () => Boolean(process.env.ODOO_URL && process.env.ODOO_DB && process.env.ODOO_USERNAME && process.env.ODOO_PASSWORD);

export async function initDb() {
  pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'fintax',
    password: process.env.DB_PASSWORD || 'fintax_local',
    database: process.env.DB_NAME || 'finworkshop',
    waitForConnections: true,
    connectionLimit: 10,
    decimalNumbers: true,
    charset: 'utf8mb4',
  });
  await pool.query(`CREATE TABLE IF NOT EXISTS users (
    id CHAR(36) PRIMARY KEY, email VARCHAR(190) NOT NULL UNIQUE,
    full_name VARCHAR(190) NOT NULL, role VARCHAR(40) NOT NULL,
    password_hash VARCHAR(255) NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await pool.query(`CREATE TABLE IF NOT EXISTS records (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    entity VARCHAR(64) NOT NULL, record_id CHAR(36) NOT NULL,
    data JSON NOT NULL, sync_status VARCHAR(32) NOT NULL DEFAULT 'LOCAL_DEMO',
    created_by CHAR(36) NULL, updated_by CHAR(36) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_entity_record (entity, record_id), KEY ix_entity_updated (entity, updated_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await pool.query(`CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, actor_id CHAR(36) NOT NULL,
    actor_name VARCHAR(190) NOT NULL, action VARCHAR(80) NOT NULL, entity VARCHAR(64) NOT NULL,
    record_id CHAR(36) NULL, before_data JSON NULL, after_data JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY ix_audit_created (created_at), KEY ix_audit_entity (entity, record_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await pool.query(`CREATE TABLE IF NOT EXISTS imports (
    id CHAR(36) PRIMARY KEY, actor_id CHAR(36) NOT NULL, original_name VARCHAR(255) NOT NULL,
    preview_data JSON NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await pool.query(`CREATE TABLE IF NOT EXISTS file_assets (
    file_id VARCHAR(255) PRIMARY KEY, stored_name VARCHAR(255) NOT NULL, original_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(120) NOT NULL, size_bytes BIGINT UNSIGNED NOT NULL, owner_id CHAR(36) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, KEY ix_file_owner (owner_id, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await pool.query(`CREATE TABLE IF NOT EXISTS role_permissions (
    role VARCHAR(40) PRIMARY KEY, entities JSON NOT NULL, actions JSON NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await pool.query(`CREATE TABLE IF NOT EXISTS odoo_sync_jobs (
    id CHAR(36) PRIMARY KEY, entity VARCHAR(64) NOT NULL, record_id VARCHAR(255) NOT NULL,
    payload JSON NOT NULL, status VARCHAR(32) NOT NULL DEFAULT 'PENDING', attempts INT NOT NULL DEFAULT 0,
    last_error TEXT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY ix_sync_status (status, created_at), KEY ix_sync_record (entity, record_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await pool.query('ALTER TABLE odoo_sync_jobs MODIFY COLUMN record_id VARCHAR(255) NOT NULL');
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
    VALUES (?, ?, ?, ?, ?, ?, ?)`, [actor.id, actor.name, action, entity, recordId, beforeData ? JSON.stringify(beforeData) : null, afterData ? JSON.stringify(afterData) : null]);
  await enqueueOdooSync('audit-logs', String(result.insertId), {
    id: String(result.insertId), actorId: actor.id, actorName: actor.name, action, entity, recordId,
    beforeData, afterData, createdAt: new Date().toISOString(),
  });
}

export async function ensureUuidRecordId(entity, data, actorId, status) {
  const record = { ...data, id: data.id || randomUUID() };
  return saveRecord(entity, record, actorId, status);
}
