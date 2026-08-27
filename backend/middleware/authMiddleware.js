import jwt from 'jsonwebtoken';
import User from '../models/user.js';
import { mustVerifyEmail } from '../utils/emailVerification.js';

// Stays reachable for a logged-in-but-unverified user so they aren't
// locked out of checking their own status, resending the email, or
// logging out — every other authenticated route is blocked for them.
const EMAIL_VERIFY_ALLOWLIST = ['/api/auth/me', '/api/auth/resend-verification', '/api/auth/logout'];

/* ======================================================
   CONFIG
====================================================== */

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error('❌ JWT_SECRET is not defined');
  process.exit(1);
}

/* ======================================================
   AUTH MIDDLEWARE
====================================================== */

export default async function authMiddleware(req, res, next) {
  try {
    // Accept token from HttpOnly cookie (new) or Authorization header (legacy)
    const authHeader = req.headers.authorization;
    const token =
      req.cookies?.s4l_token ||
      (authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null);

    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    /* ======================================================
       VERIFY TOKEN
    ====================================================== */

    const decoded = jwt.verify(token, JWT_SECRET);

    /* ======================================================
       FIND USER
    ====================================================== */

    const user = await User.findById(decoded.id).select(
      '_id name username email role active banned emailVerified createdAt'
    );

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    /* ======================================================
       ACCOUNT STATUS CHECK
    ====================================================== */

    if (!user.active) {
      return res.status(403).json({ error: 'Account inactive' });
    }

    if (user.banned) {
      return res.status(403).json({ error: 'Account banned' });
    }

    /* ======================================================
   OWNER FAILSAFE
====================================================== */

    const OWNER_ID = process.env.OWNER_USER_ID;

    if (String(user._id) === OWNER_ID) {
      user.role = 'admin'; // force admin
      req.isOwner = true;
    } else {
      req.isOwner = false;
    }

    /* ======================================================
   EMAIL VERIFICATION GATE
   The main defense against throwaway/fake-email signups — blocks every
   authenticated action until the account verifies, except the small
   allowlist above. Admins are exempt (never created via public signup).
====================================================== */

    const requestPath = req.originalUrl.split('?')[0];

    if (user.role !== 'admin' && mustVerifyEmail(user) && !EMAIL_VERIFY_ALLOWLIST.includes(requestPath)) {
      return res.status(403).json({
        error: 'Please verify your email to continue.',
        code: 'EMAIL_UNVERIFIED',
      });
    }

    /* ======================================================
   ATTACH USER
====================================================== */

    req.user = user;

    next();
  } catch (err) {
    console.error('AUTH ERROR:', {
      message: err.message,
      path: req.originalUrl,
      ip: req.ip,
    });

    return res.status(401).json({
      error: 'Invalid or expired token',
    });
  }
}
