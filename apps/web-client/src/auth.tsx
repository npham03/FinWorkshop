import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, type User } from './api';

type AuthContextValue = { user: User | null; loading: boolean; login: (email: string, password: string) => Promise<void>; logout: () => void };
const AuthContext = createContext<AuthContextValue | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    try { const cached = localStorage.getItem('fintax_user'); return cached ? JSON.parse(cached) as User : null; } catch { return null; }
  });
  const [loading, setLoading] = useState(Boolean(localStorage.getItem('fintax_token')));
  const logout = () => { localStorage.removeItem('fintax_token'); localStorage.removeItem('fintax_user'); setUser(null); };
  useEffect(() => {
    const handleExpired = () => setUser(null);
    window.addEventListener('fintax:unauthorized', handleExpired);
    if (localStorage.getItem('fintax_token')) {
      api.get('/auth/me').then(({ data }) => { setUser(data.user); localStorage.setItem('fintax_user', JSON.stringify(data.user)); }).catch(logout).finally(() => setLoading(false));
    }
    return () => window.removeEventListener('fintax:unauthorized', handleExpired);
  }, []);
  const login = async (email: string, password: string) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('fintax_token', data.token);
    localStorage.setItem('fintax_user', JSON.stringify(data.user));
    setUser(data.user);
  };
  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth phải nằm trong AuthProvider');
  return context;
}
