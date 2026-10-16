import xmlrpc from 'xmlrpc';
import { config } from '../config/config.js';

/**
 * ODOO SERVICE — Singleton kết nối Odoo 16 qua XML-RPC
 *
 * Odoo XML-RPC có 2 endpoint:
 *  - /xmlrpc/2/common  → authenticate (lấy uid)
 *  - /xmlrpc/2/object  → execute_kw (CRUD dữ liệu)
 */
const odooUrl = new URL(config.odoo.url);
const clientOptions = {
  host: odooUrl.hostname,
  port: odooUrl.port ? parseInt(odooUrl.port) : (odooUrl.protocol === 'https:' ? 443 : 80),
  path: '/xmlrpc/2/object',
};

const commonOptions = { ...clientOptions, path: '/xmlrpc/2/common' };

const commonClient = odooUrl.protocol === 'https:'
  ? xmlrpc.createSecureClient(commonOptions)
  : xmlrpc.createClient(commonOptions);

const objectClient = odooUrl.protocol === 'https:'
  ? xmlrpc.createSecureClient(clientOptions)
  : xmlrpc.createClient(clientOptions);

/** Wrapper Promise cho xmlrpc callback */
const callXmlRpc = (client, method, params) =>
  new Promise((resolve, reject) => {
    client.methodCall(method, params, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });

/** Cache uid để không authenticate lại mỗi request */
let cachedUid = null;

const authenticate = async () => {
  if (cachedUid) return cachedUid;
  const uid = await callXmlRpc(commonClient, 'authenticate', [
    config.odoo.db,
    config.odoo.username,
    config.odoo.password,
    {},
  ]);
  if (!uid) throw new Error('Odoo authentication thất bại. Kiểm tra lại credentials.');
  cachedUid = uid;
  return uid;
};

const execute = async (model, method, args, kwargs = {}) => {
  const uid = await authenticate();
  return callXmlRpc(objectClient, 'execute_kw', [
    config.odoo.db,
    uid,
    config.odoo.password,
    model,
    method,
    args,
    kwargs,
  ]);
};

/**
 * Đẩy bút toán kép (journal entry) vào Odoo - account.move
 * @returns {number} odooMoveId - ID của bản ghi account.move mới tạo
 */
export const pushJournalEntry = async ({ description, amount, debitAccount, creditAccount, date }) => {
  const moveVals = {
    name: '/',
    date: date || new Date().toISOString().split('T')[0],
    ref: description,
    journal_id: 1, // Nhật ký tiền mặt - cần cấu hình đúng journal_id thực tế
    move_type: 'entry',
    line_ids: [
      [0, 0, {
        name: description,
        account_id: await resolveAccountId(debitAccount),
        debit: amount,
        credit: 0,
      }],
      [0, 0, {
        name: description,
        account_id: await resolveAccountId(creditAccount),
        debit: 0,
        credit: amount,
      }],
    ],
  };

  const moveId = await execute('account.move', 'create', [moveVals]);

  // Post (confirm) the journal entry
  await execute('account.move', 'action_post', [[moveId]]);

  return moveId;
};

/** Cache tài khoản kế toán: số TK → id trong Odoo */
const accountCache = {};

export const resolveAccountId = async (accountCode) => {
  if (accountCache[accountCode]) return accountCache[accountCode];

  const accounts = await execute('account.account', 'search_read',
    [[['code', '=', accountCode]]],
    { fields: ['id', 'name'], limit: 1 }
  );

  if (!accounts?.length) {
    throw new Error(`Không tìm thấy tài khoản kế toán mã ${accountCode} trong Odoo.`);
  }

  accountCache[accountCode] = accounts[0].id;
  return accounts[0].id;
};

/**
 * Tạo hóa đơn bán hàng trong Odoo (account.move type=out_invoice)
 * @returns {number} odooInvoiceId
 */
export const createSalesInvoice = async ({ invoiceNumber, invoiceDate, buyerName, buyerTaxCode, items, vatRate, taxAuthorityCode }) => {
  // Tìm hoặc tạo partner
  let partnerId = 1; // Default company partner
  if (buyerName) {
    const partners = await execute('res.partner', 'search_read',
      [[['name', 'ilike', buyerName]]],
      { fields: ['id'], limit: 1 }
    );
    if (partners.length) {
      partnerId = partners[0].id;
    } else {
      partnerId = await execute('res.partner', 'create', [{
        name: buyerName,
        vat: buyerTaxCode || '',
        customer_rank: 1,
      }]);
    }
  }

  const invoiceLines = items.map((item) => [
    0, 0, {
      name: item.name,
      quantity: item.quantity,
      price_unit: item.unitPrice,
    },
  ]);

  const invoiceId = await execute('account.move', 'create', [{
    move_type: 'out_invoice',
    name: invoiceNumber,
    invoice_date: invoiceDate,
    partner_id: partnerId,
    ref: taxAuthorityCode || '',
    invoice_line_ids: invoiceLines,
  }]);

  return invoiceId;
};

/** Reset uid cache khi cần (ví dụ: Odoo restart) */
export const resetOdooSession = () => {
  cachedUid = null;
};
