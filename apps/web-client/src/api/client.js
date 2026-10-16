import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach JWT token automatically
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('finworkshop_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Global response handler
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      localStorage.removeItem('finworkshop_token');
      localStorage.removeItem('finworkshop_user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  login: async (credentials) => {
    const { data } = await apiClient.post('/auth/login', credentials);
    return data;
  },
  register: async (userData) => {
    const { data } = await apiClient.post('/auth/register', userData);
    return data;
  },
  getMe: async () => {
    const { data } = await apiClient.get('/auth/me');
    return data;
  },
};

export const cashflowApi = {
  create: async (txData) => {
    const { data } = await apiClient.post('/cashflow', txData);
    return data;
  },
  list: async (params = {}) => {
    const { data } = await apiClient.get('/cashflow', { params });
    return data;
  },
};

export const invoiceApi = {
  create: async (invData) => {
    const { data } = await apiClient.post('/invoices', invData);
    return data;
  },
  list: async (params = {}) => {
    const { data } = await apiClient.get('/invoices', { params });
    return data;
  },
};

export const taxApi = {
  checkMst: async (mst) => {
    const { data } = await apiClient.get(`/tax/check-mst/${mst}`);
    return data;
  },
};

export const dashboardApi = {
  getSummary: async () => {
    const { data } = await apiClient.get('/dashboard/summary');
    return data;
  },
};
