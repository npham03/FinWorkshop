import { useCallback,useEffect,useMemo,useRef,useState,type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowDownLeft, ArrowLeftRight, ArrowRight, CalendarDays, CheckCircle2, CircleDollarSign, Factory, FilePlus2, FileText, Landmark, Plus, RefreshCw, ShieldCheck, ShoppingCart, Upload, Wallet } from 'lucide-react';
import { Bar,CartesianGrid,Cell,ComposedChart,Legend,Line,Pie,PieChart,ResponsiveContainer,Tooltip,XAxis,YAxis } from 'recharts';
import { api,actionRecord,formatDate,formatVnd,messageOf,today } from './api';
import { ActionTile,Button,Card,Hero,PageHeader,StatusBadge,useToast } from './components';
import { roleName } from './RoleHome';
import { useAuth } from './auth';
import { formatAxisMoney,formatNumber,moneyTicks } from './presentation';

const dayShift = (day: string, count: number) => { const date = new Date(`${day}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + count); return date.toISOString().slice(0,10); };
const pathFor = (row: any) => `${({ invoices: '/invoices', transactions: '/transactions', quotations: '/quotations', 'stock-movements': '/inventory' } as Record<string,string>)[row.entity] || '/invoices'}?view=${encodeURIComponent(row.viewKey || row.code || row.id)}${row.entity === 'invoices' ? `&type=${row.direction}` : ''}`;

function HomeHero({ description, action }: { description: string; action: ReactNode }) {
  const { user } = useAuth();
  return <Hero chip={roleName[user?.role || ''] || undefined} title={`Xin chào, ${user?.name || ''}`} description={description} action={action} />;
}

function QuickActions() {
  const { user } = useAuth();
  const items = user?.role === 'ACCOUNTANT' ? [
    { to: '/invoices?new=1&type=OUTPUT', t: 'Hóa đơn bán', s: 'Lập hóa đơn xuất bán', icon: FilePlus2, tone: 'green' as const },
    { to: '/invoices?new=1&type=INPUT', t: 'Hóa đơn mua', s: 'Ghi hóa đơn mua vật tư', icon: ShoppingCart, tone: 'amber' as const },
    { to: '/transactions?new=1', t: 'Ghi thu chi', s: 'Phiếu thu, chi tiền mặt / NH', icon: Wallet, tone: 'blue' as const },
    { to: '/reconciliation', t: 'Khớp ngân hàng', s: 'Đối soát sao kê ngân hàng', icon: Landmark, tone: 'brand' as const }
  ] : [
    { to: '/invoices?new=1&type=OUTPUT', t: 'Bán hàng', s: 'Lập hóa đơn cho khách', icon: FilePlus2, tone: 'green' as const },
    { to: '/invoices?new=1&type=INPUT', t: 'Mua hàng', s: 'Ghi nhận hóa đơn vật tư', icon: ShoppingCart, tone: 'amber' as const },
    { to: '/payments?new=1', t: 'Thu / Trả nợ', s: 'Tất toán và cấn trừ công nợ', icon: ArrowLeftRight, tone: 'blue' as const },
    { to: '/quotations?new=1', t: 'Lập báo giá', s: 'Tính giá thành từ BOM & giờ công', icon: FileText, tone: 'brand' as const }
  ];
  return <section aria-label="Thao tác nhanh" className="mb-6">
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">Thao tác nghiệp vụ nhanh</h2>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((i) => <ActionTile key={i.to} to={i.to} title={i.t} hint={i.s} icon={i.icon} tone={i.tone} />)}
    </div>
  </section>;
}

export function DashboardPage() {
  const [data, setData] = useState<any>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [syncing, setSyncing] = useState(false);
  const [preset, setPreset] = useState('month'), [period, setPeriod] = useState({ from: `${today().slice(0,7)}-01`, to: today() }), [draft, setDraft] = useState(period), [chartRange, setChartRange] = useState('14');
  const { user } = useAuth(), toast = useToast();
  const requestVersion = useRef(0);
  const chartParams = useMemo(() => {
    if (chartRange === 'month') { const date = new Date(`${period.to}T12:00:00Z`); date.setUTCMonth(date.getUTCMonth()-5,1); return { chartFrom: date.toISOString().slice(0,10), chartTo: period.to, chartMode: 'month' }; }
    return { chartFrom: dayShift(period.to, 1-Number(chartRange)), chartTo: period.to, chartMode: 'day' };
  }, [period.to,chartRange]);
  const load = useCallback(async () => { const version = ++requestVersion.current; setBusy(true); try { const { data } = await api.get('/dashboard',{ params:{ ...period,...chartParams } }); if (version === requestVersion.current) { setData(data); setError(''); } } catch (error) { if (version === requestVersion.current) setError(messageOf(error)); } finally { if (version === requestVersion.current) setBusy(false); } },[period,chartParams]);
  useEffect(() => { void load(); const refresh = () => void load(); window.addEventListener('fintax:records-changed',refresh); return () => window.removeEventListener('fintax:records-changed',refresh); }, [load]);
  const choosePeriod = (value: string) => {
    setPreset(value);
    if (value === 'custom') return;
    const current = today(), year = current.slice(0,4), month = Number(current.slice(5,7));
    setPeriod({ from: value === 'quarter' ? `${year}-${String(Math.floor((month-1)/3)*3+1).padStart(2,'0')}-01` : `${current.slice(0,7)}-01`, to: current });
  };
  const retry = async () => { setSyncing(true); try { const { data } = await api.post('/integrations/odoo/sync-pending'); const count = data.results.filter((row: any) => row.status === 'SYNCED').length; toast(`Đã đồng bộ ${count}/${data.attempted} hồ sơ.`); await load(); } catch (error) { toast(messageOf(error),'error'); } finally { setSyncing(false); } };
  const approve = async (id: string) => { try { await actionRecord('quotations',id,'approve'); await load(); toast('Đã duyệt báo giá.'); } catch (error) { toast(messageOf(error),'error'); } };
  const metrics = data?.metrics || {}, actions = data?.actions || {}, tax = data?.tax || {}, comparison = data?.comparison || {};
  const ticks = moneyTicks(Math.max(1,...(data?.trend || []).flatMap((row: any) => [row.thu,row.chi])));
  const costs = data?.expenseBreakdown || [], costTotal = costs.reduce((sum: number,row: any) => sum+row.amount,0);
  const agingTotal = Number(data?.aging?.current || 0)+Number(data?.aging?.overdue || 0);

  return <>
    <HomeHero description={`Tình hình sản xuất & dòng tiền từ ${formatDate(period.from)} đến ${formatDate(period.to)}`} action={<Button variant="secondary" onClick={() => void load()} disabled={busy}><RefreshCw size={14} className={busy ? 'animate-spin' : ''}/>Làm mới</Button>}/>
    <QuickActions/>

    <Card className="mb-6 flex flex-wrap items-center justify-between gap-4 p-3.5 bg-white">
      <div className="flex flex-wrap items-center gap-2.5">
        <CalendarDays size={16} className="text-brand-600"/>
        <select aria-label="Kỳ kế toán" value={preset} onChange={(event) => choosePeriod(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs sm:text-sm font-semibold text-slate-700">
          <option value="month">Tháng này</option>
          <option value="quarter">Quý này</option>
          <option value="custom">Tùy chọn ngày</option>
        </select>
        {preset === 'custom' && <form onSubmit={(event) => { event.preventDefault(); if (draft.from && draft.to && draft.from <= draft.to) setPeriod(draft); }} className="flex flex-wrap items-center gap-1.5">
          <input aria-label="Từ ngày" type="date" required value={draft.from} onChange={(event) => setDraft({ ...draft,from:event.target.value })} className="rounded-lg border border-slate-200 p-1 text-xs"/>
          <input aria-label="Đến ngày" type="date" required min={draft.from} value={draft.to} onChange={(event) => setDraft({ ...draft,to:event.target.value })} className="rounded-lg border border-slate-200 p-1 text-xs"/>
          <Button type="submit" compact>Áp dụng</Button>
        </form>}
        <StatusBadge status={data?.period?.id ? data.period.status : 'DRAFT'} label={data?.period?.id ? data.period.status === 'LOCKED' ? 'Đã chốt sổ kỳ' : 'Kỳ đang mở' : 'Chưa thiết lập kỳ'}/>
      </div>
    </Card>

    {error && <p role="alert" className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-700">{error}</p>}

    {!data && !error ? <div className="grid gap-4 md:grid-cols-3">{Array.from({ length:6 },(_,index) => <div key={index} className="h-36 animate-pulse rounded-xl border border-slate-200 bg-white"/>)}</div> : <>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Kpi title="Tiền đang có (Quỹ & NH)" amount={metrics.balance} icon={<Wallet size={18}/>} to="/settings?tab=accounts" change={comparison.balance} tone="blue">
        <Sub label="Quỹ tiền mặt" value={metrics.cashBalance}/>
        <Sub label="Tài khoản ngân hàng" value={metrics.bankBalance}/>
      </Kpi>
      <Kpi title="Doanh thu bán hàng" amount={metrics.netRevenue} icon={<ArrowDownLeft size={18}/>} to="/invoices?type=OUTPUT" change={comparison.netRevenue} tone="green">
        <Sub label="Thực thu trong kỳ" value={metrics.actualReceipts}/>
        <span className="text-[11px] text-slate-400">Từ hóa đơn và tiền thu bán hàng</span>
      </Kpi>
      <Kpi title="Chi phí & Giá vốn đã chi" amount={metrics.operatingCost} icon={<Factory size={18}/>} to="/reports?book=SME-GT" change={comparison.operatingCost} tone="amber">
        <Sub label="Hóa đơn mua vào" value={metrics.inputInvoices}/>
        <span className="text-[11px] text-slate-400">Vật tư, nhân công & chi phí xưởng</span>
      </Kpi>
      <Kpi title="Phải thu khách hàng" amount={metrics.receivable} icon={<CircleDollarSign size={18}/>} to="/invoices?type=OUTPUT" change={comparison.receivable} tone={metrics.overdueCount ? 'red' : 'blue'}>
        <Sub label={`${metrics.overdueCount || 0} hóa đơn quá hạn`} value={metrics.overdueAmount} danger={metrics.overdueCount > 0}/>
        <span className="text-[11px] text-slate-400">{metrics.unpaidCount || 0} hóa đơn chưa thanh toán</span>
      </Kpi>
      <Kpi title="Phải trả nhà cung cấp" amount={metrics.payable} icon={<Landmark size={18}/>} to="/invoices?type=INPUT" change={comparison.payable} tone="red">
        <Sub label="Đến hạn trong 7 ngày" value={metrics.upcomingAmount}/>
        <span className="text-[11px] text-slate-400">{metrics.upcomingCount || 0} hóa đơn cần thanh toán</span>
      </Kpi>
      <Kpi title="Thuế tạm tính trong kỳ" amount={metrics.taxLiability} icon={<ShieldCheck size={18}/>} to="/reports?book=SME-VAT" change={comparison.taxLiability} tone="indigo">
        <Sub label="VAT đầu ra" value={tax.outputVat}/>
        <Sub label={tax.personalIncome ? 'TNCN khoán' : 'VAT đầu vào được trừ'} value={tax.personalIncome || tax.inputVat}/>
      </Kpi>
    </div>

    <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.85fr)_minmax(300px,1fr)]">
      <Card className="min-w-0 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">Dòng tiền thu – chi & Số dư lũy kế</h2>
            <p className="mt-0.5 text-xs text-slate-500">{formatDate(data?.chartFrom)} – {formatDate(data?.chartTo)}</p>
          </div>
          <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            {[['7','7 ngày'],['14','14 ngày'],['30','30 ngày'],['month','Theo tháng']].map(([value,label]) => (
              <button key={value} onClick={() => setChartRange(value)} className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${chartRange === value ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}>{label}</button>
            ))}
          </div>
        </div>

        <div className="my-4 grid grid-cols-3 divide-x divide-slate-200 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
          <ChartTotal label="Tổng thu vào" value={data?.chartTotals?.income} tone="text-emerald-700"/>
          <ChartTotal label="Tổng chi ra" value={data?.chartTotals?.expense} tone="text-rose-700"/>
          <ChartTotal label="Chênh lệch ròng" value={data?.chartTotals?.net} tone="text-brand-700"/>
        </div>

        <div className="h-[310px] w-full" aria-label="Biểu đồ dòng tiền" data-chart="cashflow">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data?.trend || []} barGap={4} barCategoryGap="24%" margin={{ top:15,right:8,left:0,bottom:5 }}>
              <CartesianGrid vertical={false} stroke="#E2E8F0" strokeDasharray="3 4"/>
              <XAxis dataKey="date" tickFormatter={(value) => chartRange === 'month' ? `${String(value).slice(5,7)}/${String(value).slice(0,4)}` : `${String(value).slice(8,10)}/${String(value).slice(5,7)}`} minTickGap={14} tick={{ fontSize:10,fill:'#64748B' }} axisLine={false} tickLine={false}/>
              <YAxis yAxisId="cash" ticks={ticks} domain={[0,ticks[4]]} width={64} tickFormatter={(value) => formatAxisMoney(value,ticks[4])} tick={{ fontSize:10,fill:'#64748B' }} axisLine={false} tickLine={false}/>
              <YAxis yAxisId="balance" orientation="right" width={64} tickFormatter={(value) => formatAxisMoney(value)} tick={{ fontSize:10,fill:'#4F46E5' }} axisLine={false} tickLine={false} domain={([min,max]: [number,number]) => { const padding = Math.max(1000000,(max-min)*0.15); return [Math.floor((min-padding)/1000000)*1000000,Math.ceil((max+padding)/1000000)*1000000]; }}/>
              <Tooltip content={<CashTooltip monthly={chartRange === 'month'}/>} cursor={{ fill:'#F1F5F9',opacity:0.6 }}/>
              <Legend wrapperStyle={{ fontSize:11,paddingTop:12 }}/>
              <Bar yAxisId="cash" name="Thu vào" dataKey="thu" fill="#10B981" maxBarSize={32} radius={[4,4,0,0]}/>
              <Bar yAxisId="cash" name="Chi ra" dataKey="chi" fill="#EF4444" maxBarSize={32} radius={[4,4,0,0]}/>
              <Line yAxisId="balance" name="Số dư lũy kế" dataKey="balance" type="monotone" stroke="#4F46E5" strokeWidth={2.2} dot={false} activeDot={{ r:4,stroke:'#fff',strokeWidth:2 }}/>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid gap-5">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Cơ cấu chi phí & Thuế</h2>
            <span className="text-[10px] text-slate-400">Trong kỳ</span>
          </div>
          {costs.length ? <>
            <div className="h-40 my-2">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={costs} dataKey="amount" nameKey="name" innerRadius={48} outerRadius={70} paddingAngle={2} stroke="white" strokeWidth={2}>
                    {costs.map((row: any) => <Cell key={row.name} fill={row.color}/>)}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatVnd(value)} contentStyle={{ borderRadius:8,fontSize:11,border:'1px solid #E2E8F0' }}/>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-1.5">
              {costs.map((row: any) => (
                <div key={row.name} className="flex items-center gap-2 text-xs">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background:row.color }}/>
                  <span className="min-w-0 flex-1 truncate text-slate-600">{row.name}</span>
                  <span className="w-9 text-right tabular-nums text-slate-400">{costTotal ? Math.round(row.amount/costTotal*100) : 0}%</span>
                  <span className="min-w-20 text-right font-semibold tabular-nums text-slate-900">{formatVnd(row.amount)}</span>
                </div>
              ))}
            </div>
          </> : <p className="py-10 text-center text-xs text-slate-400">Chưa phát sinh chi phí trong kỳ.</p>}
        </Card>

        <Card className="p-5">
          <div className="flex justify-between items-center">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Tuổi nợ phải thu</h2>
            <Link to="/invoices?type=OUTPUT" className="text-xs font-semibold text-brand-700 hover:underline">Chi tiết</Link>
          </div>
          <div className="my-3 flex h-2.5 overflow-hidden rounded-full bg-slate-100">
            <span className="bg-emerald-500 transition-all" style={{ width:`${agingTotal ? data.aging.current/agingTotal*100 : 0}%` }}/>
            <span className="bg-rose-500 transition-all" style={{ width:`${agingTotal ? data.aging.overdue/agingTotal*100 : 0}%` }}/>
          </div>
          <Sub label="Trong hạn thanh toán" value={data?.aging?.current}/>
          <div className="mt-1.5"><Sub label="Quá hạn thanh toán" value={data?.aging?.overdue} danger/></div>
        </Card>
      </div>
    </div>

    <div className="mt-6 grid items-start gap-5 xl:grid-cols-3">
      <Card className="overflow-hidden">
        <WidgetHeader icon={<AlertTriangle size={15}/>} title="Cần xử lý ngay"/>
        <div className="divide-y divide-slate-100">
          <Task count={actions.quotationCount} label="Báo giá chờ duyệt" to="/quotations?q=PENDING_APPROVAL" action="Xem báo giá"/>
          {user?.role === 'OWNER' && actions.pendingQuotes?.map((quote: any) => (
            <div key={quote.id} className="flex items-center justify-between gap-2 bg-amber-50/70 px-4 py-2.5 border-b border-amber-100">
              <span className="truncate text-xs font-semibold text-amber-900">{quote.code}</span>
              <Button className="shrink-0" compact onClick={() => void approve(quote.id)}>Duyệt ngay</Button>
            </div>
          ))}
          <Task count={actions.unclassifiedCount} label="Khoản thu chi chưa phân loại" to="/transactions?q=UNCLASSIFIED" action="Phân loại"/>
          <Task count={Number(actions.reviewInvoiceCount || 0)+Number(actions.reconciliationCount || 0)} label="Hóa đơn / Khớp ngân hàng cần rà soát" to="/invoices" action="Rà soát"/>
          <div className="flex items-center gap-3 p-4">
            <span className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold ${actions.pendingOdoo ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>{actions.pendingOdoo || 0}</span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-800">Hồ sơ chờ đồng bộ Odoo</p>
              <p className="mt-0.5 text-[10px] text-slate-400">{data?.integrations?.odoo?.connected ? 'Odoo ERP Online · Đồng bộ ổn định' : 'Mất kết nối · Đang chờ thử lại'}</p>
            </div>
            {user?.role === 'OWNER' ? (
              <Button variant="secondary" compact disabled={syncing || !data?.integrations?.odoo?.connected || !actions.pendingOdoo} onClick={() => void retry()}>
                <RefreshCw size={12} className={syncing ? 'animate-spin' : ''}/>Thử lại
              </Button>
            ) : (
              <Link to="/settings?tab=integrations" className="text-xs font-semibold text-brand-700">Chi tiết</Link>
            )}
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <WidgetHeader icon={<Factory size={15}/>} title="Tiến độ xưởng & Cảnh báo tồn kho"/>
        <div className="space-y-3.5 p-4">
          {data?.production?.length ? data.production.map((job: any) => (
            <Link key={job.id} to={`/workshop?view=${encodeURIComponent(job.code)}`} className="block group">
              <div className="flex justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-slate-800 group-hover:text-brand-700 transition-colors">{job.productName}</p>
                  <p className="mt-0.5 text-[10px] text-slate-400">{job.code} · {job.stage}</p>
                </div>
                <span className="text-xs font-bold text-brand-700">{formatNumber(job.progress)}%</span>
              </div>
              <div className="my-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width:`${job.progress || 0}%` }}/>
              </div>
              <p className="flex justify-between text-[10px] text-slate-400">
                <span>{formatNumber(job.laborHours)} giờ công</span>
                <span>Hạn {formatDate(job.dueDate)}</span>
              </p>
            </Link>
          )) : <p className="text-xs text-slate-400">Không có lệnh đang sản xuất.</p>}

          {data?.lowStock?.map((row: any) => (
            <Link key={row.id} to={`/catalog?tab=materials&view=${encodeURIComponent(row.viewKey || row.code || row.id)}`} className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50/80 px-3 py-2 text-rose-800">
              <AlertTriangle size={14} className="shrink-0 text-rose-600"/>
              <span className="min-w-0 flex-1 truncate text-xs font-semibold">{row.name}</span>
              <span className="whitespace-nowrap text-xs font-bold tabular-nums">{formatNumber(row.stock)} / {formatNumber(row.minStock)} {row.unit}</span>
            </Link>
          ))}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <WidgetHeader icon={<FileText size={15}/>} title="Chứng từ phát sinh gần nhất"/>
        <div className="divide-y divide-slate-100">
          {data?.recentDocuments?.map((row: any) => (
            <Link key={`${row.entity}-${row.id}`} to={pathFor(row)} className="block px-4 py-3 hover:bg-slate-50/80 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs font-bold text-slate-900">{row.code}</span>
                <span className={`whitespace-nowrap text-xs font-bold tabular-nums ${['INPUT','EXPENSE','WASTE'].includes(row.direction) ? 'text-rose-700' : 'text-emerald-700'}`}>{formatVnd(row.total)}</span>
              </div>
              <p className="mt-0.5 truncate text-[11px] text-slate-500">{row.counterparty || 'Chứng từ nội bộ'}</p>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="text-[10px] text-slate-400">{formatDate(row.date)}</span>
                <StatusBadge status={row.status}/>
              </div>
            </Link>
          ))}
          {!data?.recentDocuments?.length && <p className="px-4 py-8 text-center text-xs text-slate-400">Chưa có chứng từ.</p>}
        </div>
      </Card>
    </div>
    </>}
  </>;
}

function Kpi({ title, amount, icon, to, change, tone, children }: { title: string; amount: unknown; icon: ReactNode; to: string; change?: any; tone: 'blue'|'green'|'amber'|'red'|'indigo'; children: ReactNode }) {
  const colors = {
    blue:'bg-blue-50 text-blue-700 border border-blue-100',
    green:'bg-emerald-50 text-emerald-700 border border-emerald-100',
    amber:'bg-amber-50 text-amber-700 border border-amber-100',
    red:'bg-rose-50 text-rose-700 border border-rose-100',
    indigo:'bg-indigo-50 text-indigo-700 border border-indigo-100'
  };
  return <Link to={to} className="group rounded-xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-soft transition-all duration-150 hover:border-slate-300 hover:shadow-lift">
    <div className="flex items-start justify-between gap-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</p>
      <span className={`rounded-lg p-1.5 ${colors[tone]}`}>{icon}</span>
    </div>
    <p className={`mt-2 text-2xl font-bold tracking-tight tabular-nums ${tone === 'red' ? 'text-rose-700' : 'text-slate-900'}`}>{formatVnd(amount)}</p>
    <div className="mt-2.5 flex items-center justify-between gap-3 border-b border-slate-100 pb-2 text-[11px]">
      <span className={change?.change == null ? 'text-slate-400' : change.change >= 0 ? 'font-bold text-emerald-700' : 'font-bold text-rose-700'}>
        {change?.change == null ? 'Chưa có kỳ trước để so' : `${change.change > 0 ? '+' : ''}${formatNumber(change.change)}% so kỳ trước`}
      </span>
      <ArrowRight size={13} className="text-slate-300 transition group-hover:translate-x-1 group-hover:text-brand-600"/>
    </div>
    <div className="mt-2.5 space-y-1">{children}</div>
  </Link>;
}

function Sub({ label, value, danger = false }: { label: string; value: unknown; danger?: boolean }) {
  return <div className="flex items-center justify-between gap-3 text-xs">
    <span className={danger ? 'font-medium text-rose-700' : 'text-slate-500'}>{label}</span>
    <span className={`whitespace-nowrap font-bold tabular-nums ${danger ? 'text-rose-700' : 'text-slate-800'}`}>{formatVnd(value)}</span>
  </div>;
}

function ChartTotal({ label, value, tone }: { label: string; value: unknown; tone: string }) {
  return <div className="px-3">
    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
    <p className={`mt-0.5 text-sm font-bold tabular-nums sm:text-base ${tone}`}>{formatVnd(value)}</p>
  </div>;
}

function WidgetHeader({ icon, title }: { icon: ReactNode; title: string }) {
  return <h2 className="flex items-center gap-2 border-b border-slate-100 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-700">
    <span className="text-brand-600">{icon}</span>{title}
  </h2>;
}

function Task({ count = 0, label, to, action }: { count?: number; label: string; to: string; action: string }) {
  return <div className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50/60 transition-colors">
    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${count ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
      {count || <CheckCircle2 size={14}/>}
    </span>
    <p className="min-w-0 flex-1 text-xs font-medium text-slate-700">{label}</p>
    <Link to={to} className="shrink-0 text-xs font-semibold text-brand-700 hover:underline">{action}<span aria-hidden="true"> →</span></Link>
  </div>;
}

function CashTooltip({ active, payload, monthly }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return <div className="min-w-56 rounded-xl border border-slate-200 bg-white p-3.5 shadow-xl">
    <p className="mb-2 text-xs font-bold text-slate-900">{monthly ? `Tháng ${row.date.slice(5,7)}/${row.date.slice(0,4)}` : formatDate(row.date)}</p>
    <div className="space-y-1.5">
      <Sub label="Tổng thu" value={row.thu}/>
      <Sub label="Tổng chi" value={row.chi}/>
      <Sub label="Chênh lệch ròng" value={row.net}/>
      <div className="border-t border-slate-100 pt-1.5">
        <Sub label="Số dư lũy kế" value={row.balance}/>
      </div>
    </div>
  </div>;
}
