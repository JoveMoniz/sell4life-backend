import { requireApprovedVendor, stripTierFields, requireTier } from '../middleware/vendorMiddleware.js';
import { Router } from 'express';
import mongoose from 'mongoose';

import Product from '../models/product.js';
import Vendor from '../models/vendor.js';
import Order from '../models/order.js'; // 🔥 needed for hard delete

import authMiddleware from '../middleware/authMiddleware.js';
import adminMiddleware from '../middleware/adminMiddleware.js'; // 🔥 THIS WAS MISSING

const router = Router();

/* ======================================================
   🔥 SLUG GENERATOR (NEW)
====================================================== */

function generateSlug(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-');
}

/* ======================================================
   CREATE PRODUCT
====================================================== */

const tierFieldGuard = stripTierFields({
  variants:           'professional',
  addOns:             'professional',
  seoTitle:           'professional',
  seoDescription:     'professional',
  conditionGrade:     'refurbished',
  warrantyPeriod:     'refurbished',
  testedStatus:       'refurbished',
  refurbishmentNotes: 'refurbished',
});

router.post('/', authMiddleware, requireApprovedVendor, tierFieldGuard, async (req, res) => {
  try {
    const vendor = req.vendor;

    const { name, description, shortDescription, bulletPoints, price, images, stock, category, subcategory, tags, shippingCost, videoUrl, videoUrl2 } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({
        error: 'Product name is required',
      });
    }

    if (price == null || Number(price) < 0) {
      return res.status(400).json({
        error: 'Invalid product price',
      });
    }
    /* ======================================================
       🔥 SLUG CREATION + UNIQUE CHECK (NEW)
    ====================================================== */

    let baseSlug = generateSlug(name);
    let uniqueSlug = baseSlug;
    let counter = 1;

    while (await Product.findOne({ slug: uniqueSlug })) {
      uniqueSlug = `${baseSlug}-${counter}`;
      counter++;
    }

    /* ======================================================
       CREATE PRODUCT
    ====================================================== */

    const product = await Product.create({
      name,
      description,
      shortDescription: shortDescription || '',
      bulletPoints:     bulletPoints     || '',
      price,
      images,
      stock,
      category,
      subcategory,
      tags,
      slug: uniqueSlug,
      vendor: vendor._id,
      shippingCost: Number(shippingCost) >= 0 ? Number(shippingCost) : 0,
      videoUrl:  videoUrl  || '',
      videoUrl2: videoUrl2 || '',
    });

    res.status(201).json(product);
  } catch (err) {
    console.error('CREATE PRODUCT ERROR:', err);

    res.status(500).json({
      error: 'Failed to create product',
    });
  }
});

/* ======================================================
   🔥 GET PRODUCT BY SLUG (NEW - FUTURE READY)
====================================================== */

router.get('/slug/:slug', async (req, res) => {
  try {
    const product = await Product.findOne({ slug: req.params.slug }).populate({
      path: 'vendor',
      select: 'storeName storeLogo storeSlug type refurbishedBadge',
      populate: {
        path: 'userId',
        select: 'username email',
      },
    });

    if (!product || !product.active || product.archived) {
      return res.status(404).json({
        error: 'Product not found',
      });
    }

    res.json(product);
  } catch (err) {
    console.error('GET PRODUCT BY SLUG ERROR:', err);

    res.status(500).json({
      error: 'Failed to fetch product',
    });
  }
});

/* ======================================================
   GET CATEGORY LIST
====================================================== */

router.get('/category/list', async (req, res) => {
  try {
    const categories = await Product.distinct('category');

    res.json(categories);
  } catch (err) {
    console.error('CATEGORY LIST ERROR:', err);

    res.status(500).json({
      error: 'Failed to fetch categories',
    });
  }
});

/* ======================================================
   GET ALL PRODUCTS
====================================================== */

router.get('/', async (req, res) => {
  try {
    const { category, subcategory, vendor, search, q, page = 1, limit = 20 } = req.query;

    const searchTerm = search || q;

    const query = {
      active: true,
      archived: { $ne: true },
    };

    if (category) query.category = category;
    if (subcategory) query.subcategory = subcategory;

    if (vendor && mongoose.Types.ObjectId.isValid(vendor)) {
      query.vendor = new mongoose.Types.ObjectId(vendor);
    }

    /* 🔥 FIXED SEARCH (q + search support) */
    if (searchTerm) {
      query.$or = [
        { name: { $regex: searchTerm, $options: 'i' } },
        { category: { $regex: searchTerm, $options: 'i' } },
        { subcategory: { $regex: searchTerm, $options: 'i' } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);

    const rawProducts = await Product.find(query)
      .populate({
        path: 'vendor',
        select: 'storeName storeLogo',
        populate: {
          path: 'userId',
          select: 'username email',
        },
      })
      /* 🔥 SMART SORT (text relevance OR newest) */
      .sort({ featured: -1, createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    const products = rawProducts.map((p) => {
      const obj = p.toObject();

      return {
        ...obj,
        image:
          Array.isArray(obj.images) && obj.images.length
            ? obj.images[0]
            : '/assets/images/products/sell4life-placeholder.png',
      };
    });

    const total = await Product.countDocuments(query);

    res.json({
      products,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error('GET PRODUCTS ERROR:', err);

    res.status(500).json({
      error: 'Failed to fetch products',
    });
  }
});
/* ======================================================
   GET SINGLE PRODUCT BY ID
====================================================== */

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        error: 'Invalid product ID',
      });
    }

    const product = await Product.findById(id).populate({
      path: 'vendor',
      select: 'storeName storeLogo storeSlug type refurbishedBadge',
      populate: {
        path: 'userId',
        select: 'username email',
      },
    });

    if (!product || !product.active || product.archived) {
      return res.status(404).json({
        error: 'Product not found',
      });
    }

    res.json(product);
  } catch (err) {
    console.error('GET PRODUCT BY ID ERROR:', err);

    res.status(500).json({
      error: 'Failed to fetch product',
    });
  }
});

/* ======================================================
   UPDATE PRODUCT
====================================================== */

router.patch('/:id', authMiddleware, requireApprovedVendor, tierFieldGuard, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid product ID' });
  }
  try {
    const vendor = req.vendor;
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        error: 'Product not found',
      });
    }

    if (product.vendor.toString() !== vendor._id.toString()) {
      return res.status(403).json({
        error: 'Not allowed',
      });
    }

    const updates = req.body;

    if ('price' in updates && Number(updates.price) < 0) {
      return res.status(400).json({
        error: 'Invalid product price',
      });
    }

    /* ======================================================
       🔥 REGENERATE SLUG IF NAME CHANGED (NEW)
    ====================================================== */

    if (updates.name && updates.name !== product.name) {
      let baseSlug = generateSlug(updates.name);
      let uniqueSlug = baseSlug;
      let counter = 1;

      while (await Product.findOne({ slug: uniqueSlug })) {
        uniqueSlug = `${baseSlug}-${counter}`;
        counter++;
      }

      updates.slug = uniqueSlug;
    }

    const allowedFields = [
      'name',
      'shortDescription',
      'bulletPoints',
      'description',
      'price',
      'comparePrice',
      'costPrice',
      'images',
      'stock',
      'category',
      'subcategory',
      'tags',
      'shippingCost',
      'variants',
      'addOns',
      'videoUrl',
      'videoUrl2',
      'variantDisplay',
      'comingSoon',
    ];

    allowedFields.forEach((field) => {
      if (field in updates) {
        product[field] = updates[field];
      }
    });

    await product.save();

    res.json(product);
  } catch (err) {
    console.error('UPDATE PRODUCT ERROR:', err);

    res.status(500).json({
      error: 'Failed to update product',
    });
  }
});

/* ======================================================
   DUPLICATE PRODUCT (Professional+)
====================================================== */

router.post('/:id/duplicate', authMiddleware, requireApprovedVendor, requireTier('professional'), async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid product ID' });
  }
  try {
    const original = await Product.findOne({ _id: req.params.id, vendor: req.vendor._id });
    if (!original) return res.status(404).json({ error: 'Product not found' });

    const data = original.toObject();
    delete data._id;
    delete data.createdAt;
    delete data.updatedAt;
    delete data.views;
    delete data.salesCount;
    data.active = false; // duplicate starts as draft
    data.name = `${data.name} (Copy)`;

    // Generate unique slug
    let baseSlug = data.slug + '-copy';
    let slug = baseSlug;
    let n = 1;
    while (await Product.findOne({ slug })) { slug = `${baseSlug}-${n++}`; }
    data.slug = slug;

    const copy = await Product.create(data);
    res.json({ success: true, product: copy });
  } catch (err) {
    console.error('Duplicate product error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   ARCHIVE PRODUCT
====================================================== */

router.patch('/:id/archive', authMiddleware, requireApprovedVendor, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid product ID' });
  }
  try {
    const vendor = req.vendor;
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        error: 'Product not found',
      });
    }

    if (product.vendor.toString() !== vendor._id.toString()) {
      return res.status(403).json({
        error: 'Not allowed',
      });
    }

    // ✅ Correct archive behavior
    product.archived = true;
    product.active = false;

    await product.save();

    res.json({
      success: true,
    });
  } catch (err) {
    console.error('ARCHIVE PRODUCT ERROR:', err);

    res.status(500).json({
      error: 'Failed to archive product',
    });
  }
});

/* ======================================================
   UNARCHIVE PRODUCT
====================================================== */

router.patch('/:id/unarchive', authMiddleware, requireApprovedVendor, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid product ID' });
  }
  try {
    const vendor  = req.vendor;
    const product = await Product.findById(req.params.id);

    if (!product) return res.status(404).json({ error: 'Product not found' });
    if (product.vendor.toString() !== vendor._id.toString()) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    product.archived = false;
    product.active   = true;
    await product.save();

    res.json({ success: true });
  } catch (err) {
    console.error('UNARCHIVE PRODUCT ERROR:', err);
    res.status(500).json({ error: 'Failed to unarchive product' });
  }
});

/* ======================================================
   DELETE PRODUCT (VENDOR — own products only, no orders)
====================================================== */

router.delete('/:id', authMiddleware, requireApprovedVendor, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid product ID' });
  }
  try {
    const vendor  = req.vendor;
    const product = await Product.findById(req.params.id);

    if (!product) return res.status(404).json({ error: 'Product not found' });
    if (product.vendor.toString() !== vendor._id.toString()) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    const hasOrders = await Order.exists({ 'items.productId': product._id });
    if (hasOrders) {
      return res.status(400).json({ error: 'Cannot delete a product that has orders — archive it instead' });
    }

    await Product.deleteOne({ _id: product._id });
    res.json({ success: true });
  } catch (err) {
    console.error('VENDOR DELETE PRODUCT ERROR:', err);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

/* ======================================================
   HARD DELETE PRODUCT (ADMIN ONLY)
====================================================== */

router.delete('/:id/hard', authMiddleware, adminMiddleware, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid product ID' });
  }
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        error: 'Product not found',
      });
    }

    // 🚫 Prevent deleting products used in orders
    const hasOrders = await Order.findOne({
      'items.productId': product._id,
    });

    if (hasOrders) {
      return res.status(400).json({
        error: 'Cannot delete product used in orders',
      });
    }

    await Product.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
    });
  } catch (err) {
    console.error('HARD DELETE ERROR:', err);

    res.status(500).json({
      error: 'Failed to delete product',
    });
  }
});

export default router;
