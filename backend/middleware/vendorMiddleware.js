import Vendor from '../models/vendor.js';

export async function requireApprovedVendor(req, res, next) {
  try {
    const vendor = await Vendor.findOne({ userId: req.user._id });

    if (!vendor) {
      return res.status(403).json({
        error: 'Vendor profile not found',
      });
    }

    if (vendor.status === 'suspended') {
      return res.status(403).json({ error: 'Vendor suspended' });
    }

    if (vendor.status !== 'approved') {
      return res.status(403).json({ error: 'Vendor not approved' });
    }

    req.vendor = vendor; // reuse later
    next();
  } catch (err) {
    console.error('Vendor middleware error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}
