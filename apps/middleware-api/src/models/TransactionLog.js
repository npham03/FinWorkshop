import { query } from '../config/db.js';

const formatTransaction = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    _id: row.id,
    userId: row.user_id_detail
      ? { id: row.user_id, username: row.username, email: row.email }
      : row.user_id,
    type: row.type,
    category: row.category,
    description: row.description,
    amount: parseFloat(row.amount),
    accountingEntry: typeof row.accounting_entry === 'string'
      ? JSON.parse(row.accounting_entry)
      : row.accounting_entry,
    attachmentNote: row.attachment_note,
    odooSyncStatus: row.odoo_sync_status,
    odooMoveId: row.odoo_move_id,
    taxAlert: typeof row.tax_alert === 'string'
      ? JSON.parse(row.tax_alert)
      : row.tax_alert || { isRisky: false, alertType: null, message: null },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

export const TransactionLog = {
  async create({
    userId,
    type,
    category,
    description,
    amount,
    attachmentNote,
    accountingEntry,
    taxAlert,
    odooSyncStatus = 'pending_sync',
  }) {
    const res = await query(
      `INSERT INTO transaction_logs (
        user_id, type, category, description, amount, 
        accounting_entry, attachment_note, tax_alert, odoo_sync_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        userId,
        type,
        category,
        description,
        amount,
        JSON.stringify(accountingEntry || null),
        attachmentNote || null,
        JSON.stringify(taxAlert || null),
        odooSyncStatus,
      ]
    );
    return formatTransaction(res.rows[0]);
  },

  async findById(id) {
    const res = await query(
      `SELECT t.*, u.username, u.email, true as user_id_detail
       FROM transaction_logs t
       LEFT JOIN users u ON t.user_id = u.id
       WHERE t.id = $1`,
      [id]
    );
    return formatTransaction(res.rows[0]);
  },

  async findByIdAndUpdate(id, fields) {
    const setClauses = [];
    const values = [];
    let counter = 1;

    const mapping = {
      odooSyncStatus: 'odoo_sync_status',
      odooMoveId: 'odoo_move_id',
      taxAlert: 'tax_alert',
      description: 'description',
      amount: 'amount',
      accountingEntry: 'accounting_entry',
      attachmentNote: 'attachment_note',
    };

    for (const [key, val] of Object.entries(fields)) {
      const col = mapping[key] || key;
      const formattedVal = (key === 'taxAlert' || key === 'accountingEntry')
        ? JSON.stringify(val)
        : val;
      setClauses.push(`${col} = $${counter}`);
      values.push(formattedVal);
      counter++;
    }

    setClauses.push(`updated_at = NOW()`);
    values.push(id);

    const sql = `UPDATE transaction_logs SET ${setClauses.join(', ')} WHERE id = $${counter} RETURNING *`;
    const res = await query(sql, values);
    return formatTransaction(res.rows[0]);
  },

  async find({ userId, role, type, category, page = 1, limit = 20 } = {}) {
    const conditions = [];
    const values = [];
    let counter = 1;

    if (role !== 'admin' && userId) {
      conditions.push(`t.user_id = $${counter}`);
      values.push(userId);
      counter++;
    }

    if (type) {
      conditions.push(`t.type = $${counter}`);
      values.push(type);
      counter++;
    }

    if (category) {
      conditions.push(`t.category = $${counter}`);
      values.push(category);
      counter++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (page - 1) * limit;

    const sql = `
      SELECT t.*, u.username, u.email, true as user_id_detail
      FROM transaction_logs t
      LEFT JOIN users u ON t.user_id = u.id
      ${whereClause}
      ORDER BY t.created_at DESC
      LIMIT $${counter} OFFSET $${counter + 1}
    `;
    values.push(limit, offset);

    const res = await query(sql, values);
    return res.rows.map(formatTransaction);
  },

  async count({ userId, role, type, category } = {}) {
    const conditions = [];
    const values = [];
    let counter = 1;

    if (role !== 'admin' && userId) {
      conditions.push(`user_id = $${counter}`);
      values.push(userId);
      counter++;
    }

    if (type) {
      conditions.push(`type = $${counter}`);
      values.push(type);
      counter++;
    }

    if (category) {
      conditions.push(`category = $${counter}`);
      values.push(category);
      counter++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `SELECT COUNT(*) FROM transaction_logs ${whereClause}`;
    const res = await query(sql, values);
    return parseInt(res.rows[0].count, 10);
  },
};
