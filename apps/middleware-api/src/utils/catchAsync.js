/**
 * Wrapper bọc async route handler để tự động bắt lỗi và chuyển sang next(err)
 * Tránh phải viết try/catch trong mọi controller
 * 
 * Cách dùng:
 *   router.post('/path', protect, catchAsync(myController.myMethod))
 */
export const catchAsync = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
