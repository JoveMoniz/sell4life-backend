// backend/middleware/adminMiddleware.js

export default function adminMiddleware(req, res, next) {
  // authMiddleware MUST run first
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  // Must be admin
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin only" });
  }

  // Owner check (strict, string-to-string)
  req.isOwner =
    Boolean(process.env.OWNER_USER_ID) &&
    String(req.user.id) === String(process.env.OWNER_USER_ID);

  next();
}
