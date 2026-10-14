import crypto from 'node:crypto';

// This history is runtime-only. No sample companies or invoices are preloaded.
const issuedInvoices = new Map();
const taxCodePattern = /^\d{10}(\d{3})?$/;

export const taxController = {
  async checkTaxCode(req, res) {
    const rawTaxCode = req.params.mst || req.query.mst;
    if (!rawTaxCode) {
      return res.status(400).json({ success: false, error: 'Thiếu mã số thuế cần tra cứu (mst).' });
    }

    const taxCode = String(rawTaxCode).replace(/[\s-]/g, '');
    if (!taxCodePattern.test(taxCode)) {
      return res.status(400).json({
        success: false,
        error: 'Mã số thuế cần có 10 hoặc 13 chữ số.',
        data: { taxCode, status: 'INVALID_FORMAT' },
        isRisky: null,
        simulated: true,
      });
    }

    // This service has no connection to tax authority records, so it must not
    // invent company details or claim that a taxpayer is active or risky.
    return res.json({
      success: true,
      simulated: true,
      data: {
        taxCode,
        status: 'UNVERIFIED',
        statusDescription: 'API mô phỏng không tra cứu dữ liệu thuế thật.',
      },
      isRisky: null,
    });
  },

  async issueTaxAuthorityCode(req, res) {
    try {
      const body = req.body || {};
      const middlewareRequest = req.path === '/api/v1/invoices/issue';
      const invoiceId = body.invoiceId || null;
      const invoiceNumber = body.invoiceNumber || body.invoiceCode;
      const invoiceDate = body.invoiceDate || new Date().toISOString().slice(0, 10);
      const totalAmount = body.totalAmount ?? body.total;
      const sellerTaxCode = body.sellerTaxCode ? String(body.sellerTaxCode).replace(/[\s-]/g, '') : null;
      const buyerTaxCode = body.buyerTaxCode ? String(body.buyerTaxCode).replace(/[\s-]/g, '') : null;

      if (!invoiceNumber || totalAmount === undefined || (middlewareRequest && !invoiceId) || (!middlewareRequest && !sellerTaxCode)) {
        return res.status(400).json({
          success: false,
          errorCode: 'MISSING_REQUIRED_FIELDS',
          message: middlewareRequest
            ? 'Thiếu trường bắt buộc: invoiceId, invoiceCode, total.'
            : 'Thiếu trường bắt buộc: sellerTaxCode, invoiceNumber, totalAmount.',
        });
      }

      if ((!middlewareRequest && !taxCodePattern.test(sellerTaxCode)) || (buyerTaxCode && !taxCodePattern.test(buyerTaxCode))) {
        return res.status(422).json({
          success: false,
          errorCode: 'INVALID_TAX_CODE_FORMAT',
          message: 'Mã số thuế bên bán hoặc bên mua không đúng định dạng 10/13 chữ số.',
        });
      }

      if (!Number.isFinite(Number(totalAmount)) || Number(totalAmount) < 0) {
        return res.status(400).json({ success: false, errorCode: 'INVALID_TOTAL_AMOUNT', message: 'Tổng tiền phải là số không âm.' });
      }

      const parsedDate = new Date(invoiceDate);
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      if (!Number.isFinite(parsedDate.getTime()) || parsedDate > tomorrow) {
        return res.status(422).json({
          success: false,
          errorCode: 'INVALID_INVOICE_DATE',
          message: 'Ngày hóa đơn không hợp lệ hoặc nằm trong tương lai.',
        });
      }

      const currentYear = new Date().getFullYear().toString().slice(-2);
      const taxAuthorityCode = `C${currentYear}-${crypto.randomBytes(2).toString('hex').toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      const record = {
        taxAuthorityCode,
        sellerTaxCode,
        buyerTaxCode,
        invoiceId,
        invoiceNumber,
        invoiceDate,
        totalAmount: Number(totalAmount),
        status: 'APPROVED',
        simulated: true,
        issuedAt: new Date().toISOString(),
      };

      issuedInvoices.set(taxAuthorityCode, record);
      return res.status(201).json({
        success: true,
        simulated: true,
        message: 'Mã được tạo bởi API mô phỏng; không có giá trị pháp lý.',
        taxAuthorityCode,
        mockTaxCode: taxAuthorityCode,
        invoiceId,
        invoiceCode: invoiceNumber,
        issuedAt: record.issuedAt,
        status: 'APPROVED',
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        errorCode: 'INTERNAL_TAX_ERROR',
        message: 'Lỗi xử lý cấp mã tại API mô phỏng.',
        details: error.message,
      });
    }
  },

  async verifyTaxAuthorityCode(req, res) {
    const record = issuedInvoices.get(req.params.code);
    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Mã mô phỏng không tồn tại trong phiên chạy hiện tại.',
      });
    }
    return res.json({ success: true, simulated: true, data: record });
  },

  async getHistory(_req, res) {
    return res.json({
      success: true,
      simulated: true,
      total: issuedInvoices.size,
      data: Array.from(issuedInvoices.values()).reverse(),
    });
  },
};
