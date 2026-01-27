import express from "express";
import Order from "../models/order.js";
import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";

const router = express.Router();

// Allowed statuses (single source of truth)
const ALLOWED_STATUSES = [
  "Processing",
  "Shipped",
  "Delivered",
  "Cancelled"
];

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
        return res.status(400).json({
          error: "Invalid order status"
        });
      }

      const order = await Order.findById(req.params.id);

      if (!order) {
        return res.status(404).json({
          error: "Order not found"
        });
      }

      // Initialize history if missing (old orders)
      if (!Array.isArray(order.statusHistory)) {
        order.statusHistory = [];
      }

      // Update status + history
      order.status = status;
      order.statusHistory.push({
        status,
        date: new Date()
      });

      await order.save();

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
