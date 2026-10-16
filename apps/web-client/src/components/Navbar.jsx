import React from 'react';
import { RefreshCw, CheckCircle2, ShieldCheck } from 'lucide-react';

export const Navbar = ({ activeTab, onRefresh, refreshing }) => {
  const titles = {
    dashboard: {
      title: 'Bảng Điều Khiển & Kiến Trúc Monorepo',
      subtitle: 'Giám sát chỉ số tài chính thời gian thực, luồng đồng bộ Odoo & Cổng Thuế',
    },
    cashflow: {
      title: 'Quản Lý Thu Chi — Invisible Accounting',
      subtitle: 'Người dùng nhập ngôn ngữ đời thường — Hệ thống tự động dịch sang Định khoản Kế toán Việt Nam (TT 200)',
    },
    invoices: {
      title: 'Hóa Đơn Điện Tử — Tích Hợp Cấp Mã CQT',
      subtitle: 'Kiểm tra rủi ro người bán, xin cấp mã cơ quan thuế tự động trước khi lưu hóa đơn',
    },
    'tax-check': {
      title: 'Công Cụ Tra Cứu Rủi Ro Doanh Nghiệp',
      subtitle: 'Phát hiện công ty ngừng hoạt động, công ty ma bỏ trốn khỏi địa chỉ kinh doanh',
    },
  };

  const current = titles[activeTab] || titles.dashboard;

  return (
    <header className="h-20 bg-slate-900/60 backdrop-blur-md border-b border-slate-800 px-8 flex items-center justify-between sticky top-0 z-20">
      <div>
        <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
          {current.title}
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">{current.subtitle}</p>
      </div>

      <div className="flex items-center space-x-4">
        {/* PostgreSQL Active Badge */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>PostgreSQL 16: Active</span>
        </div>

        {/* Tax Law Compliance Badge */}
        <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-medium">
          <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
          <span>TT 200/2014 & NĐ 123</span>
        </div>

        {/* Refresh Button */}
        {onRefresh && (
          <button
            id="btn-refresh"
            onClick={onRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700/80 transition-all disabled:opacity-50"
            title="Làm mới dữ liệu"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-indigo-400' : ''}`} />
            <span>Làm mới</span>
          </button>
        )}
      </div>
    </header>
  );
};
