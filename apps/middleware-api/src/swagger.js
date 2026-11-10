import swaggerUi from 'swagger-ui-express';

export const swaggerSpec = {
  openapi: '3.0.3',
  info: {
    title: 'FinTax Automation Middleware API',
    version: '1.0.0',
    description: `
**Hệ thống Quản trị Tài chính - Thuế & Tích hợp ERP Odoo cho Hộ Sản xuất / Xưởng Cơ khí (FinTax Automation)**

- **Kiến trúc:** RESTful API Middleware giao tiếp PostgreSQL, đồng bộ Odoo 16 qua XML-RPC Outbox Pattern và Mock Tax API.
- **Tiêu chuẩn Kế toán:** Tuân thủ Thông tư 88/2021/TT-BTC (7 cuốn sổ kế toán S1-S7) & Thông tư 152/2025/TT-BTC.
- **Xác thực:** JWT Bearer Token (Phân quyền 3 vai trò: \`OWNER\`, \`ACCOUNTANT\`, \`WORKSHOP\`).

---
*Gợi ý tài khoản demo để bấm **Authorize**:*
- **Chủ hộ (OWNER):** \`owner.workflow@fintax.demo\` / Mật khẩu: \`FinTax@2026\`
- **Kế toán (ACCOUNTANT):** \`accountant.workflow@fintax.demo\` / Mật khẩu: \`FinTax@2026\`
- **Quản đốc xưởng (WORKSHOP):** \`workshop.workflow@fintax.demo\` / Mật khẩu: \`FinTax@2026\`
    `,
    contact: {
      name: 'FinTax Engineering Team',
    },
  },
  servers: [
    {
      url: '/api',
      description: 'API Server hiện tại',
    },
    {
      url: 'http://localhost:3001/api',
      description: 'Localhost Development Server',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Nhập JWT Token lấy được sau khi gọi API `/auth/login` (chỉ cần nhập mã token, không cần gõ chữ Bearer).',
      },
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        properties: {
          error: {
            type: 'string',
            example: 'Thông báo lỗi chi tiết bằng tiếng Việt.',
          },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', example: 'owner.workflow@fintax.demo' },
          password: { type: 'string', example: 'FinTax@2026' },
        },
      },
      LoginResponse: {
        type: 'object',
        properties: {
          token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
          user: {
            type: 'object',
            properties: {
              id: { type: 'string', example: 'usr_001' },
              email: { type: 'string', example: 'owner.workflow@fintax.demo' },
              name: { type: 'string', example: 'Chủ Xưởng Mẫu' },
              role: { type: 'string', example: 'OWNER', enum: ['OWNER', 'ACCOUNTANT', 'WORKSHOP'] },
              roleLabel: { type: 'string', example: 'Chủ doanh nghiệp' },
            },
          },
        },
      },
      RegisterRequest: {
        type: 'object',
        required: ['email', 'password', 'name'],
        properties: {
          email: { type: 'string', format: 'email', example: 'new.staff@fintax.demo' },
          password: { type: 'string', example: 'Password123@' },
          name: { type: 'string', example: 'Nguyễn Văn A' },
          role: { type: 'string', example: 'ACCOUNTANT', enum: ['ACCOUNTANT', 'WORKSHOP'] },
        },
      },
      Transaction: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'tx_123456' },
          date: { type: 'string', format: 'date', example: '2026-11-10' },
          type: { type: 'string', enum: ['INCOME', 'EXPENSE'], example: 'INCOME' },
          amount: { type: 'number', example: 50000000 },
          classification: { 
            type: 'string', 
            enum: ['BUSINESS_INCOME', 'BUSINESS_EXPENSE', 'PERSONAL', 'INTERNAL_TRANSFER', 'OWNER_FUNDING', 'OWNER_DRAW', 'UNCLASSIFIED'],
            example: 'BUSINESS_INCOME',
          },
          ownerScope: { type: 'string', enum: ['BUSINESS', 'PERSONAL'], example: 'BUSINESS' },
          accountId: { type: 'string', example: 'acc_vcb' },
          description: { type: 'string', example: 'Khách thanh toán đợt 1 gia công chi tiết máy' },
        },
      },
      Invoice: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'inv_889900' },
          invoiceNumber: { type: 'string', example: 'HD00012' },
          direction: { type: 'string', enum: ['INPUT', 'OUTPUT'], example: 'OUTPUT' },
          date: { type: 'string', format: 'date', example: '2026-11-10' },
          partnerId: { type: 'string', example: 'cust_01' },
          partnerName: { type: 'string', example: 'Công ty Cơ khí Chính xác ABC' },
          partnerTaxId: { type: 'string', example: '0101234567' },
          subtotal: { type: 'number', example: 100000000 },
          taxRate: { type: 'number', example: 8 },
          taxAmount: { type: 'number', example: 8000000 },
          total: { type: 'number', example: 108000000 },
          status: { type: 'string', example: 'APPROVED', enum: ['DRAFT', 'APPROVED', 'SENT', 'PAID', 'CANCELLED'] },
          taxCodeStatus: { type: 'string', example: 'SIMULATED', enum: ['PENDING', 'SIMULATED', 'VERIFIED'] },
        },
      },
      Quotation: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'quo_01' },
          code: { type: 'string', example: 'BG-2026-001' },
          customerId: { type: 'string', example: 'cust_01' },
          customerName: { type: 'string', example: 'Nhà máy Sản xuất Phụ tùng XYZ' },
          totalAmount: { type: 'number', example: 45000000 },
          status: { type: 'string', enum: ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'ORDER_CREATED'], example: 'SUBMITTED' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                productId: { type: 'string', example: 'prod_truc' },
                quantity: { type: 'number', example: 100 },
                unitPrice: { type: 'number', example: 450000 },
              },
            },
          },
        },
      },
      ProductionOrder: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'po_01' },
          code: { type: 'string', example: 'LSX-001' },
          quotationId: { type: 'string', example: 'quo_01' },
          productName: { type: 'string', example: 'Trục láp truyền động D30' },
          quantity: { type: 'number', example: 50 },
          status: { type: 'string', enum: ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'], example: 'IN_PROGRESS' },
          assignedWorkerId: { type: 'string', example: 'usr_workshop_01' },
        },
      },
    },
  },
  tags: [
    { name: 'Xác thực & Người dùng (Auth)', description: 'Đăng nhập, đăng ký, cấp JWT, OTP khôi phục mật khẩu' },
    { name: 'Báo cáo & 7 Sổ Kế toán (TT88)', description: 'Dashboard KPI, Sổ quỹ, Sổ tiền gửi, Doanh thu, Chi phí, Vật tư, Giá thành' },
    { name: 'Quản lý Thu Chi & Ngân hàng (Cash & Bank)', description: 'Thu, chi, chuyển tiền nội bộ, đối soát sao kê, phân tách dòng tiền cá nhân' },
    { name: 'Hóa đơn & Báo giá (Sales & Invoicing)', description: 'Báo giá gia công, hóa đơn đầu vào/đầu ra, cấp mã CQT mô phỏng' },
    { name: 'Sản xuất & Kho xưởng (Manufacturing & Inventory)', description: 'Định mức BOM, lệnh sản xuất, xuất nhập vật tư, chấm công gia công' },
    { name: 'Đồng bộ ERP Odoo 16 & Thuế (Integrations)', description: 'Trạng thái kết nối, hàng đợi Outbox sync Odoo và Mock Tax API' },
    { name: 'Danh mục Hệ thống (Master Data)', description: 'Khách hàng, nhà cung cấp, vật tư, sản phẩm, tài khoản quỹ, quy tắc thuế' },
  ],
  paths: {
    '/health': {
      get: {
        tags: ['Đồng bộ ERP Odoo 16 & Thuế (Integrations)'],
        summary: 'Kiểm tra trạng thái máy chủ Middleware và kết nối PostgreSQL',
        responses: {
          200: {
            description: 'Máy chủ và cơ sở dữ liệu hoạt động bình thường',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean', example: true },
                    service: { type: 'string', example: 'middleware-api' },
                    database: { type: 'string', example: 'connected' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Xác thực & Người dùng (Auth)'],
        summary: 'Đăng nhập hệ thống, nhận JWT Token',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LoginRequest' },
            },
          },
        },
        responses: {
          200: {
            description: 'Đăng nhập thành công',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/LoginResponse' },
              },
            },
          },
          401: {
            description: 'Sai email hoặc mật khẩu',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
        },
      },
    },
    '/auth/register': {
      post: {
        tags: ['Xác thực & Người dùng (Auth)'],
        summary: 'Đăng ký tài khoản nhân viên mới (chờ OWNER duyệt)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RegisterRequest' },
            },
          },
        },
        responses: {
          201: {
            description: 'Đăng ký thành công, chờ kích hoạt',
          },
          400: {
            description: 'Dữ liệu không hợp lệ hoặc email đã tồn tại',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
        },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Xác thực & Người dùng (Auth)'],
        summary: 'Lấy thông tin tài khoản hiện tại',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Thông tin tài khoản và quyền hạn' },
          401: { description: 'Chưa đăng nhập hoặc token không hợp lệ' },
        },
      },
    },
    '/auth/forgot-password': {
      post: {
        tags: ['Xác thực & Người dùng (Auth)'],
        summary: 'Yêu cầu gửi mã OTP đặt lại mật khẩu qua Gmail',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email'],
                properties: { email: { type: 'string', format: 'email', example: 'owner.workflow@fintax.demo' } },
              },
            },
          },
        },
        responses: {
          200: { description: 'Mã OTP đã được gửi về email' },
        },
      },
    },
    '/auth/reset-password': {
      post: {
        tags: ['Xác thực & Người dùng (Auth)'],
        summary: 'Đặt lại mật khẩu bằng mã OTP 6 chữ số (hết hạn sau 10 phút)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'otp', 'newPassword'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  otp: { type: 'string', example: '123456' },
                  newPassword: { type: 'string', example: 'NewPassword@2026' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Đổi mật khẩu thành công' },
        },
      },
    },
    '/dashboard': {
      get: {
        tags: ['Báo cáo & 7 Sổ Kế toán (TT88)'],
        summary: 'Lấy dữ liệu Dashboard (Doanh thu, Chi phí, Dòng tiền, Cảnh báo)',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Dữ liệu tổng quan tài chính và hoạt động' },
        },
      },
    },
    '/reports/books': {
      get: {
        tags: ['Báo cáo & 7 Sổ Kế toán (TT88)'],
        summary: 'Lấy 7 cuốn sổ kế toán hộ kinh doanh theo Thông tư 88/2021/TT-BTC',
        description: 'Bao gồm S1 (Sổ quỹ tiền mặt), S2 (Sổ tiền gửi ngân hàng), S3 (Doanh thu), S4 (Chi phí), S5 (Vật liệu, dụng cụ, sản phẩm, hàng hóa), S6 (Chi phí sản xuất kinh doanh), S7 (Nghĩa vụ thuế).',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'fromDate', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Từ ngày' },
          { name: 'toDate', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Đến ngày' },
        ],
        responses: {
          200: { description: 'Dữ liệu chi tiết 7 cuốn sổ' },
        },
      },
    },
    '/reports/books/export': {
      get: {
        tags: ['Báo cáo & 7 Sổ Kế toán (TT88)'],
        summary: 'Xuất file Excel đầy đủ 7 cuốn sổ kế toán TT88',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Tải file Excel .xlsx',
            content: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {} },
          },
        },
      },
    },
    '/transactions': {
      get: {
        tags: ['Quản lý Thu Chi & Ngân hàng (Cash & Bank)'],
        summary: 'Lấy danh sách giao dịch thu/chi',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Tìm kiếm mô tả, tài khoản' },
          { name: 'status', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          200: {
            description: 'Danh sách giao dịch',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/Transaction' } },
              },
            },
          },
        },
      },
      post: {
        tags: ['Quản lý Thu Chi & Ngân hàng (Cash & Bank)'],
        summary: 'Thêm giao dịch thu chi mới',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Transaction' },
            },
          },
        },
        responses: {
          201: { description: 'Tạo giao dịch thành công' },
        },
      },
    },
    '/transfers': {
      post: {
        tags: ['Quản lý Thu Chi & Ngân hàng (Cash & Bank)'],
        summary: 'Chuyển tiền nội bộ giữa các tài khoản (Tiền mặt <-> Ngân hàng)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['fromAccountId', 'toAccountId', 'amount', 'date'],
                properties: {
                  fromAccountId: { type: 'string', example: 'acc_vcb' },
                  toAccountId: { type: 'string', example: 'acc_cash' },
                  amount: { type: 'number', example: 10000000 },
                  date: { type: 'string', format: 'date', example: '2026-11-10' },
                  feeAmount: { type: 'number', example: 5500 },
                  note: { type: 'string', example: 'Rút tiền gửi về nhập quỹ tiền mặt' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Chuyển khoản nội bộ thành công' },
        },
      },
    },
    '/transactions/{id}/actions/classify': {
      post: {
        tags: ['Quản lý Thu Chi & Ngân hàng (Cash & Bank)'],
        summary: 'Phân loại dòng tiền (SXKD vs Tiêu dùng cá nhân / Vốn chủ sở hữu)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['classification'],
                properties: {
                  classification: {
                    type: 'string',
                    enum: ['BUSINESS_INCOME', 'BUSINESS_EXPENSE', 'PERSONAL', 'INTERNAL_TRANSFER', 'OWNER_FUNDING', 'OWNER_DRAW'],
                  },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Phân loại dòng tiền thành công' },
        },
      },
    },
    '/import/transactions/preview': {
      post: {
        tags: ['Quản lý Thu Chi & Ngân hàng (Cash & Bank)'],
        summary: 'Tải lên sao kê ngân hàng (CSV/XLS/XLSX) để đối soát và phát hiện trùng',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  file: { type: 'string', format: 'binary' },
                  accountId: { type: 'string', example: 'acc_vcb' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Kết quả phân tích preview, phát hiện dòng hợp lệ và dòng trùng' },
        },
      },
    },
    '/import/transactions/{importId}/commit': {
      post: {
        tags: ['Quản lý Thu Chi & Ngân hàng (Cash & Bank)'],
        summary: 'Lưu các dòng giao dịch sao kê hợp lệ vào hệ thống',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'importId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Đã lưu các giao dịch vào cơ sở dữ liệu' },
        },
      },
    },
    '/invoices': {
      get: {
        tags: ['Hóa đơn & Báo giá (Sales & Invoicing)'],
        summary: 'Danh sách hóa đơn đầu vào và đầu ra',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Danh sách hóa đơn',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/Invoice' } },
              },
            },
          },
        },
      },
      post: {
        tags: ['Hóa đơn & Báo giá (Sales & Invoicing)'],
        summary: 'Tạo hóa đơn mua vào hoặc bán ra mới',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Invoice' },
            },
          },
        },
        responses: {
          201: { description: 'Tạo hóa đơn thành công' },
        },
      },
    },
    '/invoices/{id}/actions/simulate-code': {
      post: {
        tags: ['Hóa đơn & Báo giá (Sales & Invoicing)'],
        summary: 'Giả lập xin cấp mã Cơ quan Thuế cho hóa đơn bán ra',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Đã cấp mã hóa đơn điện tử mô phỏng thành công' },
        },
      },
    },
    '/quotations': {
      get: {
        tags: ['Hóa đơn & Báo giá (Sales & Invoicing)'],
        summary: 'Lấy danh sách báo giá khách hàng',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Danh sách báo giá',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/Quotation' } },
              },
            },
          },
        },
      },
      post: {
        tags: ['Hóa đơn & Báo giá (Sales & Invoicing)'],
        summary: 'Tạo báo giá gia công mới',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Quotation' },
            },
          },
        },
        responses: {
          201: { description: 'Tạo báo giá thành công' },
        },
      },
    },
    '/quotations/{id}/actions/approve': {
      post: {
        tags: ['Hóa đơn & Báo giá (Sales & Invoicing)'],
        summary: 'Chủ xưởng (OWNER) duyệt báo giá',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Duyệt báo giá thành công' },
        },
      },
    },
    '/production-orders': {
      get: {
        tags: ['Sản xuất & Kho xưởng (Manufacturing & Inventory)'],
        summary: 'Lấy danh sách lệnh sản xuất gia công',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Danh sách lệnh sản xuất',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/ProductionOrder' } },
              },
            },
          },
        },
      },
      post: {
        tags: ['Sản xuất & Kho xưởng (Manufacturing & Inventory)'],
        summary: 'Tạo lệnh sản xuất mới',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ProductionOrder' },
            },
          },
        },
        responses: {
          201: { description: 'Tạo lệnh sản xuất thành công' },
        },
      },
    },
    '/stock-movements': {
      get: {
        tags: ['Sản xuất & Kho xưởng (Manufacturing & Inventory)'],
        summary: 'Lấy nhật ký luân chuyển kho (Nhập/Xuất/Hao hụt vật tư)',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Danh sách luân chuyển kho' },
        },
      },
      post: {
        tags: ['Sản xuất & Kho xưởng (Manufacturing & Inventory)'],
        summary: 'Ghi nhận xuất kho cho lệnh sản xuất hoặc nhập kho thành phẩm',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['materialId', 'type', 'quantity', 'date'],
                properties: {
                  materialId: { type: 'string', example: 'mat_thep_tam' },
                  type: { type: 'string', enum: ['RECEIPT', 'ISSUE', 'RETURN', 'WASTE'], example: 'ISSUE' },
                  quantity: { type: 'number', example: 15 },
                  productionOrderId: { type: 'string', example: 'po_01' },
                  date: { type: 'string', format: 'date', example: '2026-11-10' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Ghi nhận xuất nhập kho thành công' },
        },
      },
    },
    '/labor-logs': {
      get: {
        tags: ['Sản xuất & Kho xưởng (Manufacturing & Inventory)'],
        summary: 'Lấy nhật ký giờ công thợ theo lệnh sản xuất',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Danh sách giờ công thợ' },
        },
      },
      post: {
        tags: ['Sản xuất & Kho xưởng (Manufacturing & Inventory)'],
        summary: 'Chấm công thợ gia công cho lệnh sản xuất',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['productionOrderId', 'workerName', 'hours', 'hourlyRate', 'date'],
                properties: {
                  productionOrderId: { type: 'string', example: 'po_01' },
                  workerName: { type: 'string', example: 'Nguyễn Văn Hàn' },
                  stage: { type: 'string', example: 'Gia công phay CNC' },
                  hours: { type: 'number', example: 8 },
                  hourlyRate: { type: 'number', example: 50000 },
                  date: { type: 'string', format: 'date', example: '2026-11-10' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Ghi nhận giờ công thành công' },
        },
      },
    },
    '/integrations/status': {
      get: {
        tags: ['Đồng bộ ERP Odoo 16 & Thuế (Integrations)'],
        summary: 'Xem trạng thái kết nối Odoo 16 ERP và Mock Tax API',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Trạng thái các kết nối dịch vụ ngoài' },
        },
      },
    },
    '/integrations/odoo/queue': {
      get: {
        tags: ['Đồng bộ ERP Odoo 16 & Thuế (Integrations)'],
        summary: 'Xem danh sách 100 tác vụ hàng đợi Outbox đồng bộ Odoo gần nhất',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Danh sách tác vụ PENDING, SYNCED, FAILED' },
        },
      },
    },
    '/integrations/odoo/sync-pending': {
      post: {
        tags: ['Đồng bộ ERP Odoo 16 & Thuế (Integrations)'],
        summary: 'Kích hoạt đồng bộ thủ công các bản ghi đang chờ sang Odoo qua XML-RPC',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Kết quả chạy đồng bộ lô' },
        },
      },
    },
    '/{entity}': {
      get: {
        tags: ['Danh mục Hệ thống (Master Data)'],
        summary: 'Lấy danh sách bản ghi theo danh mục bất kỳ',
        description: 'Áp dụng cho các danh mục: `customers`, `suppliers`, `materials`, `products`, `boms`, `branches`, `cash-accounts`, `tax-rules`, `tax-periods`',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'entity', in: 'path', required: true, schema: { type: 'string', example: 'customers' } },
        ],
        responses: {
          200: { description: 'Danh sách bản ghi danh mục' },
        },
      },
      post: {
        tags: ['Danh mục Hệ thống (Master Data)'],
        summary: 'Tạo bản ghi mới trong danh mục',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'entity', in: 'path', required: true, schema: { type: 'string', example: 'customers' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object' },
            },
          },
        },
        responses: {
          201: { description: 'Tạo thành công' },
        },
      },
    },
  },
};

export function setupSwagger(app) {
  // Exclude CSP for Swagger UI assets so styles and JS render properly
  app.use('/api-docs', (req, res, next) => {
    res.removeHeader('Content-Security-Policy');
    res.removeHeader('Content-Security-Policy-Report-Only');
    next();
  }, swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'FinTax API Documentation (Swagger UI)',
    customCss: `
      .topbar { background-color: #0f172a !important; }
      .topbar-wrapper img { content: url('https://raw.githubusercontent.com/swagger-api/swagger-ui/master/dist/favicon-32x32.png'); }
      .swagger-ui .info { margin: 20px 0; }
      .swagger-ui .info .title { font-family: ui-sans-serif, system-ui, sans-serif; color: #0f172a; font-weight: 800; }
    `,
  }));

  // Endpoint to get raw OpenAPI JSON
  app.get('/api-docs.json', (_req, res) => {
    res.json(swaggerSpec);
  });
}
