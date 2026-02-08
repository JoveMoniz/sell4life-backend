import express from "express";
import Order from "../models/order.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

// Helper: normalize Mongo order → frontend-safe object
function normalizeOrder(order) {
  return {
    id: order._id.toString(),
    user: order.user,
    items: order.items,
    total: order.total,
    status: order.status,
    statusHistory: order.statusHistory || [],
    createdAt: order.createdAt
  };
}


// ---------- CREATE order ----------
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { items, total } = req.body;

    if (!Array.isArray(items) || !items.length || typeof total !== "number") {
      return res.status(400).json({ error: "Invalid order data" });
    }

    // 🔒 Normalize items BEFORE saving
    const normalizedItems = items.map(item => ({
      productId: item.productId,
      name: item.name,
      price: Number(item.price),
      quantity: Number(item.qty ?? item.quantity ?? 1),
      image: item.image || "/assets/images/placeholder.png"
    }));

const order = await Order.create({
  user: req.user.id,
  items: normalizedItems,
  total,
  status: "Processing",

  // ✅ INITIAL STATUS SNAPSHOT
  statusHistory: [
    {
      status: "Processing"
    }
  ]
});


    res.status(201).json(normalizeOrder(order));
  } catch (err) {
    console.error("CREATE ORDER ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ---------- GET my orders ----------
router.get("/", authMiddleware, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user.id })
      .sort({ createdAt: -1 });

    res.json({
      orders: orders.map(normalizeOrder)
    });
  } catch (err) {
    console.error("GET ORDERS ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ---------- GET order by ID ----------
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      user: req.user.id
    });

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    res.json(normalizeOrder(order));
  } catch (err) {
    console.error("GET ORDER ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
