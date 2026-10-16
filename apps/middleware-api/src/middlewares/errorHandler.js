import { config } from '../config/config.js';

/**
 * Global Error Handler — Express nhận đúng 4 tham số (err, req, res, next)
 * Tất cả lỗi sập bất kỳ đâu trong app đều được gom về đây.
 */
// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, next) => {
  const isDev = config.nodeEnv === 'development';

  // Log lỗi ra server console (không để sập silent)
  console.error(`[${new Date().toISOString()}] [ERROR] ${req.method} ${req.originalUrl}`);
  console.error(err.stack || err.message);

  // Mongoose Validation Error
  if (err.name === 'ValidationError') {
    const fields = Object.keys(err.errors).map((field) => ({
      field,
      message: err.errors[field].message,
    }));
    return res.status(400).json({
      success: false,
      error: 'DB_VALIDATION_ERROR',
      message: 'Dữ liệu không hợp lệ trước khi lưu vào cơ sở dữ liệu.',
      details: fields,
    });
  }

  // Mongoose Duplicate Key (ví dụ: số hóa đơn trùng, email trùng)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0];
    return res.status(409).json({
      success: false,
      error: 'DUPLICATE_KEY',
      message: `Dữ liệu đã tồn tại: trường '${field}' bị trùng lặp.`,
    });
  }

  // Odoo unreachable / connection error
  if (err.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')) {
    return res.status(503).json({
      success: false,
      error: 'ODOO_UNAVAILABLE',
      message: 'Không thể kết nối đến hệ thống Odoo ERP. Giao dịch đã được lưu cục bộ với trạng thái pending_sync.',
    });
  }

  // Tax API unreachable
  if (err.message?.includes('4000') || err.message?.includes('TAX_API')) {
    return res.status(503).json({
      success: false,
      error: 'TAX_API_UNAVAILABLE',
      message: 'Không thể kết nối đến Cổng Thuế. Vui lòng thử lại sau.',
    });
  }

  // Default 500
  const statusCode = err.statusCode || 500;
  return res.status(statusCode).json({
    success: false,
    error: err.code || 'INTERNAL_SERVER_ERROR',
    message: err.message || 'Đã xảy ra lỗi không xác định trên máy chủ.',
    ...(isDev && { stack: err.stack }),
  });
};
