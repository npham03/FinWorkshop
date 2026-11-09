import { useEffect,useMemo,useState,type ReactNode } from 'react';
import { Button,EmptyState,SearchBox,StatusBadge } from './components';
import { exportExcel,type ExportColumn } from './exports';
import { AlertTriangle,ArrowDownToLine,ArrowUpDown,Filter } from 'lucide-react';
import { actionLabel,displayLabel,entityLabels,formatNumber,formatTaxRate,isMoneyField,plainValue,referenceText,vietnamDate } from './presentation';
import { formatDate,formatVnd,statusLabel,today } from './api';

export function Pagination({ page, pageSize, total, onPage, onPageSize }: { page: number; pageSize: number; total: number; onPage: (value: number) => void; onPageSize: (value: number) => void }) {
  const count = Math.max(1, Math.ceil(total / pageSize));
  return <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 px-4 py-3 text-xs text-slate-500">
    <span>Hiển thị <b className="text-slate-800">{total ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, total)}</b> trên <b className="text-slate-800">{total}</b> bản ghi</span>
    <div className="flex flex-wrap items-center gap-1.5">
      <select aria-label="Số dòng mỗi trang" value={pageSize} onChange={(event) => { onPageSize(Number(event.target.value)); onPage(1); }} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700">
        {[10, 20, 50, 100].map((size) => <option key={size} value={size}>{size} dòng</option>)}
      </select>
      {[{ label: 'Đầu', value: 1 }, { label: 'Trước', value: page - 1 }, ...Array.from({ length: Math.min(5, count) }, (_, index) => { const value = Math.min(Math.max(1, page - 2), Math.max(1, count - 4)) + index; return { label: String(value), value }; }), { label: 'Tiếp', value: page + 1 }, { label: 'Cuối', value: count }].map(({ label, value }) => <button key={label} disabled={value < 1 || value > count || value === page} onClick={() => onPage(value)} className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition disabled:opacity-30 ${String(page) === label ? 'border-brand-600 bg-brand-50 text-brand-700 font-bold' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{label}</button>)}
    </div>
  </div>;
}

export function DataTable({ title, rows, columns, controls, emptyTitle, emptyHint }: { emptyTitle?: string; emptyHint?: string; title: string; rows: Record<string, any>[]; columns: ExportColumn[]; controls?: (row: any) => ReactNode }) {
  const [search, setSearch] = useState(new URLSearchParams(window.location.search).get('q') || ''), [query, setQuery] = useState(''), [status, setStatus] = useState(new URLSearchParams(window.location.search).get('status') || ''), [type, setType] = useState(''), [page, setPage] = useState(1), [pageSize, setPageSize] = useState(10), [sort, setSort] = useState({ key: '', descending: false });
  useEffect(() => { const timer = window.setTimeout(() => setQuery(search), 250); return () => window.clearTimeout(timer); }, [search]);
  const typeOf = (row: any) => String(row.direction || row.type || row.category || row.role || '');
  const statuses = [...new Set(rows.flatMap((row) => [row.status, row.paymentStatus, row.approvalStatus]).filter(Boolean).map(String))];
  const types = [...new Set(rows.map(typeOf).filter(Boolean))];
  const filtered = useMemo(() => rows.filter((row) => (!query || [JSON.stringify(row),...Object.values(row).filter((value) => typeof value === 'string').map(displayLabel)].join(' ').toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi'))) && (!status || [row.status, row.paymentStatus, row.approvalStatus].includes(status)) && (!type || typeOf(row) === type)), [rows, query, status, type]);
  const sorted = useMemo(() => sort.key ? [...filtered].sort((a,b) => { const x = a[sort.key], y = b[sort.key]; const order = typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), 'vi', { numeric: true }); return sort.descending ? -order : order; }) : filtered, [filtered, sort]);
  useEffect(() => setPage(1), [query, status, type]);
  const current = Math.min(page, Math.max(1, Math.ceil(sorted.length / pageSize)));
  const warning = (row: any) => ['CANCELLED','VOID'].includes(row.status) ? '' : row.dueDate && row.dueDate < today() && Number(row.openBalance ?? 0) > 0 || row.trackInventory !== false && row.stock !== undefined && row.minStock !== undefined && Number(row.stock) <= Number(row.minStock) || Number(row.balance) < 0 ? 'red' : ['REVIEW_REQUIRED','NEEDS_REVIEW','PENDING_APPROVAL'].includes(row.status) ? 'amber' : '';
  const display = (row: any, column: ExportColumn, exportValue = false): any => {
    const { key } = column, value = row[key];
    if (value === undefined || value === null || value === '') return '—';
    if (column.format === 'money' || isMoneyField(key)) return exportValue ? Number(value) : formatVnd(value);
    if (column.format === 'date') return formatDate(value);
    if (/^(createdAt|updatedAt|simulatedAt|created_at|updated_at)$/.test(key)) return vietnamDate(value,true);
    if (key === 'matchField') return ({description:'Nội dung',counterparty:'Khách / người bán',accountName:'Tài khoản tiền'} as Record<string,string>)[String(value)] || 'Nội dung';
    if (key === 'confidence') return `${formatNumber(value)}%`;
    if (key === 'entity') return entityLabels[String(value)] || 'Hồ sơ';
    if (key === 'action' || key === 'operation') return key === 'action' ? actionLabel(value) : displayLabel(value);
    if (['recordId','record_id'].includes(key)) return row.recordCode || row.code || row.afterData?.code || row.beforeData?.code || row.afterData?.name || entityLabels[row.entity] || 'Hồ sơ';
    if (key.endsWith('Id')) return referenceText(row,key);
    if (/Rate$/.test(key)) return formatTaxRate(['wasteRate','marginRate'].includes(key) && Number(value) < 1 ? Number(value)*100 : value, row.taxTreatment);
    if (key === 'last_error') return !value ? '—' : /ngày giấy tờ|quá 7 ngày|đúng kỳ/i.test(value) ? 'Cần tỷ giá đúng kỳ' : /tax|thuế/i.test(value) ? 'Cần khớp mức thuế' : /VND|tiền tệ|tỷ giá/i.test(value) ? 'Cần kiểm tra VND và tỷ giá' : /connect|timeout|ECONN/i.test(value) ? 'Lỗi kết nối · Chờ thử lại' : 'Kiểm tra cấu hình Odoo';
    if (key === 'progress') return exportValue ? `${value}%` : <div className="min-w-24"><div className="mb-1 text-right text-xs font-bold text-slate-700">{formatNumber(value)}%</div><div className="h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.min(100,Number(value))}%` }}/></div></div>;
    if (column.format === 'status' || column.format === 'classification' || ['status','direction','type','approvalStatus','odooSyncStatus','syncStatus','role','source','taxMode','ownerScope'].includes(key)) {
      const isPayment = key === 'direction' && ['PAID','RECEIVED','PAYMENT','RECEIPT'].includes(value);
      const stockReceipt=key==='type'&&value==='RECEIPT'&&(row.materialId||row.productId);
      const label = stockReceipt?'Nhập mua':isPayment ? ['PAID','PAYMENT'].includes(value) ? 'Phiếu chi' : 'Phiếu thu' : displayLabel(value);
      const tone = isPayment ? ['PAID','PAYMENT'].includes(value) ? 'INPUT' : 'OUTPUT' : value;
      return exportValue ? label : <StatusBadge status={tone} label={label}/>;
    }
    return typeof value === 'number' ? exportValue ? value : formatNumber(value) : plainValue(value);
  };
  const download = () => exportExcel(title, sorted.map((row) => Object.fromEntries(columns.map((column) => [column.key, display(row,column,true)]))), columns);
  return <div className="rounded-xl border border-slate-200/80 bg-white shadow-soft overflow-hidden">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 px-4 py-3 bg-white">
      <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto">
        <div className="w-full sm:w-60"><SearchBox value={search} onChange={setSearch}/></div>
        <Filter size={14} className="hidden text-slate-400 sm:block"/>
        <select aria-label="Lọc trạng thái" value={status} onChange={(event) => setStatus(event.target.value)} className="max-w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700">
          <option value="">Tất cả trạng thái</option>
          {statuses.map((value) => <option key={value} value={value}>{statusLabel(value)}</option>)}
        </select>
        {types.length > 0 && <select aria-label="Lọc loại" value={type} onChange={(event) => setType(event.target.value)} className="max-w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700">
          <option value="">Tất cả loại</option>
          {types.map((value) => <option key={value} value={value}>{value === 'PAID' ? 'Phiếu chi' : statusLabel(value)}</option>)}
        </select>}
      </div>
      <Button variant="secondary" compact onClick={download}><ArrowDownToLine size={13}/>Xuất Excel (.xlsx)</Button>
    </div>
    {sorted.length ? <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200/90 bg-slate-50/90">
          <tr>
            <th className="w-14 whitespace-nowrap px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">STT</th>
            {columns.map((column) => <th key={column.key} className={`whitespace-nowrap px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 ${column.format === 'money' || isMoneyField(column.key) ? 'text-right' : ''}`}>
              <button onClick={() => setSort({ key: column.key, descending: sort.key === column.key ? !sort.descending : false })} className="inline-flex items-center gap-1 hover:text-slate-900 transition-colors">
                {column.label}
                <ArrowUpDown size={11} className={sort.key === column.key ? 'text-brand-600' : 'text-slate-300'}/>
              </button>
            </th>)}
            {controls && <th className="whitespace-nowrap px-3.5 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Thao tác</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sorted.slice((current - 1) * pageSize, current * pageSize).map((row,index) => <tr key={row.id || index} className={`transition-colors ${warning(row) === 'red' ? 'bg-red-50/60 hover:bg-red-50' : warning(row) === 'amber' ? 'bg-amber-50/60 hover:bg-amber-50' : 'hover:bg-slate-50/80'}`}>
            <td className="px-3.5 py-2.5 text-xs tabular-nums text-slate-400">
              <span className="flex items-center gap-1.5">
                {warning(row) && <AlertTriangle size={13} className={warning(row) === 'red' ? 'text-red-600' : 'text-amber-600'} aria-label={warning(row) === 'red' ? 'Cần xử lý ngay' : 'Cần rà soát'}/>}
                <span>{(current - 1) * pageSize + index + 1}</span>
              </span>
            </td>
            {columns.map((column) => <td key={column.key} className={`max-w-xs px-3.5 py-2.5 text-xs sm:text-[13px] ${column.format === 'money' || isMoneyField(column.key) ? 'whitespace-nowrap text-right font-semibold tabular-nums text-slate-900' : ['code','name','counterparty'].includes(column.key) ? 'font-semibold text-slate-900' : 'text-slate-600'}`}>
              {display(row,column)}
            </td>)}
            {controls && <td className="px-3.5 py-2.5 text-right">
              <div className="flex min-w-max flex-wrap justify-end gap-1.5">{controls(row)}</div>
            </td>}
          </tr>)}
        </tbody>
      </table>
    </div> : <EmptyState title={query || status || type ? 'Không tìm thấy kết quả' : emptyTitle || 'Chưa có dữ liệu'} description={query || status || type ? 'Thử tìm từ khóa khác hoặc xóa bộ lọc.' : emptyHint || 'Bấm nút thêm ở góc trên để bắt đầu.'}/>}
    <Pagination page={current} pageSize={pageSize} total={sorted.length} onPage={setPage} onPageSize={setPageSize}/>
  </div>;
}
