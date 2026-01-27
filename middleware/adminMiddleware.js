import jwt from "jsonwebtoken";
import User from "../models/user.js";

const SECRET = process.env.JWT_SECRET || "sell4life-secret-key";

export default async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, SECRET);

    const user = await User.findById(decoded.id).select("-password");
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    req.user = user; // 🔥 FULL USER WITH role
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
}
