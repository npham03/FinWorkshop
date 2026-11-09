import { useEffect,useState,type FormEvent,type ReactNode } from 'react';
import { api,formatDate,formatVnd,today,getRecords,messageOf } from './api';
import { Button,IconButton } from './components';
import { X } from 'lucide-react';

type Row = Record<string, any>;
const input = 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs sm:text-sm outline-none focus:border-brand-500 transition-colors';
function Field({ label, hint, children, className = '' }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return <label className={`block text-xs font-semibold text-slate-700 ${className}`}>{label}{children}{hint && <span className="mt-0.5 block text-[11px] font-normal text-slate-400">{hint}</span>}</label>;
}
const lineAmount = (item: Row) => Math.round(Number(item.quantity || 0) * Number(item.unitPrice || 0));
const lineTax = (item: Row) => Math.round(lineAmount(item) * Number(item.taxRate || 0) / 100);

export function InvoiceModal({ initial = {}, direction, onClose, onSubmit }: { initial?: Row; direction: 'INPUT' | 'OUTPUT'; onClose: () => void; onSubmit: (data: Row) => Promise<void> }) {
  const [step, setStep] = useState(0);
  const [header, setHeader] = useState<Row>({ code: '', counterparty: '', date: today(), discountAmount: 0, taxRoundingAdjustment: 0, roundingAdjustment: 0, ...initial });
  const [items, setItems] = useState<Row[]>(initial.items?.length ? initial.items.map((item: Row) => ({ ...item, taxRate: item.taxRate ?? initial.taxRate ?? 0 })) : [{ name: initial.description || '', quantity: 1, unitPrice: initial.subtotal || 0, taxRate: initial.taxRate ?? (Number(initial.subtotal) ? Number(initial.taxAmount || 0) * 100 / Number(initial.subtotal) : 0), taxRuleId: initial.taxRuleId || '' }]);
  const [catalog, setCatalog] = useState<Row[]>([]), [rules, setRules] = useState<Row[]>([]), [partners, setPartners] = useState<Row[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false), [rounding, setRounding] = useState(Boolean(initial.taxRoundingAdjustment || initial.roundingAdjustment));
  const buying = direction === 'INPUT';
  useEffect(() => { void Promise.all([getRecords<Row>('products'), getRecords<Row>('materials'), getRecords<Row>('tax-rules'), getRecords<Row>(buying ? 'suppliers' : 'customers')]).then(([products, materials, taxes, counterparties]) => { setCatalog([...products.map((row) => ({ ...row, itemEntity: 'products' })), ...materials.map((row) => ({ ...row, itemEntity: 'materials' }))].filter((row: Row) => row.status !== 'CANCELLED')); setRules(taxes.filter((row) => !['INACTIVE', 'CANCELLED'].includes(row.status))); setPartners(counterparties.filter((row: Row) => row.status !== 'CANCELLED')); }).catch((reason) => setError(messageOf(reason))); }, [buying]);
  const patch = (index: number, data: Row) => setItems((rows) => rows.map((row, current) => current === index ? { ...row, ...data } : row));
  const selectProduct = (index: number, id: string) => {
    const product = catalog.find((row) => row.id === id); if (!product) { patch(index, { productId: '', materialId: '', taxRuleId: '' }); return; }
    const taxRuleId = product[buying ? 'inputTaxRuleId' : 'outputTaxRuleId'];
    const rule = rules.find((row) => row.id === taxRuleId);
    patch(index, { productId: product.itemEntity === 'products' ? id : undefined, materialId: product.itemEntity === 'materials' ? id : undefined, purchaseCategory: product.trackInventory !== false ? 'INVENTORY' : 'OPERATING', name: product.name, unit: product.unit, unitPrice: buying ? product.unitCost ?? product.cost : product.price, taxRuleId: taxRuleId || '', taxRate: rule?.taxRate ?? product[buying ? 'inputTaxRate' : 'outputTaxRate'] ?? 0 });
  };
  const subtotal = items.reduce((sum, item) => sum + lineAmount(item), 0);
  const autoTax = items.reduce((sum, item) => sum + lineTax(item), 0);
  const taxAmount = autoTax + (rounding ? Number(header.taxRoundingAdjustment || 0) : 0);
  const discount = Number(header.discountAmount || 0);
  const total = subtotal + taxAmount - discount + (rounding ? Number(header.roundingAdjustment || 0) : 0);
  const save = async () => {
    setBusy(true); setError('');
    try { await onSubmit({ ...header, direction, type: direction, invoiceType: direction, items, subtotal, taxAmount, total, totalAmount: total, taxRoundingAdjustment: rounding ? Number(header.taxRoundingAdjustment || 0) : 0, roundingAdjustment: rounding ? Number(header.roundingAdjustment || 0) : 0 }); }
    catch (reason) { setError(messageOf(reason)); } finally { setBusy(false); }
  };
  const submit = (event: FormEvent) => { event.preventDefault(); if (step < 2) { setStep(step + 1); setError(''); return; } void save(); };
  const steps = [buying ? 'Người bán' : 'Khách hàng', buying ? 'Hàng mua' : 'Hàng bán', 'Kiểm tra và lưu'];

  return <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/35 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="fixed inset-y-0 right-0 flex max-w-full pl-6">
      <form role="dialog" aria-modal="true" aria-label={`${initial.id ? 'Sửa' : 'Tạo'} hóa đơn ${buying ? 'mua' : 'bán'}`} onSubmit={submit} className="w-screen max-w-2xl bg-white shadow-2xl border-l border-slate-200 flex flex-col">
        {/* Drawer Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/90 px-5 py-3.5">
          <div>
            <h2 className="text-sm font-bold text-slate-900">{initial.id ? 'Sửa' : 'Lập'} hóa đơn {buying ? 'mua hàng (Chi)' : 'bán hàng (Thu)'}</h2>
            <ol aria-label="Các bước" className="mt-1 flex flex-wrap gap-1.5">
              {steps.map((label, index) => (
                <li key={label} aria-current={index === step ? 'step' : undefined} className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold ${index === step ? 'bg-brand-600 text-white' : index < step ? 'bg-emerald-50 text-emerald-800' : 'border border-slate-200 text-slate-500'}`}>
                  <span>{index < step ? '✓' : index + 1}.</span>{label}
                </li>
              ))}
            </ol>
          </div>
          <IconButton label="Đóng" onClick={onClose}><X size={16} /></IconButton>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {step === 0 && <div className="space-y-4">
            <Field label={buying ? 'Tên người bán / Nhà cung cấp' : 'Tên khách hàng'} hint={buying ? 'Gõ tên hoặc chọn nhà cung cấp trong danh bạ' : 'Gõ tên hoặc chọn khách hàng trong danh bạ'}>
              <input aria-label="Đối tác" list="invoice-partners" required value={header.counterparty} onChange={(event) => { const partner = partners.find((row) => row.name === event.target.value); setHeader({ ...header, counterparty: event.target.value, counterpartyId: partner?.id || '', taxCode: partner?.taxCode || header.taxCode || '' }); }} className={input} />
              <datalist id="invoice-partners">{partners.map((row) => <option key={row.id} value={row.name} />)}</datalist>
            </Field>
            <Field label="Số hóa đơn (in trên chứng từ)"><input aria-label="Số hóa đơn" required value={header.code || ''} onChange={(event) => setHeader({ ...header, code: event.target.value })} className={input} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Ngày lập chứng từ"><input aria-label="Ngày lập" type="date" required value={header.date || ''} onChange={(event) => setHeader({ ...header, date: event.target.value })} className={input} /></Field>
              <Field label={buying ? 'Hạn trả nợ NCC' : 'Hạn khách thanh toán'}><input aria-label="Hạn thanh toán" type="date" value={header.dueDate || ''} onChange={(event) => setHeader({ ...header, dueDate: event.target.value })} className={input} /></Field>
            </div>
            <details className="rounded-lg border border-slate-200 p-3 bg-slate-50/50">
              <summary className="cursor-pointer text-xs font-semibold text-slate-700">Mã số thuế & thông tin phụ</summary>
              <Field label="Mã số thuế" className="mt-2"><input aria-label="Mã số thuế" value={header.taxCode || ''} onChange={(event) => setHeader({ ...header, taxCode: event.target.value })} className={input} /></Field>
            </details>
          </div>}

          {step === 1 && <div className="space-y-4">
            {items.map((item, index) => <div key={index} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 sm:p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Dòng hàng #{index + 1}</h3>
                {items.length > 1 && <button type="button" onClick={() => setItems(items.filter((_, current) => current !== index))} className="text-xs font-medium text-rose-600 hover:underline">Xóa dòng</button>}
              </div>
              <Field label="Chọn từ danh mục kho / sản phẩm">
                <select aria-label={`Mặt hàng dòng ${index + 1}`} value={item.productId || item.materialId || ''} onChange={(event) => selectProduct(index, event.target.value)} className={input}>
                  <option value="">Tự ghi tên hàng hóa / dịch vụ</option>
                  {catalog.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
                </select>
              </Field>
              <Field label="Tên hàng hoặc dịch vụ">
                <input required aria-label={`Mô tả dòng ${index + 1}`} value={item.name || ''} onChange={(event) => patch(index, { name: event.target.value })} className={input} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Số lượng">
                  <input aria-label={`Số lượng dòng ${index + 1}`} type="number" inputMode="decimal" min="0.000001" step="any" required value={item.quantity} onChange={(event) => patch(index, { quantity: Number(event.target.value) })} className={input} />
                </Field>
                <Field label="Đơn giá (₫)">
                  <input aria-label={`Đơn giá dòng ${index + 1}`} type="number" inputMode="numeric" min="0" required value={item.unitPrice} onChange={(event) => patch(index, { unitPrice: Number(event.target.value) })} className={input} />
                </Field>
              </div>
              <div className="rounded-lg bg-white border border-slate-200 px-3 py-2 text-xs flex justify-between">
                <span>Thành tiền: <b>{formatVnd(lineAmount(item))}</b></span>
                <span>Thuế {Number(item.taxRate || 0)}%: <b>{formatVnd(lineTax(item))}</b></span>
              </div>
              <details>
                <summary className="cursor-pointer text-xs font-semibold text-brand-700">Điều chỉnh mức thuế / Khoản mục</summary>
                <div className="mt-2.5 grid gap-3 sm:grid-cols-2">
                  <Field label="Quy tắc thuế">
                    <select aria-label={`TaxRule dòng ${index + 1}`} value={item.taxRuleId || ''} onChange={(event) => { const rule = rules.find((row) => row.id === event.target.value); patch(index, { taxRuleId: rule?.id || '', taxRate: rule?.taxRate ?? 0 }); }} className={input}>
                      <option value="">Tự nhập mức thuế</option>
                      {rules.map((rule) => <option key={rule.id} value={rule.id}>{rule.status === 'REVIEW_REQUIRED' ? 'Chờ xác nhận · ' : ''}{rule.name} · {rule.taxRate}%</option>)}
                    </select>
                  </Field>
                  <Field label="Thuế suất (%)">
                    <input aria-label={`Thuế suất dòng ${index + 1}`} type="number" step="0.01" min="0" max="100" readOnly={Boolean(item.taxRuleId)} value={item.taxRate} onChange={(event) => patch(index, { taxRate: Number(event.target.value) })} className={input} />
                  </Field>
                  {buying && (
                    <Field label="Phân loại chi phí" className="sm:col-span-2">
                      <select aria-label={`Khoản mục dòng ${index + 1}`} className={input} value={item.purchaseCategory || header.purchaseCategory || 'OPERATING'} onChange={(event) => patch(index, { purchaseCategory: event.target.value })}>
                        <option value="OPERATING">Chi phí kinh doanh hằng ngày</option>
                        <option value="INVENTORY">Vật tư / Hàng hóa nhập kho</option>
                        <option value="ASSET">Tài sản / Máy móc xưởng</option>
                      </select>
                    </Field>
                  )}
                </div>
              </details>
            </div>)}
            <Button variant="secondary" compact onClick={() => setItems([...items, { name: '', quantity: 1, unitPrice: 0, taxRate: 0 }])}>+ Thêm dòng hàng</Button>
            <div className="flex justify-between rounded-xl bg-brand-50 border border-brand-100 px-4 py-3 text-sm font-bold text-slate-900">
              <span>Tạm tính (cả thuế)</span>
              <span className="text-brand-700 tabular-nums">{formatVnd(subtotal + autoTax)}</span>
            </div>
          </div>}

          {step === 2 && <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
              <dl className="grid gap-2 text-xs sm:grid-cols-2">
                <div><dt className="text-slate-500">{buying ? 'Người bán' : 'Khách hàng'}</dt><dd className="font-bold text-slate-900">{header.counterparty || '—'}</dd></div>
                <div><dt className="text-slate-500">Số hóa đơn</dt><dd className="font-bold text-slate-900">{header.code || '—'}</dd></div>
                <div><dt className="text-slate-500">Ngày lập</dt><dd className="font-bold text-slate-900">{header.date ? formatDate(header.date) : '—'}</dd></div>
                <div><dt className="text-slate-500">Hạn trả tiền</dt><dd className="font-bold text-slate-900">{header.dueDate ? formatDate(header.dueDate) : 'Không có'}</dd></div>
              </dl>
            </div>
            <div className="rounded-xl border border-slate-200 px-4 py-2 divide-y divide-slate-100">
              {items.map((item, index) => (
                <div key={index} className="flex items-start justify-between gap-4 py-2 text-xs">
                  <div>
                    <p className="font-semibold text-slate-900">{item.name || `Dòng hàng ${index + 1}`}</p>
                    <p className="text-slate-500">{Number(item.quantity)} × {formatVnd(Number(item.unitPrice))}</p>
                  </div>
                  <b className="shrink-0 text-slate-900 tabular-nums">{formatVnd(lineAmount(item))}</b>
                </div>
              ))}
            </div>
            <div className="space-y-1.5 rounded-xl bg-brand-50 border border-brand-100 p-4 text-xs">
              <div className="flex justify-between text-slate-600"><span>Tiền hàng</span><b className="tabular-nums">{formatVnd(subtotal)}</b></div>
              {discount > 0 && <div className="flex justify-between text-emerald-700"><span>Chiết khấu</span><b className="tabular-nums">− {formatVnd(discount)}</b></div>}
              <div className="flex justify-between text-slate-600"><span>Tiền thuế</span><b className="tabular-nums" aria-label="Tiền thuế">{formatVnd(taxAmount)}</b></div>
              <div className="flex justify-between border-t border-brand-200 pt-2 text-sm font-bold text-slate-900">
                <span>{buying ? 'Phải trả người bán' : 'Phải thu khách hàng'}</span>
                <b aria-label="Tổng tiền" className="text-brand-700 text-base tabular-nums">{formatVnd(total)}</b>
              </div>
            </div>
            <details className="rounded-lg border border-slate-200 p-3 bg-white">
              <summary className="cursor-pointer text-xs font-semibold text-slate-700">Tùy chọn chiết khấu & làm tròn</summary>
              <div className="mt-3 space-y-3">
                <Field label="Chiết khấu toàn hóa đơn (₫)"><input aria-label="Chiết khấu hóa đơn" type="number" min="0" value={header.discountAmount} onChange={(event) => setHeader({ ...header, discountAmount: Number(event.target.value) })} className={input} /></Field>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700"><input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={rounding} onChange={(event) => setRounding(event.target.checked)} />Điều chỉnh làm tròn (tối đa ±5 ₫)</label>
                {rounding && <div className="grid gap-3 sm:grid-cols-2">{['taxRoundingAdjustment', 'roundingAdjustment'].map((key) => <Field key={key} label={key === 'taxRoundingAdjustment' ? 'Làm tròn thuế (±5 ₫)' : 'Làm tròn tổng (±5 ₫)'}><input aria-label={key === 'taxRoundingAdjustment' ? 'Làm tròn thuế' : 'Làm tròn tổng'} type="number" min="-5" max="5" value={header[key] || 0} onChange={(event) => setHeader({ ...header, [key]: Number(event.target.value) })} className={input} /></Field>)}</div>}
                {buying && <Field label="Khoản mục mua vào"><select aria-label="Khoản mục mua vào" className={input} value={header.purchaseCategory || 'OPERATING'} onChange={(event) => setHeader({ ...header, purchaseCategory: event.target.value })}><option value="OPERATING">Chi phí kinh doanh hằng ngày</option><option value="INVENTORY">Vật tư / Hàng hóa nhập kho</option><option value="ASSET">Tài sản / Máy móc</option></select></Field>}
                {buying && <label className="flex items-center gap-2 text-xs text-slate-700"><input type="checkbox" className="h-4 w-4 rounded" checked={header.inputVatDeductible === true} onChange={(event) => setHeader({ ...header, inputVatDeductible: event.target.checked })} />Hóa đơn đủ điều kiện khấu trừ thuế VAT</label>}
              </div>
            </details>
          </div>}

          {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</p>}
        </div>

        {/* Drawer Footer */}
        <div className="border-t border-slate-200 bg-slate-50/90 px-5 py-3 flex items-center justify-between">
          <Button variant="secondary" compact onClick={() => (step === 0 ? onClose() : setStep(step - 1))} disabled={busy}>{step === 0 ? 'Hủy' : 'Quay lại'}</Button>
          <Button type="submit" compact disabled={busy || (step === 2 && total < 0)}>
            {step < 2 ? 'Tiếp tục' : busy ? 'Đang lưu…' : 'Lưu hóa đơn'}
          </Button>
        </div>
      </form>
    </div>
  </div>;
}
