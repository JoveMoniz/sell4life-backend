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
       
    console.log("OWNER_USER_ID:", process.env.OWNER_USER_ID);
    console.log("LOGGED IN USER:", req.user.id);
    console.log("TARGET USER:", req.params.id);

    const { role } = req.body;

    if (!["user", "admin"].includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    try {
      const updated = await User.findByIdAndUpdate(
        req.params.id,
        { role },
        { new: true }
      );

      if (!updated) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({ success: true });
    } catch (err) {
      console.error("ROLE UPDATE ERROR:", err);
      res.status(500).json({ error: "Server error" });
    }
  }
);

export default router;
