import { cashflowService } from '../services/cashflowService.js';
import { catchAsync } from '../utils/catchAsync.js';

export const cashflowController = {
  create: catchAsync(async (req, res) => {
    const transaction = await cashflowService.createTransaction(req.body, req.user._id);
    res.status(201).json({
      success: true,
      message: 'Ghi nhận giao dịch thành công. Đang đồng bộ sang Odoo...',
      data: transaction,
    });
  }),

  list: catchAsync(async (req, res) => {
    const { page, limit, type, category } = req.query;
    const result = await cashflowService.getTransactions({
      userId: req.user._id,
      role: req.user.role,
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      type,
      category,
    });
    res.json({ success: true, data: result });
  }),
};
