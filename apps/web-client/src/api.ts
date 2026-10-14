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

export type Role = 'OWNER' | 'ACCOUNTANT' | 'WORKSHOP';
export type User = { id: string; email: string; name: string; role: Role; roleLabel: string; permissions?: { entities: string[] | '*'; actions: string[] | '*' } };
export type RecordRow = Record<string, unknown> & { id: string; status?: string; syncStatus?: string };
export const messageOf = (error: unknown) => {
  if (axios.isAxiosError(error)) return String(error.response?.data?.error || error.message || 'Không thể kết nối máy chủ.');
  return error instanceof Error ? error.message : 'Đã có lỗi xảy ra.';
};
export const getRecords = async <T = RecordRow>(entity: string) => (await api.get<T[]>(`/${entity}`)).data;
export const createRecord = async <T = RecordRow>(entity: string, data: object) => (await api.post<T>(`/${entity}`, data)).data;
export const updateRecord = async <T = RecordRow>(entity: string, id: string, data: object) => (await api.put<T>(`/${entity}/${id}`, data)).data;
export const actionRecord = async <T = RecordRow>(entity: string, id: string, action: string, data: object = {}) => (await api.post<T>(`/${entity}/${id}/actions/${action}`, data)).data;
export const formatVnd = (value: unknown) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(value || 0));
export const formatDate = (value: unknown) => value ? new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(String(value))) : '—';
export const statusLabel = (status: unknown) => ({
  ACTIVE: 'Đang hoạt động', DRAFT: 'Bản nháp', PENDING_APPROVAL: 'Chờ duyệt', APPROVED: 'Đã duyệt', REJECTED: 'Từ chối', SENT: 'Đã gửi', ACCEPTED: 'Đã chấp nhận', IN_PROGRESS: 'Đang thực hiện', COMPLETED: 'Hoàn thành', SAVED: 'Đã lưu', DEMO_CODE_ISSUED: 'Đã mô phỏng cấp mã', REVIEW_REQUIRED: 'Chờ rà soát', NEEDS_REVIEW: 'Cần rà soát', CONFIRMED: 'Đã xác nhận', OPEN: 'Đang mở', RESOLVED: 'Đã xử lý', MATCHED: 'Khớp', PARTIAL: 'Khớp một phần', MISMATCH: 'Lệch', UNRESOLVED: 'Chưa đối soát', LOCKED: 'Đã khóa', REVIEWED: 'Đã rà soát', CANCELLED: 'Đã hủy', REVIEW_REQUIRED_TAX: 'Chờ rà soát quy tắc', ALLOCATED: 'Đã phân bổ', PAID: 'Đã thanh toán', UNPAID: 'Chưa thanh toán',
} as Record<string, string>)[String(status || '')] || String(status || 'Chưa phân loại');
