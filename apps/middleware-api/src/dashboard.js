import { active, businessDate, businessError, number } from './accounting.js';
import { booksFromData } from './ledgers.js';
import { smeFromData } from './sme-reports.js';

export function shiftDay(date, days) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function dateRange(from, to) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || !Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(to)) || new Date(`${from}T12:00:00Z`).toISOString().slice(0, 10) !== from || new Date(`${to}T12:00:00Z`).toISOString().slice(0, 10) !== to || from > to) throw businessError('Khoảng ngày không hợp lệ.');
  const count = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
  if (count > 366) throw businessError('Chọn khoảng thời gian tối đa 366 ngày.');
  return Array.from({ length: count }, (_, index) => shiftDay(from, index));
}
const sum = (rows, field) => rows.reduce((total, row) => total + number(row[field]), 0);
const cashDelta = (row) => row.direction === 'INCOME' || row.direction === 'TRANSFER' && row.transferSide === 'IN' ? number(row.amount) : -number(row.amount);

export function dashboardSnapshot(data, query = {}, integration = {}) {
  const today = businessDate(), to = String(query.to || today), from = String(query.from || `${to.slice(0, 7)}-01`);
  const days = dateRange(from, to), previousTo = shiftDay(from, -1), previousFrom = shiftDay(previousTo, 1 - days.length);
  const all = (entity) => (data[entity] || []).filter(active);
  const within = (row, start = from, end = to) => row.date >= start && row.date <= end;
  const invoices = all('invoices'), transactions = all('transactions'), accounts = all('cash-accounts').filter((row) => row.ownerScope !== 'PERSONAL');
  const accountIds = new Set(accounts.map((row) => row.id));
  const moneyTransactions = transactions.filter((row) => accountIds.has(row.accountId));
  const books = booksFromData(data, from, to).books, previousBooks = booksFromData(data, previousFrom, previousTo).books;
  const book = (code, source = books) => source.find((row) => row.code === code)?.rows || [];
  const balanceAt = (date, type) => sum(accounts.filter((row) => !type || row.type === type), 'balance') - moneyTransactions.filter((row) => row.date > date && (!type || accounts.find((account) => account.id === row.accountId)?.type === type)).reduce((total, row) => total + cashDelta(row), 0);
  const relevant = transactions.filter((row) => within(row)), priorTransactions = transactions.filter((row) => within(row, previousFrom, previousTo));
  const outstanding = (direction) => invoices.filter((row) => row.direction === direction && number(row.openBalance ?? row.total) > 0);
  const receivables = outstanding('OUTPUT'), payables = outstanding('INPUT');
  const overdue = receivables.filter((row) => row.dueDate && row.dueDate < today);
  const upcoming = payables.filter((row) => row.dueDate && row.dueDate >= today && row.dueDate <= shiftDay(today, 7));
  const taxRows = book('S4-HKD'), previousTax = book('S4-HKD', previousBooks);
  const tax = { outputVat: sum(taxRows, 'vatOutput'), inputVat: sum(taxRows, 'vatInput'), personalIncome: sum(taxRows, 'pit'), paid: sum(taxRows, 'vatPaid') + sum(taxRows, 'pitPaid'), liability: number(taxRows.at(-1)?.taxDue), method: invoices.some((row) => within(row) && (row.taxMode === 'HKD_REVENUE' || row.items?.some((item) => item.taxMode === 'HKD_REVENUE'))) ? 'MIXED_OR_HKD' : 'VAT_CREDIT' };
  const sme = smeFromData(data,from,to), priorSme = smeFromData(data,previousFrom,previousTo);
  const periodInvoices = invoices.filter((row) => within(row));
  const metrics = {
    balance: balanceAt(to), cashBalance: balanceAt(to, 'CASH'), bankBalance: balanceAt(to, 'BANK'),
    revenue: sum(relevant.filter((row) => row.classification === 'BUSINESS_INCOME'), 'amount'),
    expenses: sum(relevant.filter((row) => row.classification === 'BUSINESS_EXPENSE'), 'amount'),
    netRevenue: sme.summary.revenue, operatingCost: sme.summary.cogs + sme.summary.operatingExpense + sme.summary.financeExpense - sme.summary.financeIncome, rawMaterials:sme.summary.rawMaterials, finishedGoods:sme.summary.finishedGoods, wip:sme.summary.wip, cogs:sme.summary.cogs,
    actualReceipts: sum(relevant.filter((row) => row.direction === 'INCOME' && !['PERSONAL', 'OWNER_FUNDING'].includes(row.classification)), 'amount'),
    inputInvoices: sum(periodInvoices.filter((row) => row.direction === 'INPUT'), 'subtotal'),
    receivable: sum(all('customers'), 'receivable'), payable: sum(all('suppliers'), 'payable'),
    overdueAmount: overdue.reduce((total, row) => total + number(row.openBalance ?? row.total), 0), overdueCount: overdue.length,
    unpaidCount: receivables.length, upcomingCount: upcoming.length, upcomingAmount: upcoming.reduce((total, row) => total + number(row.openBalance ?? row.total), 0),
    taxLiability: Math.max(0, tax.liability), netCash: relevant.filter((row) => accountIds.has(row.accountId)).reduce((total, row) => total + cashDelta(row), 0),
  };
  const debtAt = (direction, date) => {
    const side = invoices.filter((row) => row.direction === direction);
    const currentOpen = side.reduce((total,row) => total + number(row.openBalance ?? row.total),0);
    const opening = all(direction === 'OUTPUT' ? 'customers' : 'suppliers').filter(row=>!row.openingDate||row.openingDate<=date).reduce((sum,row)=>sum+number(row.openingBalance),0);
    const allocations = all('payment-allocations').filter((row) => row.status !== 'UNALLOCATED' && row.date <= date);
    return opening + side.filter((row) => row.date <= date).reduce((total,row) => total + number(row.total) - allocations.filter((item) => item.invoiceId === row.id).reduce((paid,item) => paid + number(item.allocatedAmount) + number(item.discountAmount) + number(item.roundingAdjustment),0),0);
  };
  metrics.receivable = debtAt('OUTPUT',to); metrics.payable = debtAt('INPUT',to);
  const previous = { receivable: debtAt('OUTPUT',previousTo), payable: debtAt('INPUT',previousTo), balance: balanceAt(previousTo), netRevenue: priorSme.summary.revenue, operatingCost: priorSme.summary.cogs + priorSme.summary.operatingExpense + priorSme.summary.financeExpense - priorSme.summary.financeIncome, actualReceipts: sum(priorTransactions.filter((row) => row.direction === 'INCOME' && !['PERSONAL', 'OWNER_FUNDING'].includes(row.classification)), 'amount'), taxLiability: Math.max(0, number(previousTax.at(-1)?.taxDue)) };
  const comparison = Object.fromEntries(Object.keys(previous).map((key) => [key, { previous: previous[key], change: previous[key] ? Math.round((metrics[key] - previous[key]) / Math.abs(previous[key]) * 1000) / 10 : null }]));
  const chartTo = String(query.chartTo || to), chartFrom = String(query.chartFrom || shiftDay(chartTo, -13));
  const calendar = dateRange(chartFrom, chartTo), byDay = new Map(calendar.map((date) => [date, { date, thu: 0, chi: 0, net: 0, balance: 0 }]));
  for (const row of moneyTransactions.filter((txn) => within(txn, chartFrom, chartTo))) {
    const point = byDay.get(row.date);
    if (row.direction === 'INCOME') point.thu += number(row.amount);
    if (row.direction === 'EXPENSE') point.chi += number(row.amount);
  }
  let running = balanceAt(shiftDay(chartFrom, -1)), accumulated = 0;
  let trend = [...byDay.values()].map((point) => { point.net = point.thu - point.chi; accumulated += point.net; running += point.net; return { ...point, balance: running, accumulatedNet: accumulated }; });
  if (query.chartMode === 'month') {
    const groups = new Map();
    for (const point of trend) { const key = point.date.slice(0, 7); const value = groups.get(key) || { date: `${key}-01`, thu: 0, chi: 0, net: 0, balance: 0, accumulatedNet: 0 }; value.thu += point.thu; value.chi += point.chi; value.net += point.net; value.balance = point.balance; value.accumulatedNet = point.accumulatedNet; groups.set(key, value); }
    trend = [...groups.values()];
  }
  const expenseGroups = new Map([['materials', { name: 'Nguyên vật liệu', amount: 0, color: '#2563EB' }], ['labor', { name: 'Nhân công', amount: 0, color: '#7C3AED' }], ['utilities', { name: 'Điện, nước & nhà xưởng', amount: 0, color: '#F59E0B' }], ['other', { name: 'Vận chuyển & khác', amount: 0, color: '#64748B' }], ['tax', { name: 'Thuế tạm tính', amount: metrics.taxLiability, color: '#EF4444' }]]);
  for (const row of book('S3-HKD')) {
    const description = `${row.category || ''} ${row.items?.length ? row.items.map((item) => item.name).join(' ') : row.description || ''}`;
    const key = row.source === 'LABOR' ? 'labor' : /tiền điện|điện EVN|nước|thuê|EVN/i.test(description) ? 'utilities' : row.source === 'INPUT_INVOICE' && /thép|inox|gỗ|vật tư|MDF|sơn|bulong/i.test(description) ? 'materials' : 'other';
    expenseGroups.get(key).amount += number(row.expense);
  }
  const unclassified = transactions.filter((row) => ['UNCLASSIFIED', 'NEEDS_REVIEW'].includes(row.classification) || row.status === 'NEEDS_REVIEW');
  const reviewInvoices = invoices.filter((row) => ['REVIEW_REQUIRED', 'NEEDS_REVIEW'].includes(row.status) || row.direction === 'OUTPUT' && !row.mockTaxCode);
  const pendingQuotes = all('quotations').filter((row) => row.status === 'PENDING_APPROVAL');
  const reconciliationIssues = all('reconciliations').filter((row) => ['MISMATCH', 'UNRESOLVED', 'PARTIAL'].includes(row.status));
  const period = all('tax-periods').filter((row) => row.startDate <= to && row.endDate >= from).sort((a, b) => (a.status === 'LOCKED' ? -1 : 1) - (b.status === 'LOCKED' ? -1 : 1))[0];
  const recentDocuments = ['invoices', 'transactions', 'quotations', 'stock-movements'].flatMap((entity) => all(entity).map((row) => ({ id: row.id, entity, viewKey: row.code || row.id, code: row.code || row.externalReference || (entity === 'transactions' ? 'Giao dịch thu chi' : 'Chứng từ'), counterparty: row.counterparty || row.customerName || row.materialName, date: row.date, createdAt: row.createdAt, direction: row.direction || row.type, total: number(row.total ?? row.amount ?? number(row.quantity) * number(row.unitCost)), status: row.paymentStatus || row.status }))).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, 5);
  return {
    metrics, comparison, tax, from, to, previousFrom, previousTo, chartFrom, chartTo, trend,
    chartTotals: { income: sum(trend, 'thu'), expense: sum(trend, 'chi'), net: sum(trend, 'net') },
    expenseBreakdown: [...expenseGroups.values()].filter((row) => row.amount > 0),
    aging: { current: receivables.filter((row) => !row.dueDate || row.dueDate >= today).reduce((total, row) => total + number(row.openBalance ?? row.total), 0), overdue: metrics.overdueAmount },
    actions: { pendingQuotes: pendingQuotes.slice(0, 3), quotationCount: pendingQuotes.length, unclassifiedCount: unclassified.length, reviewInvoiceCount: reviewInvoices.length, reconciliationCount: reconciliationIssues.length, pendingOdoo: integration.pendingOdoo || 0 },
    production: all('production-orders').filter((row) => ['DRAFT', 'IN_PROGRESS'].includes(row.status)).slice(0, 4),
    lowStock: all('materials').filter((row) => number(row.stock) <= number(row.minStock)).slice(0, 5),
    recentDocuments, recentTransactions: relevant.slice(0, 5), quotations: pendingQuotes.slice(0, 4), invoices: periodInvoices.slice(0, 4),
    period: period ? { id: period.id, name: period.name, status: period.status, startDate: period.startDate, endDate: period.endDate } : { name: 'Kỳ chưa thiết lập', status: 'OPEN' },
    integrations: integration, alerts: all('alerts').filter((row) => row.status === 'OPEN').slice(0, 5), dataMode: 'DEMO',
  };
}
