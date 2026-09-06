import crypto from 'crypto';
import express from 'express';
import bcrypt from 'bcrypt';

import User from '../models/user.js';
import EmailVerification from '../models/emailVerification.js';
import EmailLog from '../models/emailLog.js';
import authMiddleware from '../middleware/authMiddleware.js';
import { mailEmailVerification, mailWelcome } from '../utils/email.js';
import { lookupCountry } from '../utils/geoip.js';
import { classifyTrafficSource, referrerDomainOf } from '../utils/trafficSource.js';
import { COOKIE_OPTS, generateBaseUsername, createUniqueUsername, createToken } from '../utils/authTokens.js';

const router = express.Router();

// Shared by /register and vendor.js's /create — resolves the same
// trafficSource/referrerDomain categorization used for visit tracking
// (utils/trafficSource.js) from whatever UTM/referrer the frontend read
// out of the current session's sessionStorage, defensively defaulting to
// "direct" if the body is missing or malformed so a client-side glitch
// never blocks the actual registration.
export function buildRegistrationAttribution(body) {
  const utm = body?.utm && typeof body.utm === 'object' ? body.utm : {};
  const referrer = String(body?.referrer || '').slice(0, 500);
  return {
    trafficSource: classifyTrafficSource({ referrer, utmMedium: utm.medium }),
    referrerDomain: referrerDomainOf(referrer),
    utmSource: String(utm.source || '').slice(0, 200),
    utmMedium: String(utm.medium || '').slice(0, 200),
    utmCampaign: String(utm.campaign || '').slice(0, 200),
  };
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

    // Real GeoIP-detected country, not the schema's 'GB' default — the
    // default previously made every buyer look UK-based regardless of
    // where they actually signed up from, since registration never asked
    // for a country. Falls back to the default when GeoIP can't resolve
    // (local dev, VPN, etc.) rather than leaving the field blank.
    const detectedCountry = lookupCountry(req.ip);

    /* ======================================================
       CREATE USER
    ====================================================== */

    const user = await User.create({
      name: cleanName,
      username,
      email: normalizedEmail,
      password: hashedPassword,
      role: 'user',
      ...(detectedCountry && { country: detectedCountry }),
      registrationAttribution: buildRegistrationAttribution(req.body),
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
       SEND WELCOME EMAIL (background) — the delayed "got stuff to
       sell?" seller-invite email is handled separately by
       sellerInviteWorker.js, a couple of days later.
    ====================================================== */

    (async () => {
      try {
        await mailWelcome({ to: user.email, name: user.name });
        await EmailLog.create({ type: 'welcome', to: user.email, userId: user._id, userName: user.name });
      } catch (e) {
        console.error('Welcome email error:', e.message);
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
          createdAt:     user.createdAt,
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
        createdAt:     user.createdAt,
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
    // Don't delete the token on success — leave it valid until its natural
    // expiry so a second visit (e.g. the real user clicking after a security
    // scanner already hit the link once) still succeeds instead of failing.

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
