import { invoiceService } from '../services/invoiceService.js';
import { catchAsync } from '../utils/catchAsync.js';

export const invoiceController = {
  create: catchAsync(async (req, res) => {
    const invoice = await invoiceService.createInvoice(req.body, req.user._id);
    res.status(201).json({
      success: true,
      message: `Hóa đơn đã được cấp mã ${invoice.taxAuthorityCode} và đang được đồng bộ vào Odoo.`,
      data: invoice,
    });
  }),

  list: catchAsync(async (req, res) => {
    const { page, limit } = req.query;
    const result = await invoiceService.getInvoices({
      userId: req.user._id,
      role: req.user.role,
      page: Number(page) || 1,
      limit: Number(limit) || 20,
    });
    res.json({ success: true, data: result });
  }),
};
