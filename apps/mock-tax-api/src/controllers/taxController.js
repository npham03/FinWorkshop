import { MOCK_COMPANIES } from '../data/mockCompanies.js';
import crypto from 'crypto';

// In-memory storage for issued invoices
const issuedInvoices = new Map();

/**
 * Controller xử lý các tác vụ giả lập Tổng Cục Thuế
 */
export const taxController = {
  /**
   * Tra cứu thông tin và trạng thái Mã số thuế (MST)
   * GET /api/tax/check-mst/:mst
   */
  async checkTaxCode(req, res) {
    try {
      const rawMst = req.params.mst || req.query.mst;
      if (!rawMst) {
        return res.status(400).json({
          success: false,
          error: 'Thiếu mã số thuế cần tra cứu (mst)',
        });
      }

      const cleanMst = rawMst.replace(/[\s-]/g, '');

      // Kiểm tra trong danh bạ mock có sẵn (chứa cả cty ma / cty ngừng hoạt động để test)
      if (MOCK_COMPANIES[cleanMst]) {
        const company = MOCK_COMPANIES[cleanMst];
        return res.json({
          success: true,
          data: company,
          isRisky: company.status !== 'ACTIVE',
        });
      }

      // Kiểm tra định dạng MST hợp lệ của Việt Nam (10 chữ số hoặc 13 chữ số)
      const isValidFormat = /^\d{10}(\d{3})?$/.test(cleanMst);
      if (!isValidFormat) {
        return res.status(400).json({
          success: false,
          error: 'Mã số thuế không đúng định dạng chuẩn (phải là 10 hoặc 13 chữ số)',
          data: {
            taxCode: cleanMst,
            status: 'INVALID_FORMAT',
            statusDescription: 'Mã số thuế sai định dạng',
          },
          isRisky: true,
        });
      }

      // MST ngẫu nhiên hợp lệ -> Giả lập công ty hoạt động bình thường
      const genericCompany = {
        taxCode: cleanMst,
        name: `CÔNG TY CỔ PHẦN SX & TM DOANH NGHIỆP MST ${cleanMst}`,
        status: 'ACTIVE',
        statusDescription: 'NNT đang hoạt động (đã được cấp GCN ĐKT)',
        address: 'Hà Nội, Việt Nam',
        legalRepresentative: 'Đại diện Doanh Nghiệp',
        taxOffice: 'Cục Thuế TP. Hà Nội',
      };

      return res.json({
        success: true,
        data: genericCompany,
        isRisky: false,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: 'Lỗi máy chủ nội bộ khi tra cứu MST',
        details: error.message,
      });
    }
  },

  /**
   * Xin cấp Mã cơ quan thuế cho Hóa đơn điện tử
   * POST /api/tax/invoice/issue-code
   */
  async issueTaxAuthorityCode(req, res) {
    try {
      const {
        sellerTaxCode,
        buyerTaxCode,
        invoiceNumber,
        invoiceDate,
        totalAmount,
      } = req.body;

      if (!sellerTaxCode || !invoiceNumber || !invoiceDate || totalAmount === undefined) {
        return res.status(400).json({
          success: false,
          errorCode: 'MISSING_REQUIRED_FIELDS',
          message: 'Thiếu trường bắt buộc: sellerTaxCode, invoiceNumber, invoiceDate, totalAmount',
        });
      }

      const cleanSellerMst = sellerTaxCode.replace(/[\s-]/g, '');
      const seller = MOCK_COMPANIES[cleanSellerMst];

      // Kịch bản rủi ro: Bên bán bị đình chỉ hoặc đã đóng MST
      if (seller && seller.status !== 'ACTIVE') {
        return res.status(422).json({
          success: false,
          errorCode: 'TAX_RISK_SELLER_SUSPENDED',
          message: `Từ chối cấp mã: Bên bán (${seller.name}) có trạng thái "${seller.statusDescription}"!`,
          sellerStatus: seller.status,
        });
      }

      // Kiểm tra ngày lập hóa đơn (không được vượt quá 1 ngày trong tương lai)
      const invDate = new Date(invoiceDate);
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      if (isNaN(invDate.getTime()) || invDate > tomorrow) {
        return res.status(422).json({
          success: false,
          errorCode: 'TAX_RISK_INVALID_DATE',
          message: 'Từ chối cấp mã: Ngày hóa đơn không hợp lệ hoặc nằm trong tương lai.',
        });
      }

      // Sinh Mã cơ quan thuế chuẩn (Quy chuẩn HĐĐT Việt Nam có mã C<Năm>-<Random>)
      const currentYear = new Date().getFullYear().toString().slice(-2);
      const randomSegment1 = crypto.randomBytes(2).toString('hex').toUpperCase();
      const randomSegment2 = crypto.randomBytes(4).toString('hex').toUpperCase();
      const taxAuthorityCode = `C${currentYear}-${randomSegment1}-${randomSegment2}`;

      const record = {
        taxAuthorityCode,
        sellerTaxCode: cleanSellerMst,
        buyerTaxCode: buyerTaxCode ? buyerTaxCode.replace(/[\s-]/g, '') : null,
        invoiceNumber,
        invoiceDate,
        totalAmount,
        status: 'APPROVED',
        issuedAt: new Date().toISOString(),
      };

      issuedInvoices.set(taxAuthorityCode, record);

      return res.status(201).json({
        success: true,
        message: 'Tổng cục Thuế: Cấp mã hóa đơn thành công',
        taxAuthorityCode,
        issuedAt: record.issuedAt,
        status: 'APPROVED',
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        errorCode: 'INTERNAL_TAX_ERROR',
        message: 'Lỗi xử lý cấp mã tại cổng Tổng cục Thuế',
        details: error.message,
      });
    }
  },

  /**
   * Tra cứu, kiểm tra mã hóa đơn đã cấp
   * GET /api/tax/invoice/verify/:code
   */
  async verifyTaxAuthorityCode(req, res) {
    try {
      const { code } = req.params;
      const record = issuedInvoices.get(code);

      if (!record) {
        return res.status(404).json({
          success: false,
          message: 'Mã cơ quan thuế không tồn tại trên hệ thống dữ liệu Thuế',
        });
      }

      return res.json({
        success: true,
        data: record,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Lỗi xác minh hóa đơn',
        details: error.message,
      });
    }
  },

  /**
   * Lấy danh sách lịch sử cấp mã (dành cho developer kiểm thử)
   * GET /api/tax/history
   */
  async getHistory(req, res) {
    return res.json({
      success: true,
      total: issuedInvoices.size,
      data: Array.from(issuedInvoices.values()).reverse(),
    });
  },
};
