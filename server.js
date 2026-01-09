import express from "express";
import path from "path";
import cors from "cors";
import { fileURLToPath } from "url";

import ordersRoute from "./routes/orders.js";
import authRoute from "./routes/auth.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors({
  origin: 'https://sell4life.com',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json());


// Serve frontend
app.use(express.static(path.join(__dirname, "../frontend")));

// API routes (ONLY what exists)
app.use("/api/orders", ordersRoute);
app.use("/api/auth", authRoute);


const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Sell4Life backend running on port ${PORT}`);
});

