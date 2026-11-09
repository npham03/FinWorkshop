import { useCallback,useEffect,useState,type ReactNode } from 'react';
import { api,formatVnd,messageOf,today } from './api';
import { Button,Card,PageHeader } from './components';
import { DataTable } from './DataTable';
import { exportBooks } from './exports';

const monthStart = () => `${today().slice(0, 7)}-01`;
const quarterStart = () => { const now = today(); const m = Number(now.slice(5, 7)); const q = Math.floor((m - 1) / 3) * 3 + 1; return `${now.slice(0, 4)}-${String(q).padStart(2, '0')}-01`; };
const yearStart = () => `${today().slice(0, 4)}-01-01`;

export function SmeReports({ periodTools }: { periodTools: ReactNode }) {
  const [report, setReport] = useState<any>(null), [legacy, setLegacy] = useState<any[]>([]), [from, setFrom] = useState(monthStart()), [to, setTo] = useState(today()), [range, setRange] = useState('month');
  const [selected, setSelected] = useState(new URLSearchParams(window.location.search).get('book') || ''), [mode, setMode] = useState('SME'), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true); setError('');
    try { const [sme, books] = await Promise.all([api.get('/reports/sme', { params: { from, to } }), api.get('/reports/books', { params: { from, to } })]); setReport(sme.data); setLegacy(books.data?.books || []); }
    catch (reason) { setError(messageOf(reason)); } finally { setBusy(false); }
  }, [from, to]);
  useEffect(() => { void load(); }, [load]);
  const choose = (kind: string) => { setRange(kind); setTo(today()); if (kind === 'month') setFrom(monthStart()); if (kind === 'quarter') setFrom(quarterStart()); if (kind === 'year') setFrom(yearStart()); };
  const vat = legacy.find((book) => book.code === 'S4-HKD');
  const smeBooks = [...(report?.books || []), ...(vat ? [{ ...vat, code: 'SME-VAT', title: 'Bảng đối chiếu VAT theo giấy tờ' }] : [])];
  const books = mode === 'SME' ? smeBooks : legacy;
  const current = books.find((book) => book.code === selected);
  const summary = report?.summary;
  const main = [['Tiền bán hàng', summary?.revenue], ['Vốn hàng bán', summary?.cogs], ['Lãi gộp', summary?.grossProfit]];
  const stock = [['Vật tư còn trong kho', summary?.rawMaterials], ['Đang làm dở', summary?.wip], ['Thành phẩm chưa bán', summary?.finishedGoods]];
  const chips = [['month', 'Tháng này'], ['quarter', 'Quý này'], ['year', 'Năm nay'], ['custom', 'Chọn ngày']];
  return <>
    <PageHeader title="Thuế và báo cáo" description="Xem kết quả làm ăn và tải sổ sách ra Excel." action={<Button disabled={!books.length} onClick={() => exportBooks(books, `FinWorkshop-${mode}-${from}-${to}`)}>Tải tất cả (.xlsx)</Button>} />
    <div className="mb-6 flex flex-wrap items-end gap-3">
      <div role="group" aria-label="Chọn kỳ" className="flex flex-wrap gap-2">{chips.map(([key, label]) => <button key={key} type="button" onClick={() => key === 'custom' ? setRange('custom') : choose(key)} className={`min-h-[44px] rounded-full border px-5 text-base transition ${range === key ? 'border-brand-600 bg-brand-50 font-bold text-brand-700' : 'border-slate-300 bg-white text-slate-700 hover:border-brand-400'}`}>{label}</button>)}</div>
      {range === 'custom' && <><label className="text-sm font-medium text-slate-700">Từ ngày<input aria-label="Báo cáo từ ngày" type="date" className="ml-2 rounded-xl border border-line px-3" value={from} onChange={(e) => setFrom(e.target.value)} /></label><label className="text-sm font-medium text-slate-700">Đến ngày<input aria-label="Báo cáo đến ngày" type="date" className="ml-2 rounded-xl border border-line px-3" value={to} onChange={(e) => setTo(e.target.value)} /></label></>}
    </div>
    {error && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-base text-red-700">{error}</p>}
    {busy && !report ? <Card className="p-8 text-muted">Đang tổng hợp số liệu…</Card> : summary && <>
      <div className="mb-4 grid gap-4 sm:grid-cols-3">{main.map(([label, value]) => <Card key={String(label)} className="border-l-4 border-l-brand-600 p-5"><p className="text-sm font-medium text-muted">{label}</p><strong className="mt-2 block text-2xl tabular-nums">{formatVnd(value as number)}</strong></Card>)}</div>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">{stock.map(([label, value]) => <Card key={String(label)} className="p-4"><p className="text-sm text-muted">{label}</p><strong className="mt-1 block text-lg tabular-nums">{formatVnd(value as number)}</strong></Card>)}</div>
      {(report.warnings || []).map((warning: string) => <p key={warning} className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-base text-amber-900">{warning}</p>)}
    </>}
    <section aria-label="Tải sổ sách" className="mb-6"><h2 className="mb-3 text-xl font-bold">Sổ sách</h2>
      {books.length === 0 ? <Card className="p-6 text-muted">Chưa có sổ nào trong kỳ này.</Card> : <Card className="px-5 py-1">{books.map((book) => <div key={book.code} className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-4 last:border-0"><div><p className="text-base font-semibold">{book.title}</p><p className="text-sm text-muted">{book.code}</p></div><div className="flex gap-2"><Button variant="secondary" compact onClick={() => setSelected(selected === book.code ? '' : book.code)}>{selected === book.code ? 'Ẩn' : 'Xem'}</Button><Button variant="secondary" compact onClick={() => exportBooks([book], `FinWorkshop-${book.code}-${from}-${to}`)}>Tải Excel</Button></div></div>)}</Card>}
    </section>
    {current && selected !== 'periods' && <Card className="mb-6"><h2 className="border-b border-line p-4 text-lg font-bold">{current.title}</h2><DataTable key={`${mode}-${current.code}`} title={current.title} rows={current.rows} columns={current.columns} /></Card>}
    {selected === 'periods' && <div className="mb-6">{periodTools}</div>}
    <details className="mb-6 rounded-2xl border border-line bg-white p-5"><summary className="min-h-[44px] cursor-pointer text-base font-semibold text-slate-700">Dành cho kế toán</summary>
      <div className="mt-4 flex flex-wrap items-center gap-3"><select aria-label="Nhóm báo cáo" className="rounded-xl border border-line bg-white px-3" value={mode} onChange={(e) => { setMode(e.target.value); setSelected(''); }}><option value="SME">Báo cáo kho, giá thành và tiền còn nợ</option><option value="DETAIL">7 sổ đối chiếu chi tiết</option></select><Button variant={selected === 'periods' ? 'primary' : 'secondary'} compact onClick={() => setSelected(selected === 'periods' ? '' : 'periods')}>Kỳ chốt sổ</Button></div>
      {mode === 'DETAIL' && <p className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-base text-blue-900">Bảy sổ này theo cấu trúc cũ của TT88. Hộ kinh doanh năm 2026 cần chọn mẫu theo TT152; các bảng này không phải bộ hồ sơ kê khai.</p>}
      {summary && <p className="mt-4 text-sm text-muted">Phát sinh Nợ: {formatVnd(summary.debit)} · Có: {formatVnd(summary.credit)} · {summary.debit === summary.credit ? 'Cân đối' : 'Cần đối chiếu'}</p>}
    </details>
    <p className="text-sm leading-6 text-muted">Các số này chỉ để tham khảo, chưa tính khấu hao, thuế thu nhập doanh nghiệp và các bút toán cuối kỳ. Hãy đối chiếu với kế toán trước khi nộp thuế.</p>
  </>;
}
