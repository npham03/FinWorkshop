import { useEffect,useState,type FormEvent,type ReactNode } from 'react';
import { api,formatDate,formatVnd,today,getRecords,messageOf } from './api';
import { Button } from './components';

type Row = Record<string, any>;
const input = 'mt-1.5 w-full rounded-xl border border-slate-400 bg-white px-4 py-3 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100';
function Field({ label, hint, children, className = '' }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return <label className={`block text-sm font-medium text-slate-700 ${className}`}>{label}{children}{hint && <span className="mt-1 block text-sm font-normal text-muted">{hint}</span>}</label>;
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
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 backdrop-blur-sm p-0 sm:items-center sm:p-4"><form role="dialog" aria-modal="true" aria-label={`${initial.id ? 'Sửa' : 'Tạo'} hóa đơn ${buying ? 'mua' : 'bán'}`} onSubmit={submit} className="max-h-[96vh] w-full max-w-3xl space-y-6 overflow-auto rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl sm:p-8">
    <div><h2 className="text-2xl font-bold">{initial.id ? 'Sửa' : 'Lập'} hóa đơn {buying ? 'mua hàng' : 'bán hàng'}</h2>
      <ol aria-label="Các bước" className="mt-4 flex flex-wrap gap-2">{steps.map((label, index) => <li key={label} aria-current={index === step ? 'step' : undefined} className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${index === step ? 'bg-brand-600 text-white' : index < step ? 'bg-emerald-50 text-emerald-800' : 'border border-slate-300 bg-white text-slate-600'}`}><span>{index < step ? '✓' : index + 1}.</span>{label}</li>)}</ol></div>

    {step === 0 && <div className="space-y-5">
      <Field label={buying ? 'Tên người bán' : 'Tên khách hàng'} hint={buying ? 'Gõ tên, hoặc chọn người bán đã có trong danh sách.' : 'Gõ tên, hoặc chọn khách đã có trong danh sách.'}><input aria-label="Đối tác" list="invoice-partners" required value={header.counterparty} onChange={(event) => { const partner = partners.find((row) => row.name === event.target.value); setHeader({ ...header, counterparty: event.target.value, counterpartyId: partner?.id || '', taxCode: partner?.taxCode || header.taxCode || '' }); }} className={input} /><datalist id="invoice-partners">{partners.map((row) => <option key={row.id} value={row.name} />)}</datalist></Field>
      <Field label="Số hóa đơn" hint="Ghi đúng số in trên hóa đơn."><input aria-label="Số hóa đơn" required value={header.code || ''} onChange={(event) => setHeader({ ...header, code: event.target.value })} className={input} /></Field>
      <div className="grid gap-5 sm:grid-cols-2"><Field label="Ngày lập"><input aria-label="Ngày lập" type="date" required value={header.date || ''} onChange={(event) => setHeader({ ...header, date: event.target.value })} className={input} /></Field><Field label={buying ? 'Hạn phải trả tiền (nếu có)' : 'Hạn khách trả tiền (nếu có)'}><input aria-label="Hạn thanh toán" type="date" value={header.dueDate || ''} onChange={(event) => setHeader({ ...header, dueDate: event.target.value })} className={input} /></Field></div>
      <details className="rounded-xl border border-line p-4"><summary className="min-h-[44px] cursor-pointer text-base font-semibold text-slate-700">Thông tin thêm (không bắt buộc)</summary><Field label="Mã số thuế" className="mt-3"><input aria-label="Mã số thuế" value={header.taxCode || ''} onChange={(event) => setHeader({ ...header, taxCode: event.target.value })} className={input} /></Field></details>
    </div>}

    {step === 1 && <div className="space-y-5">
      {items.map((item, index) => <div key={index} className="space-y-4 rounded-2xl border border-line bg-slate-50/60 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3"><h3 className="text-lg font-bold">Mặt hàng {index + 1}</h3>{items.length > 1 && <Button variant="danger" onClick={() => setItems(items.filter((_, current) => current !== index))}>Bỏ mặt hàng này</Button>}</div>
        <Field label="Chọn từ danh sách (hoặc tự ghi tên bên dưới)"><select aria-label={`Mặt hàng dòng ${index + 1}`} value={item.productId || item.materialId || ''} onChange={(event) => selectProduct(index, event.target.value)} className={input}><option value="">Tự ghi tên hàng</option>{catalog.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field>
        <Field label="Tên hàng hoặc dịch vụ"><input required aria-label={`Mô tả dòng ${index + 1}`} value={item.name || ''} onChange={(event) => patch(index, { name: event.target.value })} className={input} /></Field>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Số lượng"><input aria-label={`Số lượng dòng ${index + 1}`} type="number" inputMode="decimal" min="0.000001" step="any" required value={item.quantity} onChange={(event) => patch(index, { quantity: Number(event.target.value) })} className={input} /></Field><Field label="Giá một đơn vị (₫)"><input aria-label={`Đơn giá dòng ${index + 1}`} type="number" inputMode="numeric" min="0" required value={item.unitPrice} onChange={(event) => patch(index, { unitPrice: Number(event.target.value) })} className={input} /></Field></div>
        <p className="rounded-xl bg-white px-4 py-3 text-base">Thành tiền: <b>{formatVnd(lineAmount(item))}</b> · Thuế {Number(item.taxRate || 0)}% (hệ thống tự tính): <b>{formatVnd(lineTax(item))}</b></p>
        <details><summary className="min-h-[44px] cursor-pointer text-sm font-semibold text-brand-700">Đổi mức thuế hoặc loại chi</summary><div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label="Mức thuế có sẵn"><select aria-label={`TaxRule dòng ${index + 1}`} value={item.taxRuleId || ''} onChange={(event) => { const rule = rules.find((row) => row.id === event.target.value); patch(index, { taxRuleId: rule?.id || '', taxRate: rule?.taxRate ?? 0 }); }} className={input}><option value="">Tự nhập mức thuế</option>{rules.map((rule) => <option key={rule.id} value={rule.id}>{rule.status === 'REVIEW_REQUIRED' ? 'Chờ xác nhận · ' : ''}{rule.name} · {rule.taxRate}%</option>)}</select></Field>
          <Field label="Mức thuế (%)"><input aria-label={`Thuế suất dòng ${index + 1}`} type="number" step="0.01" min="0" max="100" readOnly={Boolean(item.taxRuleId)} value={item.taxRate} onChange={(event) => patch(index, { taxRate: Number(event.target.value) })} className={input} /></Field>
          {buying && <Field label="Khoản chi này là gì?"><select aria-label={`Khoản mục dòng ${index + 1}`} className={input} value={item.purchaseCategory || header.purchaseCategory || 'OPERATING'} onChange={(event) => patch(index, { purchaseCategory: event.target.value })}><option value="OPERATING">Chi phí hằng ngày</option><option value="INVENTORY">Vật tư, hàng để bán</option><option value="ASSET">Máy móc, đồ dùng lâu dài</option></select></Field>}
        </div></details>
      </div>)}
      <Button variant="secondary" onClick={() => setItems([...items, { name: '', quantity: 1, unitPrice: 0, taxRate: 0 }])}>+ Thêm mặt hàng</Button>
      <div className="flex justify-between rounded-2xl bg-brand-50 px-5 py-4 text-lg"><span>Tạm tính (cả thuế)</span><b>{formatVnd(subtotal + autoTax)}</b></div>
    </div>}

    {step === 2 && <div className="space-y-5">
      <div className="rounded-2xl border border-line p-5"><dl className="grid gap-3 text-base sm:grid-cols-2"><div><dt className="text-sm text-muted">{buying ? 'Người bán' : 'Khách hàng'}</dt><dd className="font-bold">{header.counterparty || '—'}</dd></div><div><dt className="text-sm text-muted">Số hóa đơn</dt><dd className="font-bold">{header.code || '—'}</dd></div><div><dt className="text-sm text-muted">Ngày lập</dt><dd className="font-bold">{header.date ? formatDate(header.date) : '—'}</dd></div><div><dt className="text-sm text-muted">Hạn trả tiền</dt><dd className="font-bold">{header.dueDate ? formatDate(header.dueDate) : 'Không có'}</dd></div></dl></div>
      <div className="rounded-2xl border border-line px-5 py-2">{items.map((item, index) => <div key={index} className="flex items-start justify-between gap-4 border-b border-line py-3 last:border-0"><div><p className="font-semibold">{item.name || `Mặt hàng ${index + 1}`}</p><p className="text-sm text-muted">{Number(item.quantity)} × {formatVnd(Number(item.unitPrice))}</p></div><b className="shrink-0">{formatVnd(lineAmount(item))}</b></div>)}</div>
      <div className="space-y-2 rounded-2xl bg-brand-50 p-5 text-base"><div className="flex justify-between"><span>Tiền hàng</span><b>{formatVnd(subtotal)}</b></div>{discount > 0 && <div className="flex justify-between"><span>Giảm giá</span><b>− {formatVnd(discount)}</b></div>}<div className="flex justify-between"><span>Thuế</span><b aria-label="Tiền thuế">{formatVnd(taxAmount)}</b></div><div className="flex justify-between border-t border-brand-100 pt-3 text-xl"><span>{buying ? 'Bạn phải trả' : 'Khách phải trả'}</span><b aria-label="Tổng tiền" className="text-brand-700">{formatVnd(total)}</b></div></div>
      <details className="rounded-xl border border-line p-4"><summary className="min-h-[44px] cursor-pointer text-base font-semibold text-slate-700">Tùy chọn khác</summary><div className="mt-3 space-y-4">
        <Field label="Giảm giá cho cả hóa đơn (₫)"><input aria-label="Chiết khấu hóa đơn" type="number" min="0" value={header.discountAmount} onChange={(event) => setHeader({ ...header, discountAmount: Number(event.target.value) })} className={input} /></Field>
        <label className="flex min-h-[44px] items-center gap-3 text-base"><input type="checkbox" className="h-5 w-5" checked={rounding} onChange={(event) => setRounding(event.target.checked)} />Chỉnh số lẻ (tối đa ±5 ₫)</label>
        {rounding && <div className="grid gap-4 sm:grid-cols-2">{['taxRoundingAdjustment', 'roundingAdjustment'].map((key) => <Field key={key} label={key === 'taxRoundingAdjustment' ? 'Chỉnh số lẻ của thuế' : 'Chỉnh số lẻ của tổng'}><input aria-label={key === 'taxRoundingAdjustment' ? 'Làm tròn thuế' : 'Làm tròn tổng'} type="number" min="-5" max="5" value={header[key] || 0} onChange={(event) => setHeader({ ...header, [key]: Number(event.target.value) })} className={input} /></Field>)}</div>}
        {buying && <Field label="Khoản chi chung của hóa đơn"><select aria-label="Khoản mục mua vào" className={input} value={header.purchaseCategory || 'OPERATING'} onChange={(event) => setHeader({ ...header, purchaseCategory: event.target.value })}><option value="OPERATING">Chi phí hằng ngày</option><option value="INVENTORY">Vật tư, hàng để bán</option><option value="ASSET">Máy móc, đồ dùng lâu dài</option></select></Field>}
        {buying && <label className="flex min-h-[44px] items-center gap-3 text-base"><input type="checkbox" className="h-5 w-5" checked={header.inputVatDeductible === true} onChange={(event) => setHeader({ ...header, inputVatDeductible: event.target.checked })} />Hóa đơn này đủ điều kiện để được trừ thuế VAT</label>}
        <Field label="Ảnh hoặc file hóa đơn gốc"><input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" className="mt-2 block text-base" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; const form = new FormData(); form.append('file', file); setBusy(true); try { const { data } = await api.post('/files', form); setHeader((row) => ({ ...row, attachmentName: data.name, attachmentNameId: data.id })); } catch (reason) { setError(messageOf(reason)); } finally { setBusy(false); } }} />{header.attachmentName && <span className="mt-1 block text-sm text-emerald-700">Đã đính kèm: {header.attachmentName}</span>}</Field>
      </div></details>
    </div>}

    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-base text-red-700">{error}</p>}
    <div className="flex flex-wrap justify-between gap-3 border-t border-line pt-5"><Button variant="secondary" onClick={() => (step === 0 ? onClose() : setStep(step - 1))} disabled={busy}>{step === 0 ? 'Hủy' : 'Quay lại'}</Button><Button type="submit" disabled={busy || (step === 2 && total < 0)}>{step < 2 ? 'Tiếp tục' : busy ? 'Đang lưu…' : 'Lưu hóa đơn'}</Button></div>
  </form></div>;
}
