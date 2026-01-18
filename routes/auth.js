

// TODO: migrate users to Mongo


import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import authMiddleware from "../middleware/authMiddleware.js";
import User from "../models/User.js";

const router = express.Router();

const SECRET = process.env.JWT_SECRET || "sell4life-secret-key";

/**
 * REGISTER
 */
router.post("/register", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ ok: false, msg: "Missing fields" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ ok: false, msg: "Email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      email,
      password: hashedPassword
    });

    await user.save(); // ← THIS IS THE WHOLE POINT

    res.status(201).json({
      ok: true,
      msg: "Account created"
    });
  } catch (err) {
    console.error("REGISTER ERROR:", err);
    res.status(500).json({ ok: false, msg: "Server error" });
  }
});

/**
 * LOGIN
 */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ ok: false, msg: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ ok: false, msg: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user._id, email: user.email },
      SECRET,
      { expiresIn: "3d" }
    );

    res.json({
      ok: true,
      token,
      user: {
        id: user._id,
        email: user.email
      }
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ ok: false, msg: "Server error" });
  }
});

/**
 * ME (protected)
 */
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");

    if (!user) {
      return res.status(404).json({ ok: false, msg: "User not found" });
    }

    res.json({
      ok: true,
      user
    });
  } catch (err) {
    console.error("ME ERROR:", err);
    res.status(500).json({ ok: false, msg: "Server error" });
  }
});

export default router;
