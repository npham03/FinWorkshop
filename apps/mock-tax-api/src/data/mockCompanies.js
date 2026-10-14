/**
 * Mock database for Vietnamese Tax Authority (Tổng cục Thuế)
 */
export const MOCK_COMPANIES = {
  // Công ty bình thường, đang hoạt động
  '0101234567': {
    taxCode: '0101234567',
    name: 'CÔNG TY TNHH CƠ KHÍ & THÉP HÀ NỘI',
    status: 'ACTIVE',
    statusDescription: 'NNT đang hoạt động (đã được cấp GCN ĐKT)',
    address: 'Số 123 Đường Giải Phóng, Phường Đồng Tâm, Quận Hai Bà Trưng, Hà Nội',
    legalRepresentative: 'Nguyễn Văn Hùng',
    taxOffice: 'Chi cục Thuế Quận Hai Bà Trưng',
  },
  '0317894561': {
    taxCode: '0317894561',
    name: 'CÔNG TY TNHH VẬT TƯ GỖ NAM PHÁT',
    status: 'ACTIVE',
    statusDescription: 'NNT đang hoạt động (đã được cấp GCN ĐKT)',
    address: '456 Lê Trọng Tấn, Phường Tây Thạnh, Quận Tân Phú, TP. Hồ Chí Minh',
    legalRepresentative: 'Trần Thị Mai',
    taxOffice: 'Chi cục Thuế Quận Tân Phú',
  },

  // Công ty rủi ro cao: NGỪNG HOẠT ĐỘNG (Dùng để test US02 Cảnh báo rủi ro hóa đơn đầu vào)
  '0309999999': {
    taxCode: '0309999999',
    name: 'CÔNG TY TNHH THƯƠNG MẠI & DỊCH VỤ MA ÁNH DƯƠNG',
    status: 'SUSPENDED',
    statusDescription: 'NNT ngừng hoạt động nhưng chưa hoàn thành thủ tục đóng MST (Bỏ địa chỉ kinh doanh)',
    address: '789 Đường Kép, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh',
    legalRepresentative: 'Lê Văn Trốn',
    taxOffice: 'Chi cục Thuế Quận 1',
    suspensionDate: '2024-03-15',
  },

  // Công ty đã đóng MST
  '0108888888': {
    taxCode: '0108888888',
    name: 'CÔNG TY CỔ PHẦN CUNG ỨNG NGUYÊN LIỆU PHƯƠNG ĐÔNG',
    status: 'CLOSED',
    statusDescription: 'NNT đã đóng mã số thuế',
    address: '12 Hoàng Hoa Thám, Quận Ba Đình, Hà Nội',
    legalRepresentative: 'Phạm Quốc Bảo',
    taxOffice: 'Cục Thuế Thành phố Hà Nội',
    closeDate: '2023-11-20',
  },
};
