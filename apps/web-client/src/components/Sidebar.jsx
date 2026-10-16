import React from 'react';
import { 
  LayoutDashboard, 
  ArrowLeftRight, 
  ReceiptText, 
  ShieldAlert, 
  LogOut, 
  Database, 
  Server, 
  Radio, 
  Boxes 
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const Sidebar = ({ activeTab, setActiveTab }) => {
  const { user, logout } = useAuth();

  const navItems = [
    {
      id: 'dashboard',
      label: 'Tổng Quan Hệ Thống',
      icon: LayoutDashboard,
      badge: 'Live',
      desc: 'KPI dòng tiền & kiến trúc',
    },
    {
      id: 'cashflow',
      label: 'Sổ Quỹ Tiền Mặt',
      icon: ArrowLeftRight,
      badge: 'Nợ/Có',
      desc: 'Invisible Accounting',
    },
    {
      id: 'invoices',
      label: 'Hóa Đơn Điện Tử',
      icon: ReceiptText,
      badge: 'CQT',
      desc: 'Cấp mã Cổng Thuế & Odoo',
    },
    {
      id: 'tax-check',
      label: 'Tra Cứu Rủi Ro Thuế',
      icon: ShieldAlert,
      badge: 'Cảnh Báo',
      desc: 'Phát hiện công ty ma / đóng MST',
    },
  ];

  return (
    <aside className="w-72 bg-slate-900/90 border-r border-slate-800 flex flex-col h-screen sticky top-0 z-30 select-none">
      {/* Brand Header */}
      <div className="p-5 border-b border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-indigo-500/20 font-black text-xl text-white">
            ⚡
          </div>
          <div>
            <h1 className="font-extrabold text-base tracking-tight text-white flex items-center gap-1.5">
              FinWorkshop
              <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-medium bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                v1.0
              </span>
            </h1>
            <p className="text-xs text-slate-400">Tax & Accounting Monorepo</p>
          </div>
        </div>
      </div>

      {/* System Architecture Indicators */}
      <div className="px-4 py-3 bg-slate-950/40 border-b border-slate-800/60">
        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
          <span>Hạ Tầng Dữ Liệu</span>
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5 text-[11px]">
          <div className="flex items-center gap-1.5 bg-slate-800/50 px-2 py-1 rounded border border-slate-700/40 text-emerald-300">
            <Database className="w-3 h-3 text-emerald-400" />
            <span className="font-mono">Postgres 16</span>
          </div>
          <div className="flex items-center gap-1.5 bg-slate-800/50 px-2 py-1 rounded border border-slate-700/40 text-indigo-300">
            <Server className="w-3 h-3 text-indigo-400" />
            <span className="font-mono">API :5000</span>
          </div>
          <div className="flex items-center gap-1.5 bg-slate-800/50 px-2 py-1 rounded border border-slate-700/40 text-amber-300">
            <Radio className="w-3 h-3 text-amber-400" />
            <span className="font-mono">Thuế :4000</span>
          </div>
          <div className="flex items-center gap-1.5 bg-slate-800/50 px-2 py-1 rounded border border-slate-700/40 text-purple-300">
            <Boxes className="w-3 h-3 text-purple-400" />
            <span className="font-mono">Odoo 16/20</span>
          </div>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto">
        <div className="px-2 pb-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
          Chức Năng Nghiệp Vụ
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              id={`nav-${item.id}`}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center justify-between p-3 rounded-xl text-left transition-all duration-200 group ${
                isActive
                  ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-lg shadow-indigo-600/25'
                  : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
              }`}
            >
              <div className="flex items-center space-x-3">
                <div
                  className={`p-2 rounded-lg ${
                    isActive ? 'bg-white/10 text-white' : 'bg-slate-800 text-slate-400 group-hover:text-indigo-400'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-semibold leading-none mb-1">{item.label}</div>
                  <div
                    className={`text-[11px] leading-none ${
                      isActive ? 'text-indigo-200' : 'text-slate-400'
                    }`}
                  >
                    {item.desc}
                  </div>
                </div>
              </div>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-medium ${
                  isActive
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-800 text-slate-400 group-hover:bg-slate-700'
                }`}
              >
                {item.badge}
              </span>
            </button>
          );
        })}
      </nav>

      {/* User Session Footer */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/60">
        <div className="flex items-center justify-between p-2 rounded-xl bg-slate-800/50 border border-slate-700/50">
          <div className="flex items-center space-x-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center font-bold text-xs text-indigo-300">
              {user?.username ? user.username[0].toUpperCase() : 'U'}
            </div>
            <div className="overflow-hidden">
              <div className="text-xs font-semibold text-white truncate">{user?.username || 'Người dùng'}</div>
              <div className="text-[10px] text-slate-400 font-mono capitalize">
                {user?.role === 'admin' ? 'Quản trị viên' : 'Kế toán viên'}
              </div>
            </div>
          </div>
          <button
            id="btn-logout"
            onClick={logout}
            title="Đăng xuất"
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
};
