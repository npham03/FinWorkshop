import { TransactionLog } from '../models/TransactionLog.js';
import { resolveAccountingEntry } from './mappingService.js';
import { assessInvoiceRisk } from './taxService.js';
import { pushJournalEntry, resetOdooSession } from './odooService.js';

export const cashflowService = {
  /**
   * Ghi nhận giao dịch thu/chi:
   * 1. Map dữ liệu → Định khoản Nợ/Có (Invisible Accounting)
   * 2. Kiểm tra rủi ro thuế (nếu có đính kèm MST nhà cung cấp)
   * 3. Đẩy bút toán sang Odoo, fallback → lưu pending_sync nếu Odoo down
   */
  async createTransaction({ type, category, description, amount, attachmentNote, sellerTaxCode }, userId) {
    // Bước 1: Map định khoản
    const accountingEntry = resolveAccountingEntry({ type, category, description });

    // Bước 2: Kiểm tra rủi ro thuế nếu có MST nhà cung cấp
    let taxAlert = { isRisky: false, alertType: null, message: null };
    if (sellerTaxCode && category === 'production') {
      taxAlert = await assessInvoiceRisk({ sellerTaxCode });
    }

    // Bước 3: Tạo log cục bộ trong PostgreSQL trước (nhanh & an toàn)
    const transaction = await TransactionLog.create({
      userId,
      type,
      category,
      description,
      amount,
      attachmentNote,
      accountingEntry,
      taxAlert,
      odooSyncStatus: 'pending_sync',
    });

    // Bước 4: Đẩy sang Odoo (non-blocking attempt)
    (async () => {
      try {
        const odooMoveId = await pushJournalEntry({
          description,
          amount,
          debitAccount: accountingEntry.debit.account,
          creditAccount: accountingEntry.credit.account,
        });
        await TransactionLog.findByIdAndUpdate(transaction.id, {
          odooSyncStatus: 'synced',
          odooMoveId,
        });
        console.log(`[cashflowService] Synced transaction ${transaction.id} → Odoo move #${odooMoveId}`);
      } catch (err) {
        console.error(`[cashflowService] Odoo sync failed for ${transaction.id}: ${err.message}`);
        await TransactionLog.findByIdAndUpdate(transaction.id, { odooSyncStatus: 'sync_failed' });
        if (err.code === 'ECONNREFUSED') resetOdooSession();
      }
    })();

    return transaction;
  },

  async getTransactions({ userId, role, page = 1, limit = 20, type, category }) {
    const [transactions, total] = await Promise.all([
      TransactionLog.find({ userId, role, page, limit, type, category }),
      TransactionLog.count({ userId, role, type, category }),
    ]);

    return { transactions, total, page, totalPages: Math.ceil(total / limit) || 1 };
  },
};
