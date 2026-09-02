// ======================================================
// SHARED AUTH HELPERS — username generation + JWT issuance.
// Used by routes/auth.js (real signup) and routes/orders.js (guest
// checkout auto-creates a lightweight account the same way) — kept in
// one place so both paths mint tokens identically.
// ======================================================
import jwt from 'jsonwebtoken';
import User from '../models/user.js';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error('❌ JWT_SECRET is not defined');
  process.exit(1);
}

const TOKEN_EXPIRES = '3d';

export const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 3 * 24 * 60 * 60 * 1000,
};

export function generateBaseUsername(name) {
  const connectors = ['da', 'de', 'do', 'dos', 'das', 'van', 'von', 'al'];

  const parts = name
    .toLowerCase()
    .split(' ')
    .filter((p) => p && !connectors.includes(p));

  const first = parts[0] || '';
  const last = parts[parts.length - 1] || '';

  return (first + last).replace(/[^a-z0-9]/g, '');
}

export async function createUniqueUsername(base) {
  let username = base.toLowerCase();
  let counter = 1;

  while (await User.findOne({ username })) {
    username = base.toLowerCase() + counter;
    counter++;
  }

  return username;
}

export function createToken(user) {
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
