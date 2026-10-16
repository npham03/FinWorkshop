import { authService } from '../services/authService.js';
import { catchAsync } from '../utils/catchAsync.js';

export const authController = {
  register: catchAsync(async (req, res) => {
    const result = await authService.register(req.body);
    res.status(201).json({ success: true, message: 'Đăng ký tài khoản thành công.', data: result });
  }),

  login: catchAsync(async (req, res) => {
    const result = await authService.login(req.body);
    res.json({ success: true, message: 'Đăng nhập thành công.', data: result });
  }),

  me: catchAsync(async (req, res) => {
    res.json({ success: true, data: req.user });
  }),
};
