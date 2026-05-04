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
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header missing' });
    }

    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Invalid authorization format' });
    }

    /* ======================================================
       EXTRACT TOKEN
    ====================================================== */

    const token = authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Token missing' });
    }

    /* ======================================================
       VERIFY TOKEN
    ====================================================== */

    const decoded = jwt.verify(token, JWT_SECRET);

    /* ======================================================
       FIND USER
    ====================================================== */

    const user = await User.findById(decoded.id).select(
      '_id name username email role active banned'
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
       ATTACH USER TO REQUEST
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
