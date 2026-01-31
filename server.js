// ===============================
// Load env FIRST
// ===============================
import dotenv from "dotenv";
dotenv.config();

// ===============================
// Core imports
// ===============================
import express from "express";
import mongoose from "mongoose";
import cors from "cors";

// ===============================
// Routes
// ===============================
import authRoute from "./routes/auth.js";
import ordersRoute from "./routes/orders.js";
import adminOrdersRoute from "./routes/adminOrders.js";
import adminUsersRoute from "./routes/adminUsers.js";

// ===============================
// MongoDB
// ===============================
const mongoUri = process.env.MONGODB_URI;

if (!mongoUri) {
  console.error("❌ MONGODB_URI is not defined");
  process.exit(1);
}

mongoose
  .connect(mongoUri)
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });

// ===============================
// App
// ===============================
const app = express();

// ===============================
// CORS
// ===============================
app.use(
  cors({
    origin: [
      "https://sell4life.com",
      "https://www.sell4life.com",
      "http://127.0.0.1:8080",
      "http://localhost:8080"
    ],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
  })
);

// Preflight (important for PATCH)
app.options("*", cors());

// ===============================
// Middleware
// ===============================
app.use(express.json());

// ===============================
// Health check (do not remove)
// ===============================
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    time: new Date().toISOString()
  });
});

// ===============================
// API Routes
// ===============================
app.use("/api/auth", authRoute);
app.use("/api/orders", ordersRoute);

// 🔐 Admin-only APIssss
app.use("/api/admin/orders", adminOrdersRoute);
app.use("/api/admin/users", adminUsersRoute);

// ===============================
// Global error fallback
// ===============================
app.use((err, req, res, next) => {
  console.error("UNHANDLED ERROR:", err);
  res.status(500).json({ error: "Internal server error" });
});

// ===============================
// Start server
// ===============================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Sell4Life backend running on port ${PORT}`);
});
s