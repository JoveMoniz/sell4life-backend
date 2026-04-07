import { Router } from 'express';
import mongoose from 'mongoose';

import Product from '../models/product.js';

const router = Router();

/* ======================================================
   VALIDATE CART ITEMS
   Ensures products exist and prices are correct
====================================================== */

router.post('/validate', async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];

    if (!items.length) {
      return res.json({
        items: [],
        items_count: 0,
        total: 0,
      });
    }

    /* ========================================
       LOAD PRODUCTS FROM DB
    ======================================== */

    const productIds = items
      .map((i) => i.productId)
      .filter((id) => mongoose.Types.ObjectId.isValid(id));

    const products = await Product.find({
      _id: { $in: productIds },
      active: true,
      archived: false,
    });

    const productMap = new Map();

    products.forEach((p) => {
      productMap.set(String(p._id), p);
    });

    /* ========================================
       NORMALIZE ITEMS
    ======================================== */

    const normalized = [];

    let total = 0;

    for (const item of items) {
      const product = productMap.get(String(item.productId));

      if (!product) continue;

      const quantity = Math.max(1, Number(item.quantity) || 1);

      const price = product.price;

      const subtotal = price * quantity;

      total += subtotal;

      normalized.push({
        productId: product._id,

        name: product.name,

        price,

        quantity,

        subtotal,

        image: product.images?.[0] || '/assets/images/products/sell4life-placeholder.png',
      });
    }

    /* ========================================
       RESPONSE
    ======================================== */

    res.json({
      items: normalized,

      items_count: normalized.length,

      total,
    });
  } catch (err) {
    console.error('CART VALIDATION ERROR:', err);

    res.status(500).json({
      error: 'Cart validation failed',
    });
  }
});

/* ======================================================
   CART SUMMARY
   Lightweight endpoint
====================================================== */

router.get('/', (req, res) => {
  res.json({
    items: [],
    items_count: 0,
    total: 0,
  });
});

export default router;
