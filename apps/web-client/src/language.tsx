import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Language = 'vi' | 'en';

export interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (text: string) => string;
  isEn: boolean;
  isVi: boolean;
}

const STORAGE_KEY = 'fintax_lang';

export const translations: Record<string, Record<Language, string>> = {
  // Navigation & Sections
  'Tổng quan': { vi: 'Tổng quan', en: 'Overview' },
  'Tiền & Thuế': { vi: 'Tiền & Thuế', en: 'Finance & Tax' },
  'Xưởng & Kho': { vi: 'Xưởng & Kho', en: 'Workshop & Inventory' },
  'Khách & NCC': { vi: 'Khách & NCC', en: 'Partners & Suppliers' },
  'Cài đặt': { vi: 'Cài đặt', en: 'Settings' },
  'Bàn làm việc': { vi: 'Bàn làm việc', en: 'Dashboard' },
  'Thu chi': { vi: 'Thu chi', en: 'Cashflow' },
  'Ai nợ ai': { vi: 'Ai nợ ai', en: 'Debts & Receivables' },
  'Khớp ngân hàng': { vi: 'Khớp ngân hàng', en: 'Bank Reconciliation' },
  'Khớp với ngân hàng': { vi: 'Khớp với ngân hàng', en: 'Bank Reconciliation' },
  'Hóa đơn': { vi: 'Hóa đơn', en: 'Invoices' },
  'Thuế & 7 Sổ sách': { vi: 'Thuế & 7 Sổ sách', en: 'Tax & Accounting Books' },
  'Thuế và 7 sổ sách': { vi: 'Thuế và 7 sổ sách', en: 'Tax & Accounting Books' },
  'Báo giá': { vi: 'Báo giá', en: 'Quotations' },
  'Sản phẩm & vật tư': { vi: 'Sản phẩm & vật tư', en: 'Products & Materials' },
  'Việc làm trong xưởng': { vi: 'Việc làm trong xưởng', en: 'Workshop Orders' },
  'Quản lý kho': { vi: 'Quản lý kho', en: 'Inventory' },
  'Khách hàng': { vi: 'Khách hàng', en: 'Customers' },
  'Người bán / NCC': { vi: 'Người bán / NCC', en: 'Suppliers & Vendors' },
  'Người bán': { vi: 'Người bán', en: 'Suppliers' },
  'Cài đặt hệ thống': { vi: 'Cài đặt hệ thống', en: 'System Settings' },

  // Settings Tabs
  'Hồ sơ xưởng': { vi: 'Hồ sơ xưởng', en: 'Workshop Profile' },
  'Tài khoản tiền': { vi: 'Tài khoản tiền', en: 'Bank & Cash' },
  'Người dùng': { vi: 'Người dùng', en: 'Users' },
  'Ai được làm gì': { vi: 'Ai được làm gì', en: 'Role Permissions' },
  'Tự phân loại thu chi': { vi: 'Tự phân loại thu chi', en: 'Auto-Classification' },
  'Mức thuế': { vi: 'Mức thuế', en: 'Tax Rates' },
  'Kết nối': { vi: 'Kết nối', en: 'Integrations' },
  'Lịch sử thao tác': { vi: 'Lịch sử thao tác', en: 'Audit Logs' },
  'Ngôn ngữ': { vi: 'Ngôn ngữ', en: 'Language' },
  'Ngôn ngữ & Giao diện': { vi: 'Ngôn ngữ & Giao diện', en: 'Language & Preferences' },

  // Header & Profile
  'Đăng xuất': { vi: 'Đăng xuất', en: 'Sign Out' },
  'Tìm kiếm...': { vi: 'Tìm kiếm...', en: 'Search...' },
  'Mở tìm kiếm': { vi: 'Mở tìm kiếm', en: 'Open search' },
  'Trung tâm thông báo': { vi: 'Trung tâm thông báo', en: 'Notification center' },
  'Hiện menu con': { vi: 'Hiện menu con', en: 'Show submenu' },
  'Ẩn menu con (Toàn màn hình)': { vi: 'Ẩn menu con (Toàn màn hình)', en: 'Hide submenu (Full width)' },
  'Mở menu di động': { vi: 'Mở menu di động', en: 'Open mobile menu' },
  'Đóng điều hướng': { vi: 'Đóng điều hướng', en: 'Close navigation' },

  // Common Actions & Buttons
  'Thêm mới': { vi: 'Thêm mới', en: 'Add New' },
  'Lưu': { vi: 'Lưu', en: 'Save' },
  'Lưu thông tin': { vi: 'Lưu thông tin', en: 'Save Details' },
  'Hủy': { vi: 'Hủy', en: 'Cancel' },
  'Đóng': { vi: 'Đóng', en: 'Close' },
  'Sửa': { vi: 'Sửa', en: 'Edit' },
  'Chi tiết': { vi: 'Chi tiết', en: 'Details' },
  'Làm mới': { vi: 'Làm mới', en: 'Refresh' },
  'Đổi mật khẩu': { vi: 'Đổi mật khẩu', en: 'Change Password' },
  'Xuất Excel (.xlsx)': { vi: 'Xuất Excel (.xlsx)', en: 'Export Excel (.xlsx)' },
  'Gán vào hóa đơn': { vi: 'Gán vào hóa đơn', en: 'Allocate to invoice' },
  'Đầu kỳ': { vi: 'Đầu kỳ', en: 'Opening balance' },
  'Mở khóa kỳ': { vi: 'Mở khóa kỳ', en: 'Unlock Period' },
  'Khóa kỳ': { vi: 'Khóa kỳ', en: 'Lock Period' },
  'Khôi phục mặc định': { vi: 'Khôi phục mặc định', en: 'Reset to Defaults' },
  'Lưu quyền': { vi: 'Lưu quyền', en: 'Save Permissions' },
  'Thêm người dùng': { vi: 'Thêm người dùng', en: 'Add User' },

  // DataTable & Pagination
  'STT': { vi: 'STT', en: 'No.' },
  'Hiển thị': { vi: 'Hiển thị', en: 'Showing' },
  'trên': { vi: 'trên', en: 'of' },
  'bản ghi': { vi: 'bản ghi', en: 'records' },
  'dòng': { vi: 'dòng', en: 'rows' },
  'Đầu': { vi: 'Đầu', en: 'First' },
  'Trước': { vi: 'Trước', en: 'Prev' },
  'Tiếp': { vi: 'Tiếp', en: 'Next' },
  'Cuối': { vi: 'Cuối', en: 'Last' },
  'Tất cả trạng thái': { vi: 'Tất cả trạng thái', en: 'All Statuses' },
  'Tất cả loại': { vi: 'Tất cả loại', en: 'All Types' },
  'Chưa có gì ở đây': { vi: 'Chưa có gì ở đây', en: 'Nothing here yet' },
  'Bấm nút thêm ở góc trên để bắt đầu.': { vi: 'Bấm nút thêm ở góc trên để bắt đầu.', en: 'Click the button above to get started.' },
  'Đang tải…': { vi: 'Đang tải…', en: 'Loading…' },
  'ESC hoặc dấu X để đóng': { vi: 'ESC hoặc dấu X để đóng', en: 'Press ESC or click X to close' },
  'Màn hình trượt ghi sổ nghiệp vụ': { vi: 'Màn hình trượt ghi sổ nghiệp vụ', en: 'Transaction drawer panel' },

  // Settings Descriptions
  'Thông tin xưởng, tài khoản tiền, người dùng và kết nối.': {
    vi: 'Thông tin xưởng, tài khoản tiền, người dùng và kết nối.',
    en: 'Workshop details, bank accounts, team members, integrations and display settings.'
  },
  'Cài đặt ngôn ngữ hiển thị': {
    vi: 'Cài đặt ngôn ngữ hiển thị',
    en: 'Display Language Settings'
  },
  'Thay đổi ngôn ngữ giao diện người dùng. Cài đặt được lưu trực tiếp trên trình duyệt của bạn (FE).': {
    vi: 'Thay đổi ngôn ngữ giao diện người dùng. Cài đặt được lưu trực tiếp trên trình duyệt của bạn (FE).',
    en: 'Change interface language. Settings are stored directly in your browser local storage (FE).'
  },
  'Tiếng Việt (Việt Nam)': { vi: 'Tiếng Việt (Việt Nam)', en: 'Vietnamese (Tiếng Việt)' },
  'English (United States)': { vi: 'English (United States)', en: 'English (Tiếng Anh)' },
  'Giao diện Tiếng Việt chuẩn theo hóa đơn, thuế và chế độ kế toán Việt Nam.': {
    vi: 'Giao diện Tiếng Việt chuẩn theo hóa đơn, thuế và chế độ kế toán Việt Nam.',
    en: 'Standard Vietnamese interface tailored for Vietnam tax, invoicing, and accounting regulations.'
  },
  'English interface for management, accounting terms, and foreign collaborators.': {
    vi: 'Giao diện Tiếng Anh dành cho quản trị quốc tế và cộng tác viên nước ngoài.',
    en: 'English interface for management, accounting terms, and foreign collaborators.'
  },
  'Đang kích hoạt': { vi: 'Đang kích hoạt', en: 'Active' },
  'Chọn ngôn ngữ này': { vi: 'Chọn ngôn ngữ này', en: 'Select this language' },
  'Đã chuyển sang Tiếng Việt': { vi: 'Đã chuyển sang Tiếng Việt', en: 'Switched to Vietnamese' },
  'Đã chuyển sang Tiếng Anh': { vi: 'Đã chuyển sang Tiếng Anh', en: 'Switched to English' }
};

export function getStoredLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'vi') return saved;
  } catch {
    // ignore
  }
  return 'vi';
}

const LanguageContext = createContext<LanguageContextValue>({
  language: 'vi',
  setLanguage: () => undefined,
  t: (text: string) => text,
  isEn: false,
  isVi: true,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(getStoredLanguage);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
      document.documentElement.lang = lang;
      window.dispatchEvent(new CustomEvent('fintax:language-change', { detail: lang }));
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    document.documentElement.lang = language;
    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY && (event.newValue === 'vi' || event.newValue === 'en')) {
        setLanguageState(event.newValue);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [language]);

  const t = (text: string): string => {
    if (!text) return '';
    const match = translations[text];
    if (match) return match[language] || text;
    return text;
  };

  const value: LanguageContextValue = {
    language,
    setLanguage,
    t,
    isEn: language === 'en',
    isVi: language === 'vi',
  };

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}
