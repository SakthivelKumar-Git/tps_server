/**
 * mailer.js — Lightweight nodemailer wrapper.
 * Sends email only when SMTP_HOST is configured.
 * NEVER logs or exposes plaintext reset tokens.
 */

import nodemailer from 'nodemailer';

let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return null; // SMTP not configured — silent skip
  }

  _transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT || '587', 10),
    secure: SMTP_SECURE === 'true',
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });

  return _transporter;
}

/**
 * sendMail — sends an email if SMTP is configured.
 * @param {object} opts - { to, subject, html, text }
 * @returns {Promise<boolean>} true if sent, false if SMTP not configured
 */
export async function sendMail({ to, subject, html, text }) {
  const transporter = getTransporter();

  if (!transporter) {
    console.info('[mailer] SMTP not configured — email skipped:', subject);
    return false;
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  try {
    await transporter.sendMail({ from, to, subject, html, text });
    console.info('[mailer] Email sent:', subject, '→', to);
    return true;
  } catch (err) {
    console.error('[mailer] Email send failed:', err.message);
    return false;
  }
}

/**
 * sendPasswordResetEmail — sends password reset link.
 * token param is the RAW token (before hashing) — only put in email link, NEVER logged.
 */
export async function sendPasswordResetEmail({ to, name, resetUrl }) {
  const appName = process.env.APP_NAME || 'TRUE POWER SOLUTIONS CRM';

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="font-family:Arial,sans-serif;background:#f4f6f9;padding:40px 0;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#1e3a5f,#2563eb);padding:32px;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:22px;">${appName}</h1>
      <p style="color:#93c5fd;margin:8px 0 0;">Password Reset Request</p>
    </div>
    <div style="padding:32px;">
      <p style="color:#374151;font-size:16px;">Hello <strong>${name}</strong>,</p>
      <p style="color:#6b7280;">We received a request to reset your password. Click the button below to set a new password. This link expires in <strong>30 minutes</strong>.</p>
      <div style="text-align:center;margin:32px 0;">
        <a href="${resetUrl}" style="background:#2563eb;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:600;display:inline-block;">Reset Password</a>
      </div>
      <p style="color:#9ca3af;font-size:13px;">If you did not request this, you can safely ignore this email. Your password will not change.</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;"/>
      <p style="color:#9ca3af;font-size:12px;text-align:center;">${appName} · Do not reply to this email.</p>
    </div>
  </div>
</body>
</html>`;

  const text = `Hello ${name},\n\nReset your password using this link (expires in 30 minutes):\n${resetUrl}\n\nIf you did not request this, ignore this email.\n\n${appName}`;

  return sendMail({ to, subject: `${appName} — Password Reset`, html, text });
}
