// Sources and applicability are retained with each rule; these are selectable demo rules.
export const taxRules = [
  ['HKD_DISTRIBUTE', 'HKD phân phối hàng hóa', 1, 0.5],
  ['HKD_MANUFACTURE', 'HKD sản xuất, vận tải, xây dựng có vật tư', 3, 1.5],
  ['HKD_SERVICE', 'HKD dịch vụ không bao thầu vật tư', 5, 2],
  ['HKD_LEASE', 'HKD cho thuê tài sản', 5, 5],
  ['HKD_OTHER', 'HKD hoạt động khác', 2, 1],
  ['HKD_MANUFACTURE_REDUCED', 'HKD sản xuất đủ điều kiện giảm VAT', 2.4, 1.5],
  ['HKD_SERVICE_REDUCED', 'HKD dịch vụ đủ điều kiện giảm VAT', 4, 2],
].map(([code, name, vatRate, pitRate]) => ({ code, name, vatRate, pitRate, taxMode: 'HKD_REVENUE', taxRate: vatRate + pitRate, taxTreatment: 'REVENUE_TAX_ESTIMATE', effectiveFrom: '2021-08-01', effectiveTo: code.endsWith('REDUCED') ? '2026-12-31' : '', legalReference: 'TT40/2021/TT-BTC; đối chiếu NĐ68/2026/NĐ-CP và quy định chuyển tiếp cho kỳ 2026', sourceUrl: 'https://datafiles.chinhphu.vn/cpp/files/vbpq/2026/3/68-ndcp.signed.pdf', notes: 'Tỷ lệ GTGT/TNCN trên doanh thu, không phải VAT khấu trừ. Cần xác nhận phương pháp, ngưỡng doanh thu và kỳ áp dụng; không tự xác định nghĩa vụ thuế.' })).concat([
  ['VAT_0', 'GTGT 0% — xuất khẩu đủ điều kiện', 0, 'ZERO_RATED'],
  ['VAT_5', 'GTGT 5% — nhóm hàng đủ điều kiện', 5, 'VAT'],
  ['VAT_8', 'GTGT 8% — đủ điều kiện giảm 2%', 8, 'VAT'],
  ['VAT_10', 'GTGT 10% — mức thông thường/nhóm loại trừ', 10, 'VAT'],
  ['VAT_EXEMPT', 'Không chịu thuế GTGT (KCT)', 0, 'EXEMPT'],
].map(([code, name, vatRate, taxTreatment]) => ({ code, name, vatRate, pitRate: 0, taxRate: vatRate, taxMode: 'VAT_CREDIT', taxTreatment, effectiveFrom: '2025-07-01', effectiveTo: code === 'VAT_8' ? '2026-12-31' : '', legalReference: 'Luật 48/2024/QH15; NĐ174/2025/NĐ-CP; phân loại theo phụ lục và hồ sơ thực tế', sourceUrl: 'https://congbao.chinhphu.vn/van-ban/nghi-dinh-so-174-2025-nd-cp-45374.htm', notes: code === 'VAT_8' ? 'Chỉ áp dụng khi không thuộc danh mục loại trừ. Sản phẩm kim loại không mặc định hưởng 8%.' : '0% khác không chịu thuế; phải đáp ứng điều kiện và chứng từ tương ứng.' })));

export const catalog = [
  ['materials', 'MAT-STL-SS400', 'Thép tấm SS400', 'kg', 22000, 'VAT_10'],
  ['materials', 'MAT-INX-304', 'Inox 304 tấm 1.2–3 mm', 'kg', 68000, 'VAT_10'],
  ['materials', 'MAT-WOD-MDF17', 'MDF chống ẩm phủ Melamine', 'tấm', 650000, 'VAT_8'],
  ['materials', 'MAT-PNT', 'Sơn tĩnh điện', 'kg', 95000, 'VAT_8'],
  ['materials', 'MAT-GRIND', 'Đá cắt và đá mài', 'cái', 18000, 'VAT_8'],
  ['materials', 'MAT-WELD', 'Que hàn', 'kg', 45000, 'VAT_10'],
  ['materials', 'MAT-ARGON', 'Khí Argon', 'bình', 450000, 'VAT_8'],
  ['materials', 'MAT-HDW', 'Bulong, ốc vít kim loại', 'kg', 55000, 'VAT_10'],
  ['materials', 'EXP-ELEC', 'Điện sản xuất', 'kWh', 2500, 'VAT_8'],
  ['materials', 'EXP-WATER', 'Nước sạch sản xuất', 'm³', 15000, 'VAT_5'],
  ['materials', 'EXP-TRUCK', 'Vận tải hàng hóa', 'chuyến', 1800000, 'VAT_8'],
  ['materials', 'EXP-TELECOM', 'Internet và viễn thông', 'tháng', 400000, 'VAT_10'],
  ['materials', 'EXP-RENT', 'Thuê nhà xưởng', 'tháng', 15000000, 'VAT_10'],
  ['products', 'PRD-CAB', 'Tủ điện công nghiệp bằng kim loại', 'bộ', 5500000, 'VAT_10'],
  ['products', 'PRD-TBL', 'Bàn thao tác công nghiệp', 'bộ', 3500000, 'VAT_10'],
  ['products', 'PRD-RCK', 'Kệ kho bằng thép', 'bộ', 4500000, 'VAT_10'],
  ['products', 'SVC-CNC', 'Dịch vụ cắt Laser CNC không vật tư', 'giờ', 400000, 'VAT_8'],
  ['products', 'SVC-MAINT', 'Dịch vụ bảo trì máy móc', 'giờ', 350000, 'VAT_8'],
  ['products', 'PRD-EXPORT', 'Linh kiện xuất khẩu — hồ sơ đủ điều kiện', 'bộ', 2000000, 'VAT_0'],
  ['products', 'SVC-SOFT', 'Phần mềm quản trị sản xuất', 'gói', 5000000, 'VAT_EXEMPT'],
];
