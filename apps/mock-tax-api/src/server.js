import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import taxRoutes from './routes/taxRoutes.js';
import { taxController } from './controllers/taxController.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Middlewares
app.use(cors());
app.use(express.json());

// Request logger
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [Mock-Tax-API] ${req.method} ${req.originalUrl}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'FinWorkshop Mock Tax Authority API',
    port: PORT,
    timestamp: new Date().toISOString(),
  });
});

app.get('/', (req, res) => {
  res.json({
    message: 'Chào mừng đến với Cổng Giả lập Tổng Cục Thuế Việt Nam (FinWorkshop Mock Tax API)',
    endpoints: {
      health: 'GET /health',
      checkMst: 'GET /api/tax/check-mst/:mst',
      issueInvoiceCode: 'POST /api/tax/invoice/issue-code',
      verifyInvoice: 'GET /api/tax/invoice/verify/:code',
      history: 'GET /api/tax/history',
      middlewareInvoiceCode: 'POST /api/v1/invoices/issue',
    },
  });
});

// API Routes
app.use('/api/tax', taxRoutes);
// Backward-compatible endpoint used by the FinTax middleware.
app.post('/api/v1/invoices/issue', taxController.issueTaxAuthorityCode);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint không tồn tại trên Cổng Thuế',
  });
});

// Start Server
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 [Mock Tax API] đang chạy tại: http://localhost:${PORT}`);
  console.log(`📋 Kiểm tra sức khỏe: http://localhost:${PORT}/health`);
  console.log(`🔍 Tra cứu MST: http://localhost:${PORT}/api/tax/check-mst/:mst`);
  console.log(`====================================================`);
});
