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
   UPDATE USER ROLE (ADMIN ONLY)
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

    try {
      await User.findByIdAndUpdate(req.params.id, { role });
      res.json({ success: true });
    } catch (err) {
      console.error("ROLE UPDATE ERROR:", err);
      res.status(500).json({ error: "Server error" });
    }
  }
);

export default router;
