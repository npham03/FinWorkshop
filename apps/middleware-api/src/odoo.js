import xmlrpc from 'xmlrpc';

const setting = () => ({
  url: process.env.ODOO_URL,
  db: process.env.ODOO_DB,
  username: process.env.ODOO_USERNAME,
  password: process.env.ODOO_PASSWORD,
});

export function hasOdooConfig() {
  const config = setting();
  return Boolean(config.url && config.db && config.username && config.password);
}

function invoke(client, method, params) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Odoo XML-RPC timeout')), Number(process.env.ODOO_TIMEOUT_MS || 5000));
    client.methodCall(method, params, (error, value) => { clearTimeout(timer); error ? reject(error) : resolve(value); });
  });
}

export async function odooStatus() {
  const config = setting();
  if (!config.url || !config.db || !config.username || !config.password) return { configured: false, connected: false, label: 'Chưa cấu hình Odoo' };
  try {
    const common = xmlrpc.createClient({ url: `${config.url.replace(/\/$/, '')}/xmlrpc/2/common` });
    const uid = await invoke(common, 'authenticate', [config.db, config.username, config.password, {}]);
    return { configured: true, connected: Boolean(uid), label: uid ? 'Đã kết nối' : 'Sai thông tin xác thực' };
  } catch {
    return { configured: true, connected: false, label: 'Không kết nối được Odoo' };
  }
}

export async function executeOdoo(model, method, args = [], kwargs = {}) {
  const config = setting();
  if (!config.url || !config.db || !config.username || !config.password) throw new Error('Odoo chưa được cấu hình');
  const common = xmlrpc.createClient({ url: `${config.url.replace(/\/$/, '')}/xmlrpc/2/common` });
  const uid = await invoke(common, 'authenticate', [config.db, config.username, config.password, {}]);
  if (!uid) throw new Error('Không xác thực được Odoo');
  const object = xmlrpc.createClient({ url: `${config.url.replace(/\/$/, '')}/xmlrpc/2/object` });
  return invoke(object, 'execute_kw', [config.db, uid, config.password, model, method, args, kwargs]);
}

const authAccountModel = 'fintax.user.account';
const authAccountFields = ['id', 'source_id', 'email', 'name', 'role', 'password_hash', 'is_approved', 'reset_token_hash', 'reset_token_expires_at'];

export async function findOdooAuthAccount(email) {
  if (!hasOdooConfig()) return null;
  const rows = await executeOdoo(authAccountModel, 'search_read', [[['email', '=', email]]], { fields: authAccountFields, limit: 1 });
  return rows?.[0] || null;
}

export async function createOdooAuthAccount(account) {
  const values = {
    source_id: account.id,
    email: account.email,
    name: account.name,
    role: account.role,
    password_hash: account.passwordHash,
    is_approved: Boolean(account.approved),
  };
  return executeOdoo(authAccountModel, 'create', [values]);
}

export async function updateOdooAuthAccount(odooId, values) {
  return executeOdoo(authAccountModel, 'write', [[Number(odooId)], values]);
}

export async function deleteOdooAuthAccount(odooId) {
  return executeOdoo(authAccountModel, 'unlink', [[Number(odooId)]]);
}

export async function consumeOdooPasswordReset(tokenHash, passwordHash) {
  return executeOdoo(authAccountModel, 'consume_password_reset', [tokenHash, passwordHash]);
}
