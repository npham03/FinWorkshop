import { useEffect,useState } from 'react';
import { Link,Navigate,Outlet,Route,Routes,useLocation,useNavigate } from 'react-router-dom';
import { ArrowLeftRight,Bell,Boxes,BriefcaseBusiness,ChevronDown,FileCheck2,FileClock,FileText,Factory,LayoutDashboard,LogOut,Menu,Package,Search,Settings2,ShieldCheck,Users,Wallet,X } from 'lucide-react';
import { useAuth } from './auth';
import { CatalogPage,CustomersPage,DashboardPage,InventoryPage,InvoicesPage,PaymentsPage,QuotationsPage,ReconciliationPage,ReportsPage,SettingsPage,SuppliersPage,TransactionsPage,WorkshopPage } from './pages';
import { type Role,type User } from './api';

const nav = [
  { section: 'Tổng quan', items: [{ to: '/app', label: 'Trang chủ', icon: LayoutDashboard, allow: ['OWNER', 'ACCOUNTANT', 'WAREHOUSE', 'WORKSHOP'] }] },
  { section: 'Tiền và thuế', items: [
    { to: '/transactions', label: 'Thu chi', icon: Wallet, allow: ['OWNER', 'ACCOUNTANT'] },
    { to: '/payments', label: 'Ai nợ ai', icon: ArrowLeftRight, allow: ['OWNER', 'ACCOUNTANT'] },
    { to: '/reconciliation', label: 'Khớp với ngân hàng', icon: ShieldCheck, allow: ['OWNER', 'ACCOUNTANT'] },
    { to: '/invoices', label: 'Hóa đơn', icon: FileCheck2, allow: ['OWNER', 'ACCOUNTANT'] },
    { to: '/reports', label: 'Thuế và báo cáo', icon: FileText, allow: ['OWNER', 'ACCOUNTANT'] },
  ] },
  { section: 'Xưởng và kho', items: [
    { to: '/quotations', label: 'Báo giá', icon: FileClock, allow: ['OWNER', 'ACCOUNTANT'] },
    { to: '/catalog', label: 'Sản phẩm & vật tư', icon: Package, allow: ['OWNER', 'ACCOUNTANT'] },
    { to: '/workshop', label: 'Việc làm trong xưởng', icon: Factory, allow: ['OWNER', 'ACCOUNTANT', 'WAREHOUSE', 'WORKSHOP'] },
    { to: '/inventory', label: 'Kho', icon: Boxes, allow: ['OWNER', 'ACCOUNTANT', 'WAREHOUSE', 'WORKSHOP'] },
  ] },
  { section: 'Khách và người bán', items: [
    { to: '/customers', label: 'Khách hàng', icon: Users, allow: ['OWNER', 'ACCOUNTANT'] },
    { to: '/suppliers', label: 'Người bán', icon: BriefcaseBusiness, allow: ['OWNER', 'ACCOUNTANT'] },
  ] },
  { section: 'Cài đặt', items: [{ to: '/settings', label: 'Cài đặt', icon: Settings2, allow: ['OWNER', 'ACCOUNTANT', 'WAREHOUSE', 'WORKSHOP'] }] },
];
const titles: Record<string, string> = { '/app': 'Trang chủ', '/transactions': 'Thu chi', '/payments': 'Ai nợ ai', '/reconciliation': 'Khớp với ngân hàng', '/invoices': 'Hóa đơn', '/reports': 'Thuế và báo cáo', '/quotations': 'Báo giá', '/catalog': 'Sản phẩm và vật tư', '/workshop': 'Việc làm trong xưởng', '/inventory': 'Kho', '/customers': 'Khách hàng', '/suppliers': 'Người bán', '/settings': 'Cài đặt' };
const pageAccessEntities: Record<string, string> = { '/app': 'dashboard', '/transactions': 'transactions', '/payments': 'payments', '/reconciliation': 'reconciliations', '/invoices': 'invoices', '/reports': 'transactions', '/quotations': 'quotations', '/catalog': 'products', '/workshop': 'production-orders', '/inventory': 'stock-movements', '/customers': 'customers', '/suppliers': 'suppliers' };
const userCanAccess = (user: User | null, entity: string) => (!user?.permissions || user.permissions.entities === '*' || user.permissions.entities.includes(entity)) && (!user?.permissions || user.permissions.actions === '*' || user.permissions.actions.includes('read'));

function Gate() {
  const { user, loading } = useAuth(); const location = useLocation();
  if (loading) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Đang xác thực phiên…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  const entity = location.pathname === '/app' && ['WORKSHOP', 'WAREHOUSE'].includes(user.role) ? undefined : pageAccessEntities[location.pathname];
  if (entity && !userCanAccess(user, entity)) return <Navigate to={user.role === 'WORKSHOP' ? '/settings' : '/settings'} replace />;
  return <Outlet />;
}

import { WorkerHome } from './RoleHome';
function HomePage() { const { user } = useAuth(); return ['WORKSHOP', 'WAREHOUSE'].includes(user?.role || '') ? <WorkerHome /> : <DashboardPage />; }

function AppShell() {
  const { user, logout } = useAuth(); const location = useLocation(); const navigate = useNavigate();
  const [mobileNav, setMobileNav] = useState(false); const [profileOpen, setProfileOpen] = useState(false); const [searchOpen, setSearchOpen] = useState(false); const [searchValue, setSearchValue] = useState('');
  const currentTitle = titles[location.pathname] || 'FinTax';
  useEffect(()=>{document.title=`${currentTitle} · FinWorkshop`;},[currentTitle]);
  const visibleNav = nav.map((group) => ({ ...group, items: group.items.filter((item) => item.allow.includes((user?.role || 'ACCOUNTANT') as Role) && (!pageAccessEntities[item.to] || userCanAccess(user, pageAccessEntities[item.to]))) })).filter((group) => group.items.length);
  const shortName: Record<string,string> = { '/app': 'Trang chủ', '/invoices': 'Hóa đơn', '/transactions': 'Thu chi', '/workshop': 'Xưởng', '/inventory': 'Kho' }; const quick = ['/app','/invoices','/transactions','/workshop','/inventory'].map((to) => visibleNav.flatMap((g) => g.items).find((i) => i.to === to)).filter(Boolean).slice(0, 4) as typeof nav[number]['items'];
  const search = (event: React.FormEvent) => { event.preventDefault(); if (searchValue.trim()) { navigate(`${user?.role==='WORKSHOP'?'/workshop':user?.role==='WAREHOUSE'?'/inventory':'/transactions'}?q=${encodeURIComponent(searchValue)}`); setSearchOpen(false); } };
  
  const sideNav = (
    <div className="flex h-full flex-col bg-[#0B132B] text-slate-200">
      <div className="flex h-16 items-center border-b border-slate-800/80 px-4">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-brand-700 to-brand-500 shadow-md">
            <Factory size={19} className="text-white" />
          </div>
          <span className="text-base font-bold text-white tracking-tight">
            Fin<span className="text-brand-500">Workshop</span>
            <span className="block text-[9px] font-semibold uppercase tracking-wider text-slate-400">Katana MRP Core</span>
          </span>
        </Link>
        <button onClick={() => setMobileNav(false)} className="ml-auto rounded-lg p-1.5 text-slate-400 hover:text-white lg:hidden"><X size={18} /></button>
      </div>

      <div className="px-3.5 py-3">
        <div className="flex w-full items-center gap-2.5 rounded-xl border border-slate-800 bg-slate-900/60 p-2.5 text-left">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-800 text-slate-300 border border-slate-700/60"><Factory size={14} /></span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold text-slate-100">{user?.workshopName || 'FinTax Automation'}</span>
            <span className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Đang hoạt động
            </span>
          </span>
        </div>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-4">
        {visibleNav.map((group) => (
          <div key={group.section}>
            <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">{group.section}</p>
            <div className="space-y-0.5">
              {group.items.map(({ to, label, icon: Icon }) => {
                const active = location.pathname === to;
                return (
                  <Link
                    key={to}
                    to={to}
                    onClick={() => setMobileNav(false)}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs sm:text-[13px] font-medium transition-all ${
                      active
                        ? 'bg-slate-800 text-white font-semibold shadow-sm border-l-2 border-brand-500'
                        : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                    }`}
                  >
                    <Icon size={16} strokeWidth={1.75} className={active ? 'text-brand-400' : 'text-slate-400'} />
                    {label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-slate-800/80 p-3 bg-[#0B132B]">
        <div className="rounded-xl bg-slate-900/70 border border-slate-800 p-2.5">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white shadow-sm">{user?.name?.slice(0, 1)}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-slate-100">{user?.name}</p>
              <p className="truncate text-[10px] text-slate-400">{user?.roleLabel}</p>
            </div>
          </div>
          <button onClick={logout} className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-800 bg-slate-800/60 px-2 py-1.5 text-xs text-slate-300 hover:bg-slate-700/60 hover:text-white transition-colors">
            <LogOut size={13} />Đăng xuất
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[256px] border-r border-slate-800 bg-[#0B132B] lg:block">
        {sideNav}
      </aside>
      {mobileNav && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button aria-label="Đóng điều hướng" className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setMobileNav(false)} />
          <aside className="absolute inset-y-0 left-0 w-[270px] bg-[#0B132B] shadow-2xl">{sideNav}</aside>
        </div>
      )}

      <div className="min-h-screen lg:pl-[256px]">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-slate-200/80 bg-white/95 px-4 backdrop-blur-md sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button aria-label="Mở điều hướng" onClick={() => setMobileNav(true)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden">
              <Menu size={18} />
            </button>
            <div className="min-w-0">
              <p className="truncate text-xs text-slate-400">
                {user?.workshopName || 'FinTax Automation'} <span className="px-1 text-slate-300">/</span> <span className="text-slate-900 font-semibold">{currentTitle}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className={`flex items-center overflow-hidden transition-all duration-150 ${searchOpen ? 'w-44 sm:w-64' : 'w-0'}`}>
              <form onSubmit={search} className="relative w-full">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input aria-label="Tìm giao dịch" value={searchValue} onChange={(e) => setSearchValue(e.target.value)} placeholder="Tìm kiếm nhanh..." className="w-full rounded-lg border border-slate-200 py-1 pl-8 pr-2 text-xs outline-none focus:border-brand-500" />
              </form>
            </div>
            <button aria-label="Mở tìm kiếm" onClick={() => setSearchOpen((value) => !value)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
              <Search size={16} />
            </button>
            <Link to="/app" aria-label="Thông báo" title="Thông báo" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
              <Bell size={16}/>
            </Link>
            <div className="mx-1 h-5 w-px bg-slate-200" />
            <div className="relative">
              <button onClick={() => setProfileOpen((value) => !value)} className="flex items-center gap-2 rounded-lg p-1 hover:bg-slate-50">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700 border border-brand-200">{user?.name?.slice(0, 1)}</span>
                <span className="hidden text-left sm:block">
                  <span className="block max-w-32 truncate text-xs font-semibold text-slate-900">{user?.name}</span>
                </span>
                <ChevronDown size={13} className="hidden text-slate-400 sm:block" />
              </button>
              {profileOpen && (
                <div className="absolute right-0 top-10 z-40 w-48 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                  <div className="border-b border-slate-100 px-3 py-2">
                    <p className="truncate text-xs font-semibold text-slate-900">{user?.email}</p>
                    <p className="mt-0.5 text-[10px] text-slate-400">{user?.roleLabel}</p>
                  </div>
                  <button onClick={() => { logout(); navigate('/login'); }} className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-xs text-slate-600 hover:bg-slate-50 hover:text-brand-600 transition-colors">
                    <LogOut size={13} />Đăng xuất
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1500px] px-4 py-5 pb-24 sm:px-6 sm:py-6 lg:pb-8">
          <Routes>
            <Route path="app" element={<HomePage />} />
            <Route path="transactions" element={<TransactionsPage />} />
            <Route path="payments" element={<PaymentsPage />} />
            <Route path="reconciliation" element={<ReconciliationPage />} />
            <Route path="invoices" element={<InvoicesPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="quotations" element={<QuotationsPage />} />
            <Route path="catalog" element={<CatalogPage />} />
            <Route path="workshop" element={<WorkshopPage />} />
            <Route path="inventory" element={<InventoryPage />} />
            <Route path="customers" element={<CustomersPage />} />
            <Route path="suppliers" element={<SuppliersPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/app" replace />} />
          </Routes>
          <footer className="mt-10 flex flex-col gap-2 border-t border-slate-200/80 pt-4 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
            <span>© 2026 FinWorkshop · Katana Cloud MRP Core Architecture</span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Sẵn sàng vận hành · Không gian làm việc đã xác thực
            </span>
          </footer>
        </main>
      </div>

      <nav aria-label="Menu nhanh" style={{ gridTemplateColumns: `repeat(${quick.length + 1}, minmax(0, 1fr))` }} className="fixed inset-x-0 bottom-0 z-30 grid border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
        {quick.map(({ to, icon: Icon }) => (
          <Link key={to} to={to} className={`flex min-h-[58px] flex-col items-center justify-center gap-0.5 text-[11px] ${location.pathname === to ? 'font-bold text-brand-700' : 'text-slate-600'}`}>
            <span className={`flex h-7 w-12 items-center justify-center rounded-full transition ${location.pathname === to ? 'bg-brand-50' : ''}`}>
              <Icon size={18} />
            </span>
            {shortName[to]}
          </Link>
        ))}
        <button onClick={() => setMobileNav(true)} className="flex min-h-[58px] flex-col items-center justify-center gap-0.5 text-[11px] text-slate-600">
          <span className="flex h-7 w-12 items-center justify-center"><Menu size={18} /></span>Thêm
        </button>
      </nav>
    </div>
  );
}

export default function Portal() { return <Routes><Route element={<Gate />}><Route path="/*" element={<AppShell />} /></Route></Routes>; }
