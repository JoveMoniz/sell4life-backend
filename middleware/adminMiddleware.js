export default function adminMiddleware(req, res, next) {
  // authMiddleware MUST run before this
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  // Must be admin
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin only" });
  }

  // Owner flag (single source of truth)
  req.isOwner =
    process.env.OWNER_USER_ID &&
    req.user.id === process.env.OWNER_USER_ID;

  next();
}
