export const businessError = (message, status = 400) => Object.assign(new Error(message), { status });
export const number = (value) => Number(value ?? 0);
export const active = (row) => !['CANCELLED', 'VOID', 'UNALLOCATED','DEMO_ARCHIVED'].includes(row.status);

export function invoiceDirection(data) {
  const aliases = { INPUT: 'INPUT', EXPENSE: 'INPUT', PURCHASE: 'INPUT', IN_INVOICE: 'INPUT', OUTPUT: 'OUTPUT', INCOME: 'OUTPUT', SALE: 'OUTPUT', OUT_INVOICE: 'OUTPUT' };
  const values = [data.direction, data.type, data.invoiceType].filter(Boolean).map((value) => aliases[String(value).toUpperCase()]).filter(Boolean);
  if (!values.length || new Set(values).size !== 1) throw businessError('Chọn đúng một chiều hóa đơn INPUT hoặc OUTPUT; các trường phân loại phải thống nhất.');
  return values[0];
}

export function money(value, field, { signed = false } = {}) {
  const result = Number(value ?? 0);
  if (!Number.isSafeInteger(result) || (!signed && result < 0)) throw businessError(`${field} phải là số nguyên VNĐ ${signed ? 'hợp lệ' : 'không âm'}.`);
  return result;
}

export function calculateInvoice(data) {
  const direction = invoiceDirection(data);
  const items = Array.isArray(data.items) ? data.items.map((item) => {
    const quantity = Number(item.quantity ?? 1), unitPrice = money(item.unitPrice ?? item.unitCost ?? 0, 'Đơn giá');
    if (!Number.isFinite(quantity) || quantity <= 0) throw businessError('Số lượng phải lớn hơn 0.');
    const taxRate = Number(item.taxRate ?? data.taxRate ?? 0);
    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) throw businessError('Thuế suất phải từ 0 đến 100%.');
    const subtotal = Math.round(quantity * unitPrice);
    return { ...item, quantity, unitPrice, subtotal, amount: subtotal, taxRate, taxAmount: Math.round(subtotal * taxRate / 100) };
  }) : [];
  const subtotal = money(items.length ? items.reduce((sum, item) => sum + item.subtotal, 0) : data.subtotal ?? (data.quantity !== undefined && data.unitPrice !== undefined ? Math.round(Number(data.quantity) * Number(data.unitPrice)) : data.totalAmount ?? data.total), 'Tiền hàng');
  const taxRate = Number(data.taxRate ?? 0);
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) throw businessError('Thuế suất phải từ 0 đến 100%.');
  const calculatedTax = items.length ? items.reduce((sum, item) => sum + item.taxAmount, 0) : Math.round(subtotal * taxRate / 100);
  const taxRoundingAdjustment = money(data.taxRoundingAdjustment, 'Làm tròn thuế', { signed: true });
  const roundingAdjustment = money(data.roundingAdjustment, 'Làm tròn tổng', { signed: true });
  if (Math.abs(taxRoundingAdjustment) > 5 || Math.abs(roundingAdjustment) > 5) throw businessError('Chỉ được làm tròn hóa đơn tối đa ±5 VNĐ.');
  // Historical invoices may only carry a tax amount. New rate/rule based invoices are always checked.
  const hasRate = items.length || data.taxRate !== undefined || data.taxRuleId;
  const taxAmount = money(data.taxAmount ?? calculatedTax + taxRoundingAdjustment, 'Tiền thuế');
  if (hasRate && Math.abs(taxAmount - calculatedTax) > 5) throw businessError('Tiền thuế lệch quá 5 VNĐ so với thuế suất.');
  const discountAmount = money(data.discountAmount, 'Chiết khấu hóa đơn');
  const expectedTotal = subtotal + taxAmount - discountAmount;
  const total = money(data.totalAmount ?? data.total ?? expectedTotal + roundingAdjustment, 'Tổng tiền');
  if (Math.abs(total - expectedTotal) > 5) throw businessError('Tổng tiền lệch quá 5 VNĐ so với tiền hàng + thuế − chiết khấu.');
  return { ...data, items, direction, type: direction, subtotal, taxRate, taxAmount, discountAmount, taxRoundingAdjustment: hasRate ? taxAmount - calculatedTax : 0, roundingAdjustment: total - expectedTotal, total, totalAmount: total };
}

export function allocationAmounts(data) {
  const allocatedAmount = money(data.allocatedAmount, 'Tiền phân bổ');
  const discountAmount = money(data.discountAmount, 'Chiết khấu thanh toán');
  const bankFeeAmount = money(data.bankFeeAmount, 'Phí ngân hàng');
  const roundingAdjustment = money(data.roundingAdjustment, 'Làm tròn', { signed: true });
  if (Math.abs(roundingAdjustment) > 5) throw businessError('Làm tròn thanh toán tối đa ±5 VNĐ; dùng chiết khấu cho chênh lệch lớn hơn.');
  if (allocatedAmount <= 0 || allocatedAmount + discountAmount + roundingAdjustment <= 0) throw businessError('Tiền phân bổ và giá trị tất toán phải lớn hơn 0.');
  const writeOffReason = String(data.writeOffReason || '').trim();
  if ((discountAmount || bankFeeAmount || roundingAdjustment) && !writeOffReason) throw businessError('Bắt buộc nhập lý do xử lý chênh lệch/phí ngân hàng.');
  // Fees are a separate cash expense. They never reduce invoice debt a second time.
  return { allocatedAmount, discountAmount, bankFeeAmount, roundingAdjustment, writeOffReason, settlementAmount: allocatedAmount + discountAmount + roundingAdjustment };
}

export const businessDate = () => new Date().toLocaleDateString('en-CA', { timeZone: process.env.WORKSHOP_TIME_ZONE || 'Asia/Ho_Chi_Minh' });
