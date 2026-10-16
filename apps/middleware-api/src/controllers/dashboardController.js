import { query } from '../config/db.js';
import { catchAsync } from '../utils/catchAsync.js';
import { config } from '../config/config.js';
import axios from 'axios';

export const dashboardController = {
  getSummary: catchAsync(async (req, res) => {
    const userId = req.user.id;
    const role = req.user.role;

    const userFilter = role === 'admin' ? '' : 'WHERE user_id = $1';
    const params = role === 'admin' ? [] : [userId];

    // Transaction stats
    const txStatsQuery = `
      SELECT 
        COUNT(*) as total_count,
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as total_income,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as total_expense,
        COALESCE(SUM(CASE WHEN type = 'expense' AND category = 'production' THEN amount ELSE 0 END), 0) as production_expense,
        COALESCE(SUM(CASE WHEN type = 'expense' AND category = 'personal' THEN amount ELSE 0 END), 0) as personal_expense,
        COUNT(CASE WHEN odoo_sync_status = 'synced' THEN 1 END) as synced_count,
        COUNT(CASE WHEN odoo_sync_status = 'pending_sync' THEN 1 END) as pending_sync_count,
        COUNT(CASE WHEN (tax_alert->>'isRisky')::boolean = true THEN 1 END) as tax_risk_count
      FROM transaction_logs
      ${userFilter}
    `;

    // Invoice stats
    const invStatsQuery = `
      SELECT 
        COUNT(*) as total_invoices,
        COALESCE(SUM(total_amount), 0) as total_invoice_amount,
        COUNT(CASE WHEN tax_code_status = 'approved' THEN 1 END) as approved_invoices,
        COUNT(CASE WHEN tax_code_status = 'rejected' THEN 1 END) as rejected_invoices
      FROM invoice_logs
      ${userFilter}
    `;

    // Recent 5 transactions
    const recentTxQuery = `
      SELECT t.*, u.username
      FROM transaction_logs t
      LEFT JOIN users u ON t.user_id = u.id
      ${userFilter}
      ORDER BY t.created_at DESC
      LIMIT 5
    `;

    // Recent 5 invoices
    const recentInvQuery = `
      SELECT i.*, u.username
      FROM invoice_logs i
      LEFT JOIN users u ON i.user_id = u.id
      ${userFilter}
      ORDER BY i.created_at DESC
      LIMIT 5
    `;

    const [txStats, invStats, recentTx, recentInv] = await Promise.all([
      query(txStatsQuery, params),
      query(invStatsQuery, params),
      query(recentTxQuery, params),
      query(recentInvQuery, params),
    ]);

    const txRow = txStats.rows[0] || {};
    const invRow = invStats.rows[0] || {};

    const totalIncome = parseFloat(txRow.total_income || 0);
    const totalExpense = parseFloat(txRow.total_expense || 0);
    const netCashflow = totalIncome - totalExpense;

    // Check subsystem health
    let taxApiStatus = 'healthy';
    try {
      await axios.get(`${config.taxApi.url}/health`, { timeout: 1500 });
    } catch {
      taxApiStatus = 'unreachable';
    }

    res.json({
      success: true,
      data: {
        metrics: {
          totalIncome,
          totalExpense,
          netCashflow,
          productionExpense: parseFloat(txRow.production_expense || 0),
          personalExpense: parseFloat(txRow.personal_expense || 0),
          totalTransactions: parseInt(txRow.total_count || 0, 10),
          syncedCount: parseInt(txRow.synced_count || 0, 10),
          pendingSyncCount: parseInt(txRow.pending_sync_count || 0, 10),
          taxRiskCount: parseInt(txRow.tax_risk_count || 0, 10),
          totalInvoices: parseInt(invRow.total_invoices || 0, 10),
          totalInvoiceAmount: parseFloat(invRow.total_invoice_amount || 0),
          approvedInvoices: parseInt(invRow.approved_invoices || 0, 10),
          rejectedInvoices: parseInt(invRow.rejected_invoices || 0, 10),
        },
        systemStatus: {
          database: 'connected (PostgreSQL)',
          middlewareApi: 'healthy (Port 5000)',
          taxApi: taxApiStatus,
          odoo: 'configured (Port 8069)',
        },
        recentTransactions: recentTx.rows.map((row) => ({
          id: row.id,
          type: row.type,
          category: row.category,
          description: row.description,
          amount: parseFloat(row.amount),
          accountingEntry: typeof row.accounting_entry === 'string' ? JSON.parse(row.accounting_entry) : row.accounting_entry,
          odooSyncStatus: row.odoo_sync_status,
          taxAlert: typeof row.tax_alert === 'string' ? JSON.parse(row.tax_alert) : row.tax_alert,
          createdAt: row.created_at,
        })),
        recentInvoices: recentInv.rows.map((row) => ({
          id: row.id,
          invoiceNumber: row.invoice_number,
          invoiceDate: row.invoice_date,
          sellerTaxCode: row.seller_tax_code,
          buyerName: row.buyer_name,
          totalAmount: parseFloat(row.total_amount),
          taxAuthorityCode: row.tax_authority_code,
          taxCodeStatus: row.tax_code_status,
          odooSyncStatus: row.odoo_sync_status,
          createdAt: row.created_at,
        })),
      },
    });
  }),
};
