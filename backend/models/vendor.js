import mongoose from 'mongoose';

const vendorSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },

    status: {
      type: String,
      enum: ['pending', 'approved', 'suspended'],
      default: 'pending',
    },

    approvedAt: Date,
    suspendedAt: Date,

    storeName: {
      type: String,
      required: true,
      trim: true,
    },

    storeSlug: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    storeDescription: String,
    storeLogo: String,
    storeBanner: String,

    type: {
      type: String,
      enum: ['casual', 'professional'],
      default: 'casual',
    },

    verified: {
      type: Boolean,
      default: false,
    },

    stripeAccountId: String,

    payoutEnabled: {
      type: Boolean,
      default: false,
    },

    featured: {
      type: Boolean,
      default: false,
    },

    salesCount: {
      type: Number,
      default: 0,
    },

    vatRegistered: {
      type: Boolean,
      default: false,
    },

    vatNumber: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { timestamps: true }
);

export default mongoose.models.Vendor || mongoose.model('Vendor', vendorSchema);
