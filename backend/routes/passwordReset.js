// ======================================================
// PASSWORD RESET
// POST /api/auth/forgot-password
// POST /api/auth/reset-password
// ======================================================

import express from 'express';
import crypto  from 'crypto';
import { mailPasswordReset } from '../utils/email.js';

const router = express.Router();

// ── Forgot password ────────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
  const email = String(req.body?.email || '').toLowerCase().trim();
  if (!email) return res.status(400).json({ error: 'Email is required' });

  // Always 200 — never reveal whether the account exists
  res.json({ message: 'If that email exists, a reset link has been sent.' });

  // Do the real work after the response is sent
  try {
    const [{ default: User }, { default: PasswordReset }] = await Promise.all([
      import('../models/user.js'),
      import('../models/passwordReset.js'),
    ]);

    const user = await User.findOne({ email });
    if (!user) return;

    // Remove any existing tokens for this email
    await PasswordReset.deleteMany({ email });

    const token     = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await PasswordReset.create({ email, token, expiresAt });

    const frontendUrl = process.env.FRONTEND_URL || 'https://sell4life.com';
    const resetUrl    = `${frontendUrl}/account/reset-password.html?token=${token}`;

    await mailPasswordReset({ to: email, name: user.name, resetUrl });
  } catch (err) {
    console.error('[forgot-password]', err);
  }
});

// ── Reset password ─────────────────────────────────────────
router.post('/reset-password', async (req, res) => {
  try {
    // token MUST be a plain string — a crafted body like
    // {"token":{"$ne":null}} would otherwise pass straight into the Mongo
    // filter below as a real operator, matching ANY unexpired reset record
    // in the whole collection instead of the one real token. That's a full
    // account-takeover bypass (attacker calls /forgot-password for a victim,
    // then /reset-password with the injection, needing zero access to the
    // victim's real email). Reject anything that isn't a string outright.
    const token = typeof req.body?.token === 'string' ? req.body.token : '';
    const { password } = req.body || {};

    if (!token || !password) {
      return res.status(400).json({ error: 'Token and password are required' });
    }

    if (String(password).length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const PasswordReset = (await import('../models/passwordReset.js')).default;
    const record = await PasswordReset.findOne({ token, expiresAt: { $gt: new Date() } });

    if (!record) {
      return res.status(400).json({ error: 'This reset link is invalid or has expired.' });
    }

    const User = (await import('../models/user.js')).default;
    const user = await User.findOne({ email: record.email });

    if (!user) {
      return res.status(400).json({ error: 'Account not found.' });
    }

    const bcrypt      = (await import('bcryptjs')).default;
    user.password     = await bcrypt.hash(password, 10);
    user.passwordSet  = true; // claims a guest-checkout account, if that's what this was
    await user.save();

    // Invalidate all reset tokens for this email
    await PasswordReset.deleteMany({ email: record.email });

    res.json({ message: 'Password reset successfully. You can now sign in.' });
  } catch (err) {
    console.error('[reset-password]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
