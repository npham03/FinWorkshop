import nodemailer from 'nodemailer';

function smtpConfig() {
  const user = process.env.SMTP_USER?.trim();
  const password = (process.env.SMTP_PASS || process.env.SMTP_PASSWORD || '').replace(/\s+/g, '');
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE
    ? process.env.SMTP_SECURE.toLowerCase() === 'true'
    : port === 465;

  return {
    host: process.env.SMTP_HOST?.trim() || 'smtp.gmail.com',
    port,
    secure,
    user,
    password,
    from: process.env.PASSWORD_RESET_FROM?.trim() || user,
  };
}

export function smtpStatus() {
  const config = smtpConfig();
  const configured = Boolean(config.host && config.port && config.user && config.password);
  return {
    configured,
    host: config.host,
    sender: configured ? config.from : null,
    label: configured ? 'SMTP đã cấu hình' : 'Chưa cấu hình Gmail SMTP',
  };
}

export async function sendResetCodeEmail({ to, code, expiresInMinutes = 10 }) {
  const config = smtpConfig();
  if (!config.user || !config.password) {
    throw new Error('Chưa cấu hình SMTP_USER và SMTP_PASS trong apps/middleware-api/.env.');
  }

  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: !config.secure,
    auth: { user: config.user, pass: config.password },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    tls: { minVersion: 'TLSv1.2' },
  });

  const info = await transport.sendMail({
    from: config.from,
    to,
    subject: 'Mã đặt lại mật khẩu FinTax',
    text: `Mã đặt lại mật khẩu FinTax của bạn là: ${code}\n\nMã có hiệu lực trong ${expiresInMinutes} phút. Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này.`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#242424"><h2>Đặt lại mật khẩu FinTax</h2><p>Mã xác nhận của bạn:</p><p style="font-size:30px;font-weight:700;letter-spacing:8px;color:#b5121b">${code}</p><p>Mã có hiệu lực trong <strong>${expiresInMinutes} phút</strong>.</p><p>Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này.</p></div>`,
  });

  if (!info.accepted?.some((address) => address.toLowerCase() === to.toLowerCase())) {
    throw new Error('Máy chủ SMTP không chấp nhận địa chỉ email nhận.');
  }
  return true;
}
