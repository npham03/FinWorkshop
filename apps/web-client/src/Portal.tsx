import { useEffect,useMemo,useState,useRef } from 'react';
import { Link,Navigate,Outlet,Route,Routes,useLocation,useNavigate } from 'react-router-dom';
import { ArrowLeftRight,Bell,Boxes,BriefcaseBusiness,ChevronDown,ChevronUp,Eye,EyeOff,FileCheck2,FileClock,FileText,Factory,Globe,LayoutDashboard,LogOut,Menu,Package,Search,Settings2,ShieldCheck,Users,Wallet,X } from 'lucide-react';
import { useAuth } from './auth';
import { useLanguage } from './language';
import { CatalogPage,CustomersPage,DashboardPage,InventoryPage,InvoicesPage,PaymentsPage,QuotationsPage,ReconciliationPage,ReportsPage,SettingsPage,SuppliersPage,TransactionsPage,WorkshopPage } from './pages';
import { type Role,type User } from './api';

interface NavItem {
  to: string;
  label: string;
  icon: any;
  allow: Role[];
}

interface NavGroup {
  id: string;
  section: string;
  icon: any;
  items: NavItem[];
}

const nav: NavGroup[] = [
  {
    id: 'overview',
    section: 'Tổng quan',
    icon: LayoutDashboard,
    items: [
      { to: '/app', label: 'Bàn làm việc', icon: LayoutDashboard, allow: ['OWNER', 'ACCOUNTANT', 'WAREHOUSE', 'WORKSHOP'] }
    ]
  },
  {
    id: 'finance',
    section: 'Tiền & Thuế',
    icon: Wallet,
    items: [
      { to: '/transactions', label: 'Thu chi', icon: Wallet, allow: ['OWNER', 'ACCOUNTANT'] },
      { to: '/payments', label: 'Ai nợ ai', icon: ArrowLeftRight, allow: ['OWNER', 'ACCOUNTANT'] },
      { to: '/reconciliation', label: 'Khớp ngân hàng', icon: ShieldCheck, allow: ['OWNER', 'ACCOUNTANT'] },
      { to: '/invoices', label: 'Hóa đơn', icon: FileCheck2, allow: ['OWNER', 'ACCOUNTANT'] },
      { to: '/reports', label: 'Thuế & 7 Sổ sách', icon: FileText, allow: ['OWNER', 'ACCOUNTANT'] },
    ]
  },
  {
    id: 'workshop',
    section: 'Xưởng & Kho',
    icon: Factory,
    items: [
      { to: '/quotations', label: 'Báo giá', icon: FileClock, allow: ['OWNER', 'ACCOUNTANT'] },
      { to: '/catalog', label: 'Sản phẩm & vật tư', icon: Package, allow: ['OWNER', 'ACCOUNTANT'] },
      { to: '/workshop', label: 'Việc làm trong xưởng', icon: Factory, allow: ['OWNER', 'ACCOUNTANT', 'WAREHOUSE', 'WORKSHOP'] },
      { to: '/inventory', label: 'Quản lý kho', icon: Boxes, allow: ['OWNER', 'ACCOUNTANT', 'WAREHOUSE', 'WORKSHOP'] },
    ]
  },
  {
    id: 'partners',
    section: 'Khách & NCC',
    icon: Users,
    items: [
      { to: '/customers', label: 'Khách hàng', icon: Users, allow: ['OWNER', 'ACCOUNTANT'] },
      { to: '/suppliers', label: 'Người bán / NCC', icon: BriefcaseBusiness, allow: ['OWNER', 'ACCOUNTANT'] },
    ]
  },
  {
    id: 'settings',
    section: 'Cài đặt',
    icon: Settings2,
    items: [
      { to: '/settings', label: 'Cài đặt hệ thống', icon: Settings2, allow: ['OWNER', 'ACCOUNTANT', 'WAREHOUSE', 'WORKSHOP'] }
    ]
  },
];

const titles: Record<string, string> = {
  '/app': 'Bàn làm việc',
  '/transactions': 'Thu chi',
  '/payments': 'Ai nợ ai',
  '/reconciliation': 'Khớp với ngân hàng',
  '/invoices': 'Hóa đơn',
  '/reports': 'Thuế và 7 sổ sách',
  '/quotations': 'Báo giá',
  '/catalog': 'Sản phẩm & vật tư',
  '/workshop': 'Việc làm trong xưởng',
  '/inventory': 'Quản lý kho',
  '/customers': 'Khách hàng',
  '/suppliers': 'Người bán / NCC',
  '/settings': 'Cài đặt'
};

const pageAccessEntities: Record<string, string> = {
  '/app': 'dashboard',
  '/transactions': 'transactions',
  '/payments': 'payments',
  '/reconciliation': 'reconciliations',
  '/invoices': 'invoices',
  '/reports': 'transactions',
  '/quotations': 'quotations',
  '/catalog': 'products',
  '/workshop': 'production-orders',
  '/inventory': 'stock-movements',
  '/customers': 'customers',
  '/suppliers': 'suppliers'
};

const userCanAccess = (user: User | null, entity: string) =>
  (!user?.permissions || user.permissions.entities === '*' || user.permissions.entities.includes(entity)) &&
  (!user?.permissions || user.permissions.actions === '*' || user.permissions.actions.includes('read'));

function Gate() {
  const { user, loading } = useAuth();
  const { isEn } = useLanguage();
  const location = useLocation();
  if (loading) return <div className="flex min-h-screen items-center justify-center text-xs text-slate-500">{isEn ? 'Authenticating session…' : 'Đang xác thực phiên…'}</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  const entity = location.pathname === '/app' && ['WORKSHOP', 'WAREHOUSE'].includes(user.role) ? undefined : pageAccessEntities[location.pathname];
  if (entity && !userCanAccess(user, entity)) return <Navigate to="/settings" replace />;
  return <Outlet />;
}

import { WorkerHome } from './RoleHome';
function HomePage() {
  const { user } = useAuth();
  return ['WORKSHOP', 'WAREHOUSE'].includes(user?.role || '') ? <WorkerHome /> : <DashboardPage />;
}

function AppShell() {
  const { user, logout } = useAuth();
  const { language, setLanguage, t, isEn } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();

  const [mobileNav, setMobileNav] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [subBarCollapsed, setSubBarCollapsed] = useState(() => localStorage.getItem('fin_subbar_collapsed') === 'true');

  const dropdownRef = useRef<HTMLDivElement>(null);
  const currentTitle = t(titles[location.pathname] || 'FinTax');

  useEffect(() => {
    document.title = `${currentTitle} · FinWorkshop`;
  }, [currentTitle]);

  // Click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpenDropdown(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const visibleNav = useMemo(() => {
    return nav
      .map((group) => ({
        ...group,
        items: group.items.filter(
          (item) =>
            item.allow.includes((user?.role || 'ACCOUNTANT') as Role) &&
            (!pageAccessEntities[item.to] || userCanAccess(user, pageAccessEntities[item.to]))
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [user]);

  // Find which major group contains current active path
  const activeGroup = useMemo(() => {
    return visibleNav.find((group) => group.items.some((item) => item.to === location.pathname)) || visibleNav[0];
  }, [visibleNav, location.pathname]);

  const toggleSubBar = () => {
    setSubBarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('fin_subbar_collapsed', String(next));
      return next;
    });
  };

  const search = (event: React.FormEvent) => {
    event.preventDefault();
    if (searchValue.trim()) {
      navigate(`${user?.role === 'WORKSHOP' ? '/workshop' : user?.role === 'WAREHOUSE' ? '/inventory' : '/transactions'}?q=${encodeURIComponent(searchValue)}`);
      setSearchOpen(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
      {/* 1. TOP NAVIGATION BAR */}
      <header className="sticky top-0 z-40 bg-white text-slate-800 border-b border-slate-200 shadow-xs">
        <div className="mx-auto flex h-14 items-center justify-between px-3 sm:px-6">
          {/* Left: Brand & Workshop Badge */}
          <div className="flex items-center gap-3">
            <button
              aria-label={t('Mở menu di động')}
              onClick={() => setMobileNav(true)}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 lg:hidden"
            >
              <Menu size={18} />
            </button>

            <Link to="/app" className="flex items-center h-10 px-0 hover:opacity-90 transition-opacity">
              <img src="/logo-horizontal.png" alt="DichVuThue FinTax Automation" className="h-8 w-auto max-w-[165px] sm:max-w-[185px] object-contain" />
            </Link>

            <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] text-slate-600">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="max-w-28 truncate font-medium">{user?.workshopName || 'FinTax Automation'}</span>
            </div>
          </div>

          {/* Center: Desktop Top Navigation Groups with Dropdowns */}
          <nav ref={dropdownRef} className="hidden lg:flex items-center gap-1">
            {visibleNav.map((group) => {
              const isGroupActive = group.items.some((item) => item.to === location.pathname);
              const isOpen = openDropdown === group.id;
              const hasMultiple = group.items.length > 1;

              return (
                <div key={group.id} className="relative">
                  {hasMultiple ? (
                    <button
                      type="button"
                      onClick={() => setOpenDropdown(isOpen ? null : group.id)}
                      onMouseEnter={() => setOpenDropdown(group.id)}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                        isGroupActive
                          ? 'bg-slate-100 text-brand-700 border-b-2 border-brand-600 shadow-xs'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      <group.icon size={15} className={isGroupActive ? 'text-brand-600' : 'text-slate-400'} />
                      <span>{t(group.section)}</span>
                      <ChevronDown size={13} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                  ) : (
                    <Link
                      to={group.items[0].to}
                      onMouseEnter={() => setOpenDropdown(null)}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                        isGroupActive
                          ? 'bg-slate-100 text-brand-700 border-b-2 border-brand-600 shadow-xs'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      <group.icon size={15} className={isGroupActive ? 'text-brand-600' : 'text-slate-400'} />
                      <span>{t(group.section)}</span>
                    </Link>
                  )}

                  {/* Dropdown Menu for Sub-items */}
                  {hasMultiple && isOpen && (
                    <div
                      onMouseLeave={() => setOpenDropdown(null)}
                      className="absolute left-0 top-full mt-1.5 z-50 min-w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl animate-in fade-in zoom-in-95 duration-100 text-slate-800"
                    >
                      <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 mb-1">
                        {t(group.section)}
                      </div>
                      {group.items.map((item) => {
                        const isItemActive = location.pathname === item.to;
                        return (
                          <Link
                            key={item.to}
                            to={item.to}
                            onClick={() => setOpenDropdown(null)}
                            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                              isItemActive
                                ? 'bg-brand-50 text-brand-700 font-semibold'
                                : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                            }`}
                          >
                            <item.icon size={15} className={isItemActive ? 'text-brand-600' : 'text-slate-400'} />
                            <span>{t(item.label)}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* Right: Quick Search, Language Switcher, User Profile, Role */}
          <div className="flex items-center gap-2 sm:gap-2.5">
            <div className={`flex items-center overflow-hidden transition-all duration-150 ${searchOpen ? 'w-40 sm:w-56' : 'w-0'}`}>
              <form onSubmit={search} className="relative w-full">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  aria-label={t('Tìm nhanh')}
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  placeholder={t('Tìm kiếm...')}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1 pl-7 pr-2 text-xs text-slate-800 outline-none focus:border-brand-500 focus:bg-white"
                />
              </form>
            </div>
            <button
              aria-label={t('Mở tìm kiếm')}
              onClick={() => setSearchOpen((v) => !v)}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            >
              <Search size={16} />
            </button>

            <Link to="/app" aria-label={t('Trung tâm thông báo')} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800">
              <Bell size={16} />
            </Link>

            {/* Quick Language Switcher Button */}
            <button
              type="button"
              onClick={() => setLanguage(language === 'vi' ? 'en' : 'vi')}
              title={isEn ? 'Chuyển sang Tiếng Việt (Vietnamese)' : 'Switch to English'}
              aria-label={isEn ? 'Switch to Vietnamese' : 'Chuyển sang Tiếng Anh'}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 transition-colors"
            >
              <Globe size={14} className="text-brand-600" />
              <span className="text-[11px] font-bold uppercase tracking-wide">{language === 'vi' ? 'VI' : 'EN'}</span>
            </button>

            <div className="h-4 w-px bg-slate-200 mx-0.5" />

            {/* Profile Dropdown */}
            <div className="relative">
              <button
                onClick={() => setProfileOpen((v) => !v)}
                className="flex items-center gap-2 rounded-lg p-1 hover:bg-slate-50 transition-colors"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700 border border-brand-200 shadow-xs">
                  {user?.name?.slice(0, 1)}
                </span>
                <span className="hidden text-left md:block">
                  <span className="block max-w-28 truncate text-xs font-semibold text-slate-800">{user?.name}</span>
                  <span className="block text-[10px] text-slate-400">{user?.roleLabel}</span>
                </span>
                <ChevronDown size={13} className="hidden text-slate-400 sm:block" />
              </button>

              {profileOpen && (
                <div className="absolute right-0 top-10 z-50 w-52 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl text-slate-800">
                  <div className="border-b border-slate-100 px-3 py-2">
                    <p className="truncate text-xs font-semibold text-slate-900">{user?.email}</p>
                    <p className="text-[10px] text-brand-700 font-medium">{user?.roleLabel}</p>
                  </div>

                  <Link
                    to="/settings?tab=language"
                    onClick={() => setProfileOpen(false)}
                    className="mt-1 flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Globe size={14} className="text-slate-500" />
                      <span>{t('Ngôn ngữ')}</span>
                    </div>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                      {language}
                    </span>
                  </Link>

                  <button
                    onClick={() => {
                      logout();
                      navigate('/login');
                    }}
                    className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700 transition-colors"
                  >
                    <LogOut size={13} />
                    <span>{t('Đăng xuất')}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* 2. SECONDARY SUB-NAVIGATION BAR */}
      {activeGroup && activeGroup.items.length > 1 && (
        <div className="border-b border-slate-200 bg-white shadow-sm">
          <div className="mx-auto flex h-10 items-center justify-between px-3 sm:px-6">
            <div className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mr-2 shrink-0 hidden sm:inline">
                {t(activeGroup.section)}:
              </span>
              {!subBarCollapsed ? (
                activeGroup.items.map((item) => {
                  const isItemActive = location.pathname === item.to;
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium shrink-0 transition-colors ${
                        isItemActive
                          ? 'bg-brand-50 text-brand-700 border border-brand-200/80 font-semibold shadow-xs'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      <item.icon size={13} className={isItemActive ? 'text-brand-600' : 'text-slate-400'} />
                      <span>{t(item.label)}</span>
                    </Link>
                  );
                })
              ) : (
                <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-600" />
                  {currentTitle}
                </span>
              )}
            </div>

            {/* Toggle Collapse Sub-bar Button */}
            <button
              onClick={toggleSubBar}
              title={subBarCollapsed ? t('Hiện menu con') : t('Ẩn menu con (Toàn màn hình)')}
              className="ml-2 inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors shrink-0"
            >
              {subBarCollapsed ? (
                <>
                  <Eye size={12} className="text-brand-600" />
                  <span className="hidden sm:inline">{t('Hiện menu con')}</span>
                  <ChevronDown size={11} />
                </>
              ) : (
                <>
                  <EyeOff size={12} />
                  <span className="hidden sm:inline">{t('Ẩn menu con (Toàn màn hình)')}</span>
                  <ChevronUp size={11} />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* 3. MOBILE NAVIGATION DRAWER */}
      {mobileNav && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label={t('Đóng điều hướng')}
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => setMobileNav(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-[280px] bg-white text-slate-800 border-r border-slate-200 shadow-2xl flex flex-col">
            <div className="flex h-14 items-center justify-between border-b border-slate-200 px-4">
              <Link to="/app" onClick={() => setMobileNav(false)} className="flex items-center h-8">
                <img src="/logo-horizontal.png" alt="DichVuThue FinTax Automation" className="h-7 w-auto max-w-[150px] object-contain" />
              </Link>
              <button onClick={() => setMobileNav(false)} className="rounded p-1 text-slate-400 hover:text-slate-800">
                <X size={18} />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-3 space-y-4">
              {visibleNav.map((group) => (
                <div key={group.id}>
                  <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{t(group.section)}</p>
                  <div className="space-y-0.5">
                    {group.items.map((item) => {
                      const active = location.pathname === item.to;
                      return (
                        <Link
                          key={item.to}
                          to={item.to}
                          onClick={() => setMobileNav(false)}
                          className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium transition ${
                            active
                              ? 'bg-brand-50 text-brand-700 font-semibold border-l-2 border-brand-600'
                              : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                          }`}
                        >
                          <item.icon size={15} className={active ? 'text-brand-600' : 'text-slate-400'} />
                          <span>{t(item.label)}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>
            <div className="border-t border-slate-200 p-3 bg-slate-50/70 space-y-2">
              <button
                type="button"
                onClick={() => setLanguage(language === 'vi' ? 'en' : 'vi')}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs"
              >
                <Globe size={14} className="text-brand-600" />
                <span>{language === 'vi' ? 'Chuyển sang English' : 'Switch to Tiếng Việt'}</span>
              </button>
              <button
                onClick={() => {
                  logout();
                  navigate('/login');
                }}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 shadow-xs"
              >
                <LogOut size={13} />
                <span>{t('Đăng xuất')}</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* 4. MAIN CONTENT AREA */}
      <main className="flex-1 w-full max-w-full px-3.5 sm:px-6 py-4">
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

        <footer className="mt-8 flex flex-col gap-2 border-t border-slate-200/80 pt-3 text-[11px] text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <span>{isEn ? '© 2026 FinWorkshop · Accounting & Workshop ERP Platform' : '© 2026 FinWorkshop · Chuẩn phần mềm kế toán & sản xuất ERP'}</span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {isEn ? 'Full-screen mode · Performance-tuned operations' : 'Hệ thống vận hành đầy màn hình · Đã tối ưu hóa thao tác'}
          </span>
        </footer>
      </main>
    </div>
  );
}

export default function Portal() {
  return (
    <Routes>
      <Route element={<Gate />}>
        <Route path="/*" element={<AppShell />} />
      </Route>
    </Routes>
  );
}
