import React, { useEffect, useState } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  Receipt, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  ArrowRight,
  Database,
  Server,
  Building2,
  FileCheck2,
  Layers
} from 'lucide-react';
import { dashboardApi } from '../api/client';

export const DashboardPage = ({ setActiveTab }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await dashboardApi.getSummary();
      if (res.success) {
        setData(res.data);
      }
    } catch (err) {
      console.error('Failed to load dashboard:', err);
      setError('Không thể kết nối đến Middleware API.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const formatVND = (num) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num || 0);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-slate-400 text-sm">Đang tải dữ liệu từ PostgreSQL & Middleware API...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center bg-rose-500/10 border border-rose-500/20 rounded-2xl max-w-xl mx-auto my-12">
        <AlertTriangle className="w-12 h-12 text-rose-400 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-white mb-2">{error}</h3>
        <p className="text-sm text-slate-400 mb-4">Hãy đảm bảo Middleware API đang chạy tại http://localhost:5000</p>
        <button
          onClick={fetchData}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold transition-all"
        >
          Thử Lại
        </button>
      </div>
    );
  }

  const { metrics, systemStatus, recentTransactions, recentInvoices } = data || {
    metrics: {},
    systemStatus: {},
    recentTransactions: [],
    recentInvoices: [],
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* ── KPI Metric Cards ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Total Income */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 relative overflow-hidden group hover:border-emerald-500/40 transition-all">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity text-emerald-400">
            <TrendingUp className="w-20 h-20" />
          </div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Tổng Thu Vào</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-white tracking-tight">{formatVND(metrics.totalIncome)}</div>
          <div className="mt-2 text-xs text-emerald-400 flex items-center gap-1">
            <span>Đã định khoản Có 511 / Nợ 111-112</span>
          </div>
        </div>

        {/* Total Expense */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 relative overflow-hidden group hover:border-rose-500/40 transition-all">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity text-rose-400">
            <TrendingDown className="w-20 h-20" />
          </div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Tổng Chi Ra</span>
            <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-white tracking-tight">{formatVND(metrics.totalExpense)}</div>
          <div className="mt-2 text-xs text-slate-400 flex items-center justify-between">
            <span className="text-amber-400">SX: {formatVND(metrics.productionExpense)}</span>
            <span className="text-purple-400">Cá nhân: {formatVND(metrics.personalExpense)}</span>
          </div>
        </div>

        {/* Net Cashflow */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 relative overflow-hidden group hover:border-indigo-500/40 transition-all">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity text-indigo-400">
            <Wallet className="w-20 h-20" />
          </div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Dòng Tiền Thuần</span>
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className={`text-2xl font-black tracking-tight ${metrics.netCashflow >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {formatVND(metrics.netCashflow)}
          </div>
          <div className="mt-2 text-xs text-slate-400">
            {metrics.totalTransactions} giao dịch được ghi nhận
          </div>
        </div>

        {/* E-Invoices & Tax Risk */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 relative overflow-hidden group hover:border-cyan-500/40 transition-all">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity text-cyan-400">
            <Receipt className="w-20 h-20" />
          </div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Hóa Đơn Đã Cấp Mã</span>
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <FileCheck2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-white tracking-tight">
            {metrics.approvedInvoices || 0} / {metrics.totalInvoices || 0}
          </div>
          <div className="mt-2 text-xs text-slate-400 flex items-center justify-between">
            <span className="text-cyan-300 font-mono">Trị giá: {formatVND(metrics.totalInvoiceAmount)}</span>
            {metrics.taxRiskCount > 0 ? (
              <span className="text-rose-400 font-semibold flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> {metrics.taxRiskCount} rủi ro
              </span>
            ) : (
              <span className="text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> An toàn thuế
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Monorepo Architecture Flow Card ─────────────────────────── */}
      <div className="glass-panel p-6 rounded-3xl border border-slate-800">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-indigo-400" />
              Kiến Trúc Tích Hợp Hệ Thống (Monorepo Pipeline)
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Luồng tự động hóa từ Nhập liệu Đời thường → Middleware dịch Nợ/Có & Rủi ro Thuế → PostgreSQL & Odoo ERP
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
              DB: PostgreSQL 16
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Node 1: Web Client */}
          <div className="p-4 rounded-2xl bg-slate-800/40 border border-slate-700/60 relative group hover:border-indigo-500/50 transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-indigo-400">1. Giao Diện (Vite React)</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono">:5173</span>
            </div>
            <p className="text-xs text-slate-300 font-medium">Người dùng nhập tự nhiên</p>
            <p className="text-[11px] text-slate-400 mt-1">
              "Mua sắt thép", "Rút tiền cá nhân" — Không cần biết định khoản Nợ/Có phức tạp.
            </p>
          </div>

          {/* Node 2: Middleware API */}
          <div className="p-4 rounded-2xl bg-slate-800/40 border border-indigo-500/30 relative group hover:border-indigo-500 transition-all glow-indigo">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-indigo-300">2. Middleware API (The Brain)</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono">:5000</span>
            </div>
            <p className="text-xs text-slate-200 font-medium">Mapping TT 200 & Tax Risk</p>
            <p className="text-[11px] text-slate-400 mt-1">
              Tự động phân loại Nợ 152/Có 111, kiểm tra MST công ty ma, xin mã CQT.
            </p>
          </div>

          {/* Node 3: PostgreSQL DB */}
          <div className="p-4 rounded-2xl bg-slate-800/40 border border-emerald-500/30 relative group hover:border-emerald-500 transition-all glow-emerald">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-emerald-400">3. PostgreSQL Database</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono">:5432</span>
            </div>
            <p className="text-xs text-slate-200 font-medium">Local Storage & Pending Sync</p>
            <p className="text-[11px] text-slate-400 mt-1">
              Lưu trữ an toàn ngay lập tức. Nếu Odoo bảo trì, hệ thống vẫn hoạt động thông suốt.
            </p>
          </div>

          {/* Node 4: Mock Tax & Odoo ERP */}
          <div className="p-4 rounded-2xl bg-slate-800/40 border border-purple-500/30 relative group hover:border-purple-500 transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-purple-300">4. Cổng Thuế & Odoo ERP</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono">:4000 / :8069</span>
            </div>
            <p className="text-xs text-slate-200 font-medium">Cấp Mã & Bút Toán Kế Toán</p>
            <p className="text-[11px] text-slate-400 mt-1">
              Nhận mã CQT chuẩn pháp lý và đồng bộ bút toán account.move qua XML-RPC.
            </p>
          </div>
        </div>
      </div>

      {/* ── Two Columns: Recent Transactions & Recent Invoices ──────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Transactions */}
        <div className="glass-panel p-6 rounded-3xl border border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="font-bold text-white text-base flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                Giao Dịch Gần Đây (Đã Tự Động Định Khoản)
              </h4>
              <p className="text-xs text-slate-400">Các bút toán dịch bởi Invisible Accounting</p>
            </div>
            <button
              onClick={() => setActiveTab('cashflow')}
              className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-semibold"
            >
              <span>Xem tất cả</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3">
            {recentTransactions.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8">Chưa có giao dịch nào được ghi nhận.</p>
            ) : (
              recentTransactions.map((tx) => (
                <div
                  key={tx.id}
                  className="p-3.5 rounded-2xl bg-slate-800/40 border border-slate-700/50 flex items-center justify-between hover:bg-slate-800/70 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${
                          tx.type === 'income'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}
                      >
                        {tx.type === 'income' ? 'Thu' : 'Chi'}
                      </span>
                      <span className="text-xs font-semibold text-white">{tx.description}</span>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
                      <span className="text-indigo-300 font-medium">
                        Nợ: {tx.accountingEntry?.debit?.account} ({tx.accountingEntry?.debit?.name})
                      </span>
                      <span>•</span>
                      <span className="text-cyan-300 font-medium">
                        Có: {tx.accountingEntry?.credit?.account} ({tx.accountingEntry?.credit?.name})
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className={`text-sm font-bold ${tx.type === 'income' ? 'text-emerald-400' : 'text-slate-200'}`}>
                      {tx.type === 'income' ? '+' : '-'}{formatVND(tx.amount)}
                    </div>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                        tx.odooSyncStatus === 'synced'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : tx.odooSyncStatus === 'pending_sync'
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'bg-slate-700 text-slate-300'
                      }`}
                    >
                      {tx.odooSyncStatus === 'synced' ? 'Đã sync Odoo' : tx.odooSyncStatus === 'pending_sync' ? 'Chờ sync' : 'Lưu cục bộ'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Invoices */}
        <div className="glass-panel p-6 rounded-3xl border border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="font-bold text-white text-base flex items-center gap-2">
                <Receipt className="w-4 h-4 text-cyan-400" />
                Hóa Đơn Điện Tử Đã Cấp Mã
              </h4>
              <p className="text-xs text-slate-400">Kiểm soát rủi ro thuế & mã cấp CQT</p>
            </div>
            <button
              onClick={() => setActiveTab('invoices')}
              className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-semibold"
            >
              <span>Xem tất cả</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3">
            {recentInvoices.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8">Chưa có hóa đơn nào được phát hành.</p>
            ) : (
              recentInvoices.map((inv) => (
                <div
                  key={inv.id}
                  className="p-3.5 rounded-2xl bg-slate-800/40 border border-slate-700/50 flex items-center justify-between hover:bg-slate-800/70 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-white">{inv.invoiceNumber}</span>
                      <span className="text-xs text-slate-300 truncate max-w-[180px]">
                        {inv.buyerName || 'Khách vãng lai'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-[11px] text-cyan-300 font-mono">
                      <FileCheck2 className="w-3 h-3 text-cyan-400" />
                      <span>Mã CQT: {inv.taxAuthorityCode || 'Chưa cấp'}</span>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-sm font-bold text-white">{formatVND(inv.totalAmount)}</div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-semibold uppercase">
                      {inv.taxCodeStatus}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
