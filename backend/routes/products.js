import { requireApprovedVendor, stripTierFields, requireTier } from '../middleware/vendorMiddleware.js';
import { Router } from 'express';
import mongoose from 'mongoose';

import Product from '../models/product.js';
import Vendor from '../models/vendor.js';
import Order from '../models/order.js'; // 🔥 needed for hard delete

import authMiddleware from '../middleware/authMiddleware.js';
import adminMiddleware from '../middleware/adminMiddleware.js'; // 🔥 THIS WAS MISSING
import { decryptCredential } from '../utils/shippingProviders/registry.js';
import { syncProductFromCj, looksCjSourced, deriveBasePriceFromVariants, scaleVariantPricesToTarget } from '../utils/cjProductSync.js';
import { lookupGeo } from '../utils/geoip.js';
import { isCountryAllowedByScope } from '../utils/shippingScope.js';

const router = Router();

/* ======================================================
   🔥 SLUG GENERATOR (NEW)
====================================================== */

export function generateSlug(text) {
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
  videoUrl3:          'casual',
  videoUrl4:          'professional',
  videoUrl5:          'professional',
});

router.post('/', authMiddleware, requireApprovedVendor, tierFieldGuard, async (req, res) => {
  try {
    const vendor = req.vendor;

    const { name, description, shortDescription, bulletPoints, price, images, stock, category, subcategory, tags, shippingCost, shipIncluded, collectionOnly, shippingScope, shippingCountries, videoUrl, videoUrl2, videoUrl3, videoUrl4, videoUrl5, estDeliveryMinDays, estDeliveryMaxDays, active, freeReturns, supplier, supplierUrl, condition, acceptOffers } = req.body;

    const VALID_SHIPPING_SCOPES = ['worldwide', 'uk', 'uk_eu', 'custom'];

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
      // Single source of truth for whether the buyer pays this at checkout
      // (see create-payment-intent, which zeroes shippingCost when true) —
      // shippingCost above is kept regardless, as the markup calculator's
      // reference figure.
      shipIncluded: !!shipIncluded,
      collectionOnly: !!collectionOnly,
      shippingScope: VALID_SHIPPING_SCOPES.includes(shippingScope) ? shippingScope : 'worldwide',
      shippingCountries: Array.isArray(shippingCountries)
        ? shippingCountries.map(c => String(c).toUpperCase()).filter(c => /^[A-Z]{2}$/.test(c))
        : [],
      videoUrl:  videoUrl  || '',
      videoUrl2: videoUrl2 || '',
      videoUrl3: videoUrl3 || '',
      videoUrl4: videoUrl4 || '',
      videoUrl5: videoUrl5 || '',
      estDeliveryMinDays: Number(estDeliveryMinDays) >= 0 ? Number(estDeliveryMinDays) : 3,
      estDeliveryMaxDays: Number(estDeliveryMaxDays) >= 0 ? Number(estDeliveryMaxDays) : 7,
      active: active !== undefined ? !!active : true,
      freeReturns: freeReturns !== undefined ? !!freeReturns : null,
      supplier: supplier || '',
      supplierUrl: supplierUrl || '',
      condition: condition || '',
      acceptOffers: !!acceptOffers,
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
    const product = await Product.findOne({ slug: req.params.slug })
      .select('-costPrice -supplier -supplierUrl')
      .populate({
        path: 'vendor',
        select: 'storeName storeLogo storeSlug type refurbishedBadge freeReturns',
        populate: {
          path: 'userId',
          select: 'username',
        },
      });

    if (!product || !product.active || product.archived || product.deletedAt) {
      return res.status(404).json({
        error: 'Product not found',
      });
    }

    // Browse-time availability: the seller's own stated shipping scope only
    // — never a live CJ freight call here (this route gets hit on every
    // product page view; that check belongs at checkout, where the real
    // destination is actually known and CJ calls are already happening).
    const { country: buyerCountry } = lookupGeo(req.ip);
    res.json({
      ...product.toObject(),
      buyerCountry,
      shippableToBuyer: isCountryAllowedByScope(product, buyerCountry),
    });
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

router.get('/category/counts', async (req, res) => {
  try {
    const result = await Product.aggregate([
      { $match: { active: true, archived: { $ne: true }, deletedAt: null } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ]);
    const counts = {};
    result.forEach(({ _id, count }) => { if (_id) counts[_id] = count; });
    res.json(counts);
  } catch (err) {
    console.error('CATEGORY COUNTS ERROR:', err);
    res.status(500).json({ error: 'Failed to fetch category counts' });
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
      deletedAt: null,
    };

    if (category) query.category = category;
    if (subcategory) query.subcategory = subcategory;

    if (vendor && mongoose.Types.ObjectId.isValid(vendor)) {
      query.vendor = new mongoose.Types.ObjectId(vendor);
    }

    /* 🔥 FIXED SEARCH (q + search support) */
    if (searchTerm) {
      // Treat straight and curly quotes as equivalent — product names sometimes
      // pick up smart quotes (’ “ ”) from autocorrect, which would otherwise
      // silently fail to match a customer typing a plain ' or ".
      const normalizedTerm = searchTerm
        .replace(/['‘’]/g, "['‘’]")
        .replace(/["“”]/g, '["“”]');
      query.$or = [
        { name: { $regex: normalizedTerm, $options: 'i' } },
        { category: { $regex: normalizedTerm, $options: 'i' } },
        { subcategory: { $regex: normalizedTerm, $options: 'i' } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);

    const rawProducts = await Product.find(query)
      .select('-costPrice -supplier -supplierUrl')
      .populate({
        path: 'vendor',
        select: 'storeName storeLogo',
        populate: {
          path: 'userId',
          select: 'username',
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

    const product = await Product.findById(id)
      .select('-costPrice -supplier -supplierUrl')
      .populate({
        path: 'vendor',
        select: 'storeName storeLogo storeSlug type refurbishedBadge freeReturns',
        populate: {
          path: 'userId',
          select: 'username',
        },
      });

    if (!product || !product.active || product.archived || product.deletedAt) {
      return res.status(404).json({
        error: 'Product not found',
      });
    }

    const { country: buyerCountry } = lookupGeo(req.ip);
    res.json({
      ...product.toObject(),
      buyerCountry,
      shippableToBuyer: isCountryAllowedByScope(product, buyerCountry),
    });
  } catch (err) {
    console.error('GET PRODUCT BY ID ERROR:', err);

    res.status(500).json({
      error: 'Failed to fetch product',
    });
  }
});

/* ======================================================
   BULK EDIT (Professional+)
   PATCH /products/bulk { ids: [...], price?, stock?, active? }
====================================================== */
router.patch('/bulk', authMiddleware, requireApprovedVendor, requireTier('professional'), async (req, res) => {
  try {
    const { ids, price, stock, active, shippingCost, shipIncluded, markupPct } = req.body;

    if (!Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ error: 'ids array required' });
    }
    if (!ids.every(id => mongoose.Types.ObjectId.isValid(id))) {
      return res.status(400).json({ error: 'Invalid product ID in ids' });
    }

    const update = {};
    if (stock        !== undefined && stock        !== null && Number.isFinite(Number(stock)))        update.stock        = Math.max(0, Math.round(Number(stock)));
    if (shippingCost !== undefined && shippingCost !== null && Number.isFinite(Number(shippingCost))) update.shippingCost = Math.max(0, Number(shippingCost));
    if (shipIncluded !== undefined) update.shipIncluded = !!shipIncluded;
    if (markupPct    !== undefined && markupPct    !== null && Number.isFinite(Number(markupPct)) && Number(markupPct) >= 0) update.markupPct = Number(markupPct);
    if (active !== undefined) update.active = !!active;

    const hasPriceUpdate = price !== undefined && price !== null && Number.isFinite(Number(price));

    if (!Object.keys(update).length && !hasPriceUpdate) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    let modifiedCount = 0;

    if (hasPriceUpdate) {
      // Price can't be a blanket $set here — for a product with variants,
      // price must stay derived from variant prices (the same invariant the
      // single-product edit route enforces), so each variant's price needs
      // to be scaled proportionally rather than overwritten only at the top
      // level. Bulk-setting price alone used to leave variants untouched,
      // so the very next save/CJ-sync would re-derive the base price back
      // to the old (unscaled) variant prices — the bulk edit "not applying."
      const newPrice = Number(price);
      const products = await Product.find({ _id: { $in: ids }, vendor: req.vendor._id });
      await Promise.all(products.map(async (p) => {
        Object.assign(p, update);
        p.price = (Array.isArray(p.variants) && p.variants.length > 0)
          ? scaleVariantPricesToTarget(p.variants, newPrice)
          : newPrice;
        await p.save();
        modifiedCount++;
      }));
    } else {
      const result = await Product.updateMany(
        { _id: { $in: ids }, vendor: req.vendor._id },
        { $set: update }
      );
      modifiedCount = result.modifiedCount;
    }

    res.json({ success: true, updated: modifiedCount });
  } catch (err) {
    console.error('Bulk edit error:', err);
    res.status(500).json({ error: 'Server error' });
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

    if (product.adminSuspended) {
      return res.status(403).json({
        error: 'This listing was suspended by an admin and can’t be edited until it’s reinstated.',
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

      // Exclude this product's own current slug from the collision check —
      // otherwise a trivial name tweak that regenerates to the same slug
      // it already has gets needlessly bumped to "-1".
      while (await Product.findOne({ slug: uniqueSlug, _id: { $ne: product._id } })) {
        uniqueSlug = `${baseSlug}-${counter}`;
        counter++;
      }

      // Assigned directly on the product, not via `updates` — slug is a
      // server-derived field and must never be settable through the generic
      // allowedFields pass-through below (that would let a client submit an
      // arbitrary/colliding slug directly, bypassing the uniqueness check
      // above entirely).
      product.slug = uniqueSlug;
    }

    const allowedFields = [
      'name',
      'shortDescription',
      'bulletPoints',
      'description',
      'price',
      'comparePrice',
      'costPrice',
      'markupPct',
      'images',
      'stock',
      'sku',
      'trackInventory',
      'allowBackorder',
      'weight',
      'dimensions',
      'category',
      'subcategory',
      'tags',
      'shippingCost',
      'shipIncluded',
      'collectionOnly',
      'shippingScope',
      'shippingCountries',
      'condition',
      'acceptOffers',
      'variants',
      'addOns',
      'videoUrl',
      'videoUrl2',
      'videoUrl3',
      'videoUrl4',
      'videoUrl5',
      'variantDisplay',
      'comingSoon',
      'estDeliveryMinDays',
      'estDeliveryMaxDays',
      'active',
      'freeReturns',
      'supplier',
      'supplierUrl',
      'seoTitle',
      'seoDescription',
      'conditionGrade',
      'testedStatus',
      'warrantyPeriod',
      'serialNumber',
      'refurbishmentNotes',
    ];

    allowedFields.forEach((field) => {
      if (!(field in updates)) return;

      if (field === 'variants') {
        // The edit form never sends cjVid back (it's not a vendor-editable
        // field), so a plain overwrite here would silently erase CJ's
        // internal variant id on every save — breaking CJ auto-ordering
        // until the background re-sync below happens to repair it (which
        // isn't guaranteed: it can fail silently, e.g. rate limit or SKU
        // mismatch). Carry the existing cjVid forward by matching on SKU,
        // falling back to position for newly-added/unmatched rows.
        const existingVariants = product.variants || [];
        product.variants = (updates.variants || []).map((incoming, idx) => {
          const sku = (incoming.sku || '').trim();
          const existing = (sku && existingVariants.find(v => (v.sku || '').trim() === sku))
            || existingVariants[idx];
          return { ...incoming, cjVid: incoming.cjVid || existing?.cjVid || '' };
        });
      } else {
        product[field] = updates[field];
      }
    });

    // Keep the base "from £X" price honest — always the cheapest variant,
    // never an independently-maintained number that can silently drift away
    // from what the variants actually cost (that drift caused a real
    // mispricing bug: checkout charged one price, the page showed another).
    // Deliberately NOT gated on `'variants' in updates` — a save that only
    // touches pricing fields (e.g. editing Cost Price and hitting Save from
    // the Pricing section) must still be forced to match the variants that
    // already exist in the DB.
    //
    // If the vendor explicitly submitted a new `price` this request (e.g.
    // typing directly into the Price field and hitting Save, rather than
    // using the "Apply to Price" calculator, which already scales variant
    // inputs client-side before submitting), scale the variants to match it
    // instead of silently discarding their edit — same shared logic the
    // bulk price-edit route uses.
    if (Array.isArray(product.variants) && product.variants.length > 0) {
      if ('price' in updates && Number.isFinite(Number(updates.price))) {
        product.price = scaleVariantPricesToTarget(product.variants, Number(updates.price));
      } else {
        const derivedBase = deriveBasePriceFromVariants(product.variants);
        if (derivedBase != null) product.price = derivedBase;
      }
    }

    await product.save();

    // Auto-sync with CJ in the background if this update touched variants and
    // the product looks CJ-sourced — keeps cjVid current without the vendor
    // needing to remember a separate manual "sync" step. Never blocks the
    // response; failures are logged only.
    if ('variants' in updates && vendor.type === 'professional' && looksCjSourced(product)) {
      const rawCred = vendor.supplierCredentials?.cjdropshipping;
      if (rawCred) {
        (async () => {
          try {
            const credential = decryptCredential(rawCred);
            await syncProductFromCj(product, credential);
          } catch (err) {
            console.warn('[auto-cj-sync] failed for product', product._id.toString(), err.message);
          }
        })();
      }
    }

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

    // Archive hides the product regardless of its Active/Draft state;
    // that state is preserved so unarchiving restores it correctly.
    product.archived = true;

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

    // Restore visibility only — keep whatever Active/Draft state it had before archiving
    product.archived = false;
    await product.save();

    res.json({ success: true });
  } catch (err) {
    console.error('UNARCHIVE PRODUCT ERROR:', err);
    res.status(500).json({ error: 'Failed to unarchive product' });
  }
});

/* ======================================================
   DELETE PRODUCT (VENDOR — own products only, no orders)
   Soft delete: moves to Trash. Use /:id/permanent to actually remove it.
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

    product.deletedAt = new Date();
    await product.save();
    res.json({ success: true });
  } catch (err) {
    console.error('VENDOR DELETE PRODUCT ERROR:', err);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

/* ======================================================
   RESTORE PRODUCT FROM TRASH (VENDOR)
====================================================== */

router.patch('/:id/restore', authMiddleware, requireApprovedVendor, async (req, res) => {
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
    if (!product.deletedAt) {
      return res.status(400).json({ error: 'Product is not in Trash' });
    }

    product.deletedAt = null;
    await product.save();
    res.json({ success: true });
  } catch (err) {
    console.error('RESTORE PRODUCT ERROR:', err);
    res.status(500).json({ error: 'Failed to restore product' });
  }
});

/* ======================================================
   PERMANENTLY DELETE FROM TRASH (VENDOR — must already be trashed)
====================================================== */

router.delete('/:id/permanent', authMiddleware, requireApprovedVendor, async (req, res) => {
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
    if (!product.deletedAt) {
      return res.status(400).json({ error: 'Move to Trash first before permanently deleting' });
    }

    const hasOrders = await Order.exists({ 'items.productId': product._id });
    if (hasOrders) {
      return res.status(400).json({ error: 'Cannot delete a product that has orders' });
    }

    await Product.deleteOne({ _id: product._id });
    res.json({ success: true });
  } catch (err) {
    console.error('PERMANENT DELETE PRODUCT ERROR:', err);
    res.status(500).json({ error: 'Failed to permanently delete product' });
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

/* ======================================================
   SUSPEND / REINSTATE A SINGLE LISTING (ADMIN ONLY)
   Pulls one listing for cause without hard-deleting it (blocked once it
   has orders) or suspending the vendor's whole account over one product.
====================================================== */

router.patch('/:id/suspend', authMiddleware, adminMiddleware, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid product ID' });
  }
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    product.active = false;
    product.adminSuspended = true;
    product.adminSuspendedReason = (req.body?.reason || '').trim();
    product.adminSuspendedAt = new Date();
    await product.save();

    res.json({ success: true, product });
  } catch (err) {
    console.error('PRODUCT SUSPEND ERROR:', err);
    res.status(500).json({ error: 'Failed to suspend product' });
  }
});

router.patch('/:id/reinstate', authMiddleware, adminMiddleware, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid product ID' });
  }
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    product.adminSuspended = false;
    product.adminSuspendedReason = '';
    product.adminSuspendedAt = null;
    product.active = true;
    await product.save();

    res.json({ success: true, product });
  } catch (err) {
    console.error('PRODUCT REINSTATE ERROR:', err);
    res.status(500).json({ error: 'Failed to reinstate product' });
  }
});

export default router;
