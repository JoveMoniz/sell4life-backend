// backend/routes/adminUsers.js

import express from "express";
import User from "../models/user.js";
import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";

const router = express.Router();

/* ================================
   GET ALL USERS (ADMIN ONLY)
================================ */
router.get(
  "/",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      const users = await User.find()
        .select("email role createdAt")
        .sort({ createdAt: -1 });

      res.json({ users });
    } catch (err) {
      console.error("ADMIN USERS ERROR:", err);
      res.status(500).json({ error: "Server error" });
    }
  }
);

/* ================================
   UPDATE USER ROLE
   RULES:
   - Admin can REMOVE admin
   - ONLY OWNER can ADD admin
   - Owner role cannot be changed
================================ */
router.patch(
  "/:id/role",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    const { role } = req.body;

    if (!["user", "admin"].includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    const targetUser = await User.findById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ error: "User not found" });
    }

    // 🚫 Owner can never lose admin
    if (
      String(targetUser.id) === String(process.env.OWNER_USER_ID) &&
      role !== "admin"
    ) {
      return res.status(403).json({
        error: "Owner role cannot be changed"
      });
    }

    // 🔒 Only OWNER can assign admin
    if (role === "admin" && !req.isOwner) {
      return res.status(403).json({
        error: "Only the site owner can assign admin role"
      });
    }

    targetUser.role = role;
    await targetUser.save();

    res.json({ success: true });
  }
);

export default router;
