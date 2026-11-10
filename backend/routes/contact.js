import { Router } from 'express';
import { sendMail } from '../utils/email.js';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_MESSAGE_LEN = 2000;

// Public contact form — no auth, so every field here is attacker-controlled
// and must be validated as a plain string before it ever reaches an email
// template, same reasoning as the public product-search endpoint elsewhere
// in this codebase.
router.post('/', async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';

  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Please fill in your name, email, and message.' });
  }
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  if (message.length > MAX_MESSAGE_LEN) {
    return res.status(400).json({ error: `Message is too long (max ${MAX_MESSAGE_LEN} characters).` });
  }

  // sendMail() (utils/email.js) swallows send failures internally (logs
  // them, never throws/returns a status) — same fire-and-forget contract
  // every other caller in this codebase already relies on, so there's no
  // real failure branch to report back to the visitor here. The visitor's
  // own email is put in the body (not just the From header) since sendMail
  // has no replyTo param — support has to copy it to reply.
  await sendMail({
    to: 'support@sell4life.com',
    subject: `Contact form: ${name}`,
    html: `
      <p><strong>From:</strong> ${escHtml(name)} (${escHtml(email)})</p>
      <p><strong>Message:</strong></p>
      <p>${escHtml(message).replace(/\n/g, '<br />')}</p>
    `,
  });

  res.json({ ok: true });
});

// Minimal inline escaper — this is server-side (no window.escHtml here),
// and the only interpolation risk is this one email template.
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export default router;
