import {lazy,Suspense,useEffect} from 'react';
import {Route,Routes,useLocation} from 'react-router-dom';
import {ForgotPasswordPage,LoginPage,RegisterPage,ResetPasswordPage} from './AuthPages';
import {ToastProvider} from './components';
import LandingPage from './LandingPage';
import MarketingLayout from './marketing/MarketingLayout';
const Portal=lazy(()=>import('./Portal'));
const MarketingPage=lazy(()=>import('./marketing/MarketingPages'));
const publicPages: Record<string,string> = {
  '/san-pham':'san-pham', '/giai-phap/san-xuat':'giai-phap-san-xuat',
  '/giai-phap/ke-toan':'giai-phap-ke-toan', '/trien-khai':'trien-khai',
  '/tai-lieu':'tai-lieu', '/lien-he':'lien-he', '/demo':'demo',
  '/bao-mat':'bao-mat', '/dieu-khoan':'dieu-khoan',
};
export default function App(){
  const {pathname}=useLocation();
  useEffect(()=>{
    const title=({'/login':'Đăng nhập','/register':'Đăng ký tài khoản','/forgot-password':'Khôi phục mật khẩu','/reset-password':'Đặt lại mật khẩu'} as Record<string,string>)[pathname];
    if(title) document.title=`${title} · FinWorkshop`;
  },[pathname]);
  return <ToastProvider><Suspense fallback={<div role="status" className="flex min-h-screen items-center justify-center bg-canvas text-sm text-muted">Đang mở trang…</div>}>
    <Routes>
      <Route path="/" element={<MarketingLayout><LandingPage/></MarketingLayout>}/>
      {Object.entries(publicPages).map(([path,page])=><Route key={path} path={path} element={<MarketingLayout><MarketingPage page={page}/></MarketingLayout>}/>)}
      <Route path="/login" element={<LoginPage/>}/><Route path="/register" element={<RegisterPage/>}/>
      <Route path="/forgot-password" element={<ForgotPasswordPage/>}/><Route path="/reset-password" element={<ResetPasswordPage/>}/>
      <Route path="/*" element={<Portal/>}/>
    </Routes>
  </Suspense></ToastProvider>;
}
