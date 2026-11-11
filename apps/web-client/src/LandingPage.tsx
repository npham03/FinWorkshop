import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Check, ChevronDown, FileText, Package, Factory, Wallet } from 'lucide-react';

const processes = [
  { label: 'Báo giá', code: '01', copy: 'Xây dựng giá từ vật tư, nhân công và chi phí máy.', to: '/giai-phap/san-xuat' },
  { label: 'Sản xuất', code: '02', copy: 'Chuyển đơn đã chốt thành lệnh và phân công công việc.', to: '/giai-phap/san-xuat' },
  { label: 'Kho & giá thành', code: '03', copy: 'Ghi nhận xuất dùng, vật tư trả lại và thành phẩm.', to: '/san-pham' },
  { label: 'Tài chính', code: '04', copy: 'Liên kết hóa đơn, thanh toán và khoản còn phải thu.', to: '/giai-phap/ke-toan' },
];
const questions = [
  ['Có thể trải nghiệm trước khi tạo doanh nghiệp không?', 'Có. Trang Trải nghiệm sản phẩm cho phép chọn vai trò và đăng nhập vào ứng dụng với dữ liệu mẫu. Bạn có thể xem các phân hệ thực tế trước khi tạo không gian dữ liệu riêng.'],
  ['FinWorkshop dành cho những công việc nào?', 'Hệ thống phục vụ xưởng sản xuất và doanh nghiệp nhỏ cần quản lý báo giá, định mức vật tư, lệnh sản xuất, kho, chứng từ và dòng tiền. Phạm vi cụ thể cần được đối chiếu với quy trình của đơn vị trước khi triển khai.'],
  ['Dữ liệu Excel và Odoo được sử dụng như thế nào?', 'Ứng dụng hỗ trợ xem trước và nhập sao kê CSV/XLSX, xuất các danh sách và báo cáo ra Excel. Tích hợp Odoo cần cấu hình công ty, danh mục, tài khoản và tiền tệ; các tác vụ chưa đồng bộ được theo dõi riêng.'],
  ['Phiên bản này đã kết nối thuế và ngân hàng thật chưa?', 'Chưa. Mã hóa đơn hiện được mô phỏng; chưa ký số, phát hành hóa đơn thật, nộp thuế hoặc kết nối trực tiếp ngân hàng. Các nội dung kế toán và thuế cần được người có chuyên môn rà soát trước khi sử dụng chính thức.'],
];

export default function LandingPage() {
  const [preview, setPreview] = useState<'dashboard' | 'production' | 'invoices'>('dashboard');
  const [faq, setFaq] = useState<number | null>(0);
  const views = [
    { id: 'dashboard' as const, label: 'Tổng quan điều hành', source: '/media/finworkshop-dashboard.png', alt: 'Bàn làm việc thật của FinWorkshop với dòng tiền, chỉ tiêu và công việc cần xử lý' },
    { id: 'production' as const, label: 'Quản lý sản xuất', source: '/media/finworkshop-production.png', alt: 'Danh sách lệnh sản xuất và thao tác công việc trong FinWorkshop' },
    { id: 'invoices' as const, label: 'Hóa đơn & công nợ', source: '/media/finworkshop-invoices.png', alt: 'Danh sách hóa đơn thật của FinWorkshop với trạng thái và số tiền' },
  ];
  const selected = views.find(v => v.id === preview)!;
  return <>
    <section className="fw-hero fw-container">
      <div className="fw-hero-heading">
        <div><p className="fw-eyebrow"><span />HỆ THỐNG QUẢN TRỊ CHO DOANH NGHIỆP SẢN XUẤT</p><h1>Vận hành xưởng.<br /><span>Kiểm soát tài chính.</span></h1></div>
        <div className="fw-hero-intro"><p>Kết nối báo giá, sản xuất, kho và kế toán trong cùng một hệ thống. Theo dõi công việc từ đơn hàng đến thanh toán, với hồ sơ để đối chiếu tại mỗi bước.</p>
          <div className="fw-action-row"><Link className="fw-btn fw-btn-primary" to="/demo">Trải nghiệm sản phẩm <ArrowRight size={17} /></Link><Link className="fw-text-link" to="/san-pham">Tìm hiểu nền tảng <ArrowUpRight size={16} /></Link></div>
          <p className="fw-hero-note">Ứng dụng thực tế. Dữ liệu trình diễn. Không cần tạo doanh nghiệp để xem thử.</p></div>
      </div>
      <div className="fw-product-showcase">
        <div className="fw-showcase-side"><p className="fw-eyebrow">KHÔNG GIAN LÀM VIỆC</p><h2>Từ từng nghiệp vụ.<br />Đến một bức tranh chung.</h2><p>Chọn một màn hình để xem giao diện đang có trong sản phẩm.</p>
          <div className="fw-preview-tabs" role="tablist" aria-label="Màn hình sản phẩm">
            {views.map((view, i) => <button key={view.id} type="button" role="tab" id={'fw-tab-' + view.id} aria-controls="fw-preview-panel" aria-selected={preview === view.id} tabIndex={preview === view.id ? 0 : -1}
              onClick={() => setPreview(view.id)} onKeyDown={event => {
                if (!['ArrowDown','ArrowUp','ArrowRight','ArrowLeft','Home','End'].includes(event.key)) return;
                event.preventDefault();
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? views.length - 1 : (i + (['ArrowDown','ArrowRight'].includes(event.key) ? 1 : -1) + views.length) % views.length;
                setPreview(views[next].id); document.getElementById('fw-tab-' + views[next].id)?.focus();
              }}><span>0{i + 1}</span>{view.label}<ArrowUpRight size={16} /></button>)}
          </div>
          <Link className="fw-text-link" to="/san-pham">Xem toàn bộ chức năng <ArrowRight size={15} /></Link>
        </div>
        <div className="fw-showcase-visual">
          <div className="fw-preview-caption"><span><i />Giao diện ứng dụng</span><span>Dữ liệu trình diễn</span></div>
          <div role="tabpanel" id="fw-preview-panel" aria-labelledby={'fw-tab-' + preview} className="fw-preview-image"><img src={selected.source} alt={selected.alt} width="1440" height="1028" /></div>
          <div className="fw-preview-bottom"><span>FINWORKSHOP / {selected.label}</span><Link to="/demo">Mở và thao tác trực tiếp <ArrowUpRight size={14} /></Link></div>
        </div>
      </div>
    </section>
    <section className="fw-value-strip"><div className="fw-container fw-value-strip-grid">
      {[
        ['Theo đơn hàng', 'Báo giá đến hoàn thành sản xuất', FileText], ['Theo vật tư', 'Nhập, xuất và giá trị tồn kho', Package],
        ['Theo chứng từ', 'Hóa đơn và các lần thanh toán', Wallet], ['Theo trách nhiệm', 'Chủ xưởng, kế toán, kho và thợ', Factory],
      ].map(([title, copy, Icon]) => { const I = Icon as typeof FileText; return <div key={String(title)}><I size={21} strokeWidth={1.5} aria-hidden="true" /><span><strong>{String(title)}</strong><small>{String(copy)}</small></span></div>; })}
    </div></section>
    <section className="fw-container fw-section">
      <div className="fw-section-heading"><div><p className="fw-eyebrow">QUY TRÌNH LIÊN KẾT</p><h2 className="fw-section-title">Công việc có đầu vào.<br />Số liệu có nguồn đối chiếu.</h2></div><p className="fw-section-summary">Thay vì xử lý từng phần trên những bảng tính tách rời, liên kết hồ sơ qua các bước để mỗi bộ phận có đủ thông tin cho công việc tiếp theo.</p></div>
      <div className="fw-process-grid">{processes.map(process => <Link key={process.code} to={process.to} className="fw-process-item"><span className="fw-process-code">{process.code}<ArrowUpRight size={17} /></span><h3>{process.label}</h3><p>{process.copy}</p></Link>)}</div>
    </section>
    <section className="fw-solutions-section"><div className="fw-container fw-section">
      <div className="fw-section-heading"><div><p className="fw-eyebrow">GIẢI PHÁP THEO CÔNG VIỆC</p><h2 className="fw-section-title">Đúng thông tin.<br />Đúng người sử dụng.</h2></div><Link className="fw-text-link" to="/trien-khai">Tìm hiểu phạm vi triển khai <ArrowRight size={16} /></Link></div>
      <div className="fw-solutions-grid">
        <article className="fw-solution-block"><span className="fw-section-number">01 / SẢN XUẤT & KHO</span><h3>Lập kế hoạch có định mức.<br />Thực hiện có ghi nhận.</h3><p>Từ cấu thành vật tư và chi phí dự kiến đến phân công, giờ công và nhập thành phẩm. Hồ sơ theo lệnh giúp đối chiếu kế hoạch với thực tế.</p><ul>{['Báo giá và phiên bản được lưu lại', 'BOM, vật tư và chi phí theo lệnh', 'Tiến độ, giờ công và biến động kho'].map(text => <li key={text}><Check size={15} />{text}</li>)}</ul><Link className="fw-text-link" to="/giai-phap/san-xuat">Giải pháp quản lý sản xuất <ArrowRight size={16} /></Link></article>
        <article className="fw-solution-block"><span className="fw-section-number">02 / TÀI CHÍNH & KẾ TOÁN</span><h3>Theo dõi từng khoản tiền.<br />Đối chiếu từng chứng từ.</h3><p>Quản lý hóa đơn mua bán, phiếu thu chi và các lần phân bổ. Tổng hợp công nợ và báo cáo để biết số dư được hình thành từ đâu.</p><ul>{['Tách hóa đơn mua vào và bán ra', 'Theo dõi phải thu, phải trả và tất toán', 'Sao kê, đối soát và báo cáo Excel'].map(text => <li key={text}><Check size={15} />{text}</li>)}</ul><Link className="fw-text-link" to="/giai-phap/ke-toan">Giải pháp tài chính & kế toán <ArrowRight size={16} /></Link></article>
      </div>
    </div></section>
    <section className="fw-container fw-section fw-deployment">
      <div><p className="fw-eyebrow">TRIỂN KHAI THEO PHẠM VI</p><h2 className="fw-section-title">Bắt đầu từ quy trình<br />của doanh nghiệp.</h2><p className="fw-section-summary">Xác định mô hình hoạt động, dữ liệu cần chuyển và trách nhiệm của từng bộ phận trước khi đưa hệ thống vào sử dụng.</p><Link className="fw-btn fw-btn-secondary" to="/trien-khai">Xem các bước triển khai <ArrowRight size={16} /></Link></div>
      <ol className="fw-deployment-list">{[
        ['Xác định nhu cầu', 'Đối chiếu quy trình bán hàng, sản xuất, kho và kế toán.'],
        ['Chuẩn bị dữ liệu', 'Danh mục, định mức, số dư đầu kỳ và người phụ trách.'],
        ['Cấu hình & kiểm thử', 'Phân quyền, kết nối cần thiết và các tình huống nghiệm thu.'],
      ].map(([title, copy], i) => <li key={title}><span>0{i + 1}</span><div><h3>{title}</h3><p>{copy}</p></div></li>)}</ol>
    </section>
    <section className="fw-container fw-section fw-faq">
      <div><p className="fw-eyebrow">THÔNG TIN CẦN BIẾT</p><h2 className="fw-section-title">Trước khi bắt đầu.</h2><p className="fw-section-summary">Khả năng hiện có và phạm vi áp dụng của sản phẩm.</p><Link className="fw-text-link" to="/tai-lieu">Đọc hướng dẫn sử dụng <ArrowRight size={16} /></Link></div>
      <div className="fw-faq-list">{questions.map(([question, answer], i) => <div key={question}><h3><button type="button" id={'fw-faq-' + i} aria-expanded={faq === i} aria-controls={'fw-answer-' + i} onClick={() => setFaq(faq === i ? null : i)}>{question}<ChevronDown size={18} className={faq === i ? 'fw-rotated' : ''} /></button></h3><div id={'fw-answer-' + i} aria-labelledby={'fw-faq-' + i} hidden={faq !== i}><p>{answer}</p></div></div>)}</div>
    </section>
  </>;
}
