import { useEffect,useState } from 'react';
import { createRecord,formatVnd,getRecords,messageOf } from './api';
import { displayLabel } from './presentation';
import { RecordModal,type FieldDef } from './components';

export function AllocationModal({ invoiceId, paymentId, onClose, onSaved }: { invoiceId?: string; paymentId?: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const [invoices, setInvoices] = useState<any[]>([]), [payments, setPayments] = useState<any[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { void Promise.all([getRecords<any>('invoices'), getRecords<any>('payments')]).then(([a, b]) => { setInvoices(a.filter((row) => !['CANCELLED', 'VOID'].includes(row.status) && Number(row.openBalance ?? row.total) > 0)); setPayments(b.filter((row) => row.status !== 'CANCELLED' && Number(row.amount) > Number(row.allocatedAmount || 0))); }).catch((reason) => setError(messageOf(reason))); }, []);
  const fields: FieldDef[] = [
    { name: 'invoiceId', label: 'Hóa đơn', type: 'select', required: true, wide: true, options: invoices.map((row) => ({ value: row.id, label: `${row.code} · ${row.counterparty} · ${row.direction === 'PAID' ? 'Phiếu chi' : displayLabel(row.direction)} · còn ${formatVnd(row.openBalance)}` })) },
    { name: 'paymentId', label: 'Phiếu thu / chi', type: 'select', required: true, wide: true, options: payments.map((row) => ({ value: row.id, label: `${row.code} · ${row.counterparty} · ${row.direction === 'PAID' ? 'Phiếu chi' : displayLabel(row.direction)} · còn ${formatVnd(Number(row.amount) - Number(row.allocatedAmount || 0))}` })) },
    { name: 'allocatedAmount', label: 'Tiền phân bổ (₫)', type: 'number', required: true, min: 1 },
    { name: 'discountAmount', label: 'Chiết khấu thanh toán (₫)', type: 'number', min: 0 },
    { name: 'bankFeeAmount', label: 'Phí ngân hàng chi riêng (₫)', type: 'number', min: 0 },
    { name: 'roundingAdjustment', label: 'Làm tròn (±5 ₫)', type: 'number', min: -5, max: 5 },
    { name: 'writeOffReason', label: 'Lý do xử lý chênh lệch / phí NH', type: 'textarea', wide: true },
  ];
  if (error) return <div role="alert" className="fixed inset-10 z-50 rounded-2xl bg-white p-6 shadow-xl">{error}<button onClick={onClose}>Đóng</button></div>;
  return <RecordModal title="Phân bổ / Xử lý chênh lệch công nợ" fields={fields} initial={{ invoiceId, paymentId }} onClose={onClose} busy={busy} onSubmit={async (value) => { setBusy(true); try { await createRecord('payment-allocations', value); window.dispatchEvent(new Event('fintax:records-changed')); await onSaved(); onClose(); } finally { setBusy(false); } }}/>;
}
