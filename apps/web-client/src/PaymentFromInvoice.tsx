import { useEffect,useState } from 'react';
import { api,createRecord,getRecords,messageOf,today } from './api';
import { RecordModal,type FieldDef } from './components';

export function PaymentFromInvoice({ invoice, onClose, onSaved }: { invoice: any; onClose: () => void; onSaved: () => Promise<void> }) {
  const [accounts, setAccounts] = useState<any[]>([]), [busy, setBusy] = useState(false), [payment, setPayment] = useState<any>(null);
  useEffect(() => { void getRecords<any>('cash-accounts').then((rows) => setAccounts(rows.filter((row) => row.status !== 'CANCELLED'))).catch(() => setAccounts([])); }, []);
  const fields: FieldDef[] = [
    { name: 'code', label: 'Số phiếu', required: true }, { name: 'date', label: 'Ngày thanh toán', type: 'date', required: true },
    { name: 'counterparty', label: invoice.direction === 'INPUT' ? 'Nhà cung cấp' : 'Khách hàng', readOnly: true, wide: true },
    { name: 'accountId', label: 'Tài khoản tiền', type: 'select', required: true, options: accounts.map((row) => ({ value: row.id, label: row.name })) },
    { name: 'amount', label: 'Thực thu / Thực chi (₫)', type: 'number', required: true, min: 1 },
    { name: 'discountAmount', label: 'Chiết khấu thanh toán (₫)', type: 'number', min: 0 },
    { name: 'bankFeeAmount', label: 'Phí ngân hàng chi riêng (₫)', type: 'number', min: 0 },
    { name: 'roundingAdjustment', label: 'Làm tròn (±5 ₫)', type: 'number', min: -5, max: 5 },
    { name: 'writeOffReason', label: 'Lý do điều chỉnh / Phí ngân hàng', type: 'textarea', wide: true },
  ];
  return <RecordModal title={`${invoice.direction === 'INPUT' ? 'Chi tiền' : 'Thu tiền'} · ${invoice.code}`} fields={fields.map((field) => payment && ['code','date','accountId','amount'].includes(field.name) ? { ...field,readOnly:true } : field)} initial={{ code: `${invoice.direction === 'INPUT' ? 'PC' : 'PT'}-${today().replace(/-/g, '')}-${Date.now().toString().slice(-5)}`, date: today(), counterparty: invoice.counterparty, amount: Number(invoice.openBalance ?? invoice.total) }} busy={busy} submitLabel={payment ? 'Phân bổ phiếu đã lưu' : 'Ghi nhận & Phân bổ'} onClose={onClose} onSubmit={async (value) => {
    setBusy(true);
    let savedPayment = payment;
    try {
      const amount = Number(value.amount), discount = Number(value.discountAmount || 0), rounding = Number(value.roundingAdjustment || 0);
      if (amount + discount + rounding > Number(invoice.openBalance ?? invoice.total)) throw new Error('Tổng tất toán vượt công nợ còn lại.');
      if ((discount || rounding || Number(value.bankFeeAmount)) && !String(value.writeOffReason || '').trim()) throw new Error('Nhập lý do điều chỉnh hoặc phí ngân hàng.');
      const saved = payment || await createRecord<any>('payments', { code: value.code, date: value.date, counterparty: invoice.counterparty, counterpartyId: invoice.counterpartyId, amount, accountId: value.accountId, direction: invoice.direction === 'INPUT' ? 'PAID' : 'RECEIVED' });
      savedPayment = saved; setPayment(saved);
      await createRecord('payment-allocations', { paymentId: saved.id, invoiceId: invoice.id, allocatedAmount: saved.amount, discountAmount: discount, bankFeeAmount: Number(value.bankFeeAmount || 0), roundingAdjustment: rounding, writeOffReason: value.writeOffReason });
      window.dispatchEvent(new Event('fintax:records-changed')); await onSaved(); onClose();
    } catch (error) { throw new Error(savedPayment ? `Phiếu ${savedPayment.code} đã lưu. ${messageOf(error)}` : messageOf(error)); }
    finally { setBusy(false); }
  }}/>;
}

export function CancelDocument({ entity, record, onClose, onSaved }: { entity: string; record: any; onClose: () => void; onSaved: () => Promise<void> }) {
  const [allocations, setAllocations] = useState<any[]>([]), [reason, setReason] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { if (entity === 'invoices') void api.get(`/invoices/${record.id}/details`).then(({ data }) => setAllocations(data.allocations.filter((row: any) => !['CANCELLED','UNALLOCATED'].includes(row.status)))).catch((error) => setError(messageOf(error))); }, [entity, record.id]);
  const submit = async () => { setBusy(true); setError(''); try { await api.delete(`/${entity}/${record.id}`, { data: { reason, autoUnallocate: allocations.length > 0 } }); await onSaved(); onClose(); } catch (error) { setError(messageOf(error)); } finally { setBusy(false); } };
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4"><section role="alertdialog" aria-modal="true" aria-label="Hủy chứng từ" className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl"><h2 className="text-lg font-bold text-red-800">Hủy {record.code || record.name || 'chứng từ'}</h2>{allocations.length > 0 && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="text-sm font-semibold text-amber-900">Gỡ {allocations.length} khoản phân bổ trước khi hủy</p><ul className="mt-2 space-y-2 text-sm text-amber-900">{allocations.map((row) => <li key={row.id}>{row.paymentCode} · {new Intl.NumberFormat('vi-VN').format(row.allocatedAmount)} ₫</li>)}</ul><p className="mt-3 text-xs text-amber-800">Số dư chưa phân bổ được hoàn lại cho phiếu. Công nợ và lịch sử được cập nhật cùng lúc.</p></div>}<label className="mt-5 block text-sm font-semibold">Lý do hủy <span className="text-red-600">*</span><textarea autoFocus aria-label="Lý do hủy" value={reason} onChange={(event) => setReason(event.target.value)} rows={3} className="mt-2 w-full rounded-xl border border-line p-3 text-sm outline-none focus:border-brand-500"/></label>{error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}<div className="mt-5 flex justify-end gap-2"><button onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm font-semibold">Giữ chứng từ</button><button disabled={busy || !reason.trim()} onClick={() => void submit()} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{busy ? 'Đang xử lý…' : allocations.length ? 'Gỡ phân bổ & Hủy' : 'Xác nhận hủy'}</button></div></section></div>;
}
