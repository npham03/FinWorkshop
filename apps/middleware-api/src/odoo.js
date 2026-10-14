import xmlrpc from 'xmlrpc';

const setting = () => ({
  url: process.env.ODOO_URL,
  db: process.env.ODOO_DB,
  username: process.env.ODOO_USERNAME,
  password: process.env.ODOO_PASSWORD,
});

function invoke(client, method, params) {
  return new Promise((resolve, reject) => client.methodCall(method, params, (error, value) => error ? reject(error) : resolve(value)));
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
