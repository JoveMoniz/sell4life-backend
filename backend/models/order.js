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

    sku: { type: String, default: '' },

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

    subtotal: { type: Number, min: 0 },

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

    name: String,
    phone: String,
    address1: String,
    address2: String,
    city: String,
    county: String,
    postcode: String,

    country: {
      type: String,
      default: 'GB',
      uppercase: true,
    },
  },
  { _id: false }
);

/* ==============================
VENDOR SPLIT ORDER
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

    // refund scheduling per vendor
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

    status: String,
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
    /* ==============================
       CUSTOMER
    ============================== */

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

    /* ==============================
       ITEMS
    ============================== */

    items: {
      type: [orderItemSchema],
      required: true,
    },

    vendorOrders: {
      type: [vendorOrderSchema],
      default: [],
    },

    /* ==============================
       PRICING
    ============================== */

    subtotal: { type: Number, required: true },
    shipping: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    platformFee: { type: Number, default: 0 },

    total: { type: Number, required: true },

    currency: {
      type: String,
      default: 'gbp',
      lowercase: true,
    },

    couponCode: String,

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
      enum: ['pending', 'paid', 'failed', 'refund_scheduled', 'refunded', 'partially_refunded'],
      default: 'pending',
      index: true,
    },

    /* ==============================
       REFUND SYSTEM (NEW CLEAN LAYER)
    ============================== */

    refundStatus: {
      type: String,
      enum: ['none', 'requested', 'scheduled', 'processed'],
      default: 'none',
    },

    refundType: {
      type: String,
      enum: ['auto', 'vendor', 'admin'],
    },

    refundRequestedBy: {
      type: String,
      enum: ['customer', 'vendor', 'admin', 'system'],
    },

    refundAmount: {
      type: Number,
      default: 0,
    },

    refundReason: String,

    refundRequestedAt: Date,
    refundScheduledAt: Date,
    refundedAt: Date,

    /* ==============================
       ORDER STATUS (FULFILLMENT)
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

        'Refund Requested',
      ],
      default: 'Pending',
      index: true,
    },

    /* ==============================
       TIMESTAMPS
    ============================== */

    shippedAt: Date,
    deliveredAt: Date,
    cancelledAt: Date,

    cancelRequestedAt: Date,

    returnRequestedAt: Date,
    returnApprovedAt: Date,
    returnedAt: Date,

    /* ==============================
       ADDRESSES
    ============================== */

    shippingAddress: addressSchema,
    billingAddress: addressSchema,

    /* ==============================
       SHIPPING
    ============================== */

    shippingMethod: String,
    trackingNumber: String,
    carrier: String,
    estimatedDelivery: Date,

    /* ==============================
       HISTORY
    ============================== */

    statusHistory: {
      type: [statusHistorySchema],
      default: [],
    },

    /* ==============================
       NOTES & INTERNAL
    ============================== */

    customerNote: String,
    adminNote: String,

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
SHORT ID + SUBTOTAL FIX
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
