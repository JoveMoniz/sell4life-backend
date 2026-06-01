import Vendor from '../models/vendor.js';

// Authenticates requests using the X-API-Key header.
// Sets req.vendor for downstream handlers — ready for future public API routes.
export async function requireApiKey(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!key) return res.status(401).json({ error: 'API key required' });
  try {
    const vendor = await Vendor.findOne({ apiKey: key, status: 'approved' });
    if (!vendor) return res.status(401).json({ error: 'Invalid or inactive API key' });
    if (vendor.type !== 'enterprise') {
      return res.status(403).json({ error: 'API access requires Enterprise tier' });
    }
    req.vendor = vendor;
    next();
  } catch (err) {
    console.error('API key auth error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

const TIER_RANK = { casual: 1, refurbished: 2, professional: 3, enterprise: 4 };

export async function requireApprovedVendor(req, res, next) {
  try {
    const vendor = await Vendor.findOne({ userId: req.user._id });

    if (!vendor) return res.status(403).json({ error: 'Vendor profile not found' });
    if (vendor.status === 'suspended') return res.status(403).json({ error: 'Vendor suspended' });
    if (vendor.status !== 'approved') return res.status(403).json({ error: 'Vendor not approved' });

    req.vendor = vendor;
    next();
  } catch (err) {
    console.error('Vendor middleware error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// Requires vendor tier to be at least `minTier`.
// Use after requireApprovedVendor so req.vendor is already set.
export function requireTier(minTier) {
  return (req, res, next) => {
    const vendorRank = TIER_RANK[req.vendor?.type] || 0;
    const requiredRank = TIER_RANK[minTier] || 0;
    if (vendorRank < requiredRank) {
      return res.status(403).json({
        error: `This feature requires a ${minTier} vendor account or higher.`,
        requiredTier: minTier,
        currentTier: req.vendor?.type || 'casual',
      });
    }
    next();
  };
}

// Strips fields from req.body that the vendor's tier doesn't allow.
// Pass an object mapping field names to the minimum tier required.
// Example: stripTierFields({ variants: 'professional', refurb: 'refurbished' })
export function stripTierFields(fieldTierMap) {
  return (req, res, next) => {
    const vendorRank = TIER_RANK[req.vendor?.type] || 1;
    for (const [field, minTier] of Object.entries(fieldTierMap)) {
      if (vendorRank < (TIER_RANK[minTier] || 0)) {
        delete req.body[field];
      }
    }
    next();
  };
}
