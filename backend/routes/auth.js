import crypto from 'crypto';
import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

import User from '../models/user.js';
import EmailVerification from '../models/emailVerification.js';
import authMiddleware from '../middleware/authMiddleware.js';
import { mailEmailVerification } from '../utils/email.js';

const router = express.Router();

/* ======================================================
   CONFIG
====================================================== */

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error('❌ JWT_SECRET is not defined');
  process.exit(1);
}

const TOKEN_EXPIRES = '3d';

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 3 * 24 * 60 * 60 * 1000,
};

/* ======================================================
   USERNAME HELPERS
====================================================== */

function generateBaseUsername(name) {
  const connectors = ['da', 'de', 'do', 'dos', 'das', 'van', 'von', 'al'];

  const parts = name
    .toLowerCase()
    .split(' ')
    .filter((p) => p && !connectors.includes(p));

  const first = parts[0] || '';
  const last = parts[parts.length - 1] || '';

  return (first + last).replace(/[^a-z0-9]/g, '');
}

async function createUniqueUsername(base) {
  let username = base.toLowerCase();
  let counter = 1;

  while (await User.findOne({ username })) {
    username = base.toLowerCase() + counter;

    counter++;
  }

  return username;
}

/* ======================================================
   TOKEN GENERATOR
====================================================== */

function createToken(user) {
  return jwt.sign(
    {
      id: user._id,
      role: user.role,
      type: 'access',
    },

    JWT_SECRET,

    {
      expiresIn: TOKEN_EXPIRES,
    }
  );
}

/* ======================================================
   REGISTER USER
====================================================== */

router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        ok: false,
        msg: 'Missing required fields',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        ok: false,
        msg: 'Password must be at least 6 characters',
      });
    }

    const cleanName = name.trim();

    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await User.findOne({
      email: normalizedEmail,
    });

    if (existingUser) {
      return res.status(409).json({
        ok: false,
        msg: 'Email already exists',
      });
    }

    /* ======================================================
       PASSWORD HASH
    ====================================================== */

    const hashedPassword = await bcrypt.hash(password, 10);

    /* ======================================================
       USERNAME GENERATION
    ====================================================== */

    const baseUsername = generateBaseUsername(cleanName);

    const username = await createUniqueUsername(baseUsername);

    /* ======================================================
       CREATE USER
    ====================================================== */

    const user = await User.create({
      name: cleanName,
      username,
      email: normalizedEmail,
      password: hashedPassword,
      role: 'user',
    });

    /* ======================================================
       JWT TOKEN
    ====================================================== */

    const token = createToken(user);

    /* ======================================================
       SEND VERIFICATION EMAIL (background)
    ====================================================== */

    (async () => {
      try {
        const verifyToken = crypto.randomBytes(32).toString('hex');
        await EmailVerification.create({
          userId:    user._id,
          token:     verifyToken,
          expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
        });
        const verifyUrl = `${process.env.FRONTEND_URL || 'https://sell4life.com'}/account/verify-email.html?token=${verifyToken}`;
        await mailEmailVerification({ to: user.email, name: user.name, verifyUrl });
      } catch (e) {
        console.error('Verification email error:', e.message);
      }
    })();

    /* ======================================================
       RESPONSE
    ====================================================== */

    res
      .status(201)
      .cookie('s4l_token', token, COOKIE_OPTS)
      .json({
        ok: true,
        token,
        user: {
          id:            user._id,
          name:          user.name,
          username:      user.username,
          email:         user.email,
          role:          user.role,
          emailVerified: user.emailVerified,
        },
      });
  } catch (err) {
    console.error('REGISTER ERROR:', err);

    res.status(500).json({
      ok: false,
      msg: 'Server error',
    });
  }
});

/* ======================================================
   LOGIN
====================================================== */

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        ok: false,
        msg: 'Missing fields',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    /* ======================================================
       FIND USER
    ====================================================== */

    const user = await User.findOne({
      email: normalizedEmail,
    });

    if (!user) {
      return res.status(401).json({
        ok: false,
        msg: 'Invalid credentials',
      });
    }

    /* ======================================================
       ACCOUNT STATUS CHECK
    ====================================================== */

    if (user.banned) {
      console.warn('LOGIN BLOCKED: banned account', user._id);

      return res.status(403).json({
        ok: false,
        msg: 'Invalid credentials',
      });
    }

    if (!user.active) {
      console.warn('LOGIN BLOCKED: inactive account', user._id);

      return res.status(403).json({
        ok: false,
        msg: 'Invalid credentials',
      });
    }

    /* ======================================================
       PASSWORD CHECK
    ====================================================== */

    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.status(401).json({
        ok: false,
        msg: 'Invalid credentials',
      });
    }

    /* ======================================================
       CREATE TOKEN
    ====================================================== */

    const token = createToken(user);

    /* ======================================================
       RESPONSE
    ====================================================== */

    res
      .cookie('s4l_token', token, COOKIE_OPTS)
      .json({
        ok: true,
        token,
        user: {
          id:            user._id,
          name:          user.name,
          username:      user.username,
          email:         user.email,
          role:          user.role,
          emailVerified: user.emailVerified,
        },
      });
  } catch (err) {
    console.error('LOGIN ERROR:', err);

    res.status(500).json({
      ok: false,
      msg: 'Server error',
    });
  }
});

/* ======================================================
   CURRENT USER
====================================================== */

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
      });
    }

    res.json({
      user: {
        id:            user._id,
        name:          user.name,
        username:      user.username,
        email:         user.email,
        role:          user.role,
        emailVerified: user.emailVerified,
      },
    });
  } catch (err) {
    console.error('AUTH ME ERROR:', err);

    res.status(500).json({
      error: 'Failed to load user',
    });
  }
});

/* ======================================================
   VERIFY EMAIL
====================================================== */

router.get('/verify-email', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ ok: false, msg: 'Missing token' });

  try {
    const record = await EmailVerification.findOne({ token, expiresAt: { $gt: new Date() } });
    if (!record) return res.status(400).json({ ok: false, msg: 'Invalid or expired link' });

    await User.findByIdAndUpdate(record.userId, { emailVerified: true });
    await EmailVerification.deleteMany({ userId: record.userId });

    res.json({ ok: true });
  } catch (err) {
    console.error('VERIFY EMAIL ERROR:', err);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

/* ======================================================
   RESEND VERIFICATION EMAIL
====================================================== */

router.post('/resend-verification', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ ok: false, msg: 'User not found' });
    if (user.emailVerified) return res.json({ ok: true, msg: 'already_verified' });

    await EmailVerification.deleteMany({ userId: user._id });

    const verifyToken = crypto.randomBytes(32).toString('hex');
    await EmailVerification.create({
      userId:    user._id,
      token:     verifyToken,
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
    });
    const verifyUrl = `${process.env.FRONTEND_URL || 'https://sell4life.com'}/account/verify-email.html?token=${verifyToken}`;
    await mailEmailVerification({ to: user.email, name: user.name, verifyUrl });

    res.json({ ok: true });
  } catch (err) {
    console.error('RESEND VERIFICATION ERROR:', err);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

/* ======================================================
   LOGOUT
====================================================== */

router.post('/logout', (req, res) => {
  res
    .clearCookie('s4l_token', { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production' })
    .json({ ok: true });
});

/* ======================================================
   EXPORT ROUTER
====================================================== */

export default router;
