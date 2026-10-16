import { z } from 'zod';

export const registerSchema = z.object({
  username: z.string().min(3, 'Tên đăng nhập tối thiểu 3 ký tự').max(50),
  email: z.string().email('Email không hợp lệ'),
  password: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự'),
  role: z.enum(['admin', 'accountant']).optional(),
});

export const loginSchema = z.object({
  email: z.string().email('Email không hợp lệ'),
  password: z.string().min(1, 'Vui lòng nhập mật khẩu'),
});

export const createTransactionSchema = z.object({
  type: z.enum(['income', 'expense'], { message: "Loại giao dịch phải là 'income' hoặc 'expense'" }),
  category: z.enum(['production', 'personal'], { message: "Danh mục phải là 'production' hoặc 'personal'" }),
  description: z.string().min(3, 'Nội dung giao dịch phải có ít nhất 3 ký tự').max(500),
  amount: z.number({ invalid_type_error: 'Số tiền phải là số' }).positive('Số tiền phải lớn hơn 0'),
  attachmentNote: z.string().optional(),
  sellerTaxCode: z.string().optional(),
});

const invoiceItemSchema = z.object({
  name: z.string().min(1, 'Tên hàng hóa/dịch vụ không được trống'),
  unit: z.string().optional(),
  quantity: z.number().positive(),
  unitPrice: z.number().positive(),
});

export const createInvoiceSchema = z.object({
  invoiceNumber: z.string().min(1, 'Số hóa đơn không được trống'),
  invoiceDate: z.string().refine((d) => !isNaN(Date.parse(d)), { message: 'Ngày hóa đơn không hợp lệ' }),
  sellerTaxCode: z
    .string()
    .regex(/^\d{10}(\d{3})?$/, 'MST bên bán phải là 10 hoặc 13 chữ số'),
  buyerName: z.string().optional(),
  buyerTaxCode: z
    .string()
    .regex(/^\d{10}(\d{3})?$/, 'MST bên mua phải là 10 hoặc 13 chữ số')
    .optional()
    .or(z.literal('')),
  buyerAddress: z.string().optional(),
  items: z.array(invoiceItemSchema).min(1, 'Hóa đơn phải có ít nhất 1 mặt hàng/dịch vụ'),
  vatRate: z.number().min(0).max(1).optional().default(0.1),
});
