import { Router } from "express";
import fs from "fs";
import path from "path";
import authMiddleware from "../middleware/authMiddleware.js";

const router = Router();
const DATA_FILE = path.join(process.cwd(), "data", "orders.json");

// ---------- helpers ----------
function readOrders() {
    try {
        return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
    } catch {
        return [];
    }
}

function writeOrders(orders) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(orders, null, 2));
}

// ---------- GET all orders ----------
router.get("/", authMiddleware, (req, res) => {
    const orders = readOrders();
    const userOrders = orders.filter(o => o.userId === req.user.id);
    res.json({ orders: userOrders });
});

// ---------- GET order by ID ----------
router.get("/:id", authMiddleware, (req, res) => {
    const orders = readOrders();
    const order = orders.find(
        o => o.id === req.params.id && o.userId === req.user.id
    );

    if (!order) {
        return res.status(404).json({ error: "Order not found" });
    }

    res.json(order);
});

// ---------- CREATE order ----------
router.post("/", authMiddleware, (req, res) => {
    const { items, total } = req.body;

    if (!Array.isArray(items) || !items.length) {
        return res.status(400).json({ error: "Invalid order items" });
    }

    const orders = readOrders();

    const newOrder = {
        id: "A" + Date.now(),
        userId: req.user.id,
        items,
        total,
        status: "Processing",
        createdAt: new Date().toISOString()
    };

    orders.push(newOrder);
    writeOrders(orders);

    res.status(201).json(newOrder);
});

export default router;
