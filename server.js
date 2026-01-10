// Production CORS configuration for Sell4Life


import express from "express";
import path from "path";
import cors from "cors";
import { fileURLToPath } from "url";

import ordersRoute from "./routes/orders.js";
import authRoute from "./routes/auth.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

/**
 * CORS configuration
 * Frontend is hosted separately over HTTPS
 */
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

// Handle preflight requests explicitly
app.options("*", cors());

app.use(express.json());

// Optional: serve frontend if you ever colocate it
app.use(express.static(path.join(__dirname, "../frontend")));

// API routes
app.use("/api/orders", ordersRoute);
app.use("/api/auth", authRoute);

// Render / production port
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Sell4Life backend running on port ${PORT}`);
});
