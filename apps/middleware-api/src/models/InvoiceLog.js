import { query } from '../config/db.js';

const formatInvoice = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    _id: row.id,
    userId: row.user_id_detail
      ? { id: row.user_id, username: row.username, email: row.email }
      : row.user_id,
    invoiceNumber: row.invoice_number,
    invoiceDate: row.invoice_date,
    sellerTaxCode: row.seller_tax_code,
    buyerName: row.buyer_name,
    buyerTaxCode: row.buyer_tax_code,
    buyerAddress: row.buyer_address,
    items: typeof row.items === 'string' ? JSON.parse(row.items) : row.items || [],
    subtotal: parseFloat(row.subtotal),
    vatRate: parseFloat(row.vat_rate),
    vatAmount: parseFloat(row.vat_amount),
    totalAmount: parseFloat(row.total_amount),
    taxAuthorityCode: row.tax_authority_code,
    taxCodeStatus: row.tax_code_status,
    taxRejectionReason: row.tax_rejection_reason,
    odooSyncStatus: row.odoo_sync_status,
    odooInvoiceId: row.odoo_invoice_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

export const InvoiceLog = {
  async create({
    userId,
    invoiceNumber,
    invoiceDate,
    sellerTaxCode,
    buyerName,
    buyerTaxCode,
    buyerAddress,
    items = [],
    subtotal,
    vatRate = 0.1,
    vatAmount,
    totalAmount,
    taxAuthorityCode = null,
    taxCodeStatus = 'pending',
    taxRejectionReason = null,
    odooSyncStatus = 'pending_sync',
  }) {
    const res = await query(
      `INSERT INTO invoice_logs (
        user_id, invoice_number, invoice_date, seller_tax_code,
        buyer_name, buyer_tax_code, buyer_address, items,
        subtotal, vat_rate, vat_amount, total_amount,
        tax_authority_code, tax_code_status, tax_rejection_reason, odoo_sync_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *`,
      [
        userId,
        invoiceNumber,
        invoiceDate,
        sellerTaxCode,
        buyerName || null,
        buyerTaxCode || null,
        buyerAddress || null,
        JSON.stringify(items),
        subtotal,
        vatRate,
        vatAmount,
        totalAmount,
        taxAuthorityCode,
        taxCodeStatus,
        taxRejectionReason,
        odooSyncStatus,
      ]
    );
    return formatInvoice(res.rows[0]);
  },

  async findById(id) {
    const res = await query(
      `SELECT i.*, u.username, u.email, true as user_id_detail
       FROM invoice_logs i
       LEFT JOIN users u ON i.user_id = u.id
       WHERE i.id = $1`,
      [id]
    );
    return formatInvoice(res.rows[0]);
  },

  async findByIdAndUpdate(id, fields) {
    const setClauses = [];
    const values = [];
    let counter = 1;

    const mapping = {
      odooSyncStatus: 'odoo_sync_status',
      odooInvoiceId: 'odoo_invoice_id',
      taxAuthorityCode: 'tax_authority_code',
      taxCodeStatus: 'tax_code_status',
      taxRejectionReason: 'tax_rejection_reason',
    };

    for (const [key, val] of Object.entries(fields)) {
      const col = mapping[key] || key;
      const formattedVal = key === 'items' ? JSON.stringify(val) : val;
      setClauses.push(`${col} = $${counter}`);
      values.push(formattedVal);
      counter++;
    }

    setClauses.push(`updated_at = NOW()`);
    values.push(id);

    const sql = `UPDATE invoice_logs SET ${setClauses.join(', ')} WHERE id = $${counter} RETURNING *`;
    const res = await query(sql, values);
    return formatInvoice(res.rows[0]);
  },

  async find({ userId, role, page = 1, limit = 20 } = {}) {
    const conditions = [];
    const values = [];
    let counter = 1;

    if (role !== 'admin' && userId) {
      conditions.push(`i.user_id = $${counter}`);
      values.push(userId);
      counter++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (page - 1) * limit;

    const sql = `
      SELECT i.*, u.username, u.email, true as user_id_detail
      FROM invoice_logs i
      LEFT JOIN users u ON i.user_id = u.id
      ${whereClause}
      ORDER BY i.created_at DESC
      LIMIT $${counter} OFFSET $${counter + 1}
    `;
    values.push(limit, offset);

    const res = await query(sql, values);
    return res.rows.map(formatInvoice);
  },

  async count({ userId, role } = {}) {
    const conditions = [];
    const values = [];
    let counter = 1;

    if (role !== 'admin' && userId) {
      conditions.push(`user_id = $${counter}`);
      values.push(userId);
      counter++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `SELECT COUNT(*) FROM invoice_logs ${whereClause}`;
    const res = await query(sql, values);
    return parseInt(res.rows[0].count, 10);
  },
};
