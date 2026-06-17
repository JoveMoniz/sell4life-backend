import express from 'express';
import mongoose from 'mongoose';
import Review, { syncProductRating } from '../models/review.js';
import Product from '../models/product.js';
import Order from '../models/order.js';
import User from '../models/user.js';
import authMiddleware from '../middleware/authMiddleware.js';
import adminMiddleware from '../middleware/adminMiddleware.js';
import { getPlatformConfig } from '../models/platformConfig.js';

const router = express.Router();

/* ── helpers ─────────────────────────────────────────────── */

async function getReviewsConfig() {
  const cfg = await getPlatformConfig();
  return {
    reviewsEnabled: cfg.reviewsEnabled ?? false,
    reviewsMinCount: cfg.reviewsMinCount ?? 3,
  };
}

/* ======================================================
   GET /api/reviews/config  — public, no auth
====================================================== */
router.get('/config', async (_req, res) => {
  try {
    res.json(await getReviewsConfig());
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   GET /api/reviews/product/:productId  — public
   Returns reviews + summary (only if enabled + threshold met)
====================================================== */
router.get('/product/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }

    const cfg = await getReviewsConfig();
    if (!cfg.reviewsEnabled) {
      return res.json({ enabled: false, reviews: [], summary: null });
    }

    const reviews = await Review.find({
      productId,
      status: 'approved',
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    if (reviews.length < cfg.reviewsMinCount) {
      return res.json({ enabled: true, public: false, reviews: [], summary: null });
    }

    const total = reviews.length;
    const avg   = Math.round((reviews.reduce((s, r) => s + r.rating, 0) / total) * 10) / 10;

    // Breakdown per star (1-5)
    const breakdown = [5, 4, 3, 2, 1].map(star => ({
      star,
      count: reviews.filter(r => r.rating === star).length,
    }));

    res.json({
      enabled: true,
      public: true,
      summary: { avg, total, breakdown },
      reviews,
    });
  } catch (err) {
    console.error('GET reviews error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   GET /api/reviews/my  — auth, user's own reviews
====================================================== */
router.get('/my', authMiddleware, async (req, res) => {
  try {
    const reviews = await Review.find({ userId: req.user._id })
      .select('productId rating title createdAt status')
      .lean();
    res.json({ reviews });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   POST /api/reviews  — auth required
======================================================  */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const cfg = await getReviewsConfig();
    if (!cfg.reviewsEnabled) {
      return res.status(403).json({ error: 'Reviews are currently disabled' });
    }

    const { productId, rating, title = '', body = '' } = req.body;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }

    const ratingNum = Number(rating);
    if (!ratingNum || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({ error: 'Rating must be 1–5' });
    }

    const product = await Product.findById(productId).lean();
    if (!product) return res.status(404).json({ error: 'Product not found' });

    // Only customers who have actually received the product may review it
    const deliveredOrder = await Order.findOne({
      userId: req.user._id,
      items: {
        $elemMatch: {
          productId: new mongoose.Types.ObjectId(productId),
          status: 'Delivered',
        },
      },
    }).lean();

    if (!deliveredOrder) {
      return res.status(403).json({ error: 'You can only review products after they have been delivered to you.' });
    }

    const verified = true;
    const orderId  = deliveredOrder._id;

    const user = await User.findById(req.user._id).select('username firstName lastName').lean();
    const buyerName = user?.username || user?.firstName || 'Buyer';

    const review = await Review.create({
      productId,
      userId:    req.user._id,
      vendorId:  product.vendor,
      orderId,
      rating:    ratingNum,
      title:     title.trim().slice(0, 120),
      body:      body.trim().slice(0, 2000),
      verified,
      buyerName,
      status: 'approved',
    });

    await syncProductRating(productId);

    res.status(201).json({ ok: true, review });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'You have already reviewed this product' });
    }
    console.error('POST review error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   GET /api/reviews/my/:productId  — auth, user's review for one product
====================================================== */
router.get('/my/:productId', authMiddleware, async (req, res) => {
  try {
    const { productId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }
    const review = await Review.findOne({ productId, userId: req.user._id }).lean();
    res.json({ review: review || null });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   PUT /api/reviews/:id  — user updates own review
====================================================== */
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const review = await Review.findOne({ _id: req.params.id, userId: req.user._id });
    if (!review) return res.status(404).json({ error: 'Review not found' });

    const ratingNum = Number(req.body.rating);
    if (!ratingNum || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({ error: 'Rating must be 1–5' });
    }

    review.rating = ratingNum;
    review.title  = (req.body.title  || '').trim().slice(0, 120);
    review.body   = (req.body.body   || '').trim().slice(0, 2000);
    review.status = 'pending';
    await review.save();
    await syncProductRating(review.productId);

    res.json({ ok: true, review });
  } catch (err) {
    console.error('PUT review error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   DELETE /api/reviews/:id  — user deletes own review
====================================================== */
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ error: 'Review not found' });

    const isAdmin = req.user?.role === 'admin';
    if (!isAdmin && String(review.userId) !== String(req.user._id)) {
      return res.status(403).json({ error: 'Not authorised' });
    }

    const { productId } = review;
    await review.deleteOne();
    await syncProductRating(productId);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   ADMIN ROUTES
====================================================== */

/* GET /api/reviews/admin/list */
router.get('/admin/list', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status, page = 1, limit = 30 } = req.query;
    const filter = {};
    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      filter.status = status;
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [reviews, total] = await Promise.all([
      Review.find(filter)
        .populate('productId', 'name slug')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Review.countDocuments(filter),
    ]);

    res.json({ reviews, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

/* PUT /api/reviews/admin/:id/status  — approve or reject */
router.put('/admin/:id/status', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['approved', 'rejected', 'pending'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const review = await Review.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    if (!review) return res.status(404).json({ error: 'Review not found' });

    await syncProductRating(review.productId);
    res.json({ ok: true, review });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

/* DELETE /api/reviews/admin/:id */
router.delete('/admin/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const review = await Review.findByIdAndDelete(req.params.id);
    if (!review) return res.status(404).json({ error: 'Review not found' });
    await syncProductRating(review.productId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
