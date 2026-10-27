import { randomUUID } from 'node:crypto';
import { getPool, getWorkshop, getRecord, getRecordForUpdate, listRecords, saveRecord, createAudit, assertOpenPeriod, decodeData } from './db.js';
import { active, allocationAmounts, businessError, calculateInvoice, invoiceDirection, number, businessDate } from './accounting.js';

export async function normalizeInvoice(data, wid) {
  const direction = invoiceDirection(data);
  const workshop = await getWorkshop(wid);
  const settings = workshop?.settings || {};
  const entities = ['tax-rules', 'products', 'materials'];
  const [rows] = await getPool().query('SELECT entity, record_id, data FROM records WHERE workshop_id = ? AND entity IN (?)', [wid, entities]);
  const records = rows.map((row) => ({ ...decodeData(row.data), id: row.record_id, entity: row.entity }));
  const date = data.date || businessDate();
  function resolve(value) {
    const item = records.find((row) => ['products', 'materials'].includes(row.entity) && row.id === (value.productId || value.materialId));
    if ((value.productId || value.materialId) && (!item || !active(item) || item.status==='INACTIVE')) throw businessError('Mặt hàng không tồn tại hoặc đã ngừng hoạt động.');
    const ruleId = Object.hasOwn(value, 'taxRuleId') && value.taxRuleId !== undefined ? value.taxRuleId : item?.[direction === 'INPUT' ? 'inputTaxRuleId' : 'outputTaxRuleId'];
    const rule = ruleId ? records.find((row) => row.entity === 'tax-rules' && (row.id === ruleId || row.code === ruleId)) : null;
    if (ruleId && (!rule || !active(rule) || rule.status === 'INACTIVE' || (rule.effectiveFrom && date < rule.effectiveFrom) || (rule.effectiveTo && date > rule.effectiveTo))) throw businessError('Quy tắc thuế không tồn tại, ngừng áp dụng hoặc ngoài thời hạn.');
    if (rule && settings.accountingRegime && settings.accountingRegime !== 'DEMO') {
      if (!['ACTIVE','APPROVED'].includes(rule.status)) throw businessError('Chủ doanh nghiệp cần xác nhận quy tắc thuế trước khi dùng.');
      if (settings.taxMethod && rule.taxMode !== settings.taxMethod) throw businessError('Quy tắc thuế không phù hợp phương pháp thuế của doanh nghiệp.');
    }
    if (settings.taxMethod === 'HKD_REVENUE' && !rule && !value.items?.length) throw businessError('HKD cần chọn quy tắc đã xác nhận để tách GTGT và TNCN.');
    return { ...value, ...(item ? { name: value.name || item.name, unitPrice: value.unitPrice ?? item.unitCost ?? item.price, unit: item.unit, taxRate: value.taxRate ?? item[direction === 'INPUT' ? 'inputTaxRate' : 'outputTaxRate'] } : {}), ...(direction==='INPUT'?{purchaseCategory:value.purchaseCategory||(item?.trackInventory!==false&&item?'INVENTORY':data.purchaseCategory||'OPERATING')}:{}), ...(rule ? { taxRuleId: rule.id, taxRate: rule.taxRate !== undefined ? number(rule.taxRate) : number(rule.vatRate) + (rule.taxMode === 'HKD_REVENUE' ? number(rule.pitRate) : 0), taxMode: rule.taxMode, vatRate: rule.vatRate, pitRate: rule.pitRate, taxTreatment: rule.taxTreatment } : {}) };
  }
  const value = resolve({ ...data, direction });
  if (data.items?.length) value.items = data.items.map((item) => resolve({ ...item, taxRuleId: item.taxRuleId !== undefined ? item.taxRuleId : value.taxRuleId, taxRate: item.taxRate ?? value.taxRate }));
  if (value.counterpartyId) {
    const partner = await getRecord(direction === 'INPUT' ? 'suppliers' : 'customers', value.counterpartyId, wid);
    if (!partner || !active(partner) || partner.status==='INACTIVE') throw businessError('Đối tác không thuộc doanh nghiệp hoặc đã ngừng hoạt động.');
    value.counterparty = partner.name; value.taxCode = partner.taxCode || value.taxCode;
  }
  if (direction === 'INPUT') {
    const inventory = value.items?.length && value.items.every(line => records.some(item => ['materials','products'].includes(item.entity) && item.id === (line.materialId || line.productId) && item.trackInventory !== false));
    value.purchaseCategory = value.purchaseCategory || (inventory ? 'INVENTORY' : 'OPERATING');
    const categories = new Set((value.items||[]).map(line=>line.purchaseCategory||value.purchaseCategory));
    if (categories.size>1) value.purchaseCategory='MIXED';
    else if(categories.size===1) value.purchaseCategory=[...categories][0];
    if (![...categories,value.purchaseCategory].every(category=>['INVENTORY','OPERATING','ASSET','MIXED'].includes(category))) throw businessError('Chọn khoản mục mua vật tư, chi phí hoặc tài sản.');
  }
  return calculateInvoice(value);
}

export async function updateInvoicePartner(executor, actorId, invoice, delta, wid) {
  const direction = invoiceDirection(invoice);
  const entity = direction === 'OUTPUT' ? 'customers' : 'suppliers';
  const field = direction === 'OUTPUT' ? 'receivable' : 'payable';
  const match = (await listRecords(entity, wid, executor)).find((row) => active(row) && ((invoice.counterpartyId && row.id === invoice.counterpartyId) || (invoice.taxCode && row.taxCode === invoice.taxCode) || row.name === invoice.counterparty));
  if (!match) { if (!invoice.counterparty || delta < 0) return null; return saveRecord(entity, { name: invoice.counterparty, taxCode: invoice.taxCode || '', [field]: delta, status: 'ACTIVE' }, actorId, wid, executor); }
  const partner = await getRecordForUpdate(entity, match.id, wid, executor);
  const invoices = (await listRecords('invoices', wid, executor)).filter(row => active(row) && invoiceDirection(row) === direction && (row.counterpartyId === partner.id || !row.counterpartyId && row.counterparty === partner.name));
  const openingBalance = number(partner.openingBalance);
  return saveRecord(entity, { ...partner, openingBalance, [field]: openingBalance + invoices.reduce((sum, row) => sum + number(row.openBalance ?? row.total), 0) }, actorId, wid, executor);
}

export async function transaction(wid, callback) {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('SELECT pg_advisory_xact_lock(hashtext(?))', [`period:${wid}`]);
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

async function audit(connection, actor, action, entity, before, after, reason) {
  await createAudit({ actor, action, entity, recordId: after.id, beforeData: before, afterData: after, reason, executor: connection });
}

export async function allocatePayment(data, actor) {
  const amounts = allocationAmounts(data), wid = actor.workshopId;
  return transaction(wid, async (connection) => {
    const payment = await getRecordForUpdate('payments', data.paymentId, wid, connection);
    const invoice = await getRecordForUpdate('invoices', data.invoiceId, wid, connection);
    if (!payment || !invoice) throw businessError('Không tìm thấy thanh toán hoặc hóa đơn.', 404);
    if (!active(payment) || !active(invoice)) throw businessError('Không phân bổ chứng từ đã hủy.', 409);
    await assertOpenPeriod(payment, wid, connection); await assertOpenPeriod(invoice, wid, connection);
    if ((payment.direction === 'RECEIVED' ? 'OUTPUT' : 'INPUT') !== invoiceDirection(invoice)) throw businessError('Chiều thanh toán không khớp loại hóa đơn.', 409);
    if ((payment.counterpartyId && invoice.counterpartyId && payment.counterpartyId !== invoice.counterpartyId) || String(payment.counterparty || '').trim().toLowerCase() !== String(invoice.counterparty || '').trim().toLowerCase()) throw businessError('Thanh toán và hóa đơn phải cùng đối tác.', 409);
    if (amounts.allocatedAmount > number(payment.amount) - number(payment.allocatedAmount)) throw businessError('Số tiền phân bổ vượt số dư phiếu.');
    if (amounts.settlementAmount > number(invoice.openBalance ?? invoice.total)) throw businessError('Giá trị tất toán vượt công nợ còn lại.');
    const value = { id: randomUUID(), paymentId: payment.id, invoiceId: invoice.id, date: data.date || payment.date, status: 'ACTIVE', ...amounts };
    const save = (entity, row) => saveRecord(entity, row, actor.id, wid, connection);
    if (amounts.bankFeeAmount) {
      const fee = await save('transactions', { date: value.date, description: `Phí ngân hàng ${payment.code}`, amount: amounts.bankFeeAmount, accountId: payment.accountId, accountName: payment.accountName, direction: 'EXPENSE', classification: 'BUSINESS_EXPENSE', status: 'CONFIRMED', source: 'ALLOCATION_FEE', allocationId: value.id });
      value.bankFeeTransactionId = fee.id;
      const account = await getRecordForUpdate('cash-accounts', payment.accountId, wid, connection);
      if (!account) throw businessError('Không tìm thấy tài khoản ngân hàng.', 409);
      await save('cash-accounts', { ...account, balance: number(account.balance) - amounts.bankFeeAmount });
    }
    if (amounts.discountAmount || amounts.roundingAdjustment || amounts.bankFeeAmount) {
      const adjustment = await save('accounting-adjustments', { date: value.date, allocationId: value.id, invoiceId: invoice.id, paymentId: payment.id, direction: invoice.direction, counterparty: invoice.counterparty, accountId: payment.accountId, status: 'ACTIVE', ...amounts });
      value.adjustmentId = adjustment.id;
    }
    const allocatedAmount = number(payment.allocatedAmount) + amounts.allocatedAmount;
    await save('payments', { ...payment, allocatedAmount, unallocatedAmount: number(payment.amount) - allocatedAmount, status: allocatedAmount === number(payment.amount) ? 'ALLOCATED' : 'PARTIAL' });
    const openBalance = number(invoice.openBalance ?? invoice.total) - amounts.settlementAmount;
    await save('invoices', { ...invoice, paidAmount: number(invoice.paidAmount) + amounts.allocatedAmount, settledAmount: number(invoice.settledAmount ?? invoice.paidAmount) + amounts.settlementAmount, openBalance, paymentStatus: openBalance === 0 ? 'PAID' : 'PARTIAL' });
    await updateInvoicePartner(connection, actor.id, invoice, -amounts.settlementAmount, wid);
    const saved = await save('payment-allocations', value);
    await audit(connection, actor, 'PAYMENT_ALLOCATED', 'payment-allocations', null, saved, amounts.writeOffReason);
    return saved;
  });
}

async function unallocate(connection, allocation, actor, reason) {
  const wid = actor.workshopId;
  if (!active(allocation)) throw businessError('Phân bổ đã được gỡ.', 409);
  const payment = await getRecordForUpdate('payments', allocation.paymentId, wid, connection);
  const invoice = await getRecordForUpdate('invoices', allocation.invoiceId, wid, connection);
  if (!payment || !invoice || !active(payment) || !active(invoice)) throw businessError('Chứng từ liên quan đã thay đổi.', 409);
  for (const row of [allocation, payment, invoice]) await assertOpenPeriod(row, wid, connection);
  const save = (entity, row) => saveRecord(entity, row, actor.id, wid, connection);
  const settlement = number(allocation.settlementAmount ?? allocation.allocatedAmount);
  const allocatedAmount = number(payment.allocatedAmount) - number(allocation.allocatedAmount);
  await save('payments', { ...payment, allocatedAmount, unallocatedAmount: number(payment.amount) - allocatedAmount, status: allocatedAmount > 0 ? 'PARTIAL' : 'CONFIRMED' });
  const paidAmount = number(invoice.paidAmount) - number(allocation.allocatedAmount);
  const settledAmount = number(invoice.settledAmount ?? invoice.paidAmount) - settlement;
  await save('invoices', { ...invoice, paidAmount, settledAmount, openBalance: number(invoice.openBalance ?? invoice.total) + settlement, paymentStatus: settledAmount > 0 ? 'PARTIAL' : 'UNPAID' });
  await updateInvoicePartner(connection, actor.id, invoice, settlement, wid);
  if (allocation.adjustmentId) {
    const adjustment = await getRecordForUpdate('accounting-adjustments', allocation.adjustmentId, wid, connection);
    if (adjustment) await save('accounting-adjustments', { ...adjustment, status: 'CANCELLED', cancellationReason: reason });
  }
  if (allocation.bankFeeTransactionId) {
    const fee = await getRecordForUpdate('transactions', allocation.bankFeeTransactionId, wid, connection);
    if (fee && active(fee)) {
      await save('transactions', { ...fee, status: 'CANCELLED', cancellationReason: reason });
      const account = await getRecordForUpdate('cash-accounts', fee.accountId, wid, connection);
      await save('cash-accounts', { ...account, balance: number(account.balance) + number(fee.amount) });
    }
  }
  const saved = await save('payment-allocations', { ...allocation, status: 'UNALLOCATED', unallocatedAt: new Date().toISOString(), unallocatedBy: actor.id, unallocateReason: reason });
  await audit(connection, actor, 'PAYMENT_UNALLOCATED', 'payment-allocations', allocation, saved, reason);
  return saved;
}

export async function unallocatePayment(id, actor, reason) {
  if (!String(reason || '').trim()) throw businessError('Bắt buộc nhập lý do gỡ phân bổ.');
  return transaction(actor.workshopId, async (connection) => {
    const allocation = await getRecordForUpdate('payment-allocations', id, actor.workshopId, connection);
    if (!allocation) throw businessError('Không tìm thấy phân bổ.', 404);
    return unallocate(connection, allocation, actor, reason.trim());
  });
}

export async function voidInvoice(id, actor, reason, autoUnallocate = false) {
  if (!String(reason || '').trim()) throw businessError('Bắt buộc nhập lý do hủy hóa đơn.');
  return transaction(actor.workshopId, async (connection) => {
    const wid = actor.workshopId;
    const before = await getRecordForUpdate('invoices', id, wid, connection);
    if (!before) throw businessError('Không tìm thấy hóa đơn.', 404);
    if (!active(before)) throw businessError('Hóa đơn đã hủy.', 409);
    if ((await listRecords('stock-movements',wid,connection)).some(row=>active(row)&&row.invoiceId===id)) throw businessError('Hóa đơn đã gắn phiếu kho. Xử lý phiếu kho trước khi hủy.',409);
    await assertOpenPeriod(before, wid, connection);
    const [rows] = await connection.query("SELECT record_id, data FROM records WHERE workshop_id = ? AND entity = 'payment-allocations' AND data->>'invoiceId' = ?", [wid, id]);
    const allocations = rows.map((row) => ({ ...decodeData(row.data), id: row.record_id })).filter(active);
    if (allocations.length && !autoUnallocate) throw businessError('Hóa đơn có thanh toán. Hãy gỡ phân bổ trước hoặc dùng Gỡ phân bổ tự động & Hủy.', 409);
    for (const allocation of allocations) await unallocate(connection, allocation, actor, reason);
    const invoice = await getRecord('invoices', id, wid, connection);
    const saved = await saveRecord('invoices', { ...invoice, status: 'CANCELLED', openBalance: 0, cancelledAt: new Date().toISOString(), cancellationReason: reason, odooUnreconcileRequested: true, statusHistory: [...(invoice.statusHistory || []), { status: 'CANCELLED', at: new Date().toISOString(), actor: actor.name, note: reason }] }, actor.id, wid, connection);
    await updateInvoicePartner(connection, actor.id, invoice, -number(invoice.total), wid);
    await audit(connection, actor, 'INVOICE_VOIDED', 'invoices', before, saved, reason);
    return saved;
  });
}

export async function reviseQuotation(id, actor, overrides = {}) {
  return transaction(actor.workshopId, async (connection) => {
    const wid = actor.workshopId, before = await getRecordForUpdate('quotations', id, wid, connection);
    if (!before || !['REJECTED', 'APPROVED', 'SENT', 'ACCEPTED'].includes(before.status)) throw businessError('Chỉ tạo phiên bản mới từ báo giá bị từ chối, đã duyệt, đã gửi hoặc đã chấp nhận.', 409);
    const rootId = before.parentQuoteId || before.id;
    const related = (await listRecords('quotations', wid, connection)).filter((row) => row.id === rootId || row.parentQuoteId === rootId);
    const version = Math.max(1, ...related.map((row) => number(row.version || 1))) + 1;
    const copy = structuredClone({ ...before, ...overrides });
    for (const key of ['id', 'syncStatus', 'odooId', 'odooModel', 'odooUrl', 'odooMirrorId', 'productionOrderId', 'productionCreatedAt', 'acceptedAt', 'sentAt', 'approvedAt']) delete copy[key];
    const rootCode = before.rootCode || before.code.replace(/-v\d+$/i, '');
    const saved = await saveRecord('quotations', { ...copy, id: randomUUID(), code: `${rootCode}-v${version}`, rootCode, version, status: 'DRAFT', parentQuoteId: rootId, previousVersionId: before.id, rejectionNote: before.rejectionNote || before.sourceRejectionNote || '', sourceRejectionNote: before.rejectionNote || before.sourceRejectionNote || '', createdAt: new Date().toISOString() }, actor.id, wid, connection);
    await audit(connection, actor, 'QUOTATION_REVISED', 'quotations', before, saved, before.rejectionNote);
    return saved;
  });
}
