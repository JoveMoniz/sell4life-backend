// ======================================================
// ACCOUNT SETTINGS  –  authenticated user self-update
// GET  /api/account/me  — return name + email
// PATCH /api/account/me — update name / email / password
// ======================================================

import express from 'express';

const router = express.Router();

async function getUser(req, res) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) { res.status(401).json({ error: 'Not authenticated' }); return null; }
  const jwt = (await import('jsonwebtoken')).default;
  let decoded;
  try { decoded = jwt.verify(token, process.env.JWT_SECRET); } catch {
    res.status(401).json({ error: 'Invalid token' }); return null;
  }
  const User = (await import('../models/user.js')).default;
  const user = await User.findById(decoded.id || decoded._id);
  if (!user) { res.status(404).json({ error: 'User not found' }); return null; }
  return user;
}

router.get('/me', async (req, res) => {
  try {
    const user = await getUser(req, res);
    if (!user) return;
    res.json({ name: user.name, email: user.email });
  } catch (err) {
    console.error('Account GET error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/me', async (req, res) => {
  try {
    const user = await getUser(req, res);
    if (!user) return;

    const bcrypt = (await import('bcryptjs')).default;
    const User = (await import('../models/user.js')).default;

    const { name, email, currentPassword, newPassword } = req.body;
    const changes = {};

    // Name — no password required
    if (name !== undefined) {
      const trimmed = String(name).trim();
      if (!trimmed) return res.status(400).json({ error: 'Name cannot be empty' });
      changes.name = trimmed;
    }

    // Email or password — require current password
    if (email !== undefined || newPassword !== undefined) {
      if (!currentPassword) {
        return res.status(400).json({ error: 'Current password required to change email or password' });
      }
      const valid = await bcrypt.compare(currentPassword, user.password);
      if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });

      if (email !== undefined) {
        const trimmed = String(email).toLowerCase().trim();
        if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
          return res.status(400).json({ error: 'Invalid email address' });
        }
        const existing = await User.findOne({ email: trimmed, _id: { $ne: user._id } });
        if (existing) return res.status(400).json({ error: 'Email already in use' });
        changes.email = trimmed;
      }

      if (newPassword !== undefined) {
        if (String(newPassword).length < 8) {
          return res.status(400).json({ error: 'New password must be at least 8 characters' });
        }
        changes.password = await bcrypt.hash(newPassword, 10);
      }
    }

    if (!Object.keys(changes).length) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    Object.assign(user, changes);
    await user.save();

    res.json({
      message: 'Account updated',
      user: { name: user.name, email: user.email },
    });
  } catch (err) {
    console.error('Account update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
