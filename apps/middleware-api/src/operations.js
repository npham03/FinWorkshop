import { randomUUID } from 'node:crypto';
import { getPool, getRecord, getRecordForUpdate, listRecords, saveRecord, createAudit, assertOpenPeriod } from './db.js';
import { active, businessDate, businessError, money, number } from './accounting.js';
import { normalizeInvoice, transaction } from './workflows.js';

const nonnegative = (value, label) => {
  const result = Number(value ?? 0);
  if (!Number.isFinite(result) || result < 0) throw businessError(`${label} phải là số không âm.`);
  return result;
};
export const incomingStock = (type) => ['OPENING', 'RECEIPT', 'RETURN', 'FINISHED_RECEIPT', 'ADJUST_IN'].includes(type);
export function operationalView(entity, row, role) {
  if (!['WORKSHOP','WAREHOUSE'].includes(role)) return row;
  const fields = entity === 'labor-logs' ? ['id','productionOrderId','employeeName','stage','hours','date','note','status'] : entity === 'production-orders' ? ['id','code','productId','productName','customerName','quantity','stage','progress','laborHours','plannedLaborHours','dueDate','status','assignedTo','quotationCode','finishedReceiptId'] : ['id','code','materialId','productId','materialName','quantity','unit','type','productionOrderId','sourceIssueId','invoiceId','invoiceLineIndex','date','status','note','reason'];
  const result = Object.fromEntries(fields.filter(key => row[key] !== undefined).map(key => [key,row[key]]));
  if (entity === 'production-orders' && row.bom) result.bom = { version:row.bom.version,items:(row.bom.items||[]).map(({materialId,name,unit,quantity})=>({materialId,name,unit,quantity})) };
  return result;
}
const audit = (actor, action, entity, before, after, connection, reason) => createAudit({ actor, action, entity, recordId: after.id, beforeData: before, afterData: after, reason, executor: connection });

export async function validateMaster(entity, data, before, actor) {
  const value = { ...data };
  const masters = ['customers', 'suppliers', 'materials', 'products', 'cash-accounts','branches'];
  if (!masters.includes(entity)) return value;
  value.name = String(value.name || '').trim();
  if (!value.name) throw businessError('Nhập tên danh mục.');
  value.status = value.status || 'ACTIVE';
  if (!['ACTIVE','INACTIVE'].includes(value.status)) throw businessError('Danh mục có trạng thái đang hoạt động hoặc ngừng hoạt động.');
  value.code = String(value.code || before?.code || '').trim();
  if (['materials', 'products'].includes(entity)) {
    value.trackInventory = value.trackInventory !== false && value.trackInventory !== 'false';
    value.unit = String(value.unit || '').trim();
    if (value.trackInventory && !value.unit) throw businessError('Nhập đơn vị tính cho mặt hàng quản lý tồn kho.');
    for (const key of ['price', 'cost', 'unitCost', 'minStock']) if (value[key] !== undefined) value[key] = nonnegative(value[key], 'Đơn giá / tồn tối thiểu');
    if (!before && number(value.stock) !== 0) throw businessError('Khai báo tồn đầu kỳ bằng phiếu “Tồn đầu kỳ” tại Kho.');
    if (before && (number(value.stock) !== number(before.stock) || value.stockValue !== undefined && number(value.stockValue) !== number(before.stockValue))) throw businessError('Tồn kho chỉ thay đổi qua phiếu nhập, xuất hoặc kiểm kê.', 409);
    if (before && value.trackInventory !== (before.trackInventory !== false) && (number(before.stock) || (await listRecords('stock-movements', actor.workshopId)).some(row => active(row) && (row.materialId === before.id || row.productId === before.id)))) throw businessError('Mặt hàng đã có tồn/phiếu kho; không đổi phương thức quản lý tồn.', 409);
    value.stock = number(before?.stock); value.stockValue = number(before?.stockValue ?? number(before?.stock) * number(before?.unitCost));
  }
  if (['customers', 'suppliers'].includes(entity)) {
    const field = entity === 'customers' ? 'receivable' : 'payable';
    if (number(value[field]) !== number(before?.[field])) throw businessError('Công nợ được tính từ chứng từ; dùng “Công nợ đầu kỳ” để khai báo.', 409);
    if (before && value.openingBalance !== undefined && number(value.openingBalance) !== number(before.openingBalance)) throw businessError('Không sửa số dư đầu kỳ trong hồ sơ đối tác.', 409);
    value[field] = number(before?.[field]); value.openingBalance = number(before?.openingBalance);
    if (value.taxCode && !/^\d{10}(?:-?\d{3})?$/.test(String(value.taxCode).trim())) throw businessError('Mã số thuế gồm 10 hoặc 13 chữ số.');
    if (value.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) throw businessError('Email đối tác chưa hợp lệ.');
  }
  return value;
}

export async function normalizeBom(data, wid) {
  const value = { ...data };
  if (!String(value.productName || value.name || '').trim()) throw businessError('Chọn sản phẩm cho định mức.');
  if (!Array.isArray(value.items) || !value.items.length) throw businessError('Định mức cần ít nhất một dòng vật tư.');
  value.items = await Promise.all(value.items.map(async row => {
    const material = await getRecord('materials', row.materialId, wid);
    if (!material || !active(material) || material.status==='INACTIVE' || material.trackInventory === false) throw businessError('Chọn vật tư đang quản lý tồn kho.');
    const quantity = nonnegative(row.quantity, 'Định lượng');
    if (!quantity) throw businessError('Định lượng vật tư phải lớn hơn 0.');
    return { materialId: material.id, name: material.name, unit: material.unit, quantity, unitCost: number(material.unitCost), amount: Math.round(quantity * number(material.unitCost)) };
  }));
  if (new Set(value.items.map(row => row.materialId)).size !== value.items.length) throw businessError('Gộp các dòng cùng vật tư trong định mức.');
  value.materialCost = value.items.reduce((sum, row) => sum + row.amount, 0);
  for (const key of ['laborHours','laborRate','machineCost']) value[key] = nonnegative(value[key], key === 'laborHours' ? 'Giờ công định mức' : 'Chi phí định mức');
  for (const key of ['wasteRate','marginRate']) {
    const rate = nonnegative(value[key], 'Tỷ lệ');
    value[key] = rate > 1 ? rate / 100 : rate;
    if (value[key] >= 1) throw businessError('Tỷ lệ hao hụt/biên lợi nhuận phải nhỏ hơn 100%.');
  }
  value.version = Math.max(1, Math.trunc(number(value.version) || 1));
  value.status = value.status || 'ACTIVE';
  return value;
}

export async function normalizeQuotation(data, wid, patch = data) {
  let value = { ...data };
  if (value.bomId) {
    const bom = await getRecord('boms', value.bomId, wid);
    if (!bom || !active(bom)) throw businessError('Định mức không tồn tại hoặc đã ngừng dùng.');
    if (!value.bom || patch.bomId !== undefined) value.bom = structuredClone(bom);
    for (const key of ['materialCost','laborHours','laborRate','machineCost','wasteRate','marginRate']) if (patch[key] === undefined) value[key] = value.bom[key];
    value.productId ||= bom.productId;
  }
  value.title = String(value.title || '').trim();
  value.customerName = String(value.customerName || '').trim();
  if (!value.title) throw businessError('Nhập sản phẩm/dịch vụ báo giá.');
  const quantity = nonnegative(value.quantity ?? 1, 'Số lượng');
  if (!quantity) throw businessError('Số lượng báo giá phải lớn hơn 0.');
  const ratio = input => { const n = nonnegative(input, 'Tỷ lệ'); return n > 1 ? n / 100 : n; };
  value.wasteRate = ratio(value.wasteRate); value.marginRate = ratio(value.marginRate);
  if (value.marginRate >= 1 || value.wasteRate >= 1) throw businessError('Tỷ lệ phải nhỏ hơn 100%.');
  value.costEstimate = Math.round((nonnegative(value.materialCost, 'Chi phí vật tư') + nonnegative(value.laborHours, 'Giờ công') * nonnegative(value.laborRate, 'Đơn giá giờ công') + nonnegative(value.machineCost, 'Chi phí máy')) * (1 + value.wasteRate));
  value.suggestedUnitPrice = Math.round(value.costEstimate / (1 - value.marginRate));
  value.quantity = quantity; value.unitPrice = money(value.unitPrice || value.suggestedUnitPrice, 'Đơn giá');
  // The current quotation editor represents one product; a header edit replaces its line.
  const lineChanged = ['quantity','unitPrice','title','taxRate','taxRuleId','productId'].some(key => Object.hasOwn(patch, key));
  if (!value.items?.length || lineChanged && !Object.hasOwn(patch, 'items')) value.items = [{ productId: value.productId || undefined, name: value.title, unit: value.unit || 'sản phẩm', quantity, unitPrice: value.unitPrice, taxRuleId: value.taxRuleId || '', taxRate: number(value.taxRate) }];
  delete value.total; delete value.totalAmount; delete value.subtotal; delete value.taxAmount;
  return normalizeInvoice({ ...value, direction: 'OUTPUT', type: 'OUTPUT', taxRate: number(value.taxRate) }, wid);
}

export async function createOpeningBalance(data, actor) {
  if (actor.role !== 'OWNER') throw businessError('Chủ doanh nghiệp khai báo số dư đầu kỳ.', 403);
  const entity = data.partnerType === 'CUSTOMER' ? 'customers' : data.partnerType === 'SUPPLIER' ? 'suppliers' : '';
  if (!entity) throw businessError('Chọn khách hàng hoặc nhà cung cấp.');
  const amount = money(data.amount, 'Công nợ đầu kỳ'), date = String(data.date || ''), reason = String(data.reason || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !reason) throw businessError('Nhập ngày đầu kỳ và căn cứ số dư.');
  return transaction(actor.workshopId, async connection => {
    const partner = await getRecordForUpdate(entity, data.partnerId, actor.workshopId, connection);
    if (!partner || !active(partner)) throw businessError('Đối tác không tồn tại.');
    if ((await listRecords('opening-balances', actor.workshopId, connection)).some(row => active(row) && row.partnerId === partner.id)) throw businessError('Đối tác đã có chứng từ đầu kỳ.', 409);
    const invoices = (await listRecords('invoices', actor.workshopId, connection)).filter(row => active(row) && (row.counterpartyId === partner.id || row.counterparty === partner.name));
    if (invoices.some(row => row.date < date)) throw businessError('Ngày đầu kỳ phải trước hóa đơn đã ghi nhận.', 409);
    const saved = await saveRecord('opening-balances', { ...data, id: randomUUID(), date, amount, reason, partnerName: partner.name, status: 'CONFIRMED' }, actor.id, actor.workshopId, connection);
    const field = entity === 'customers' ? 'receivable' : 'payable';
    await saveRecord(entity, { ...partner, openingBalance: amount, openingDate: date, [field]: amount + invoices.reduce((sum, row) => sum + number(row.openBalance ?? row.total), 0) }, actor.id, actor.workshopId, connection);
    await audit(actor, 'OPENING_BALANCE', 'opening-balances', null, saved, connection, reason);
    return saved;
  });
}

async function applyStock(connection, data, actor, internal = false) {
  const wid = actor.workshopId, type = String(data.type || '');
  const supported = ['OPENING','RECEIPT','ISSUE','RETURN','WASTE','ADJUST_IN','ADJUST_OUT','FINISHED_RECEIPT','DELIVERY','RETURN_PURCHASE'];
  if (!supported.includes(type)) throw businessError('Loại phiếu kho không hợp lệ.');
  if (type === 'FINISHED_RECEIPT' && !internal) throw businessError('Nhập thành phẩm từ thao tác nghiệm thu lệnh sản xuất.');
  if (['OPENING','ADJUST_IN','ADJUST_OUT'].includes(type) && actor.role !== 'OWNER') throw businessError('Chủ doanh nghiệp duyệt tồn đầu kỳ và điều chỉnh kiểm kê.', 403);
  const itemEntity = data.itemEntity === 'products' || data.productId ? 'products' : 'materials';
  const id = data.productId || data.materialId;
  const material = id ? await getRecordForUpdate(itemEntity, id, wid, connection) : (await listRecords(itemEntity, wid, connection)).find(row => row.name === data.materialName);
  if (!material || !active(material) || material.status==='INACTIVE' || material.trackInventory === false) throw businessError('Chọn mặt hàng đang quản lý tồn kho.');
  const item = id ? material : await getRecordForUpdate(itemEntity, material.id, wid, connection);
  const quantity = nonnegative(data.quantity, 'Số lượng');
  if (!quantity) throw businessError('Số lượng phải lớn hơn 0.');
  const movements = (await listRecords('stock-movements', wid, connection)).filter(active);
  const same = row => (row.productId || row.materialId) === item.id;
  if (movements.some(row => same(row) && row.date > (data.date || businessDate()))) throw businessError('Mặt hàng đã có phát sinh sau ngày này. Ghi điều chỉnh ở ngày hiện tại để giữ đúng giá vốn.',409);
  const job = data.productionOrderId ? await getRecordForUpdate('production-orders', data.productionOrderId, wid, connection) : null;
  if (actor.role === 'WORKSHOP' && (!job || !['ISSUE','RETURN','WASTE'].includes(type) || ![actor.id, actor.name].includes(job.assignedTo))) throw businessError('Chỉ ghi vật tư cho lệnh được phân công.', 403);
  if (data.productionOrderId && (!job || !active(job) || ['COMPLETED','READY_FOR_RECEIPT'].includes(job.status))) throw businessError('Lệnh không còn nhận phát sinh vật tư.', 409);
  if (['ISSUE','WASTE'].includes(type) && !job) throw businessError('Chọn lệnh sản xuất nhận vật tư.');
  if (type === 'OPENING' && (number(item.stock) || movements.some(same))) throw businessError('Mặt hàng đã có tồn hoặc phát sinh; dùng kiểm kê điều chỉnh.', 409);
  if (['OPENING','ADJUST_IN','ADJUST_OUT'].includes(type) && !String(data.reason || data.note || '').trim()) throw businessError('Nhập căn cứ số dư hoặc lý do kiểm kê.');
  let unitCost = number(item.unitCost ?? item.cost), sourceIssueId = data.sourceIssueId || data.issueId;
  if (type === 'RETURN') {
    let source = movements.find(row => row.id === sourceIssueId && row.type === 'ISSUE' && same(row));
    if (!source && !sourceIssueId && job) {
      const candidates = movements.filter(row => row.type === 'ISSUE' && same(row) && row.productionOrderId === job.id);
      if (candidates.length === 1) source = candidates[0];
    }
    if (!source || source.productionOrderId !== data.productionOrderId) throw businessError('Chọn phiếu xuất gốc của vật tư/lệnh cần trả.');
    const returned = movements.filter(row => row.type === 'RETURN' && row.sourceIssueId === source.id).reduce((sum, row) => sum + number(row.quantity), 0);
    if (quantity + returned > number(source.quantity)) throw businessError('Số trả vượt số đã xuất còn lại.', 409);
    sourceIssueId = source.id; unitCost = number(source.amount ?? number(source.quantity)*number(source.unitCost))/number(source.quantity);
  }
  let invoice = null, invoiceLineIndex = Number(data.invoiceLineIndex ?? 0);
  if (data.invoiceId) {
    invoice = await getRecord('invoices', data.invoiceId, wid, connection);
    if (!invoice || !active(invoice) || invoice.direction !== (type === 'DELIVERY' ? 'OUTPUT' : 'INPUT')) throw businessError('Hóa đơn không khớp chiều nhập/xuất.');
    const line = invoice.items?.[invoiceLineIndex];
    if (!line || (line.productId || line.materialId) !== item.id) throw businessError('Chọn đúng dòng mặt hàng trong hóa đơn.');
    const done = movements.filter(row => row.invoiceId === invoice.id && row.invoiceLineIndex === invoiceLineIndex && row.type === type).reduce((sum, row) => sum + number(row.quantity), 0);
    if (done + quantity > number(line.quantity)) throw businessError('Số lượng vượt số còn lại trên dòng hóa đơn.', 409);
    if (type === 'RECEIPT') unitCost = number(line.unitPrice) + (invoice.inputVatDeductible === true ? 0 : number(line.taxAmount) / number(line.quantity));
  }
  if (type === 'DELIVERY' && (!invoice || itemEntity !== 'products')) throw businessError('Xuất bán thành phẩm cần hóa đơn bán ra có đúng mặt hàng.');
  if (type === 'RETURN_PURCHASE') throw businessError('Dùng phiếu xuất điều chỉnh có chứng từ mua điều chỉnh; không tự giảm công nợ từ phiếu kho.');
  if (['OPENING','RECEIPT','ADJUST_IN','FINISHED_RECEIPT'].includes(type) && !invoice) unitCost = money(data.unitCost ?? unitCost, 'Đơn giá nhập');
  const delta = (incomingStock(type) ? 1 : -1) * quantity;
  if (number(item.stock) + delta < -1e-8) throw businessError('Tồn kho không đủ.', 409);
  const oldValue = number(item.stockValue ?? number(item.stock) * number(item.unitCost ?? item.cost));
  const amount = internal && data.receiptValue !== undefined ? money(data.receiptValue,'Giá trị nhập thành phẩm') : !incomingStock(type) && quantity === number(item.stock) ? oldValue : Math.round(quantity * unitCost);
  const stockValue = oldValue + (incomingStock(type) ? amount : -amount), stock = number(item.stock) + delta;
  const sequence = Math.max(0,...movements.filter(same).map(row=>number(row.sequence)))+1;
  const saved = await saveRecord('stock-movements', { ...data, id: randomUUID(), sequence, date: data.date || businessDate(), type, quantity, itemEntity, materialId: itemEntity === 'materials' ? item.id : undefined, productId: itemEntity === 'products' ? item.id : undefined, materialName: item.name, unit: item.unit, unitCost, amount, sourceIssueId, invoiceLineIndex: invoice ? invoiceLineIndex : undefined, status: 'CONFIRMED', stockBefore: number(item.stock), stockAfter: stock, stockValueBefore: oldValue, stockValueAfter: stockValue, reason: data.reason || data.note || '' }, actor.id, wid, connection);
  await saveRecord(itemEntity, { ...item, stock, stockValue, unitCost: stock ? Math.round(stockValue / stock) : unitCost }, actor.id, wid, connection);
  await audit(actor, 'STOCK_POSTED', 'stock-movements', null, saved, connection, saved.reason);
  return saved;
}

export const createStockMovement = (data, actor) => transaction(actor.workshopId, connection => applyStock(connection, data, actor));

export async function cancelStockMovement(id, actor, reason) {
  if (actor.role !== 'OWNER' || !String(reason || '').trim()) throw businessError('Chủ doanh nghiệp hủy phiếu kèm lý do.', 403);
  return transaction(actor.workshopId, async connection => {
    const before = await getRecordForUpdate('stock-movements', id, actor.workshopId, connection);
    if (!before || !active(before)) throw businessError('Phiếu đã hủy hoặc không tồn tại.', 409);
    const movements = (await listRecords('stock-movements', actor.workshopId, connection)).filter(active);
    if (movements.some(row => row.sourceIssueId === id)) throw businessError('Hủy các phiếu trả tham chiếu trước khi hủy phiếu xuất.', 409);
    if (before.type==='FINISHED_RECEIPT') throw businessError('Phiếu nghiệm thu cần xử lý thành phẩm và mở lại lệnh; không hủy trực tiếp.', 409);
    const entity = before.itemEntity || (before.productId ? 'products' : 'materials');
    const itemId = before.productId || before.materialId;
    if(!before.sequence)throw businessError('Phiếu cũ chưa có thứ tự định giá; dùng phiếu kiểm kê điều chỉnh có căn cứ.',409);
    const later = movements.some(row => (row.productId || row.materialId) === itemId && number(row.sequence)>number(before.sequence));
    if (later) throw businessError('Đã có phát sinh sau phiếu này; điều chỉnh bằng phiếu kiểm kê để giữ giá trị tồn.', 409);
    const item = await getRecordForUpdate(entity, itemId, actor.workshopId, connection);
    if (!item) throw businessError('Không tìm thấy mặt hàng.');
    await saveRecord(entity, { ...item, stock: before.stockBefore, stockValue: before.stockValueBefore, unitCost: before.stockBefore ? Math.round(before.stockValueBefore / before.stockBefore) : item.unitCost }, actor.id, actor.workshopId, connection);
    const saved = await saveRecord('stock-movements', { ...before, status: 'CANCELLED', cancellationReason: reason }, actor.id, actor.workshopId, connection);
    await audit(actor, 'STOCK_CANCELLED', 'stock-movements', before, saved, connection, reason);
    return saved;
  });
}

export async function productionAction(id, action, data, actor) {
  return transaction(actor.workshopId, async connection => {
    const before = await getRecordForUpdate('production-orders', id, actor.workshopId, connection);
    if (!before || !active(before)) throw businessError('Lệnh không tồn tại hoặc đã hủy.', 409);
    if (actor.role === 'WORKSHOP' && ![actor.id,actor.name].includes(before.assignedTo)) throw businessError('Lệnh chưa được phân công cho bạn.', 403);
    let after = { ...before };
    if (action === 'start') {
      if (before.status !== 'DRAFT') throw businessError('Chỉ bắt đầu lệnh mới; lệnh hoàn thành cần mở lại có lý do.', 409);
      after.status = 'IN_PROGRESS'; after.stage = 'Đang sản xuất'; after.startedAt = new Date().toISOString();
    } else if (action === 'progress') {
      if (!['DRAFT','IN_PROGRESS'].includes(before.status)) throw businessError('Lệnh đã chốt tiến độ.', 409);
      const progress = Number(data.progress);
      if (!Number.isInteger(progress) || progress < 0 || progress > 100) throw businessError('Tiến độ phải từ 0 đến 100%.');
      after.progress = progress; after.stage = String(data.stage || before.stage || 'Đang sản xuất');
      if (progress > 0) after.status = 'IN_PROGRESS';
    } else if (action === 'complete') {
      if (before.status !== 'IN_PROGRESS') throw businessError('Chỉ hoàn thành lệnh đang sản xuất.', 409);
      const movements = (await listRecords('stock-movements', actor.workshopId, connection)).filter(row => active(row) && row.productionOrderId === id);
      const labor = (await listRecords('labor-logs', actor.workshopId, connection)).filter(row => active(row) && row.productionOrderId === id);
      const shortage = (before.bom?.items || []).some(item => movements.filter(row => row.materialId === item.materialId).reduce((sum, row) => sum + (row.type === 'RETURN' ? -1 : row.type === 'ISSUE' || row.type === 'WASTE' ? 1 : 0) * number(row.quantity), 0) < number(item.quantity) * number(before.quantity));
      if ((shortage || number(before.plannedLaborHours) > 0 && !labor.length) && !String(data.note || '').trim()) throw businessError('Vật tư/giờ công chưa đủ định mức. Nhập lý do chênh lệch trước khi kết thúc.', 409);
      after.status = before.productId ? 'READY_FOR_RECEIPT' : 'COMPLETED'; after.progress = 100; after.stage = before.productId ? 'Chờ nghiệm thu thành phẩm' : 'Hoàn thành dịch vụ'; after.completionNote = String(data.note || '');
      after.completedAt = new Date().toISOString();
    } else if (action === 'receive-finished') {
      if (!['OWNER','WAREHOUSE','ACCOUNTANT'].includes(actor.role)) throw businessError('Chỉ người nghiệm thu được nhập thành phẩm.', 403);
      if (before.status !== 'READY_FOR_RECEIPT' || !before.productId) throw businessError('Lệnh chưa sẵn sàng nghiệm thu.', 409);
      const material = (await listRecords('stock-movements', actor.workshopId, connection)).filter(row => active(row) && row.productionOrderId === id);
      const labor = (await listRecords('labor-logs', actor.workshopId, connection)).filter(row => active(row) && row.productionOrderId === id);
      const actualMaterialCost = material.reduce((sum, row) => sum + (row.type === 'RETURN' ? -1 : ['ISSUE','WASTE'].includes(row.type) ? 1 : 0) * number(row.amount ?? number(row.quantity) * number(row.unitCost)), 0);
      const actualLaborCost = labor.reduce((sum, row) => sum + Math.round(number(row.hours) * number(row.hourlyRate)), 0);
      const machineCost = money(data.machineCost ?? before.plannedMachineCost, 'Chi phí máy thực tế');
      const totalCost = actualMaterialCost + actualLaborCost + machineCost;
      if (number(before.quantity) <= 0 || totalCost < 0) throw businessError('Số lượng/giá thành lệnh không hợp lệ.');
      after.actualMaterialCost = actualMaterialCost; after.actualLaborCost = actualLaborCost; after.actualMachineCost = machineCost; after.totalCost = totalCost; after.unitCost = Math.round(totalCost / number(before.quantity));
      // Mark the job completed in this same transaction before applying its receipt.
      after.status = 'COMPLETED'; after.stage = 'Đã nghiệm thu'; after.acceptedBy = actor.name; after.acceptedAt = new Date().toISOString();
      const receipt = await applyStock(connection, { code: `NK-${before.code}`, type: 'FINISHED_RECEIPT', productId: before.productId, quantity: before.quantity, unitCost: after.unitCost, receiptValue:totalCost, date: data.date || businessDate(), productionOrderId: undefined, sourceProductionOrderId: id, note: `Nghiệm thu ${before.code}` }, actor, true);
      after.finishedReceiptId = receipt.id;
    } else if (action === 'reopen') {
      if (actor.role !== 'OWNER' || !String(data.note || '').trim()) throw businessError('Chủ doanh nghiệp mở lại lệnh kèm lý do.', 403);
      if (!['COMPLETED','READY_FOR_RECEIPT'].includes(before.status)) throw businessError('Chỉ mở lại lệnh đã kết thúc.', 409);
      if (before.finishedReceiptId) throw businessError('Lệnh đã nhập thành phẩm; cần xử lý thành phẩm và giá thành trước khi mở lại.', 409);
      after.status = 'IN_PROGRESS'; after.progress = Math.min(number(before.progress), 99); after.stage = 'Đã mở lại'; after.reopenReason = String(data.note);
    } else throw businessError('Thao tác sản xuất không hợp lệ.');
    await assertOpenPeriod({ date: data.date || businessDate() }, actor.workshopId, connection);
    const saved = await saveRecord('production-orders', after, actor.id, actor.workshopId, connection);
    await audit(actor, `PRODUCTION_${action.toUpperCase()}`, 'production-orders', before, saved, connection, data.note);
    return saved;
  });
}
