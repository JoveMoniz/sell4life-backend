import express from "express";
import Order from "../models/order.js";
import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";

const router = express.Router();

const ALLOWED_STATUSES = [
  "Processing",
  "Shipped",
  "Delivered",
  "Cancelled"
];

// ========================================
// GET: All orders (ADMIN ONLY)
// ========================================
router.get(
  "/",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      const orders = await Order.find()
        .populate("user", "email")
        .sort({ createdAt: -1 });

      res.json({ orders });
    } catch (err) {
      console.error("ADMIN GET ORDERS ERROR:", err);
      res.status(500).json({ error: "Server error" });
    }
  }
);


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
