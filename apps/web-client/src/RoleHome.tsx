import { useEffect,useState } from 'react';
import { Link } from 'react-router-dom';
import { Boxes,CircleCheck,Factory,PackageMinus,Wrench,TriangleAlert,type LucideIcon } from 'lucide-react';
import { useAuth } from './auth';
import { formatDate,getRecords,type RecordRow } from './api';
import { ActionTile,Card,Hero } from './components';

type Row = RecordRow & Record<string, any>;
type Tile = { to: string; t: string; s: string; icon: LucideIcon; tone: 'green' | 'amber' | 'blue' | 'brand' };
export const roleName: Record<string, string> = { OWNER: 'Chủ xưởng', ACCOUNTANT: 'Kế toán', WAREHOUSE: 'Thủ kho', WORKSHOP: 'Thợ xưởng' };
const content: Record<string, { hello: string; tiles: Tile[] }> = {
  WORKSHOP: { hello: 'Đây là các việc đang làm trong xưởng.', tiles: [
    { to: '/workshop', t: 'Việc của tôi', s: 'Xem việc, ghi giờ công, báo tiến độ', icon: Wrench, tone: 'brand' },
    { to: '/inventory?new=1', t: 'Lấy vật tư', s: 'Ghi vật tư đã lấy, trả lại hoặc bị hỏng', icon: PackageMinus, tone: 'amber' },
  ] },
  WAREHOUSE: { hello: 'Đây là việc của kho hôm nay.', tiles: [
    { to: '/inventory?new=1', t: 'Xuất hoặc trả vật tư', s: 'Ghi một phiếu mới', icon: PackageMinus, tone: 'amber' },
    { to: '/inventory', t: 'Xem phiếu kho', s: 'Các phiếu đã ghi', icon: Boxes, tone: 'blue' },
    { to: '/workshop', t: 'Việc trong xưởng', s: 'Xem xưởng đang cần gì', icon: Factory, tone: 'brand' },
  ] },
};

function dueInfo(due?: string) {
  if (!due) return null;
  const days = Math.ceil((new Date(due).getTime() - new Date(new Date().toDateString()).getTime()) / 86400000);
  if (Number.isNaN(days)) return null;
  if (days < 0) return { text: `Quá hạn ${-days} ngày`, cls: 'bg-red-50 text-red-700 border-red-200', bar: 'bg-red-500' };
  if (days <= 3) return { text: days === 0 ? 'Hạn hôm nay' : `Còn ${days} ngày`, cls: 'bg-amber-50 text-amber-800 border-amber-200', bar: 'bg-amber-400' };
  return { text: `Hạn ${formatDate(due)}`, cls: 'bg-slate-100 text-slate-700 border-slate-200', bar: 'bg-emerald-400' };
}

export function WorkerHome() {
  const { user } = useAuth();
  const role = user?.role === 'WAREHOUSE' ? 'WAREHOUSE' : 'WORKSHOP';
  const [jobs, setJobs] = useState<Row[] | null>(null);
  const [low, setLow] = useState<Row[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    getRecords<Row>('production-orders').then((rows) => setJobs(rows.filter((r) => ['DRAFT', 'IN_PROGRESS'].includes(String(r.status || ''))).slice(0, 6))).catch(() => { setJobs([]); setFailed(true); });
    if (role === 'WAREHOUSE') getRecords<Row>('materials').then((rows) => setLow(rows.filter((r) => Number(r.minStock) > 0 && Number(r.stock) <= Number(r.minStock)).slice(0, 8))).catch(() => setLow([]));
  }, [role]);
  const c = content[role];
  return <>
    <Hero chip={roleName[role]} title={`Xin chào, ${user?.name || ''}`} description={c.hello} />
    <section aria-label="Việc thường làm" className="mb-10"><h2 className="mb-4 text-xl font-bold">Bạn muốn làm gì?</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{c.tiles.map((i) => <ActionTile key={i.to} to={i.to} title={i.t} hint={i.s} icon={i.icon} tone={i.tone} />)}</div>
    </section>
    <section aria-label="Việc đang làm" className="mb-10"><h2 className="mb-4 text-xl font-bold">Việc đang làm</h2>
      {jobs === null ? <p className="text-muted">Đang tải…</p> : jobs.length === 0 ? <Card className="p-8 text-center"><span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><CircleCheck size={28} /></span><p className="text-base text-muted">{failed ? 'Chưa tải được danh sách việc. Bạn thử tải lại trang nhé.' : 'Hiện chưa có việc nào. Khi có việc mới, bạn sẽ thấy ở đây.'}</p></Card> :
        <div className="grid gap-4 md:grid-cols-2">{jobs.map((j) => { const pct = Math.max(0, Math.min(100, Number(j.progress) || 0)); const due = dueInfo(j.dueDate); return <Link key={String(j.id)} to={`/workshop?view=${encodeURIComponent(String(j.code || j.id))}`} className="group relative block overflow-hidden rounded-2xl border border-line bg-white p-5 pl-7 shadow-soft transition duration-200 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lift">
          <span aria-hidden className={`absolute inset-y-0 left-0 w-1.5 ${due?.bar || 'bg-slate-200'}`} />
          <div className="flex items-start justify-between gap-3"><div><p className="text-lg font-bold leading-6">{j.productName || j.code}</p><p className="mt-0.5 text-sm text-muted">{j.customerName ? `Cho ${j.customerName}` : j.code}</p></div>{due && <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${due.cls}`}>{due.text}</span>}</div>
          <div className="mt-4"><div className="mb-1.5 flex justify-between text-sm"><span className="text-muted">{j.stage || 'Chưa bắt đầu'}</span><b>{pct}% xong</b></div><div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600 transition-all" style={{ width: `${pct}%` }} /></div></div>
        </Link>; })}</div>}
    </section>
    {role === 'WAREHOUSE' && <section aria-label="Vật tư sắp hết" className="mb-10"><h2 className="mb-4 text-xl font-bold">Vật tư sắp hết</h2>
      {low === null ? <p className="text-muted">Đang tải…</p> : low.length === 0 ? <Card className="p-8 text-center"><span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><CircleCheck size={28} /></span><p className="text-base text-muted">Hiện chưa có vật tư nào sắp hết.</p></Card> :
        <Card className="px-5 py-2">{low.map((m) => <div key={String(m.id)} className="flex items-center justify-between gap-3 border-b border-line py-4 last:border-0"><span className="flex items-center gap-3 text-base font-semibold"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600"><TriangleAlert size={20} /></span>{m.name}</span><span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-sm font-semibold text-red-700">Còn {String(m.stock)} {m.unit || ''}</span></div>)}</Card>}
    </section>}
  </>;
}
