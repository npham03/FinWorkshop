import {lazy,Suspense,useEffect} from 'react';
import {Route,Routes,useLocation} from 'react-router-dom';
import {ForgotPasswordPage,LoginPage,RegisterPage,ResetPasswordPage} from './AuthPages';
import {ToastProvider} from './components';
import LandingPage from './LandingPage';
const Portal=lazy(()=>import('./Portal'));
export default function App(){const {pathname}=useLocation();useEffect(()=>{const title=({'/login':'Đăng nhập','/register':'Đăng ký tài khoản','/forgot-password':'Khôi phục mật khẩu','/reset-password':'Đặt lại mật khẩu'} as Record<string,string>)[pathname];if(title)document.title=`${title} · FinWorkshop`;},[pathname]);return <ToastProvider><Suspense fallback={<div role="status" className="flex min-h-screen items-center justify-center bg-canvas text-sm text-muted">Đang mở không gian làm việc…</div>}><Routes><Route path="/" element={<LandingPage/>}/><Route path="/login" element={<LoginPage/>}/><Route path="/register" element={<RegisterPage/>}/><Route path="/forgot-password" element={<ForgotPasswordPage/>}/><Route path="/reset-password" element={<ResetPasswordPage/>}/><Route path="/*" element={<Portal/>}/></Routes></Suspense></ToastProvider>;}
