import { createContext,useContext,useState,type FormEvent,type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Check,ChevronRight,CircleAlert,Info,LoaderCircle,Plus,Search,X,type LucideIcon } from 'lucide-react';
import { isMoneyField } from './presentation';
import { api,formatVnd,messageOf,statusLabel } from './api';

export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="mb-6 flex flex-col justify-between gap-4 2xl:flex-row 2xl:items-end">
    <div>
      {eyebrow && <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-brand-700">{eyebrow}</p>}
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
      {description && <p className="mt-1.5 max-w-2xl text-sm text-slate-500">{description}</p>}
    </div>
    {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
  </div>;
}

export function Hero({ title, description, chip, action }: { title: string; description?: string; chip?: string; action?: ReactNode }) {
  return <div className="relative mb-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-6 shadow-soft sm:p-7">
    <div aria-hidden className="pointer-events-none absolute -right-12 -top-16 h-52 w-52 rounded-full bg-slate-50 blur-2xl" />
    <div className="relative flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
      <div>
        {chip && <span className="mb-2.5 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-0.5 text-xs font-semibold text-slate-700"><span className="h-1.5 w-1.5 rounded-full bg-brand-600" />{chip}</span>}
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[26px]">{title}</h1>
        {description && <p className="mt-1.5 text-sm text-slate-500">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  </div>;
}

const tileTone = {
  green: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  amber: 'bg-amber-50 text-amber-700 border-amber-100',
  blue: 'bg-blue-50 text-blue-700 border-blue-100',
  brand: 'bg-brand-50 text-brand-700 border-brand-100'
};

export function ActionTile({ to, title, hint, icon: Icon, tone = 'brand' }: { to: string; title: string; hint: string; icon: LucideIcon; tone?: keyof typeof tileTone }) {
  return <Link to={to} className="group flex min-h-[90px] items-center gap-3.5 rounded-xl border border-slate-200/80 bg-white p-4 shadow-soft transition-all duration-150 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lift">
    <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border ${tileTone[tone]}`}>
      <Icon size={24} strokeWidth={1.75} />
    </span>
    <span className="min-w-0 flex-1">
      <span className="block text-base font-bold text-slate-900 group-hover:text-brand-700 transition-colors">{title}</span>
      <span className="mt-0.5 block text-xs text-slate-500">{hint}</span>
    </span>
    <ChevronRight size={18} className="shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-600" />
  </Link>;
}

export function Button({ children, onClick, variant = 'primary', type = 'button', disabled = false, className = '', compact = false }: { compact?: boolean; children: ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; type?: 'button' | 'submit'; disabled?: boolean; className?: string }) {
  const variants = {
    primary: 'border border-brand-700 bg-gradient-to-b from-brand-600 to-brand-700 text-white shadow-sm hover:from-brand-500 hover:to-brand-600 active:translate-y-px',
    secondary: 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 shadow-sm',
    ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
    danger: 'border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
  };
  return <button type={type} onClick={onClick} disabled={disabled} className={`inline-flex items-center justify-center gap-1.5 ${compact ? 'h-8 px-3 text-xs' : 'h-10 px-4 text-sm'} rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}>{children}</button>;
}

export function IconButton({ label, children, onClick }: { label: string; children: ReactNode; onClick?: () => void }) {
  return <button type="button" onClick={onClick} title={label} aria-label={label} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900">{children}</button>;
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-slate-200/80 bg-white shadow-soft ${className}`}>{children}</section>;
}

export function StatusBadge({ status, label }: { status?: unknown; label?: string }) {
  const value = String(status || '');
  const green = ['APPROVED','ACCEPTED','COMPLETED','CONFIRMED','MATCHED','RESOLVED','ACTIVE','PAID','OUTPUT','INCOME','RECEIVED','BUSINESS_INCOME','SYNCED','OPEN','ALLOCATED','DEMO_CODE_ISSUED'].includes(value);
  const red = ['REJECTED','MISMATCH','INPUT','EXPENSE','BUSINESS_EXPENSE','WASTE','LOCKED','PENDING_RETRY','SUSPENDED'].includes(value);
  const blue = ['INTERNAL_TRANSFER','TRANSFER','IN_PROGRESS','SENT','VAT_CREDIT','HKD_REVENUE'].includes(value);
  const amber = ['PENDING_APPROVAL','REVIEW_REQUIRED','NEEDS_REVIEW','PARTIAL','PENDING','PENDING_ODOO','PENDING_SYNC','PENDING_OWNER','PENDING_MAPPING','PROCESSING','UNPAID','UNRESOLVED'].includes(value);
  const style = green ? 'border-emerald-200/90 bg-emerald-50/90 text-emerald-700' : red ? 'border-rose-200/90 bg-rose-50/90 text-rose-700' : blue ? 'border-blue-200/90 bg-blue-50/90 text-blue-700' : amber ? 'border-amber-200/90 bg-amber-50/90 text-amber-800' : 'border-slate-200 bg-slate-100 text-slate-600';
  const dot = green ? 'bg-emerald-500' : red ? 'bg-rose-500' : blue ? 'bg-blue-500' : amber ? 'bg-amber-500' : 'bg-slate-400';
  return <span className={`inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium leading-5 ${style}`}><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`}/>{label || statusLabel(status)}</span>;
}

export type FieldDef = { name: string; label: string; type?: 'text' | 'password' | 'number' | 'date' | 'select' | 'textarea' | 'file'; required?: boolean; placeholder?: string; options?: { value: string; label: string }[]; wide?: boolean; min?: number; max?: number; readOnly?: boolean };

export function RecordModal({ title, fields, initial = {}, submitLabel = 'Lưu thông tin', onClose, onSubmit, busy = false, derive }: { title: string; fields: FieldDef[]; initial?: Record<string, unknown>; submitLabel?: string; onClose: () => void; onSubmit: (value: Record<string, unknown>) => Promise<void>; busy?: boolean; derive?: (value: Record<string, string>) => Record<string, string> }) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((field) => [field.name, String(initial[field.name] ?? '')])));
  const displayValues = derive ? derive(values) : values;
  const [fileIds, setFileIds] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError('');
    const missing = fields.find((field) => field.required && !String(values[field.name] || '').trim());
    if (missing) { setError(`Vui lòng nhập ${missing.label.toLowerCase()}.`); return; }
    const payload: Record<string, unknown> = {};
    fields.forEach((field) => { payload[field.name] = field.type === 'number' ? Number(displayValues[field.name] || 0) : displayValues[field.name]; if (fileIds[field.name]) payload[`${field.name}Id`] = fileIds[field.name]; });
    try { await onSubmit(payload); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không lưu được dữ liệu.'); }
  };
  const upload = async (fieldName: string, file?: File) => {
    if (!file) return;
    const form = new FormData(); form.append('file', file); setUploading(fieldName); setError('');
    try { const { data } = await api.post('/files', form); setValues((prev) => ({ ...prev, [fieldName]: data.name })); setFileIds((prev) => ({ ...prev, [fieldName]: data.id })); }
    catch (reason) { setError(messageOf(reason)); }
    finally { setUploading(null); }
  };
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm p-0 sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:max-w-xl sm:rounded-2xl">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        <IconButton label="Đóng" onClick={onClose}><X size={18} /></IconButton>
      </div>
      <form onSubmit={submit} className="space-y-4 p-5 sm:p-6">
        {Boolean(initial.sourceRejectionNote || initial.rejectionNote) && <p className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700 border border-rose-200">Lý do Chủ xưởng từ chối: {String(initial.sourceRejectionNote || initial.rejectionNote)}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map((field) => <label key={field.name} className={`block ${field.wide || field.type === 'textarea' ? 'sm:col-span-2' : ''} ${isMoneyField(field.name) || ['stock','minStock'].includes(field.name) ? 'field-highlight' : ''}`}>
            <span className="mb-1 block text-xs font-semibold text-slate-700">{field.label}{field.required && <span className="ml-1 text-brand-600">*</span>}</span>
            {field.readOnly && isMoneyField(field.name) ? <output aria-label={field.label} className="block text-xl font-bold tabular-nums text-brand-800">{formatVnd(displayValues[field.name])}</output> : field.type === 'select' ? <select disabled={field.readOnly} required={field.required} value={displayValues[field.name] || ''} onChange={(e) => setValues((prev) => ({ ...prev, [field.name]: e.target.value }))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500"><option value="">Chọn {field.label.toLowerCase()}</option>{field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : field.type === 'textarea' ? <textarea required={field.required} rows={3} value={displayValues[field.name] || ''} placeholder={field.placeholder} onChange={(e) => setValues((prev) => ({ ...prev, [field.name]: e.target.value }))} className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500" /> : field.type === 'file' ? <div className="rounded-lg border border-dashed border-slate-300 p-3"><input type="file" accept="image/*,.pdf,.png,.jpg,.jpeg" onChange={(e) => void upload(field.name, e.target.files?.[0])} className="block w-full text-xs text-slate-500 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-2.5 file:py-1.5 file:text-xs file:font-semibold file:text-brand-700" />{uploading === field.name && <p className="mt-1.5 text-xs text-slate-500">Đang tải tệp…</p>}{values[field.name] && <p className="mt-1.5 truncate text-xs text-emerald-700">Chứng từ: {values[field.name]}</p>}</div> : <input step={field.type === 'number' ? 'any' : undefined} readOnly={field.readOnly} type={field.type || 'text'} required={field.required} min={field.min} max={field.max} value={displayValues[field.name] || ''} placeholder={field.placeholder} onChange={(e) => setValues((prev) => ({ ...prev, [field.name]: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500" />}
          </label>)}
        </div>
        {error && <p className="rounded-lg bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs text-red-700">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button type="submit" disabled={busy}>{busy && <LoaderCircle size={14} className="animate-spin" />}{submitLabel}</Button>
        </div>
      </form>
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
  return <ToastContext.Provider value={push}>
    {children}
    <div className="fixed bottom-5 right-5 z-[80] flex w-[calc(100%-2.5rem)] max-w-sm flex-col gap-2">
      {items.map((item) => <div key={item.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${item.kind === 'error' ? 'bg-red-50 text-red-600' : item.kind === 'info' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'}`}>
          {item.kind === 'error' ? <CircleAlert size={15} /> : item.kind === 'info' ? <Info size={15} /> : <Check size={15} />}
        </span>
        <p className="text-xs sm:text-sm font-medium text-slate-800">{item.message}</p>
        <button className="ml-auto text-slate-400 hover:text-slate-600" onClick={() => setItems((prev) => prev.filter((entry) => entry.id !== item.id))}><X size={14} /></button>
      </div>)}
    </div>
  </ToastContext.Provider>;
}
export const useToast = () => useContext(ToastContext);

export function SearchBox({ value, onChange, placeholder = 'Tìm kiếm...' }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <div className="relative">
    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
    <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-xs sm:text-sm outline-none transition focus:border-brand-500" />
  </div>;
}

export function Metric({ label, value, caption, icon, tone = 'brand' }: { label: string; value: string | number; caption?: string; icon: ReactNode; tone?: 'brand' | 'green' | 'amber' | 'blue' }) {
  const tones = { brand: 'bg-brand-50 text-brand-700', green: 'bg-emerald-50 text-emerald-700', amber: 'bg-amber-50 text-amber-700', blue: 'bg-blue-50 text-blue-700' };
  return <Card className="p-4 sm:p-5">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
        <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900 tabular-nums">{typeof value === 'number' ? formatVnd(value) : value}</p>
        {caption && <p className="mt-1 text-xs text-slate-500">{caption}</p>}
      </div>
      <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${tones[tone]}`}>{icon}</div>
    </div>
  </Card>;
}

export function EmptyState({ title = 'Chưa có gì ở đây', description = 'Bấm nút thêm ở góc trên để bắt đầu.' }: { title?: string; description?: string }) {
  return <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500"><Info size={24} /></div>
    <h3 className="text-base font-bold text-slate-900">{title}</h3>
    <p className="mt-1 max-w-sm text-xs text-slate-500">{description}</p>
  </div>;
}

export function AddButton({ onClick, label = 'Thêm mới' }: { onClick: () => void; label?: string }) {
  return <Button onClick={onClick}><Plus size={15} />{label}</Button>;
}
