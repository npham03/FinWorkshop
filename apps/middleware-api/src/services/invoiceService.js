import { InvoiceLog } from '../models/InvoiceLog.js';
import { requestTaxAuthorityCode, assessInvoiceRisk } from './taxService.js';
import { createSalesInvoice } from './odooService.js';
import { AppError } from '../utils/AppError.js';

export const invoiceService = {
  /**
   * Tạo hóa đơn điện tử — đúng quy trình pháp lý:
   * 1. Kiểm tra rủi ro bên bán (sellerTaxCode)
   * 2. Xin cấp mã từ Cổng Thuế (blocking)
   * 3. Lưu vào local PostgreSQL DB
   * 4. Đẩy hóa đơn sang Odoo (non-blocking)
   */
  async createInvoice(invoiceData, userId) {
    const { sellerTaxCode, invoiceDate, items, vatRate = 0.1, buyerTaxCode } = invoiceData;

    // Kiểm tra rủi ro thuế trước khi làm gì cả
    const risk = await assessInvoiceRisk({ sellerTaxCode, invoiceDate });
    if (risk.isRisky) {
      throw new AppError(risk.message, 422, risk.alertType);
    }

    // Tính tổng tiền
    const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const vatAmount = Math.round(subtotal * vatRate);
    const totalAmount = subtotal + vatAmount;

    // Xin cấp mã cơ quan thuế (blocking — bắt buộc có mã trước khi lưu)
    const taxAuthorityCode = await requestTaxAuthorityCode({
      sellerTaxCode,
      buyerTaxCode,
      invoiceNumber: invoiceData.invoiceNumber,
      invoiceDate,
      totalAmount,
    });

    // Lưu vào local PostgreSQL DB
    const invoice = await InvoiceLog.create({
      userId,
      ...invoiceData,
      items: items.map((item) => ({
        ...item,
        totalPrice: item.quantity * item.unitPrice,
      })),
      subtotal,
      vatRate,
      vatAmount,
      totalAmount,
      taxAuthorityCode,
      taxCodeStatus: 'approved',
      odooSyncStatus: 'pending_sync',
    });

    // Đẩy sang Odoo (non-blocking)
    (async () => {
      try {
        const odooInvoiceId = await createSalesInvoice({
          ...invoiceData,
          items,
          vatRate,
          taxAuthorityCode,
        });
        await InvoiceLog.findByIdAndUpdate(invoice.id, {
          odooSyncStatus: 'synced',
          odooInvoiceId,
        });
        console.log(`[invoiceService] Synced invoice ${invoice.id} → Odoo invoice #${odooInvoiceId}`);
      } catch (err) {
        console.error(`[invoiceService] Odoo sync failed for invoice ${invoice.id}: ${err.message}`);
        await InvoiceLog.findByIdAndUpdate(invoice.id, { odooSyncStatus: 'sync_failed' });
      }
    })();

    return invoice;
  },

  async getInvoices({ userId, role, page = 1, limit = 20 }) {
    const [invoices, total] = await Promise.all([
      InvoiceLog.find({ userId, role, page, limit }),
      InvoiceLog.count({ userId, role }),
    ]);
    return { invoices, total, page, totalPages: Math.ceil(total / limit) || 1 };
  },
};
