import jwt from 'jsonwebtoken';
import User from '../models/user.js';

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
