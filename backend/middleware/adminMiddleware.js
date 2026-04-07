/* ======================================================
   ADMIN AUTHORIZATION MIDDLEWARE
   Ensures user is authenticated AND admin
====================================================== */

export default function adminMiddleware(req, res, next) {
  /* ======================================================
     AUTHENTICATION CHECK
     authMiddleware must run before this
  ====================================================== */

  if (!req.user) {
    return res.status(401).json({
      error: 'Authentication required',
    });
  }

  /* ======================================================
     ROLE CHECK
  ====================================================== */

  if (req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Admin access required',
    });
  }

  /* ======================================================
     OWNER CHECK
     Optional super-admin protection
  ====================================================== */

  const ownerId = process.env.OWNER_USER_ID;

  req.isOwner = Boolean(ownerId) && String(req.user.id) === String(ownerId);

  /* ======================================================
     CONTINUE
  ====================================================== */

  next();
}
