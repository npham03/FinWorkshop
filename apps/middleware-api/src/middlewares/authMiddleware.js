import jwt from 'jsonwebtoken';
import { config } from '../config/config.js';
import { User } from '../models/User.js';

export const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Bạn chưa đăng nhập. Vui lòng cung cấp token hợp lệ.',
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, config.jwt.secret);

    const user = await User.findById(decoded.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Tài khoản không tồn tại hoặc đã bị vô hiệu hóa.',
      });
    }
    delete user.passwordHash;

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: 'TOKEN_EXPIRED', message: 'Phiên đăng nhập đã hết hạn.' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, error: 'INVALID_TOKEN', message: 'Token không hợp lệ.' });
    }
    next(err);
  }
};

export const authorize = (...roles) =>
  (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: `Tính năng này yêu cầu quyền: ${roles.join(' hoặc ')}.`,
      });
    }
    next();
  };
