import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronDown, Factory, FileText, ShieldCheck, Sparkles } from 'lucide-react';
import { useAuth } from './auth';
import { api, messageOf } from './api';

function AuthLayout({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: ReactNode }) {
  return <div className="grid min-h-screen bg-white lg:grid-cols-[1.05fr_.95fr]">
    <section className="relative hidden overflow-hidden bg-[#1e1a1a] p-12 text-white lg:flex lg:flex-col lg:justify-between">
      <div className="absolute -right-32 -top-24 h-[480px] w-[480px] rounded-full border border-white/10" />
      <div className="absolute -right-12 -top-4 h-[320px] w-[320px] rounded-full border border-white/10" />
      <div className="relative z-10">
        <div className="h-20 w-[310px] overflow-hidden rounded-2xl bg-white"><img src="/logo-horizontal.png" alt="DichVuThue FinTax" className="h-full w-full object-contain" /></div>
        <div className="mt-20 max-w-xl"><p className="text-xs font-semibold uppercase tracking-[.22em] text-red-300">FinTax Automation</p><h1 className="mt-5 text-4xl font-semibold leading-[1.15] tracking-tight">Quản trị xưởng.<br />An tâm dòng tiền.</h1><p className="mt-5 max-w-md text-sm leading-7 text-white/60">Từ định mức sản xuất đến dòng tiền và dữ liệu đối soát — rõ ràng, liền mạch, trong tầm kiểm soát.</p></div>
      </div>
      <div className="relative z-10 grid max-w-xl grid-cols-3 gap-3">{[['01', 'Dòng tiền rõ ràng'], ['02', 'Vận hành liền mạch'], ['03', 'Rà soát chủ động']].map(([number, label]) => <div key={number} className="rounded-2xl border border-white/10 bg-white/[.04] p-4"><p className="text-xs text-red-300">{number}</p><p className="mt-3 text-xs font-medium text-white/80">{label}</p></div>)}</div>
      <p className="relative z-10 text-[10px] text-white/35">Dữ liệu trình diễn · Không kết nối cơ quan thuế hoặc ngân hàng thật</p>
    </section>
    <section className="flex min-h-screen items-center justify-center px-5 py-12"><div className="w-full max-w-[410px]">
      <div className="mb-9 flex h-14 w-[220px] overflow-hidden lg:hidden"><img src="/logo-horizontal.png" alt="DichVuThue FinTax" className="h-full w-full object-contain" /></div>
      <div className="mb-8"><p className="text-xs font-semibold uppercase tracking-[.18em] text-brand-600">{eyebrow}</p><h2 className="mt-3 text-3xl font-semibold tracking-tight">{title}</h2><p className="mt-2 text-sm leading-6 text-muted">{description}</p></div>
      {children}
      <div className="mt-8 flex items-center justify-center gap-1.5 text-[10px] text-gray-400"><Sparkles size={12} />FinTax Automation · Tài khoản được quản lý qua Odoo</div>
    </div></section>
  </div>;
}

const inputClass = 'w-full rounded-xl border border-line px-4 py-3 text-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-50';
const primaryButton = 'flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white shadow-md shadow-brand-600/15 transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60';
function FormError({ children }: { children: string }) { return children ? <p role="alert" className="rounded-xl border border-red-100 bg-red-50 px-3.5 py-3 text-xs leading-5 text-red-700">{children}</p> : null; }

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('owner@fintax.demo');
  const [password, setPassword] = useState('FinTax@2026');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setBusy(true);
    try { await login(email, password); navigate('/'); }
    catch (reason) { setError(messageOf(reason)); }
    finally { setBusy(false); }
  };
  const demos = [
    { email: 'owner@fintax.demo', label: 'Chủ xưởng', icon: <ShieldCheck size={15} /> },
    { email: 'accountant@fintax.demo', label: 'Kế toán', icon: <FileText size={15} /> },
    { email: 'warehouse@fintax.demo', label: 'Thợ xưởng', icon: <Factory size={15} /> },
  ];
  return <AuthLayout eyebrow="Chào mừng trở lại" title="Đăng nhập FinTax" description="Sử dụng tài khoản của bạn để tiếp tục làm việc.">
    <form onSubmit={submit} className="space-y-5">
      <FormError>{error}</FormError>
      <label className="block"><span className="mb-2 block text-xs font-medium text-gray-600">Email</span><input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required className={inputClass} /></label>
      <label className="block"><span className="mb-2 block text-xs font-medium text-gray-600">Mật khẩu</span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required className={inputClass} /></label>
      <div className="-mt-2 text-right"><Link to="/forgot-password" className="text-xs font-medium text-brand-700 hover:text-brand-800">Quên mật khẩu?</Link></div>
      <button disabled={busy} type="submit" className={primaryButton}>{busy ? 'Đang xác thực…' : 'Đăng nhập'}<ChevronDown className="-rotate-90" size={16} /></button>
    </form>
    <div className="my-6 flex items-center gap-3"><span className="h-px flex-1 bg-line" /><span className="text-[10px] uppercase tracking-wider text-gray-400">Tài khoản mẫu</span><span className="h-px flex-1 bg-line" /></div>
    <div className="space-y-2">{demos.map((demo) => <button key={demo.email} type="button" onClick={() => { setEmail(demo.email); setPassword('FinTax@2026'); }} className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition ${email === demo.email ? 'border-brand-200 bg-brand-50/60' : 'border-line hover:bg-gray-50'}`}><span className="rounded-lg bg-white p-2 text-brand-700 shadow-sm">{demo.icon}</span><span className="flex-1"><span className="block text-xs font-medium">{demo.label}</span><span className="mt-0.5 block text-[10px] text-muted">{demo.email}</span></span><span className="text-[10px] text-gray-400">Chọn</span></button>)}</div>
    <p className="mt-3 text-center text-[10px] text-muted">Mật khẩu tài khoản mẫu: <span className="font-medium text-gray-600">FinTax@2026</span></p>
    <p className="mt-7 text-center text-sm text-muted">Chưa có tài khoản? <Link to="/register" className="font-semibold text-brand-700 hover:text-brand-800">Đăng ký</Link></p>
  </AuthLayout>;
}

export function RegisterPage() {
  const { user } = useAuth(); const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [confirmation, setConfirmation] = useState(''); const [error, setError] = useState(''); const [done, setDone] = useState(false); const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError('');
    if (password !== confirmation) { setError('Hai mật khẩu chưa trùng khớp.'); return; }
    setBusy(true);
    try { await api.post('/auth/register', { name, email, password }); setDone(true); }
    catch (reason) { setError(messageOf(reason)); }
    finally { setBusy(false); }
  };
  return <AuthLayout eyebrow="Tạo tài khoản mới" title={done ? 'Đã nhận đăng ký' : 'Đăng ký FinTax'} description={done ? 'Thông tin tài khoản đã được lưu trong Odoo.' : 'Tạo tài khoản để truy cập không gian làm việc FinTax.'}>
    {done ? <div className="space-y-5"><div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-900">Tài khoản đã được tạo và lưu trong Odoo. Chủ xưởng cần mở quyền trước khi bạn đăng nhập được.</div><Link to="/login" className={`${primaryButton} no-underline`}>Quay lại đăng nhập</Link></div> : <form onSubmit={submit} className="space-y-4">
      <FormError>{error}</FormError>
      <label className="block"><span className="mb-2 block text-xs font-medium text-gray-600">Họ và tên</span><input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={190} className={inputClass} /></label>
      <label className="block"><span className="mb-2 block text-xs font-medium text-gray-600">Email</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required className={inputClass} /></label>
      <label className="block"><span className="mb-2 block text-xs font-medium text-gray-600">Mật khẩu</span><input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={10} className={inputClass} /><span className="mt-1.5 block text-[10px] text-muted">Từ 10 ký tự; mật khẩu dài tối đa 72 byte UTF-8.</span></label>
      <label className="block"><span className="mb-2 block text-xs font-medium text-gray-600">Nhập lại mật khẩu</span><input type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required minLength={10} className={inputClass} /></label>
      <button disabled={busy} type="submit" className={primaryButton}>{busy ? 'Đang tạo tài khoản…' : 'Tạo tài khoản'}<ChevronDown className="-rotate-90" size={16} /></button>
      <p className="pt-2 text-center text-sm text-muted">Đã có tài khoản? <Link to="/login" className="font-semibold text-brand-700">Đăng nhập</Link></p>
    </form>}
  </AuthLayout>;
}

export function ForgotPasswordPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setBusy(true);
    const normalizedEmail = email.trim();
    try {
      const { data } = await api.post('/auth/forgot-password', { email: normalizedEmail });
      navigate(`/reset-password?email=${encodeURIComponent(normalizedEmail)}`, { state: { debugCode: data.debugCode || '' } });
    } catch (reason) { setError(messageOf(reason)); }
    finally { setBusy(false); }
  };

  return <AuthLayout eyebrow="Khôi phục quyền truy cập" title="Quên mật khẩu?" description="Nhập email tài khoản để nhận mã xác nhận gồm 6 chữ số.">
    <form onSubmit={submit} className="space-y-5"><FormError>{error}</FormError>
      <label className="block"><span className="mb-2 block text-xs font-medium text-gray-600">Email</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required className={inputClass} /></label>
      <button disabled={busy} type="submit" className={primaryButton}>{busy ? 'Đang gửi mã…' : 'Gửi mã xác nhận'}</button>
      <p className="text-center text-sm text-muted"><Link to="/login" className="font-semibold text-brand-700">Quay lại đăng nhập</Link></p>
    </form>
  </AuthLayout>;
}

export function ResetPasswordPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const [email, setEmail] = useState(searchParams.get('email') || '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const debugCode = typeof location.state?.debugCode === 'string' ? location.state.debugCode : '';
  if (user) return <Navigate to="/" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError('');
    if (password !== confirmation) { setError('Hai mật khẩu chưa trùng khớp.'); return; }
    setBusy(true);
    try { await api.post('/auth/reset-password', { email: email.trim(), code: code.trim(), newPassword: password }); setDone(true); }
    catch (reason) { setError(messageOf(reason)); }
    finally { setBusy(false); }
  };

  return <AuthLayout eyebrow="Cập nhật bảo mật" title={done ? 'Đổi mật khẩu thành công' : 'Đặt mật khẩu mới'} description="Nhập mã 6 chữ số trong email và mật khẩu mới của bạn. Mã chỉ dùng một lần, có hiệu lực 10 phút.">
    {done ? <Link to="/login" className={`${primaryButton} no-underline`}>Đăng nhập</Link> : <form onSubmit={submit} className="space-y-4"><FormError>{error}</FormError>
      {debugCode && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs leading-5 text-amber-900">SMTP chưa gửi được trong môi trường phát triển. Mã thử nghiệm: <strong className="tracking-widest">{debugCode}</strong></p>}
      <label className="block"><span className="mb-2 block text-xs font-medium text-gray-600">Email</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required className={inputClass} /></label>
      <label className="block"><span className="mb-2 block text-xs font-medium text-gray-600">Mã xác nhận</span><input type="text" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} required minLength={6} maxLength={6} pattern="[0-9]{6}" className={inputClass} /></label>
      <label className="block"><span className="mb-2 block text-xs font-medium text-gray-600">Mật khẩu mới</span><input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={10} className={inputClass} /><span className="mt-1.5 block text-[10px] text-muted">Từ 10 ký tự; tối đa 72 byte UTF-8.</span></label>
      <label className="block"><span className="mb-2 block text-xs font-medium text-gray-600">Nhập lại mật khẩu mới</span><input type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required minLength={10} className={inputClass} /></label>
      <button disabled={busy} type="submit" className={primaryButton}>{busy ? 'Đang lưu…' : 'Đặt lại mật khẩu'}</button>
      <p className="text-center text-sm text-muted"><Link to="/forgot-password" className="font-semibold text-brand-700">Gửi mã khác</Link></p>
    </form>}
  </AuthLayout>;
}
