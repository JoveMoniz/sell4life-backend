
import mongoose from "mongoose";
import User from "../models/user.js";
import express from "express";
import Order from "../models/order.js";
import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";



const router = express.Router();

// Single source of truth for statuses
const ALLOWED_STATUSES = [
  "Processing",
  "Shipped",
  "Delivered",
  "Cancelled"
];

// ========================================
// GET: All orders (ADMIN ONLY)
// Supports: pagination + search + status
// ========================================
router.get(
  "/",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      const page  = parseInt(req.query.page) || 1;
      const limit = 20;
      const skip  = (page - 1) * limit;

      const { q, status } = req.query;

      let filter = {};

  // Search by Mongo _id (if valid) OR user email
// Search by Mongo _id (full OR short) OR user email
if (q) {

  const users = await User.find({
    email: { $regex: q, $options: "i" }
  }).select("_id");

  const userIds = users.map(u => u._id);

  const isFullObjectId = mongoose.Types.ObjectId.isValid(q);
  const shortIdMatch = /^[0-9A-Fa-f]{10}$/.test(q);

  let orConditions = [];

  if (isFullObjectId) {
    orConditions.push({ _id: new mongoose.Types.ObjectId(q) });
  }

  if (shortIdMatch) {
    orConditions.push({
      $expr: {
        $regexMatch: {
          input: { $toString: "$_id" },
          regex: new RegExp("^" + q, "i")
        }
      }
    });
  }

  if (userIds.length) {
    orConditions.push({ user: { $in: userIds } });
  }

  if (orConditions.length) {
    filter.$or = orConditions;
  }
}






      // Filter by status
      if (status && status !== "all") {
        filter.status = status;
      }

      const [orders, total] = await Promise.all([
        Order.find(filter)
          .populate("user", "email")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),
        Order.countDocuments(filter)
      ]);

      res.json({
        orders,
        page,
        totalPages: Math.ceil(total / limit),
        totalOrders: total
      });

    } catch (err) {
      console.error("ADMIN GET ORDERS ERROR:", err);
      res.status(500).json({ error: "Server error" });
    }
  }
);

// ========================================
// GET: Single order (ADMIN ONLY)
// ========================================
router.get(
  "/:id",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      const order = await Order.findById(req.params.id)
        .populate("user", "email");

      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      res.json(order);

    } catch (err) {
      console.error("ADMIN GET ORDER ERROR:", err);
      res.status(500).json({ error: "Server error" });
    }
  }
);

// ========================================
// PATCH: Update order status (ADMIN ONLY)
// ========================================
router.patch(
  "/:id/status",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      const { status } = req.body;

      if (!ALLOWED_STATUSES.includes(status)) {
        return res.status(400).json({ error: "Invalid order status" });
      }

      const order = await Order.findByIdAndUpdate(
        req.params.id,
        {
          $set: { status },
          $push: {
            statusHistory: {
              status,
              date: new Date()
            }
          }
        },
        { new: true }
      );

      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      res.json({
        success: true,
        orderId: order._id,
        status: order.status,
        statusHistory: order.statusHistory
      });

    } catch (err) {
      console.error("ADMIN STATUS UPDATE ERROR:", err);
      res.status(500).json({ error: "Server error" });
    }
  }
);

export default router;
