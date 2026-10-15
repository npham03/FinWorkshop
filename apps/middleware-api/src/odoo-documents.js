import { createHash } from 'node:crypto';
import { listRecords } from './db.js';
import { executeOdoo } from './odoo.js';

const amount = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const odooMappingError = (message) => Object.assign(new Error(message), { code: 'PENDING_MAPPING' });

async function findSourceRecord(model, sourceKey, fields = ['id']) {
  const rows = await executeOdoo(model, 'search_read', [[['fintax_source_key', '=', sourceKey]]], { fields, limit: 1, context: { active_test: false } });
  return rows?.[0] || null;
}

async function resolvePartner(data, partnerType) {
  const counterpartEntity = partnerType === 'supplier' ? 'suppliers' : 'customers';
  const counterpartName = String(data.counterparty || data.customerName || data.supplierName || data.partnerName || '').trim();
  if (!counterpartName) throw odooMappingError(`Thiếu tên ${partnerType === 'supplier' ? 'nhà cung cấp' : 'khách hàng'} để tạo chứng từ Odoo.`);

  const records = await listRecords(counterpartEntity);
  const namedRecord = records.find((record) => (data.counterpartyId && record.id === data.counterpartyId)
    || (data.customerId && record.id === data.customerId)
    || (data.supplierId && record.id === data.supplierId)
    || (data.taxCode && record.taxCode && String(record.taxCode).replace(/\s/g, '') === String(data.taxCode).replace(/\s/g, ''))
    || String(record.name || '').trim().toLocaleLowerCase('vi') === counterpartName.toLocaleLowerCase('vi'));
  const counterpartSourceKey = namedRecord ? `${counterpartEntity}:${namedRecord.id}` : '';
  if (counterpartSourceKey) {
    const linked = await findSourceRecord('res.partner', counterpartSourceKey);
    if (linked) return Number(linked.id);
  }

  const taxCode = String(data.taxCode || namedRecord?.taxCode || '').trim();
  const stableKey = counterpartSourceKey || `web:partner:${createHash('sha256').update(`${partnerType}|${taxCode}|${counterpartName.toLocaleLowerCase('vi')}`).digest('hex').slice(0, 32)}`;
  const alreadyLinked = await findSourceRecord('res.partner', stableKey);
  if (alreadyLinked) return Number(alreadyLinked.id);

  let found = [];
  const fields = ['id', 'fintax_source_key'];
  if (taxCode) found = await executeOdoo('res.partner', 'search_read', [[['vat', '=', taxCode]]], { fields, limit: 1, context: { active_test: false } });
  if (!found?.length) found = await executeOdoo('res.partner', 'search_read', [[['name', '=ilike', counterpartName]]], { fields, limit: 1, context: { active_test: false } });
  const values = {
    name: String(namedRecord?.name || counterpartName),
    email: data.email || namedRecord?.email || false,
    phone: data.phone || namedRecord?.phone || false,
    vat: taxCode || false,
    street: data.address || namedRecord?.address || false,
  };
  if (found?.length) {
    const partner = found[0];
    if (!partner.fintax_source_key || String(partner.fintax_source_key).startsWith('web:partner:')) {
      await executeOdoo('res.partner', 'write', [[Number(partner.id)], { ...values, fintax_source_key: stableKey }]);
    }
    return Number(partner.id);
  }
  return Number(await executeOdoo('res.partner', 'create', [{ ...values, fintax_source_key: stableKey }]));
}

async function matchingTaxIds(typeUse, subtotal, taxAmount) {
  if (subtotal <= 0 || taxAmount <= 0) return [];
  const taxes = await executeOdoo('account.tax', 'search_read', [[['type_tax_use', '=', typeUse], ['active', '=', true], ['amount_type', '=', 'percent']]], { fields: ['id', 'amount'], limit: 100 });
  const expected = amount(taxAmount);
  const match = taxes.map((tax) => ({ tax, delta: Math.abs(subtotal * amount(tax.amount) / 100 - expected) })).sort((a, b) => a.delta - b.delta)[0];
  return match && match.delta <= Math.max(1, subtotal * 0.002) ? [Number(match.tax.id)] : [];
}

function saleLines(data, taxIds) {
  const items = Array.isArray(data.items) && data.items.length ? data.items : [{
    name: data.title || data.description || data.code || 'Báo giá FinTax',
    quantity: data.quantity ?? 1,
    unitPrice: data.unitPrice ?? data.subtotal ?? data.total ?? 0,
  }];
  return items.map((item) => [0, 0, {
    name: String(item.name || item.description || data.title || 'Sản phẩm / dịch vụ'),
    product_uom_qty: Math.max(0.000001, amount(item.quantity ?? data.quantity ?? 1)),
    price_unit: amount(item.unitPrice ?? item.unitCost ?? item.price ?? 0),
    ...(taxIds.length ? { tax_id: [[6, 0, taxIds]] } : {}),
  }]);
}

export async function syncOdooQuotation(data, sourceKey) {
  const partnerId = await resolvePartner(data, 'customer');
  const companies = await executeOdoo('res.company', 'search_read', [[]], { fields: ['id', 'currency_id'], limit: 1 });
  const company = companies?.[0];
  if (!company) throw odooMappingError('Odoo chưa có công ty để tạo báo giá.');
  const pricelists = await executeOdoo('product.pricelist', 'search_read', [[['currency_id', '=', Number(company.currency_id?.[0] || 0)], '|', ['company_id', '=', false], ['company_id', '=', Number(company.id)]]], { fields: ['id'], limit: 1 });
  if (!pricelists?.length) throw odooMappingError('Chưa có bảng giá Odoo cùng tiền tệ với công ty.');
  const date = String(data.date || data.issueDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const subtotal = amount(data.subtotal ?? data.total);
  const taxAmount = amount(data.taxAmount);
  const taxes = await matchingTaxIds('sale', subtotal, taxAmount);
  const taxNote = taxAmount > 0 && !taxes.length ? `Thuế nguồn ${taxAmount} VND chưa khớp thuế Odoo; cần rà soát.` : '';
  const values = {
    fintax_source_key: sourceKey,
    partner_id: partnerId,
    company_id: Number(company.id),
    pricelist_id: Number(pricelists[0].id),
    client_order_ref: String(data.code || sourceKey),
    origin: `FinTax:${sourceKey}`,
    date_order: `${date} 00:00:00`,
    validity_date: data.validUntil || false,
    note: [String(data.terms || ''), taxNote].filter(Boolean).join('\n\n'),
    order_line: saleLines(data, taxes),
  };
  const existing = await findSourceRecord('sale.order', sourceKey, ['id', 'state']);
  let nativeId;
  if (!existing) {
    nativeId = Number(await executeOdoo('sale.order', 'create', [values], { context: { allowed_company_ids: [Number(company.id)] } }));
  } else {
    nativeId = Number(existing.id);
    if (['sale', 'done'].includes(existing.state)) {
      if (data.status !== 'ACCEPTED') throw odooMappingError('Báo giá đã được xác nhận thành đơn bán hàng trong Odoo; hãy rà soát thay đổi trước khi đồng bộ tiếp.');
    } else if (existing.state === 'cancel') {
      if (!['CANCELLED', 'REJECTED'].includes(data.status)) throw odooMappingError('Báo giá đã bị hủy trong Odoo; cần xử lý thủ công trước khi đồng bộ tiếp.');
    } else {
      await executeOdoo('sale.order', 'write', [[nativeId], values]);
      if (['CANCELLED', 'REJECTED'].includes(data.status) && existing.state !== 'cancel') await executeOdoo('sale.order', 'action_cancel', [[nativeId]]);
      else if (data.status === 'ACCEPTED' && existing.state !== 'sale') await executeOdoo('sale.order', 'action_confirm', [[nativeId]]);
      else if (data.status === 'SENT' && existing.state === 'draft') await executeOdoo('sale.order', 'action_quotation_sent', [[nativeId]]);
    }
  }
  return { model: 'sale.order', id: nativeId };
}

export async function syncOdooInvoice(data, sourceKey) {
  const isVendorBill = data.direction === 'INPUT';
  if (!isVendorBill && data.direction !== 'OUTPUT') throw odooMappingError('Chọn hóa đơn đầu vào hoặc đầu ra để ánh xạ sang Odoo.');
  const moveType = isVendorBill ? 'in_invoice' : 'out_invoice';
  const partnerId = await resolvePartner(data, isVendorBill ? 'supplier' : 'customer');
  const companies = await executeOdoo('res.company', 'search_read', [[]], { fields: ['id', 'currency_id'], limit: 1 });
  const company = companies?.[0];
  if (!company?.currency_id?.[0]) throw odooMappingError('Odoo chưa cấu hình tiền tệ công ty.');
  const journals = await executeOdoo('account.journal', 'search_read', [[['type', '=', isVendorBill ? 'purchase' : 'sale'], ['company_id', '=', Number(company.id)], ['active', '=', true]]], { fields: ['id', 'default_account_id'], limit: 1 });
  const journal = journals?.[0];
  if (!journal?.default_account_id?.[0]) throw odooMappingError(`Chưa cấu hình nhật ký ${isVendorBill ? 'hóa đơn nhà cung cấp' : 'hóa đơn khách hàng'} với tài khoản mặc định trong Odoo.`);
  const subtotal = amount(data.subtotal ?? data.total);
  const taxAmount = amount(data.taxAmount);
  const taxes = await matchingTaxIds(isVendorBill ? 'purchase' : 'sale', subtotal, taxAmount);
  const items = Array.isArray(data.items) && data.items.length ? data.items : [{ name: data.description || data.title || data.code || 'Hóa đơn FinTax', quantity: 1, unitPrice: subtotal }];
  const taxNote = taxAmount > 0 && !taxes.length ? ` · Thuế nguồn ${taxAmount} VND chưa khớp thuế Odoo, cần rà soát` : '';
  const invoiceLines = items.map((item) => [0, 0, {
    name: `${String(item.name || item.description || data.description || data.code || 'Hóa đơn FinTax')}${taxNote}`,
    quantity: Math.max(0.000001, amount(item.quantity ?? 1)),
    price_unit: amount(item.unitPrice ?? item.unitCost ?? item.amount ?? 0),
    account_id: Number(journal.default_account_id[0]),
    ...(taxes.length ? { tax_ids: [[6, 0, taxes]] } : {}),
  }]);
  const values = {
    fintax_source_key: sourceKey,
    move_type: moveType,
    journal_id: Number(journal.id),
    company_id: Number(company.id),
    currency_id: Number(company.currency_id[0]),
    partner_id: partnerId,
    ref: String(data.code || sourceKey),
    invoice_origin: `FinTax:${sourceKey}`,
    invoice_date: data.date || data.issueDate || false,
    invoice_date_due: data.dueDate || false,
    narration: String(data.notes || data.description || ''),
    invoice_line_ids: invoiceLines,
  };
  const existing = await findSourceRecord('account.move', sourceKey, ['id', 'state']);
  let nativeId;
  if (!existing) nativeId = Number(await executeOdoo('account.move', 'create', [values], { context: { allowed_company_ids: [Number(company.id)] } }));
  else {
    nativeId = Number(existing.id);
    if (existing.state !== 'draft') {
      if (existing.state === 'cancel' && data.status === 'CANCELLED') return { model: 'account.move', id: nativeId };
      throw odooMappingError('Hóa đơn đã được ghi sổ hoặc hủy trong Odoo; không thể ghi đè tự động.');
    }
    if (data.status === 'CANCELLED') await executeOdoo('account.move', 'button_cancel', [[nativeId]]);
    else await executeOdoo('account.move', 'write', [[nativeId], values]);
  }
  if (!existing && data.status === 'CANCELLED') await executeOdoo('account.move', 'button_cancel', [[nativeId]]);
  return { model: 'account.move', id: nativeId };
}

export async function syncOdooPayment(data, sourceKey) {
  const isInbound = data.direction === 'RECEIVED';
  if (!isInbound && data.direction !== 'PAID') throw odooMappingError('Chọn chiều thu hoặc chi để ánh xạ thanh toán Odoo.');
  const partnerId = await resolvePartner(data, isInbound ? 'customer' : 'supplier');
  const account = data.accountId ? (await listRecords('cash-accounts')).find((row) => row.id === data.accountId) : null;
  if (!account) throw odooMappingError('Chưa tìm thấy tài khoản tiền của khoản thanh toán trong web.');
  const journalType = account.type === 'CASH' ? 'cash' : 'bank';
  const companies = await executeOdoo('res.company', 'search_read', [[]], { fields: ['id', 'currency_id'], limit: 1 });
  const company = companies?.[0];
  if (!company) throw odooMappingError('Odoo chưa có công ty để tạo phiếu thanh toán.');
  const journals = await executeOdoo('account.journal', 'search_read', [[['type', '=', journalType], ['company_id', '=', Number(company.id)], ['active', '=', true]]], { fields: ['id'], limit: 1 });
  if (!journals?.length) throw odooMappingError(`Odoo chưa có nhật ký ${journalType === 'cash' ? 'tiền mặt' : 'ngân hàng'} cho tài khoản ${account.name}.`);
  const methodLines = await executeOdoo('account.payment.method.line', 'search_read', [[['journal_id', '=', Number(journals[0].id)], ['payment_type', '=', isInbound ? 'inbound' : 'outbound']]], { fields: ['id'], limit: 1 });
  if (!methodLines?.length) throw odooMappingError(`Nhật ký Odoo ${journalType} chưa có phương thức thanh toán ${isInbound ? 'thu vào' : 'chi ra'}.`);
  const values = {
    fintax_source_key: sourceKey,
    payment_type: isInbound ? 'inbound' : 'outbound',
    partner_type: isInbound ? 'customer' : 'supplier',
    partner_id: partnerId,
    journal_id: Number(journals[0].id),
    payment_method_line_id: Number(methodLines[0].id),
    amount: amount(data.amount),
    currency_id: Number(company.currency_id?.[0] || 0),
    date: data.date || new Date().toISOString().slice(0, 10),
    ref: String(data.code || sourceKey),
  };
  const allocations = (await listRecords('payment-allocations')).filter((row) => row.paymentId === data.id);
  if (allocations.length) {
    const invoices = await listRecords('invoices');
    const invoiceCodes = allocations.map((allocation) => invoices.find((invoice) => invoice.id === allocation.invoiceId)?.code).filter(Boolean);
    if (invoiceCodes.length) values.ref = `${values.ref} · Hóa đơn ${invoiceCodes.join(', ')}`.slice(0, 255);
  }
  const existing = await findSourceRecord('account.payment', sourceKey, ['id', 'state']);
  let nativeId;
  if (!existing) {
    nativeId = Number(await executeOdoo('account.payment', 'create', [values], { context: { allowed_company_ids: [Number(company.id)] } }));
    if (data.status === 'CANCELLED') await executeOdoo('account.payment', 'action_cancel', [[nativeId]]);
  }
  else {
    nativeId = Number(existing.id);
    if (existing.state === 'cancel' && data.status === 'CANCELLED') return { model: 'account.payment', id: nativeId };
    if (existing.state !== 'draft') throw odooMappingError('Phiếu thanh toán đã được ghi sổ trong Odoo; không thể ghi đè tự động.');
    if (data.status === 'CANCELLED') await executeOdoo('account.payment', 'action_cancel', [[nativeId]]);
    else await executeOdoo('account.payment', 'write', [[nativeId], values]);
  }
  return { model: 'account.payment', id: nativeId };
}
