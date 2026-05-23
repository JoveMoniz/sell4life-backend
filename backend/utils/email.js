// ======================================================
// EMAIL UTILITY  –  SMTP via nodemailer
// Env vars required:
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
//   EMAIL_FROM  (e.g. "Sell4Life <no-reply@sell4life.com>")
// ======================================================

import nodemailer from 'nodemailer';

let _transport = null;

function getTransport() {
  if (_transport) return _transport;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.warn('[email] SMTP not configured — emails disabled');
    return null;
  }

  _transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  return _transport;
}

export async function sendMail({ to, subject, html, text }) {
  const transport = getTransport();
  if (!transport) return;

  try {
    await transport.sendMail({
      from: process.env.EMAIL_FROM || 'Sell4Life <no-reply@sell4life.com>',
      to,
      subject,
      html,
      text,
    });
  } catch (err) {
    console.error('[email] Send failed:', err.message);
  }
}

// ---- Pre-built templates ----

export function mailOrderConfirmation({ to, orderRef, items, total, shippingAddress }) {
  const itemRows = items.map(i =>
    `<tr><td style="padding:4px 0">${i.name}</td><td style="padding:4px 8px" align="right">x${i.qty}</td><td style="padding:4px 0" align="right">£${Number(i.price).toFixed(2)}</td></tr>`
  ).join('');

  return sendMail({
    to,
    subject: `Order confirmed – ${orderRef}`,
    html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto">
      <h2 style="color:#0b6b6a">Your order is confirmed</h2>
      <p>Thank you for your purchase. Your order reference is <strong>${orderRef}</strong>.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e7eb;margin-top:12px">
        ${itemRows}
        <tr><td colspan="2" style="padding-top:8px;font-weight:700">Total</td><td style="padding-top:8px;font-weight:700" align="right">£${Number(total).toFixed(2)}</td></tr>
      </table>
      ${shippingAddress ? `<p style="margin-top:16px;color:#6b7280;font-size:13px">Shipping to: ${shippingAddress}</p>` : ''}
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
      <p style="font-size:12px;color:#9ca3af">Sell4Life · You're receiving this because you placed an order.</p>
    </div>`,
  });
}

export function mailNewOrderVendor({ to, storeName, orderRef, items }) {
  const itemRows = items.map(i =>
    `<tr><td style="padding:4px 0">${i.name}</td><td style="padding:4px 8px" align="right">x${i.qty}</td></tr>`
  ).join('');

  return sendMail({
    to,
    subject: `New order received – ${orderRef}`,
    html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto">
      <h2 style="color:#0b6b6a">New order for ${storeName}</h2>
      <p>Order reference: <strong>${orderRef}</strong></p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e7eb;margin-top:12px">
        ${itemRows}
      </table>
      <p style="margin-top:16px"><a href="${process.env.FRONTEND_URL || 'https://sell4life.com'}/account/vendor/orders.html" style="background:#0b6b6a;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none">View Order</a></p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
      <p style="font-size:12px;color:#9ca3af">Sell4Life Vendor Notifications</p>
    </div>`,
  });
}

export function mailPayoutProcessed({ to, storeName, amount, reference }) {
  return sendMail({
    to,
    subject: 'Your payout has been processed',
    html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto">
      <h2 style="color:#0b6b6a">Payout processed – ${storeName}</h2>
      <p>Your payout of <strong>£${Number(amount).toFixed(2)}</strong> has been marked as paid.</p>
      ${reference ? `<p style="color:#6b7280;font-size:13px">Reference: ${reference}</p>` : ''}
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
      <p style="font-size:12px;color:#9ca3af">Sell4Life Vendor Notifications</p>
    </div>`,
  });
}

export function mailVendorStatusChange({ to, storeName, status }) {
  const messages = {
    approved:   { heading: `Welcome, ${storeName}!`, body: 'Your vendor account has been approved. You can now list products and start selling.' },
    suspended:  { heading: 'Account suspended',     body: 'Your vendor account has been suspended. Please contact support if you believe this is an error.' },
    reactivated:{ heading: 'Account reactivated',   body: 'Your vendor account has been reactivated. You can now list products again.' },
  };
  const { heading, body } = messages[status] || { heading: `Account status: ${status}`, body: '' };

  return sendMail({
    to,
    subject: heading,
    html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto">
      <h2 style="color:#0b6b6a">${heading}</h2>
      <p>${body}</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
      <p style="font-size:12px;color:#9ca3af">Sell4Life</p>
    </div>`,
  });
}
