import { createContext, useContext, useState, type FormEvent, type ReactNode } from 'react';
import { Check, CircleAlert, Info, LoaderCircle, Plus, Search, X } from 'lucide-react';
import { api, formatVnd, messageOf, statusLabel } from './api';

export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="mb-2 text-xs font-semibold uppercase tracking-[.16em] text-brand-600">{eyebrow || 'FINTAX AUTOMATION'}</p><h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[28px]">{title}</h1>{description && <p className="mt-1.5 max-w-2xl text-sm text-muted">{description}</p>}</div>{action}</div>;
}

export function Button({ children, onClick, variant = 'primary', type = 'button', disabled = false, className = '' }: { children: ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; type?: 'button' | 'submit'; disabled?: boolean; className?: string }) {
  const variants = { primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm', secondary: 'border border-line bg-white text-ink hover:bg-gray-50', ghost: 'text-muted hover:bg-gray-100 hover:text-ink', danger: 'bg-red-50 text-red-700 hover:bg-red-100' };
  return <button type={type} onClick={onClick} disabled={disabled} className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-55 ${variants[variant]} ${className}`}>{children}</button>;
}

export function IconButton({ label, children, onClick }: { label: string; children: ReactNode; onClick?: () => void }) {
  return <button type="button" onClick={onClick} title={label} aria-label={label} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted transition hover:bg-gray-100 hover:text-ink">{children}</button>;
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) { return <section className={`rounded-2xl border border-line bg-white shadow-soft ${className}`}>{children}</section>; }

export function StatusBadge({ status, label }: { status?: unknown; label?: string }) {
  const value = String(status || '');
  const positive = ['APPROVED', 'COMPLETED', 'CONFIRMED', 'MATCHED', 'RESOLVED', 'ACTIVE', 'DEMO_CODE_ISSUED'].includes(value);
  const caution = ['PENDING_APPROVAL', 'REVIEW_REQUIRED', 'NEEDS_REVIEW', 'PARTIAL', 'OPEN', 'IN_PROGRESS', 'REVIEWED'].includes(value);
  const negative = ['REJECTED', 'MISMATCH', 'CANCELLED'].includes(value);
  const style = positive ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/10' : caution ? 'bg-amber-50 text-amber-700 ring-amber-600/10' : negative ? 'bg-red-50 text-red-700 ring-red-600/10' : 'bg-gray-100 text-gray-600 ring-gray-500/10';
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset ${style}`}>{label || statusLabel(status)}</span>;
}

export type FieldDef = { name: string; label: string; type?: 'text' | 'password' | 'number' | 'date' | 'select' | 'textarea' | 'file'; required?: boolean; placeholder?: string; options?: { value: string; label: string }[]; wide?: boolean; min?: number; max?: number };

export function RecordModal({ title, fields, initial = {}, submitLabel = 'Lưu thông tin', onClose, onSubmit, busy = false }: { title: string; fields: FieldDef[]; initial?: Record<string, unknown>; submitLabel?: string; onClose: () => void; onSubmit: (value: Record<string, unknown>) => Promise<void>; busy?: boolean }) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((field) => [field.name, String(initial[field.name] ?? '')])));
  const [fileIds, setFileIds] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError('');
    const missing = fields.find((field) => field.required && !String(values[field.name] || '').trim());
    if (missing) { setError(`Vui lòng nhập ${missing.label.toLowerCase()}.`); return; }
    const payload: Record<string, unknown> = {};
    fields.forEach((field) => { payload[field.name] = field.type === 'number' ? Number(values[field.name] || 0) : values[field.name]; if (fileIds[field.name]) payload[`${field.name}Id`] = fileIds[field.name]; });
    try { await onSubmit(payload); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không lưu được dữ liệu.'); }
  };
  const upload = async (fieldName: string, file?: File) => {
    if (!file) return;
    const form = new FormData(); form.append('file', file); setUploading(fieldName); setError('');
    try { const { data } = await api.post('/files', form); setValues((prev) => ({ ...prev, [fieldName]: data.name })); setFileIds((prev) => ({ ...prev, [fieldName]: data.id })); }
    catch (reason) { setError(messageOf(reason)); }
    finally { setUploading(null); }
  };
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:max-w-xl sm:rounded-3xl">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-white px-6 py-5"><div><p className="text-xs font-semibold uppercase tracking-wider text-brand-600">FinTax · Hồ sơ nghiệp vụ</p><h2 className="mt-1 text-lg font-semibold">{title}</h2></div><IconButton label="Đóng" onClick={onClose}><X size={18} /></IconButton></div>
      <form onSubmit={submit} className="space-y-5 p-6"><div className="grid gap-4 sm:grid-cols-2">
        {fields.map((field) => <label key={field.name} className={`block ${field.wide || field.type === 'textarea' ? 'sm:col-span-2' : ''}`}><span className="mb-1.5 block text-xs font-medium text-gray-600">{field.label}{field.required && <span className="ml-1 text-brand-600">*</span>}</span>
          {field.type === 'select' ? <select required={field.required} value={values[field.name] || ''} onChange={(e) => setValues((prev) => ({ ...prev, [field.name]: e.target.value }))} className="w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-50"><option value="">Chọn {field.label.toLowerCase()}</option>{field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : field.type === 'textarea' ? <textarea required={field.required} rows={3} value={values[field.name] || ''} placeholder={field.placeholder} onChange={(e) => setValues((prev) => ({ ...prev, [field.name]: e.target.value }))} className="w-full resize-y rounded-xl border border-line px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-50" /> : field.type === 'file' ? <div className="rounded-xl border border-dashed border-gray-300 p-3"><input type="file" accept="image/*,.pdf,.png,.jpg,.jpeg" onChange={(e) => void upload(field.name, e.target.files?.[0])} className="block w-full text-xs text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-xs file:font-medium file:text-brand-700" />{uploading === field.name && <p className="mt-2 text-xs text-muted">Đang tải tệp…</p>}{values[field.name] && <p className="mt-2 truncate text-xs text-emerald-700">Đã tải: {values[field.name]} · cần rà soát thủ công</p>}</div> : <input type={field.type || 'text'} required={field.required} min={field.min} max={field.max} value={values[field.name] || ''} placeholder={field.placeholder} onChange={(e) => setValues((prev) => ({ ...prev, [field.name]: e.target.value }))} className="w-full rounded-xl border border-line px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-50" />}
        </label>)}
      </div>{error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}<div className="flex justify-end gap-2 border-t border-line pt-4"><Button variant="secondary" onClick={onClose}>Hủy</Button><Button type="submit" disabled={busy}>{busy && <LoaderCircle size={15} className="animate-spin" />}{submitLabel}</Button></div></form>
    </div>
  </div>;
}

type ToastItem = { id: number; message: string; kind: 'success' | 'error' | 'info' };
const ToastContext = createContext<(message: string, kind?: ToastItem['kind']) => void>(() => undefined);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = (message: string, kind: ToastItem['kind'] = 'success') => {
    const id = Date.now() + Math.random(); setItems((prev) => [...prev, { id, message, kind }]);
    window.setTimeout(() => setItems((prev) => prev.filter((item) => item.id !== id)), 4200);
  };
  return <ToastContext.Provider value={push}>{children}<div className="fixed bottom-5 right-5 z-[80] flex w-[calc(100%-2.5rem)] max-w-sm flex-col gap-2">{items.map((item) => <div key={item.id} className="flex items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3 shadow-xl"><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${item.kind === 'error' ? 'bg-red-50 text-red-600' : item.kind === 'info' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'}`}>{item.kind === 'error' ? <CircleAlert size={16} /> : item.kind === 'info' ? <Info size={16} /> : <Check size={16} />}</span><p className="text-sm text-ink">{item.message}</p><button className="ml-auto text-muted" onClick={() => setItems((prev) => prev.filter((entry) => entry.id !== item.id))}><X size={15} /></button></div>)}</div></ToastContext.Provider>;
}
export const useToast = () => useContext(ToastContext);

export function SearchBox({ value, onChange, placeholder = 'Tìm kiếm...' }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <div className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-xl border border-line bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-50" /></div>;
}

export function Metric({ label, value, caption, icon, tone = 'brand' }: { label: string; value: string | number; caption?: string; icon: ReactNode; tone?: 'brand' | 'green' | 'amber' | 'blue' }) {
  const tones = { brand: 'bg-brand-50 text-brand-700', green: 'bg-emerald-50 text-emerald-700', amber: 'bg-amber-50 text-amber-700', blue: 'bg-blue-50 text-blue-700' };
  return <Card className="p-5"><div className="flex items-start justify-between"><div><p className="text-sm text-muted">{label}</p><p className="mt-3 text-[25px] font-semibold tracking-tight text-ink">{typeof value === 'number' ? formatVnd(value) : value}</p>{caption && <p className="mt-1.5 text-xs text-muted">{caption}</p>}</div><div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone]}`}>{icon}</div></div></Card>;
}

export function EmptyState({ title = 'Chưa có dữ liệu', description = 'Thêm bản ghi đầu tiên để bắt đầu theo dõi.' }: { title?: string; description?: string }) {
  return <div className="flex flex-col items-center justify-center px-6 py-16 text-center"><div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600"><Info size={20} /></div><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 max-w-sm text-sm text-muted">{description}</p></div>;
}

export function AddButton({ onClick, label = 'Thêm mới' }: { onClick: () => void; label?: string }) { return <Button onClick={onClick}><Plus size={16} />{label}</Button>; }
