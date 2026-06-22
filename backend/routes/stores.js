// ======================================================
// PUBLIC STORES  –  no auth required
// ======================================================

import express from 'express';
import Vendor from '../models/vendor.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const vendors = await Vendor.find({ status: 'approved' })
      .select('storeName storeSlug storeLogo storeBanner storeDescription type createdAt')
      .sort({ createdAt: -1 })
      .lean();

    // Product counts per vendor
    let countMap = {};
    try {
      const Product = (await import('../models/product.js')).default;
      const counts = await Product.aggregate([
        { $match: { archived: { $ne: true }, active: true, deletedAt: null } },
        { $group: { _id: '$vendor', count: { $sum: 1 } } },
      ]);
      counts.forEach(c => { countMap[String(c._id)] = c.count; });
    } catch { /* non-critical */ }

    const stores = vendors.map(v => ({
      _id:             v._id,
      storeName:       v.storeName,
      storeSlug:       v.storeSlug,
      storeLogo:       v.storeLogo || null,
      storeBanner:     v.storeBanner || null,
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

router.get('/:slug', async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ storeSlug: req.params.slug, status: 'approved' })
      .select('storeName storeSlug storeLogo storeBanner storeDescription type createdAt')
      .lean();

    if (!vendor) {
      return res.status(404).json({ error: 'Store not found' });
    }

    const Product = (await import('../models/product.js')).default;
    const products = await Product.find({
      vendor: vendor._id,
      active: true,
      archived: { $ne: true },
      deletedAt: null,
    })
      .select('-costPrice -supplier -supplierUrl')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      store: {
        _id:              vendor._id,
        storeName:        vendor.storeName,
        storeSlug:        vendor.storeSlug,
        storeLogo:        vendor.storeLogo || null,
        storeBanner:      vendor.storeBanner || null,
        storeDescription: vendor.storeDescription || '',
        type:             vendor.type || 'casual',
        createdAt:        vendor.createdAt,
        productCount:     products.length,
      },
      products,
    });
  } catch (err) {
    console.error('Public store detail error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
