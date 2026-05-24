// ======================================================
// EMAIL UTILITY  –  Resend HTTP API
// Env vars required:
//   RESEND_API_KEY  (from resend.com)
//   EMAIL_FROM      (e.g. "Sell4Life <noreply@sell4life.com>")
// ======================================================

import { Resend } from 'resend';

let _client = null;

function getClient() {
  if (_client) return _client;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn('[email] RESEND_API_KEY not configured — emails disabled');
    return null;
  }
  _client = new Resend(key);
  return _client;
}

export async function sendMail({ to, subject, html }) {
  const client = getClient();
  if (!client) return;

  try {
    const from = process.env.EMAIL_FROM || 'Sell4Life <noreply@sell4life.com>';
    const { error } = await client.emails.send({ from, to, subject, html });
    if (error) {
      console.error('[email] Send failed:', error.message);
    } else {
      console.log('[email] Sent to:', to);
    }
  } catch (err) {
    console.error('[email] Exception:', err.message);
  }
}

// ---- Shared logo header ----
const logoHeader = `
  <div style="margin-bottom:18px">
    <span style="display:inline-block;background:#0b6b6a;padding:8px 14px;border-radius:6px;font-family:Arial,sans-serif;font-size:16px;font-weight:700;letter-spacing:2px;color:#fff">
      <span style="color:#f28c28">$</span>ell<span style="color:#f28c28">4</span>Life
    </span>
  </div>`;

// ---- Pre-built templates ----

export function mailOrderConfirmation({ to, orderRef, items, total, shippingAddress }) {
  const itemRows = items.map(i =>
    `<tr><td style="padding:4px 0;font-size:13px">${i.name}</td><td style="padding:4px 8px;font-size:13px" align="right">x${i.qty}</td><td style="padding:4px 0;font-size:13px" align="right">£${Number(i.price).toFixed(2)}</td></tr>`
  ).join('');

  return sendMail({
    to,
    subject: `Order confirmed – ${orderRef}`,
    html: `<div style="font-family:sans-serif;font-size:13px;max-width:560px;margin:0 auto;color:#111827">
      ${logoHeader}
      <p style="font-size:15px;font-weight:700;color:#0b6b6a;margin:0 0 8px">Order confirmed</p>
      <p style="margin:0 0 10px;color:#374151">Thank you for your purchase. Reference: <strong>${orderRef}</strong></p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e7eb;margin-top:10px;font-size:13px">
        ${itemRows}
        <tr><td colspan="2" style="padding-top:8px;font-weight:600">Total</td><td style="padding-top:8px;font-weight:600" align="right">£${Number(total).toFixed(2)}</td></tr>
      </table>
      ${shippingAddress ? `<p style="margin-top:12px;color:#6b7280;font-size:12px">Shipping to: ${shippingAddress}</p>` : ''}
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">
      <p style="font-size:11px;color:#9ca3af">Sell4Life · You're receiving this because you placed an order.</p>
    </div>`,
  });
}

export function mailNewOrderVendor({ to, storeName, orderRef, items }) {
  const itemRows = items.map(i =>
    `<tr><td style="padding:4px 0;font-size:13px">${i.name}</td><td style="padding:4px 8px;font-size:13px" align="right">x${i.qty}</td></tr>`
  ).join('');

  return sendMail({
    to,
    subject: `New order received – ${orderRef}`,
    html: `<div style="font-family:sans-serif;font-size:13px;max-width:560px;margin:0 auto;color:#111827">
      ${logoHeader}
      <p style="font-size:15px;font-weight:700;color:#0b6b6a;margin:0 0 8px">New order for ${storeName}</p>
      <p style="margin:0 0 10px;color:#374151">Order reference: <strong>${orderRef}</strong></p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e7eb;margin-top:10px;font-size:13px">
        ${itemRows}
      </table>
      <p style="margin-top:16px"><a href="${process.env.FRONTEND_URL || 'https://sell4life.com'}/account/vendor/orders.html" style="background:#0b6b6a;color:#fff;padding:7px 14px;border-radius:6px;text-decoration:none;font-size:13px">View Order</a></p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">
      <p style="font-size:11px;color:#9ca3af">Sell4Life Vendor Notifications</p>
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

export function mailPasswordReset({ to, name, resetUrl }) {
  return sendMail({
    to,
    subject: 'Reset your Sell4Life password',
    html: `<div style="font-family:sans-serif;font-size:13px;max-width:560px;margin:0 auto;color:#111827">
      ${logoHeader}
      <p style="font-size:15px;font-weight:700;color:#0b6b6a;margin:0 0 8px">Reset your password</p>
      <p style="margin:0 0 16px;color:#374151">Hi ${name || 'there'},<br><br>We received a request to reset your Sell4Life password. Click the button below — this link expires in <strong>1 hour</strong>.</p>
      <p style="margin:0 0 20px">
        <a href="${resetUrl}" style="display:inline-block;background:#0b6b6a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600">Reset Password</a>
      </p>
      <p style="color:#6b7280;font-size:12px">If you didn't request this, you can safely ignore this email — your password won't change.</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">
      <p style="font-size:11px;color:#9ca3af">Sell4Life · This link expires in 1 hour.</p>
    </div>`,
  });
}

export function mailVendorStatusChange({ to, storeName, status }) {
  const messages = {
    approved:    { heading: `Welcome, ${storeName}!`, body: 'Your vendor account has been approved. You can now list products and start selling.' },
    suspended:   { heading: 'Account suspended',      body: 'Your vendor account has been suspended. Please contact support if you believe this is an error.' },
    reactivated: { heading: 'Account reactivated',    body: 'Your vendor account has been reactivated. You can now list products again.' },
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
