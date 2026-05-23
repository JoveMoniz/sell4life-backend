// ======================================================
// PUBLIC STORES  –  no auth required
// ======================================================

import express from 'express';
import Vendor from '../models/vendor.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const vendors = await Vendor.find({ status: 'approved' })
      .select('storeName storeSlug storeLogo storeDescription type createdAt')
      .sort({ createdAt: -1 })
      .lean();

    // Product counts per vendor
    let countMap = {};
    try {
      const Product = (await import('../models/product.js')).default;
      const counts = await Product.aggregate([
        { $match: { archived: { $ne: true }, active: true } },
        { $group: { _id: '$vendor', count: { $sum: 1 } } },
      ]);
      counts.forEach(c => { countMap[String(c._id)] = c.count; });
    } catch { /* non-critical */ }

    const stores = vendors.map(v => ({
      _id:             v._id,
      storeName:       v.storeName,
      storeSlug:       v.storeSlug,
      storeLogo:       v.storeLogo || null,
      storeDescription:v.storeDescription || '',
      type:            v.type || 'casual',
      productCount:    countMap[String(v._id)] || 0,
    }));

    res.json({ stores });
  } catch (err) {
    console.error('Public stores error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
