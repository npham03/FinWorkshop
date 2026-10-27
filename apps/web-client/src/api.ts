import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
export const api = axios.create({ baseURL, timeout: 15000 });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('fintax_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
api.interceptors.response.use((response) => response, (error) => {
  if (error.response?.status === 401 && !String(error.config?.url || '').includes('/auth/login')) {
    localStorage.removeItem('fintax_token');
    localStorage.removeItem('fintax_user');
    window.dispatchEvent(new Event('fintax:unauthorized'));
  }
  return Promise.reject(error);
});

export type Role = 'OWNER' | 'ACCOUNTANT' | 'WAREHOUSE' | 'WORKSHOP';
export type User = {
  id: string;
  email: string;
  name: string;
  role: Role;
  roleLabel: string;
  workshopId?: string;
  workshopName?: string;
  permissions?: { entities: string[] | '*'; actions: string[] | '*' };
};
export type RecordRow = Record<string, unknown> & { id: string; status?: string; syncStatus?: string };
export const messageOf = (error: unknown) => {
  if (axios.isAxiosError(error)) return String(error.response?.data?.error || error.message || 'Không thể kết nối máy chủ.');
  return error instanceof Error ? error.message : 'Đã có lỗi xảy ra.';
};
export const getRecords = async <T = RecordRow>(entity: string) => (await api.get<T[]>(`/${entity}`)).data;
export const createRecord = async <T = RecordRow>(entity: string, data: object) => (await api.post<T>(`/${entity}`, data)).data;
export const updateRecord = async <T = RecordRow>(entity: string, id: string, data: object) => (await api.put<T>(`/${entity}/${id}`, data)).data;
export const actionRecord = async <T = RecordRow>(entity: string, id: string, action: string, data: object = {}) => (await api.post<T>(`/${entity}/${id}/actions/${action}`, data)).data;
export { formatMoney as formatVnd, vietnamDate as formatDate, displayLabel as statusLabel } from './presentation';

export const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
