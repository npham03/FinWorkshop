import React, { useState, useEffect } from 'react';
import { 
  ArrowLeftRight, 
  PlusCircle, 
  AlertTriangle, 
  CheckCircle2, 
  HelpCircle, 
  Sparkles, 
  Filter, 
  Calendar,
  Building,
  User,
  ShieldCheck,
  Search
} from 'lucide-react';
import { cashflowApi } from '../api/client';

export const CashflowPage = () => {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Filter state
  const [typeFilter, setTypeFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    type: 'expense',
    category: 'production',
    description: '',
    amount: '',
    sellerTaxCode: '',
    attachmentNote: '',
  });

  const quickPresets = [
    { label: 'Mua sắt thép', desc: 'Mua sắt thép phi 10 xưởng sản xuất', type: 'expense', cat: 'production', amount: 8500000, mst: '0101234567' },
    { label: 'Trả lương thợ', desc: 'Trả lương thợ tiện tuần này', type: 'expense', cat: 'production', amount: 4500000, mst: '' },
    { label: 'Tiền điện xưởng', desc: 'Thanh toán tiền điện sản xuất ba pha', type: 'expense', cat: 'production', amount: 3200000, mst: '' },
    { label: 'Rút tiền cá nhân', desc: 'Rút tiền sinh hoạt gia đình chủ xưởng', type: 'expense', cat: 'personal', amount: 2000000, mst: '' },
    { label: 'Thu tiền bán hàng', desc: 'Khách hàng thanh toán tiền gia công khung nhôm', type: 'income', cat: 'production', amount: 15000000, mst: '' },
  ];

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      const params = {};
      if (typeFilter) params.type = typeFilter;
      if (categoryFilter) params.category = categoryFilter;

      const res = await cashflowApi.list(params);
      if (res.success && res.data) {
        setTransactions(res.data.transactions || []);
      }
    } catch (err) {
      console.error('Lỗi tải giao dịch:', err);
      setError('Không thể tải danh sách giao dịch từ PostgreSQL.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, [typeFilter, categoryFilter]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const numAmount = parseFloat(formData.amount);
    if (!numAmount || numAmount <= 0) {
      setError('Vui lòng nhập số tiền hợp lệ lớn hơn 0.');
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        type: formData.type,
        category: formData.category,
        description: formData.description,
        amount: numAmount,
        attachmentNote: formData.attachmentNote || undefined,
        sellerTaxCode: formData.sellerTaxCode ? formData.sellerTaxCode.trim() : undefined,
      };

      const res = await cashflowApi.create(payload);
      if (res.success) {
        const tx = res.data;
        let msg = `Đã ghi nhận giao dịch! Hệ thống tự động định khoản: Nợ ${tx.accountingEntry?.debit?.account} / Có ${tx.accountingEntry?.credit?.account}.`;
        if (tx.taxAlert?.isRisky) {
          msg += ` ⚠️ ${tx.taxAlert.message}`;
        }
        setSuccessMsg(msg);

        // Reset form
        setFormData({
          type: 'expense',
          category: 'production',
          description: '',
          amount: '',
          sellerTaxCode: '',
          attachmentNote: '',
        });

        // Refresh list
        fetchTransactions();
      }
    } catch (err) {
      console.error('Lỗi ghi nhận giao dịch:', err);
      const backendErr = err.response?.data?.message || err.message || 'Đã có lỗi xảy ra.';
      setError(backendErr);
    } finally {
      setSubmitting(false);
    }
  };

  const applyPreset = (preset) => {
    setFormData({
      type: preset.type,
      category: preset.cat,
      description: preset.desc,
      amount: preset.amount.toString(),
      sellerTaxCode: preset.mst,
      attachmentNote: 'Chứng từ nội bộ',
    });
  };

  const formatVND = (num) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num || 0);
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* ── Header Description ──────────────────────────────────────── */}
      <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-start gap-3">
        <Sparkles className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
        <div className="text-xs text-indigo-200">
          <span className="font-bold text-white">Cơ Chế "Invisible Accounting" (Kế toán vô hình):</span> Bạn chỉ cần nhập liệu theo ngôn ngữ thông thường (như "Mua sắt thép", "Trả lương công nhân", "Rút tiền sinh hoạt"). Middleware API và Quy chuẩn Kế toán Việt Nam (TT 200/2014/TT-BTC) sẽ tự động phân loại, kiểm tra rủi ro thuế của nhà cung cấp và lập bút toán kép (Nợ/Có) chuẩn xác để đồng bộ vào Odoo ERP!
        </div>
      </div>

      {/* ── Transaction Entry Form Card ─────────────────────────────── */}
      <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-slate-800">
        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <PlusCircle className="w-5 h-5 text-indigo-400" />
          Ghi Nhận Thu / Chi Nhanh
        </h3>

        {/* Quick Presets */}
        <div className="mb-6">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
            Mẫu Nghiệp Vụ Xưởng Phổ Biến:
          </span>
          <div className="flex flex-wrap gap-2">
            {quickPresets.map((preset, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => applyPreset(preset)}
                className="px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-indigo-600/30 border border-slate-700/80 hover:border-indigo-500/50 text-xs font-medium text-slate-300 hover:text-white transition-all flex items-center gap-1.5"
              >
                <span>{preset.label}</span>
                <span className="text-[10px] text-slate-400 font-mono">({formatVND(preset.amount)})</span>
              </button>
            ))}
          </div>
        </div>

        {/* Feedback messages */}
        {error && (
          <div className="mb-6 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-6 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Row 1: Type & Category */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Type */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                1. Loại Nghiệp Vụ
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  id="btn-type-income"
                  onClick={() => setFormData({ ...formData, type: 'income' })}
                  className={`p-3 rounded-2xl border text-sm font-semibold flex items-center justify-center gap-2 transition-all ${
                    formData.type === 'income'
                      ? 'bg-emerald-600/20 border-emerald-500 text-emerald-400 shadow-lg shadow-emerald-500/10'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  Thu Tiền Vào (+)
                </button>

                <button
                  type="button"
                  id="btn-type-expense"
                  onClick={() => setFormData({ ...formData, type: 'expense' })}
                  className={`p-3 rounded-2xl border text-sm font-semibold flex items-center justify-center gap-2 transition-all ${
                    formData.type === 'expense'
                      ? 'bg-rose-600/20 border-rose-500 text-rose-400 shadow-lg shadow-rose-500/10'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-rose-400"></span>
                  Chi Tiền Ra (-)
                </button>
              </div>
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                2. Phân Loại Dòng Tiền (Bảo vệ Thuế)
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  id="btn-cat-production"
                  onClick={() => setFormData({ ...formData, category: 'production' })}
                  className={`p-3 rounded-2xl border text-sm font-semibold flex items-center justify-center gap-2 transition-all ${
                    formData.category === 'production'
                      ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300 shadow-lg shadow-indigo-500/10'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <Building className="w-4 h-4" />
                  Sản Xuất Kinh Doanh
                </button>

                <button
                  type="button"
                  id="btn-cat-personal"
                  onClick={() => setFormData({ ...formData, category: 'personal' })}
                  className={`p-3 rounded-2xl border text-sm font-semibold flex items-center justify-center gap-2 transition-all ${
                    formData.category === 'personal'
                      ? 'bg-purple-600/20 border-purple-500 text-purple-300 shadow-lg shadow-purple-500/10'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <User className="w-4 h-4" />
                  Cá Nhân Chủ Hộ
                </button>
              </div>
            </div>
          </div>

          {/* Row 2: Description & Amount */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                3. Nội Dung Nghiệp Vụ (Nhập tự nhiên)
              </label>
              <input
                type="text"
                id="input-description"
                required
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Ví dụ: Mua 5 cuộn sắt thép phi 10, Trả tiền nhân công hàn xưởng..."
                className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                4. Số Tiền (VNĐ)
              </label>
              <input
                type="number"
                id="input-amount"
                required
                min="1000"
                step="1000"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                placeholder="0"
                className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-4 py-3 text-sm font-mono text-white focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
          </div>

          {/* Row 3: Seller Tax Code & Attachment Note */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                5. Mã Số Thuế Nhà Cung Cấp (Tùy chọn)
              </label>
              <input
                type="text"
                id="input-seller-tax-code"
                maxLength={14}
                value={formData.sellerTaxCode}
                onChange={(e) => setFormData({ ...formData, sellerTaxCode: e.target.value })}
                placeholder="Nhập 10 hoặc 13 chữ số để tự động soi rủi ro..."
                className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-4 py-3 text-sm font-mono text-white focus:outline-none focus:border-indigo-500 transition-colors"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                Thử MST công ty ma: <code className="text-rose-400 font-mono">0309999999</code> để kích hoạt cảnh báo rủi ro thuế!
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                6. Ghi Chú Chứng Từ Kèm Theo
              </label>
              <input
                type="text"
                id="input-attachment-note"
                value={formData.attachmentNote}
                onChange={(e) => setFormData({ ...formData, attachmentNote: e.target.value })}
                placeholder="Ví dụ: HĐ 0048291, Phiếu chi số 12..."
                className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              id="btn-submit-transaction"
              disabled={submitting}
              className="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white font-bold text-sm shadow-lg shadow-indigo-500/25 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Đang xử lý & Mapping định khoản...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Ghi Nhận & Tự Động Định Khoản Kế Toán</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* ── Transactions History Table ─────────────────────────────── */}
      <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-slate-800">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <ArrowLeftRight className="w-5 h-5 text-indigo-400" />
              Sổ Nhật Ký Thu Chi (Lưu Trữ Trong PostgreSQL)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Toàn bộ nghiệp vụ đã được dịch sang cặp tài khoản Nợ/Có chuẩn Thông tư 200
            </p>
          </div>

          {/* Filter options */}
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="bg-slate-900 border border-slate-800 text-xs text-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500"
            >
              <option value="">Tất cả loại</option>
              <option value="income">Chỉ Thu (+)</option>
              <option value="expense">Chỉ Chi (-)</option>
            </select>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-slate-900 border border-slate-800 text-xs text-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500"
            >
              <option value="">Tất cả phân loại</option>
              <option value="production">Sản xuất kinh doanh</option>
              <option value="personal">Cá nhân chủ hộ</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/60 text-slate-400 uppercase font-semibold border-b border-slate-800">
              <tr>
                <th className="p-3.5 rounded-l-xl">Thời Gian</th>
                <th className="p-3.5">Loại / Mục</th>
                <th className="p-3.5">Mô Tả Người Dùng Nhập</th>
                <th className="p-3.5">Định Khoản Kế Toán (Tự Động)</th>
                <th className="p-3.5 text-right">Số Tiền</th>
                <th className="p-3.5 text-center">Đồng Bộ Odoo</th>
                <th className="p-3.5 rounded-r-xl text-center">Rủi Ro Thuế</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan="7" className="text-center py-12 text-slate-400">
                    <div className="inline-block w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-2"></div>
                    <div>Đang tải dữ liệu từ cơ sở dữ liệu PostgreSQL...</div>
                  </td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center py-12 text-slate-400">
                    Chưa có giao dịch nào phù hợp với bộ lọc.
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="p-3.5 font-mono text-slate-400">
                      {new Date(tx.createdAt).toLocaleDateString('vi-VN', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>

                    <td className="p-3.5">
                      <div className="flex flex-col gap-1">
                        <span
                          className={`inline-block px-2 py-0.5 rounded font-semibold text-[10px] uppercase w-fit ${
                            tx.type === 'income'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}
                        >
                          {tx.type === 'income' ? 'Thu Tiền' : 'Chi Tiền'}
                        </span>
                        <span className="text-[11px] text-slate-400 font-medium">
                          {tx.category === 'production' ? '🏢 Sản xuất' : '👤 Cá nhân'}
                        </span>
                      </div>
                    </td>

                    <td className="p-3.5 font-medium text-white max-w-xs">
                      <div>{tx.description}</div>
                      {tx.attachmentNote && (
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                          Kèm: {tx.attachmentNote}
                        </div>
                      )}
                    </td>

                    <td className="p-3.5 font-mono">
                      <div className="p-2 rounded-xl bg-slate-900 border border-slate-800/80 space-y-1">
                        <div className="text-indigo-300 font-semibold flex items-center justify-between gap-2">
                          <span>Nợ {tx.accountingEntry?.debit?.account}:</span>
                          <span className="text-[11px] text-slate-400 font-normal truncate max-w-[140px]">
                            {tx.accountingEntry?.debit?.name}
                          </span>
                        </div>
                        <div className="text-cyan-300 font-semibold flex items-center justify-between gap-2">
                          <span>Có {tx.accountingEntry?.credit?.account}:</span>
                          <span className="text-[11px] text-slate-400 font-normal truncate max-w-[140px]">
                            {tx.accountingEntry?.credit?.name}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td className="p-3.5 text-right font-bold text-sm">
                      <span className={tx.type === 'income' ? 'text-emerald-400' : 'text-slate-200'}>
                        {tx.type === 'income' ? '+' : '-'}{formatVND(tx.amount)}
                      </span>
                    </td>

                    <td className="p-3.5 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-mono font-medium ${
                          tx.odooSyncStatus === 'synced'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : tx.odooSyncStatus === 'pending_sync'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-slate-800 text-slate-400 border border-slate-700'
                        }`}
                      >
                        {tx.odooSyncStatus === 'synced' ? 'Đã sync Odoo' : tx.odooSyncStatus === 'pending_sync' ? 'Chờ sync' : 'Lưu cục bộ'}
                      </span>
                    </td>

                    <td className="p-3.5 text-center">
                      {tx.taxAlert?.isRisky ? (
                        <div
                          title={tx.taxAlert.message}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/30 font-semibold cursor-help"
                        >
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                          <span>Rủi Ro</span>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Chuẩn</span>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
