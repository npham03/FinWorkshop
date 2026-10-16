import express from 'express';
import cors from 'cors';
import { config } from './config/config.js';
import { connectDB } from './config/db.js';
import { errorHandler } from './middlewares/errorHandler.js';

// Routes
import authRoutes from './routes/authRoutes.js';
import cashflowRoutes from './routes/cashflowRoutes.js';
import invoiceRoutes from './routes/invoiceRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import taxRoutes from './routes/taxRoutes.js';

const app = express();

// ── Global Middlewares ───────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Request logger
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// ── Health Check ─────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'OK',
    service: 'FinWorkshop Middleware API',
    database: 'PostgreSQL',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// ── API Routes ───────────────────────────────────────────────────
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/cashflow', cashflowRoutes);
app.use('/api/v1/invoices', invoiceRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/tax', taxRoutes);

// ── 404 Handler ──────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Endpoint không tồn tại.' });
});

// ── Global Error Handler (MUST be last) ─────────────────────────
app.use(errorHandler);

// ── Start ────────────────────────────────────────────────────────
const start = async () => {
  await connectDB();
  app.listen(config.port, () => {
    console.log(`====================================================`);
    console.log(`🚀 [Middleware API] đang chạy tại: http://localhost:${config.port}`);
    console.log(`📋 Health check: http://localhost:${config.port}/health`);
    console.log(`====================================================`);
  });
};

start();
