import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      default: null,
    },
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      default: null,
    },
    rating:   { type: Number, required: true, min: 1, max: 5 },
    title:    { type: String, trim: true, maxlength: 120, default: '' },
    body:     { type: String, trim: true, maxlength: 2000, default: '' },
    verified: { type: Boolean, default: false },
    status:   { type: String, enum: ['pending', 'approved', 'rejected'], default: 'approved' },
    buyerName:{ type: String, default: '' },
  },
  { timestamps: true }
);

// One review per user per product
reviewSchema.index({ productId: 1, userId: 1 }, { unique: true });

const Review = mongoose.models.Review || mongoose.model('Review', reviewSchema);
export default Review;

/* Recalculate and persist avgRating + reviewCount on the Product */
export async function syncProductRating(productId) {
  const Product = mongoose.model('Product');
  const agg = await Review.aggregate([
    { $match: { productId: new mongoose.Types.ObjectId(String(productId)), status: 'approved' } },
    { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  const avg   = agg[0] ? Math.round(agg[0].avg * 10) / 10 : 0;
  const count = agg[0] ? agg[0].count : 0;
  await Product.findByIdAndUpdate(productId, { avgRating: avg, reviewCount: count });
}
