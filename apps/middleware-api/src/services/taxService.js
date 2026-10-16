import axios from 'axios';
import { config } from '../config/config.js';

const taxClient = axios.create({
  baseURL: config.taxApi.url,
  timeout: 5000,
});

/**
 * TAX SERVICE — Quản lý mọi tương tác với Mock Tax Authority API (port 4000)
 * và logic phát hiện rủi ro hóa đơn.
 */

/**
 * Tra cứu trạng thái Mã số thuế.
 * @returns {{ isRisky: boolean, status: string, data: Object }}
 */
export const checkTaxCode = async (mst) => {
  try {
    const { data } = await taxClient.get(`/api/tax/check-mst/${mst}`);
    console.log(`[taxService] checkTaxCode ${mst} → isRisky=${data.isRisky}, status=${data.data?.status}`);
    return data;
  } catch (err) {
    // Nếu Tax API không response → không block luồng, coi là không rủi ro nhưng cảnh báo
    console.warn(`[taxService] Không thể tra cứu MST ${mst}: ${err.message}`);
    return { isRisky: false, status: 'UNKNOWN', data: null };
  }
};

/**
 * Xin cấp mã cơ quan thuế cho Hóa đơn điện tử.
 * Ném AppError có HTTP status nếu Tax API từ chối cấp mã.
 *
 * @returns {string} taxAuthorityCode
 */
export const requestTaxAuthorityCode = async ({ sellerTaxCode, buyerTaxCode, invoiceNumber, invoiceDate, totalAmount }) => {
  const { data: response } = await taxClient.post('/api/tax/invoice/issue-code', {
    sellerTaxCode,
    buyerTaxCode,
    invoiceNumber,
    invoiceDate,
    totalAmount,
  });

  if (!response.success) {
    const err = new Error(response.message || 'Cổng Thuế từ chối cấp mã hóa đơn.');
    err.statusCode = 422;
    err.code = response.errorCode || 'TAX_CODE_REJECTED';
    throw err;
  }

  return response.taxAuthorityCode;
};

/**
 * Kiểm tra rủi ro hóa đơn đầu vào (khi Kế toán nhập hóa đơn mua hàng từ nhà cung cấp).
 * Luôn kiểm tra MST nhà cung cấp trước khi ghi nhận chi phí.
 *
 * @returns {{ isRisky: boolean, alertType: string|null, message: string|null }}
 */
export const assessInvoiceRisk = async ({ sellerTaxCode, invoiceDate }) => {
  const result = { isRisky: false, alertType: null, message: null };

  // Kiểm tra 1: MST nhà cung cấp
  const mstCheck = await checkTaxCode(sellerTaxCode);
  if (mstCheck.isRisky) {
    return {
      isRisky: true,
      alertType: 'SUSPENDED_COMPANY',
      message: `Cảnh báo: Nhà cung cấp MST ${sellerTaxCode} có trạng thái "${mstCheck.data?.statusDescription || 'không hoạt động'}". Hóa đơn từ công ty này có thể bị từ chối khấu trừ thuế!`,
    };
  }

  // Kiểm tra 2: Ngày hóa đơn không được vượt quá 10 ngày trong tương lai
  if (invoiceDate) {
    const invDate = new Date(invoiceDate);
    const tenDaysLater = new Date();
    tenDaysLater.setDate(tenDaysLater.getDate() + 10);

    if (invDate > tenDaysLater) {
      return {
        isRisky: true,
        alertType: 'INVALID_DATE',
        message: `Cảnh báo: Ngày hóa đơn ${invoiceDate} vượt quá thời hạn cho phép. Hóa đơn có thể không được chấp nhận!`,
      };
    }
  }

  return result;
};
