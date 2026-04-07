import mongoose from 'mongoose';

/* ==============================
ORDER ITEM
============================== */

const orderItemSchema = new mongoose.Schema(
  {
    _id: false,

    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },

    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    sku: {
      type: String,
      default: '',
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    image: {
      type: String,
      default: '/assets/images/products/sell4life-placeholder.png',
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    quantity: {
      type: Number,
      required: true,
      min: 1,
    },

    subtotal: {
      type: Number,
      min: 0,
    },

    attributes: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { _id: false }
);

/* ==============================
ADDRESS
============================== */

const addressSchema = new mongoose.Schema(
  {
    _id: false,

    name: { type: String, default: '', trim: true },
    phone: { type: String, default: '', trim: true },
    address1: { type: String, default: '', trim: true },
    address2: { type: String, default: '', trim: true },
    city: { type: String, default: '', trim: true },
    county: { type: String, default: '', trim: true },
    postcode: { type: String, default: '', trim: true },

    country: {
      type: String,
      default: 'GB',
      uppercase: true,
      trim: true,
    },
  },
  { _id: false }
);

/* ==============================
VENDOR SPLIT ORDERS
============================== */

const vendorOrderSchema = new mongoose.Schema(
  {
    _id: false,

    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    subtotal: { type: Number, default: 0 },
    shipping: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    total: { type: Number, default: 0 },

    status: {
      type: String,
      enum: [
        'Pending',
        'Processing',
        'Shipped',
        'Delivered',

        'Cancel Requested',
        'Cancelled',

        'Return Requested',
        'Return Approved',
        'Returned',

        'Refund Scheduled',
        'Refund Requested',
      ],
      default: 'Pending',
    },

    // 🔥 optional but future-proof
    refundScheduledAt: Date,

    trackingNumber: String,
    carrier: String,
    shippedAt: Date,
    deliveredAt: Date,
  },
  { _id: false }
);

/* ==============================
STATUS HISTORY
============================== */

const statusHistorySchema = new mongoose.Schema(
  {
    _id: false,

    status: {
      type: String,
      enum: [
        'Pending',
        'Processing',
        'Shipped',
        'Delivered',

        'Cancel Requested',
        'Cancelled',

        'Return Requested',
        'Return Approved',
        'Returned',

        'Refund Scheduled',
        'Refund Requested',
      ],
    },

    note: String,

    date: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

/* ==============================
ORDER SCHEMA
============================== */

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
    },

    shortId: {
      type: String,
      index: true,
    },

    items: {
      type: [orderItemSchema],
      required: true,
    },

    /* ==============================
     PRICING
    ============================== */

    subtotal: { type: Number, required: true, min: 0 },
    shipping: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    platformFee: { type: Number, default: 0 },

    total: {
      type: Number,
      required: true,
    },

    currency: {
      type: String,
      default: 'gbp',
      lowercase: true,
    },

    couponCode: {
      type: String,
      uppercase: true,
    },

    /* ==============================
     PAYMENT
    ============================== */

    paymentProvider: {
      type: String,
      default: 'stripe',
    },

    paymentIntentId: {
      type: String,
      index: true,
    },

    paymentMethod: String,

    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded', 'partially_refunded'],
      default: 'pending',
      index: true,
    },

    refundAmount: {
      type: Number,
      default: 0,
    },

    refundReason: String,

    /* ==============================
     ORDER STATUS
    ============================== */

    status: {
      type: String,
      enum: [
        'Pending',
        'Processing',
        'Shipped',
        'Delivered',

        'Cancel Requested',
        'Cancelled',

        'Return Requested',
        'Return Approved',
        'Returned',

        'Refund Scheduled',
        'Refund Requested',
      ],
      default: 'Pending',
      index: true,
    },

    /* ==============================
     ADDRESSES
    ============================== */

    shippingAddress: { type: addressSchema, default: {} },
    billingAddress: { type: addressSchema, default: {} },

    /* ==============================
     SHIPPING
    ============================== */

    shippingMethod: String,
    trackingNumber: String,
    carrier: String,
    estimatedDelivery: Date,

    shippedAt: Date,
    deliveredAt: Date,
    cancelledAt: Date,

    /* ==============================
     TIMESTAMPS (IMPORTANT)
    ============================== */

    cancelRequestedAt: Date,
    refundRequestedAt: Date,

    returnRequestedAt: Date,
    returnApprovedAt: Date, // ✅ added
    returnedAt: Date,

    refundScheduledAt: {
      type: Date,
      index: true,
    },

    /* ==============================
     MULTI-VENDOR
    ============================== */

    vendorOrders: {
      type: [vendorOrderSchema],
      default: [],
    },

    /* ==============================
     HISTORY
    ============================== */

    statusHistory: {
      type: [statusHistorySchema],
      default: [],
    },

    /* ==============================
     NOTES
    ============================== */

    customerNote: String,
    adminNote: String,

    /* ==============================
     ANALYTICS
    ============================== */

    source: { type: String, default: 'website' },
    device: { type: String, default: 'web' },
    ipAddress: String,

    /* ==============================
     INTERNAL
    ============================== */

    archived: {
      type: Boolean,
      default: false,
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

/* ==============================
INDEXES
============================== */

orderSchema.index({ createdAt: -1 });
orderSchema.index({ 'items.vendorId': 1 });
orderSchema.index({ status: 1, paymentStatus: 1 });

/* ==============================
GENERATE SHORT ORDER ID
============================== */

orderSchema.pre('validate', function () {
  if (!this.shortId && this._id) {
    this.shortId = `S4L-${String(this._id).slice(0, 10).toUpperCase()}`;
  }

  if (Array.isArray(this.items)) {
    this.items.forEach((item) => {
      if (!item.subtotal) {
        item.subtotal = item.price * item.quantity;
      }
    });
  }
});

export default mongoose.models.Order || mongoose.model('Order', orderSchema);
