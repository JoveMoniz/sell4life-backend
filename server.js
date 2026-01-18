// Load env FIRST
import dotenv from "dotenv";
dotenv.config();

// Core imports
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

// Routes
import ordersRoute from "./routes/orders.js";
import authRoute from "./routes/auth.js";

// __dirname fix for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// MongoDB
const mongoUri = process.env.MONGODB_URI;

if (!mongoUri) {
  console.error("MONGODB_URI is not defined");
  process.exit(1);
}

mongoose
  .connect(mongoUri)
  .then(() => console.log("MongoDB connected"))
  .catch(err => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });

// App
const app = express();

// CORS
app.use(
  cors({
    origin: [
      "https://sell4life.com",
      "https://www.sell4life.com"
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
  })
);

app.options("*", cors());
app.use(express.json());

// Routes
app.use("/api/orders", ordersRoute);
app.use("/api/auth", authRoute);

// Port
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Sell4Life backend running on port ${PORT}`);
});
