import React, { useState } from 'react';
import { Lock, Mail, Sparkles, AlertTriangle, ArrowRight, ShieldCheck, Database } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const LoginPage = () => {
  const { login } = useAuth();
  const [email, setEmail] = useState('admin@fin.com');
  const [password, setPassword] = useState('admin123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      setLoading(true);
      await login(email.trim(), password);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Đăng nhập thất bại.');
    } finally {
      setLoading(false);
    }
  };

  const fillCredentials = (demoEmail, demoPass) => {
    setEmail(demoEmail);
    setPassword(demoPass);
  };

  return (
    <div className="min-h-screen bg-[#0b0f19] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background radial glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-cyan-600/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 flex items-center justify-center mx-auto mb-4 shadow-xl shadow-indigo-500/25 text-3xl font-black text-white">
            ⚡
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">FinWorkshop</h1>
          <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
            Hệ thống Quản trị Tài chính Xưởng Sản xuất, Định khoản Kế toán Vô hình & Tự động hóa Thuế
          </p>
          <div className="mt-3 flex items-center justify-center gap-2 text-[11px] text-emerald-400 font-mono">
            <Database className="w-3.5 h-3.5" />
            <span>PostgreSQL 16 Database Engine</span>
          </div>
        </div>

        {/* Login Box */}
        <div className="glass-panel p-8 rounded-3xl border border-slate-800 shadow-2xl">
          <h2 className="text-base font-bold text-white mb-2">Đăng Nhập Hệ Thống</h2>
          <p className="text-xs text-slate-400 mb-6">Nhập thông tin tài khoản được cấp quyền</p>

          {error && (
            <div className="mb-6 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                <input
                  type="email"
                  id="input-login-email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@fin.com"
                  className="w-full bg-slate-900 border border-slate-800 rounded-2xl pl-10 pr-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Mật Khẩu
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                <input
                  type="password"
                  id="input-login-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-900 border border-slate-800 rounded-2xl pl-10 pr-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              id="btn-login-submit"
              disabled={loading}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white font-bold text-sm shadow-lg shadow-indigo-500/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <>
                  <span>Đăng Nhập</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Logins */}
          <div className="mt-8 pt-6 border-t border-slate-800/80">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-3 text-center">
              Tài Khoản Mẫu Có Sẵn (Đã Seeder Trong PostgreSQL):
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                id="btn-quick-admin"
                onClick={() => fillCredentials('admin@fin.com', 'admin123')}
                className="p-2.5 rounded-xl bg-slate-800/60 hover:bg-indigo-600/20 border border-slate-700/60 hover:border-indigo-500/40 text-left transition-all"
              >
                <div className="text-xs font-bold text-indigo-300">Quản Trị Viên</div>
                <div className="text-[10px] text-slate-400 font-mono">admin@fin.com</div>
              </button>

              <button
                type="button"
                id="btn-quick-accountant"
                onClick={() => fillCredentials('accountant@fin.com', 'acc123')}
                className="p-2.5 rounded-xl bg-slate-800/60 hover:bg-cyan-600/20 border border-slate-700/60 hover:border-cyan-500/40 text-left transition-all"
              >
                <div className="text-xs font-bold text-cyan-300">Kế Toán Viên</div>
                <div className="text-[10px] text-slate-400 font-mono">accountant@fin.com</div>
              </button>
            </div>
          </div>
        </div>

        {/* Security Footer */}
        <div className="mt-6 text-center text-xs text-slate-400 flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Bảo mật JWT 8h & Bút toán kép Odoo XML-RPC</span>
        </div>
      </div>
    </div>
  );
};
