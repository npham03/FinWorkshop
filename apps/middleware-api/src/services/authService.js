import jwt from 'jsonwebtoken';
import { config } from '../config/config.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';

export const authService = {
  async register({ username, email, password, role }) {
    const existing = await User.findByEmail(email);
    if (existing) {
      throw new AppError('Email đã được đăng ký trong hệ thống.', 400, 'EMAIL_EXISTS');
    }

    const user = await User.create({ username, email, password, role });

    const token = jwt.sign({ userId: user.id, role: user.role }, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    });

    return {
      token,
      user: { id: user.id, username: user.username, email: user.email, role: user.role },
    };
  },

  async login({ email, password }) {
    const user = await User.findByEmail(email);
    if (!user || !(await user.comparePassword(password))) {
      throw new AppError('Email hoặc mật khẩu không đúng.', 401, 'INVALID_CREDENTIALS');
    }
    if (!user.isActive) {
      throw new AppError('Tài khoản đã bị vô hiệu hóa.', 403, 'ACCOUNT_DISABLED');
    }

    const token = jwt.sign({ userId: user.id, role: user.role }, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    });

    return {
      token,
      user: { id: user.id, username: user.username, email: user.email, role: user.role },
    };
  },
};
