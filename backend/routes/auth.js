import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

import User from '../models/user.js';

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
  let username = base;
  let counter = 1;

  while (await User.findOne({ username })) {
    username = base + counter;

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

    const baseUsername = generateBaseUsername(name);

    const username = await createUniqueUsername(baseUsername);

    /* ======================================================
       CREATE USER
    ====================================================== */

    const user = await User.create({
      name,
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
       RESPONSE
    ====================================================== */

    res.status(201).json({
      ok: true,

      token,

      user: {
        id: user._id,

        name: user.name,

        username: user.username,

        email: user.email,

        role: user.role,
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
      return res.status(403).json({
        ok: false,
        msg: 'Account suspended',
      });
    }

    if (!user.active) {
      return res.status(403).json({
        ok: false,
        msg: 'Account inactive',
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

    res.json({
      ok: true,

      token,

      user: {
        id: user._id,

        name: user.name,

        username: user.username,

        email: user.email,

        role: user.role,
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
   EXPORT ROUTER
====================================================== */

export default router;
