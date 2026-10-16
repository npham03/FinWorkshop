import React, { useState, useEffect } from 'react';
import { 
  ReceiptText, 
  FileCheck2, 
  AlertTriangle, 
  Plus, 
  Trash2, 
  Sparkles, 
  Building2, 
  Calendar, 
  Hash, 
  Search,
  CheckCircle2,
  ExternalLink
} from 'lucide-react';
import { invoiceApi, taxApi } from '../api/client';

export const InvoicePage = () => {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState(false);
  const [error, setError] = useState(null);
  const [successResult, setSuccessResult] = useState(null);

  // Form State
  const [invoiceNumber, setInvoiceNumber] = useState(`HD-${Date.now().toString().slice(-6)}`);
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [sellerTaxCode, setSellerTaxCode] = useState('0101234567');
  const [buyerName, setBuyerName] = useState('Công ty TNHH Khang Điền');
  const [buyerTaxCode, setBuyerTaxCode] = useState('0317894561');
  const [buyerAddress, setBuyerAddress] = useState('123 Nam Kỳ Khởi Nghĩa, Quận 3, TP.HCM');
  const [vatRate, setVatRate] = useState(0.1);

  // Dynamic Line Items
  const [items, setItems] = useState([
    { name: 'Thép cuộn xây dựng Hòa Phát', unit: 'Tấn', quantity: 2, unitPrice: 14500000 },
    { name: 'Gia công uốn cắt thép theo bản vẽ', unit: 'Gói', quantity: 1, unitPrice: 2000000 },
  ]);

  // Buyer check state
  const [checkingBuyer, setCheckingBuyer] = useState(false);
  const [buyerCheckResult, setBuyerCheckResult] = useState(null);

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      const res = await invoiceApi.list();
      if (res.success && res.data) {
        setInvoices(res.data.invoices || []);
      }
    } catch (err) {
      console.error('Lỗi tải hóa đơn:', err);
      setError('Không thể tải danh sách hóa đơn từ PostgreSQL.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, []);

  const handleAddItem = () => {
    setItems([...items, { name: '', unit: 'Cái', quantity: 1, unitPrice: 0 }]);
  };

  const handleRemoveItem = (index) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, idx) => idx !== index));
  };

  const handleItemChange = (index, field, value) => {
    const updated = [...items];
    updated[index][field] = field === 'quantity' || field === 'unitPrice' ? parseFloat(value) || 0 : value;
    setItems(updated);
  };

  const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice || 0), 0);
  const vatAmount = Math.round(subtotal * vatRate);
  const totalAmount = subtotal + vatAmount;

  const handleCheckBuyerMst = async () => {
    if (!buyerTaxCode || buyerTaxCode.length < 10) {
      alert('Vui lòng nhập MST khách hàng (10 hoặc 13 số).');
      return;
    }
    try {
      setCheckingBuyer(true);
      setBuyerCheckResult(null);
      const res = await taxApi.checkMst(buyerTaxCode);
      if (res.success && res.data) {
        setBuyerCheckResult(res);
        if (res.data.name) setBuyerName(res.data.name);
        if (res.data.address) setBuyerAddress(res.data.address);
      }
    } catch (err) {
      console.error('Lỗi tra cứu MST khách:', err);
    } finally {
      setCheckingBuyer(false);
    }
  };

  const handleIssueInvoice = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccessResult(null);

    if (items.some((i) => !i.name || i.quantity <= 0 || i.unitPrice <= 0)) {
      setError('Vui lòng điền đầy đủ tên, số lượng và đơn giá cho các dòng hàng hóa/dịch vụ.');
      return;
    }

    try {
      setIssuing(true);
      const payload = {
        invoiceNumber,
        invoiceDate,
        sellerTaxCode: sellerTaxCode.trim(),
        buyerName,
        buyerTaxCode: buyerTaxCode ? buyerTaxCode.trim() : undefined,
        buyerAddress,
        items,
        vatRate,
      };

      const res = await invoiceApi.create(payload);
      if (res.success && res.data) {
        setSuccessResult(res.data);
        // Generate new invoice number for next invoice
        setInvoiceNumber(`HD-${Date.now().toString().slice(-6)}`);
        fetchInvoices();
      }
    } catch (err) {
      console.error('Lỗi phát hành hóa đơn:', err);
      const msg = err.response?.data?.message || err.message || 'Cổng thuế từ chối cấp mã hóa đơn.';
      setError(msg);
    } finally {
      setIssuing(false);
    }
  };

  const formatVND = (num) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num || 0);
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* ── Flow Alert ─────────────────────────────────────────────── */}
      <div className="p-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-start gap-3">
        <FileCheck2 className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
        <div className="text-xs text-cyan-200">
          <span className="font-bold text-white">Quy Trình Cấp Mã Hóa Đơn Điện Tử (Nghị định 123/2020/NĐ-CP):</span>
          Trước khi lưu chính thức vào Odoo ERP, Middleware API sẽ gửi dữ liệu sang Mock Cổng Tổng Cục Thuế (Port 4000) để thẩm tra rủi ro (doanh nghiệp bỏ trốn, sai lệch ngày) và cấp <span className="font-mono font-bold text-cyan-300">Mã Cơ Quan Thuế (Tax Authority Code)</span>.
        </div>
      </div>

      {/* ── Invoice Issuance Form ──────────────────────────────────── */}
      <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-slate-800">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <ReceiptText className="w-5 h-5 text-cyan-400" />
            Lập & Phát Hành Hóa Đơn Điện Tử Có Mã CQT
          </h3>
          <span className="text-xs font-mono px-3 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
            Mẫu số: 1/001 - Ký hiệu: C26T
          </span>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0 text-rose-400 mt-0.5" />
            <div>
              <div className="font-bold text-white mb-0.5">Từ Chối Cấp Mã Cơ Quan Thuế</div>
              <div>{error}</div>
            </div>
          </div>
        )}

        {/* Success Modal / Banner */}
        {successResult && (
          <div className="mb-6 p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-200 space-y-2">
            <div className="flex items-center gap-2 text-sm font-bold text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
              <span>Tổng Cục Thuế Đã Cấp Mã Hóa Đơn Thành Công!</span>
            </div>
            <div className="p-3 bg-slate-900 rounded-xl border border-emerald-500/30 font-mono text-sm flex items-center justify-between">
              <div>
                <span className="text-slate-400 text-xs block">Mã Cơ Quan Thuế Cấp:</span>
                <span className="text-cyan-400 font-black text-base">{successResult.taxAuthorityCode}</span>
              </div>
              <div className="text-right">
                <span className="text-slate-400 text-xs block">Tổng tiền thanh toán:</span>
                <span className="text-white font-bold">{formatVND(successResult.totalAmount)}</span>
              </div>
            </div>
            <p className="text-[11px] text-slate-400">
              Hóa đơn #{successResult.invoiceNumber} đã được lưu an toàn trong PostgreSQL và đang được đồng bộ sang Odoo ERP.
            </p>
          </div>
        )}

        <form onSubmit={handleIssueInvoice} className="space-y-6">
          {/* Section 1: General Info */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Số Hóa Đơn
              </label>
              <div className="relative">
                <Hash className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                <input
                  type="text"
                  required
                  id="input-invoice-number"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-2xl pl-10 pr-4 py-3 text-sm font-mono text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Ngày Lập Hóa Đơn
              </label>
              <div className="relative">
                <Calendar className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                <input
                  type="date"
                  required
                  id="input-invoice-date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-2xl pl-10 pr-4 py-3 text-sm font-mono text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                MST Bên Bán (Xưởng Của Bạn)
              </label>
              <input
                type="text"
                required
                id="input-seller-tax-code"
                value={sellerTaxCode}
                onChange={(e) => setSellerTaxCode(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-4 py-3 text-sm font-mono text-white focus:outline-none focus:border-cyan-500"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                Thử MST đóng mã: <code className="text-rose-400 font-mono">0309999999</code> để thử nghiệm cơ chế chặn rủi ro!
              </span>
            </div>
          </div>

          {/* Section 2: Buyer Info */}
          <div className="p-4 rounded-2xl bg-slate-950/40 border border-slate-800/80 space-y-4">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
              Thông Tin Khách Hàng / Bên Mua
            </span>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Mã Số Thuế Khách Hàng</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    id="input-buyer-tax-code"
                    value={buyerTaxCode}
                    onChange={(e) => setBuyerTaxCode(e.target.value)}
                    placeholder="0317894561"
                    className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                  />
                  <button
                    type="button"
                    onClick={handleCheckBuyerMst}
                    disabled={checkingBuyer}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-xl text-xs font-semibold border border-slate-700 flex items-center gap-1 transition-all"
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>Tra cứu</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Tên Đơn Vị / Khách Hàng</label>
                <input
                  type="text"
                  id="input-buyer-name"
                  value={buyerName}
                  onChange={(e) => setBuyerName(e.target.value)}
                  placeholder="Công ty TNHH..."
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Địa Chỉ Khách Hàng</label>
                <input
                  type="text"
                  id="input-buyer-address"
                  value={buyerAddress}
                  onChange={(e) => setBuyerAddress(e.target.value)}
                  placeholder="Số nhà, đường, quận/huyện..."
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            {buyerCheckResult && (
              <div className={`p-2.5 rounded-xl text-xs flex items-center gap-2 ${
                buyerCheckResult.isRisky 
                  ? 'bg-rose-500/10 text-rose-300 border border-rose-500/30' 
                  : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
              }`}>
                {buyerCheckResult.isRisky ? <AlertTriangle className="w-4 h-4 text-rose-400" /> : <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                <span>
                  <strong>{buyerCheckResult.data?.name}</strong> — Trạng thái: {buyerCheckResult.data?.statusDescription}
                </span>
              </div>
            )}
          </div>

          {/* Section 3: Line Items */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Danh Sách Hàng Hóa / Dịch Vụ
              </span>
              <button
                type="button"
                id="btn-add-line-item"
                onClick={handleAddItem}
                className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Thêm dòng</span>
              </button>
            </div>

            <div className="space-y-3">
              {items.map((item, index) => (
                <div
                  key={index}
                  className="grid grid-cols-12 gap-3 items-center p-3 rounded-2xl bg-slate-900/60 border border-slate-800"
                >
                  <div className="col-span-12 sm:col-span-5">
                    <input
                      type="text"
                      required
                      placeholder="Tên hàng hóa / dịch vụ..."
                      value={item.name}
                      onChange={(e) => handleItemChange(index, 'name', e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div className="col-span-4 sm:col-span-2">
                    <input
                      type="text"
                      placeholder="ĐVT (Tấn, Cái...)"
                      value={item.unit}
                      onChange={(e) => handleItemChange(index, 'unit', e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-center text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div className="col-span-4 sm:col-span-2">
                    <input
                      type="number"
                      required
                      min="1"
                      placeholder="SL"
                      value={item.quantity}
                      onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-right font-mono text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div className="col-span-3 sm:col-span-2">
                    <input
                      type="number"
                      required
                      min="0"
                      step="1000"
                      placeholder="Đơn giá"
                      value={item.unitPrice}
                      onChange={(e) => handleItemChange(index, 'unitPrice', e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-right font-mono text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div className="col-span-1 text-center">
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(index)}
                      disabled={items.length <= 1}
                      className="text-slate-500 hover:text-rose-400 disabled:opacity-30 transition-colors p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 4: VAT & Calculations */}
          <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-slate-300">Thuế Suất GTGT (VAT):</span>
              <div className="flex gap-2">
                {[
                  { label: '0%', val: 0 },
                  { label: '5%', val: 0.05 },
                  { label: '8%', val: 0.08 },
                  { label: '10%', val: 0.1 },
                ].map((r) => (
                  <button
                    key={r.label}
                    type="button"
                    onClick={() => setVatRate(r.val)}
                    className={`px-3 py-1 rounded-xl text-xs font-mono font-semibold transition-all ${
                      vatRate === r.val
                        ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="text-right space-y-1 font-mono text-xs">
              <div className="text-slate-400">Tiền hàng: <span className="text-white font-bold">{formatVND(subtotal)}</span></div>
              <div className="text-slate-400">Tiền thuế VAT ({(vatRate * 100).toFixed(0)}%): <span className="text-cyan-300 font-bold">{formatVND(vatAmount)}</span></div>
              <div className="text-sm font-bold text-white border-t border-slate-800 pt-1">
                Tổng thanh toán: <span className="text-cyan-400 text-base">{formatVND(totalAmount)}</span>
              </div>
            </div>
          </div>

          {/* Submit Action */}
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              id="btn-issue-invoice"
              disabled={issuing}
              className="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-cyan-600 via-cyan-500 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-bold text-sm shadow-lg shadow-cyan-500/25 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {issuing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Đang kết nối Cổng Thuế xin cấp mã...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>⚡ Phát Hành & Xin Cấp Mã Cơ Quan Thuế</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* ── Issued Invoices Table ──────────────────────────────────── */}
      <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-slate-800">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <ReceiptText className="w-5 h-5 text-cyan-400" />
              Sổ Hóa Đơn Điện Tử Đã Phát Hành (Lưu PostgreSQL)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Tất cả hóa đơn đã có mã xác thực CQT và trạng thái đồng bộ sang Odoo
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/60 text-slate-400 uppercase font-semibold border-b border-slate-800">
              <tr>
                <th className="p-3.5 rounded-l-xl">Số HĐ</th>
                <th className="p-3.5">Ngày Lập</th>
                <th className="p-3.5">Khách Hàng / MST</th>
                <th className="p-3.5">Mã Cơ Quan Thuế (CQT)</th>
                <th className="p-3.5 text-right">Tổng Tiền</th>
                <th className="p-3.5 text-center">Trạng Thái Thuế</th>
                <th className="p-3.5 rounded-r-xl text-center">Đồng Bộ Odoo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan="7" className="text-center py-12 text-slate-400">
                    <div className="inline-block w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mb-2"></div>
                    <div>Đang tải danh sách hóa đơn từ PostgreSQL...</div>
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center py-12 text-slate-400">
                    Chưa có hóa đơn nào được phát hành.
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="p-3.5 font-mono font-bold text-white">
                      {inv.invoiceNumber}
                    </td>

                    <td className="p-3.5 font-mono text-slate-400">
                      {new Date(inv.invoiceDate).toLocaleDateString('vi-VN')}
                    </td>

                    <td className="p-3.5">
                      <div className="font-semibold text-white">{inv.buyerName || 'Khách lẻ'}</div>
                      {inv.buyerTaxCode && (
                        <div className="text-[11px] font-mono text-slate-400">MST: {inv.buyerTaxCode}</div>
                      )}
                    </td>

                    <td className="p-3.5 font-mono">
                      {inv.taxAuthorityCode ? (
                        <div className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 font-bold text-center">
                          {inv.taxAuthorityCode}
                        </div>
                      ) : (
                        <span className="text-slate-500 italic">Chưa cấp</span>
                      )}
                    </td>

                    <td className="p-3.5 text-right font-bold text-sm text-white">
                      {formatVND(inv.totalAmount)}
                    </td>

                    <td className="p-3.5 text-center">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                          inv.taxCodeStatus === 'approved'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : inv.taxCodeStatus === 'rejected'
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        }`}
                      >
                        {inv.taxCodeStatus === 'approved' ? 'Đã Cấp Mã' : inv.taxCodeStatus}
                      </span>
                    </td>

                    <td className="p-3.5 text-center font-mono text-[10px]">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full ${
                          inv.odooSyncStatus === 'synced'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {inv.odooSyncStatus === 'synced' ? 'Đã sync Odoo' : 'Lưu cục bộ'}
                      </span>
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
