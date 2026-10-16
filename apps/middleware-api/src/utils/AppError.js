/**
 * Lớp AppError chuẩn hóa — tạo lỗi có statusCode để errorHandler xử lý đúng.
 * Dùng trong controller/service thay cho throw new Error()
 */
export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'APP_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.name = 'AppError';
  }
}
