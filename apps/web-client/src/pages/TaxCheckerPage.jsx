import React, { useState } from 'react';
import { 
  ShieldAlert, 
  Search, 
  Building2, 
  MapPin, 
  UserCheck, 
  AlertTriangle, 
  CheckCircle2, 
  FileWarning, 
  HelpCircle,
  Sparkles
} from 'lucide-react';
import { taxApi } from '../api/client';

export const TaxCheckerPage = () => {
  const [mst, setMst] = useState('0101234567');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const sampleCompanies = [
    {
      mst: '0101234567',
      name: 'CƠ KHÍ & THÉP HÀ NỘI',
      status: 'ACTIVE',
      desc: 'Hoạt động bình thường - An toàn khấu trừ thuế',
    },
    {
      mst: '0309999999',
      name: 'CÔNG TY MA ÁNH DƯƠNG',
      status: 'SUSPENDED',
      desc: 'Ngừng hoạt động / Bỏ địa chỉ KD - RỦI RO THUẾ CAO!',
    },
    {
      mst: '0317894561',
      name: 'TNHH KHANG ĐIỀN',
      status: 'ACTIVE',
      desc: 'Doanh nghiệp thương mại đang hoạt động',
    },
  ];

  const handleSearch = async (taxCodeToSearch) => {
    const code = taxCodeToSearch || mst;
    if (!code || code.trim().length < 10) {
      setError('Vui lòng nhập Mã số thuế hợp lệ (10 hoặc 13 chữ số).');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setResult(null);
      const res = await taxApi.checkMst(code.trim());
      setResult(res);
    } catch (err) {
      console.error('Lỗi tra cứu MST:', err);
      setError('Không thể kết nối đến Cổng Thuế để tra cứu.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* ── Banner ──────────────────────────────────────────────────── */}
      <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-200">
          <span className="font-bold text-white">Tax Risk Engine (Công Cụ Phòng Chống Hóa Đơn Khống & Doanh Nghiệp Rủi Ro):</span>
          Theo quy định của Tổng Cục Thuế và Luật Quản lý Thuế, việc nhận hóa đơn đầu vào từ doanh nghiệp "ngừng hoạt động nhưng chưa đóng MST (bỏ địa chỉ kinh doanh)" sẽ bị loại khỏi chi phí hợp lý và truy thu thuế VAT 100%. FinWorkshop tự động phát hiện và cảnh báo trước khi ghi sổ!
        </div>
      </div>

      {/* ── Search Input Card ───────────────────────────────────────── */}
      <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-slate-800">
        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <Search className="w-5 h-5 text-indigo-400" />
          Tra Cứu Trạng Thái Người Nộp Thuế Trực Tiếp
        </h3>

        {/* Quick Sample Chips */}
        <div className="mb-6">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
            Mã Số Thuế Kiểm Thử Sẵn Có:
          </span>
          <div className="flex flex-wrap gap-2.5">
            {sampleCompanies.map((sample) => (
              <button
                key={sample.mst}
                type="button"
                onClick={() => {
                  setMst(sample.mst);
                  handleSearch(sample.mst);
                }}
                className={`px-3.5 py-2 rounded-2xl border text-xs text-left transition-all flex items-center gap-2 ${
                  sample.status === 'SUSPENDED'
                    ? 'bg-rose-500/10 hover:bg-rose-500/20 border-rose-500/30 text-rose-300'
                    : 'bg-slate-800/80 hover:bg-slate-700/80 border-slate-700 text-slate-200'
                }`}
              >
                <span className="font-mono font-bold">{sample.mst}</span>
                <span className="text-[11px] text-slate-400">({sample.name})</span>
              </button>
            ))}
          </div>
        </div>

        {/* Search Bar */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-4 top-4" />
            <input
              type="text"
              id="input-search-mst"
              value={mst}
              onChange={(e) => setMst(e.target.value)}
              placeholder="Nhập 10 hoặc 13 số Mã Số Thuế doanh nghiệp..."
              className="w-full bg-slate-900 border border-slate-800 rounded-2xl pl-11 pr-4 py-3.5 text-sm font-mono text-white focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          <button
            type="button"
            id="btn-search-tax"
            onClick={() => handleSearch()}
            disabled={loading}
            className="px-8 py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <Search className="w-4 h-4" />
            )}
            <span>Tra Cứu Dữ Liệu Thuế</span>
          </button>
        </div>

        {error && (
          <div className="mt-4 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* ── Search Result Display ──────────────────────────────────── */}
      {result && result.data && (
        <div className={`glass-panel p-6 sm:p-8 rounded-3xl border transition-all ${
          result.isRisky 
            ? 'border-rose-500/50 glow-rose' 
            : 'border-emerald-500/40 glow-emerald'
        }`}>
          {/* Status Badge */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-3">
                <h4 className="text-xl font-extrabold text-white tracking-tight">
                  {result.data.name}
                </h4>
              </div>
              <div className="text-xs text-slate-400 mt-1 font-mono">
                Mã Số Thuế: <span className="text-white font-bold">{result.data.taxCode}</span>
              </div>
            </div>

            <div>
              {result.isRisky ? (
                <div className="px-4 py-2 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-300 font-bold text-xs flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-rose-400 animate-bounce" />
                  <span>CẢNH BÁO: RỦI RO THUẾ CAO</span>
                </div>
              ) : (
                <div className="px-4 py-2 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <span>DOANH NGHIỆP HOẠT ĐỘNG BÌNH THƯỜNG</span>
                </div>
              )}
            </div>
          </div>

          {/* Detailed Information Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-6">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Building2 className="w-4 h-4 text-slate-400 mt-1" />
                <div>
                  <span className="text-xs text-slate-400 block">Trạng Thái Người Nộp Thuế (NNT):</span>
                  <span className={`text-sm font-semibold ${result.isRisky ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {result.data.statusDescription}
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <MapPin className="w-4 h-4 text-slate-400 mt-1" />
                <div>
                  <span className="text-xs text-slate-400 block">Địa Chỉ Trụ Sở Đăng Ký:</span>
                  <span className="text-sm font-medium text-white">
                    {result.data.address || 'Không có thông tin địa chỉ'}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <UserCheck className="w-4 h-4 text-slate-400 mt-1" />
                <div>
                  <span className="text-xs text-slate-400 block">Người Đại Diện Theo Pháp Luật:</span>
                  <span className="text-sm font-medium text-white">
                    {result.data.legalRepresentative || 'Chưa cập nhật'}
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Building2 className="w-4 h-4 text-slate-400 mt-1" />
                <div>
                  <span className="text-xs text-slate-400 block">Cơ Quan Thuế Quản Lý:</span>
                  <span className="text-sm font-medium text-white">
                    {result.data.taxOffice || 'Tổng Cục Thuế'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Legal / Tax Advice Box */}
          <div className={`p-4 rounded-2xl text-xs ${
            result.isRisky 
              ? 'bg-rose-500/10 border border-rose-500/20 text-rose-300' 
              : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
          }`}>
            <span className="font-bold block mb-1">Khuyến Nghị Nghiệp Vụ Cho Kế Toán:</span>
            {result.isRisky ? (
              <p>
                Doanh nghiệp này đã bị cơ quan thuế thông báo không còn hoạt động tại địa chỉ đăng ký kinh doanh. Tuyệt đối <strong>KHÔNG</strong> nhận hóa đơn, không hạch toán vào chi phí được trừ khi tính thuế TNDN và không kê khai khấu trừ thuế GTGT để tránh bị xử phạt hành vi sử dụng bất hợp pháp hóa đơn!
              </p>
            ) : (
              <p>
                Doanh nghiệp đang hoạt động và có đầy đủ tư cách pháp nhân hợp lệ. Hóa đơn đầu vào từ đối tác này đủ điều kiện khấu trừ thuế GTGT và tính chi phí hợp lý khi có đầy đủ chứng từ thanh toán ngân hàng (đối với hóa đơn trên 20 triệu đồng).
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
