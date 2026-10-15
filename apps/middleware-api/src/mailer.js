import nodemailer from 'nodemailer';

export async function sendResetEmail({ to, subject, html, text }) {
  const user = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASS?.replace(/\s+/g, '');
  if (!user || !password) throw new Error('Chưa cấu hình SMTP_USER và SMTP_PASS cho Gmail.');

  const port = Number(process.env.SMTP_PORT || 587);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port,
    secure: process.env.SMTP_SECURE
      ? process.env.SMTP_SECURE.toLowerCase() === 'true'
      : port === 465,
    auth: { user, pass: password },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    tls: { minVersion: 'TLSv1.2' },
  });

  await transport.sendMail({
    from: process.env.PASSWORD_RESET_FROM?.trim() || user,
    to,
    subject,
    html,
    text,
  });
}
