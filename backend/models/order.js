import mongoose from 'mongoose';

/* ==============================
   ORDER ITEM
============================== */

const orderItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
    index: true,
  },

  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true,
    index: true,
  },

  variantSku: { type: String, default: '' },
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

  attributes: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },

  price: { type: Number, required: true, min: 0 },
  quantity: { type: Number, required: true, min: 1 },
  subtotal: { type: Number, min: 0 },
  shippingCost: { type: Number, default: 0, min: 0 },

  // Snapshot of the product's supplier info at purchase time — lets the vendor
  // jump straight to the supplier listing when fulfilling a dropshipped order.
  supplier: { type: String, default: '' },
  supplierUrl: { type: String, default: '' },

  // CJ auto-order — created automatically (unpaid) when the buyer pays, so
  // the vendor just has to go pay for it in the CJ dashboard rather than
  // re-entering the order by hand. cjOrderStatus 'failed' means creation
  // didn't succeed and the vendor needs to place it manually as before.
  cjOrderId: { type: String, default: '' },
  cjOrderNumber: { type: String, default: '' },
  cjOrderStatus: { type: String, default: '' },
  cjOrderError: { type: String, default: '' },
  cjOrderCreatedAt: Date,

  taxAmount: { type: Number, default: 0, min: 0 },
  shippingAmount: { type: Number, default: 0, min: 0 },
  discountAmount: { type: Number, default: 0, min: 0 },
  platformFeeAmount: { type: Number, default: 0, min: 0 },

  // Snapshot of the vendor/product free-returns setting at the time of purchase,
  // so a later settings change doesn't retroactively affect this order's refund.
  freeReturns: { type: Boolean, default: false },

  status: {
    type: String,
    enum: [
      'Pending',
      'Processing',
      'Shipped',
      'Delivered',
      'Cancel Requested',
      'Cancel Approved',
      'Cancel Rejected',
      'Cancelled',
    ],
    default: 'Pending',
    index: true,
  },

  returnStatus: {
    type: String,
    enum: ['none', 'requested', 'approved', 'rejected', 'partially_returned', 'returned'],
    default: 'none',
    index: true,
  },

  returnReason: { type: String, trim: true, default: '' },
  returnReasonCategory: {
    type: String,
    enum: ['', 'change_of_mind', 'faulty_damaged_wrong_misdescribed'],
    default: '',
  },
  customerReturnNote: { type: String, default: '' },
  vendorReturnNote: { type: String, default: '' },
  adminReturnNote: { type: String, default: '' },

  returnRequestedQuantity: { type: Number, default: 0, min: 0 },
  returnApprovedQuantity: { type: Number, default: 0, min: 0 },
  returnQuantity: { type: Number, default: 0, min: 0 },

  returnedCondition: {
    type: String,
    enum: ['new', 'opened', 'used', 'damaged', 'not_returned'],
    default: 'not_returned',
  },

  returnRequestedAt: Date,
  returnApprovedAt: Date,
  returnedAt: Date,

  returnApprovedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },

  returnRejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },

  returnRejectionReason: { type: String, default: '' },

  refundStatus: {
    type: String,
    enum: [
      'none',
      'requested',
      'approved',
      'scheduled',
      'processing',
      'partially_refunded',
      'processed',
      'failed',
      'cancelled',
    ],
    default: 'none',
    index: true,
  },

  refundedQuantity: { type: Number, default: 0, min: 0 },
  refundedAmount: { type: Number, default: 0, min: 0 },

  refundReason: { type: String, default: '' },
  refundAttempts: { type: Number, default: 0 },

  // Refund with no physical return required (e.g. low-value item where
  // return postage isn't worth it). Scheduled 24h out for review/cancellation
  // before the refundWorker actually executes it. goodwillPaidBy determines
  // whether it counts against the vendor's payout (vendor) or is absorbed
  // by Sell4Life itself (platform) — see computeVendorBalance.
  goodwillRefund: { type: Boolean, default: false },
  goodwillRefundAmount: { type: Number, default: 0, min: 0 },
  goodwillPaidBy: { type: String, enum: ['vendor', 'platform'], default: 'vendor' },

  refundRequestedAt: Date,
  refundScheduledAt: Date,
  refundedAt: Date,

  refundApprovedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },

  refundProcessedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },

  refundCancelledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },

  refundFailedReason: { type: String, default: '' },
  stripeRefundId: { type: String, default: '' },

  returnHistory: [
    {
      _id: false,

      type: {
        type: String,
        enum: [
          'return_requested',
          'return_approved',
          'return_rejected',
          'returned',

          'refund_requested',
          'refund_scheduled',
          'refund_processed',
          'partial_refund',
          'refund_failed',
          'refund_cancelled',

          'goodwill_refund_scheduled',
          'goodwill_refund_processed',
          'goodwill_refund_cancelled',
        ],
      },

      stripeRefundId: {
        type: String,
        default: '',
      },

      status: String,

      quantity: {
        type: Number,
        default: 0,
      },

      amount: {
        type: Number,
        default: 0,
      },

      note: String,

      by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },

      at: {
        type: Date,
        default: Date.now,
      },
    },
  ],

  trackingNumber: { type: String, default: '' },
  carrier: { type: String, default: '' },

  shippedAt: Date,
  deliveredAt: Date,
  cancelledAt: Date,

  // What this item's status was right before an order-level cancel
  // overwrote it — lets admin's "Cancel Refund" genuinely undo the
  // cancellation (revert fulfillment) rather than just stopping the money.
  statusBeforeCancel: { type: String, default: '' },

  archived: {
    type: Boolean,
    default: false,
  },

  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
});

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
      trim: true,
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
      ref: 'Vendor',
      required: true,
      index: true,
    },

    vendorName: { type: String, default: '' },
    vendorSlug: { type: String, default: '' },
    vendorStoreName: { type: String, default: '' },

    subtotal: { type: Number, default: 0 },
    shipping: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    platformFee: { type: Number, default: 0 },
    total: { type: Number, default: 0 },

    status: {
      type: String,
      enum: [
        'Pending',
        'Processing',
        'Shipped',
        'Delivered',
        'Partially Delivered',

        'Cancel Requested',
        'Cancel Approved',
        'Cancel Rejected',
        'Cancelled',

        'Return Requested',
        'Return Approved',
        'Return Rejected',
        'Partially Returned',
        'Returned',

        'Refund Requested',
        'Partially Refunded',
        'Refund Scheduled',
        'Refund Processing',
        'Refunded',
      ],
      default: 'Pending',
      index: true,
    },

    refundStatus: {
      type: String,
      enum: [
        'none',
        'requested',
        'approved',
        'scheduled',
        'processing',
        'partially_refunded',
        'processed',
        'failed',
        'cancelled',
      ],
      default: 'none',
      index: true,
    },

    refundAmount: { type: Number, default: 0 },
    refundScheduledAt: Date,
    refundedAt: Date,

    trackingNumber: { type: String, default: '' },
    carrier: { type: String, default: '' },

    shippedAt: Date,
    deliveredAt: Date,
    cancelledAt: Date,
    returnedAt: Date,

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
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

    vendorOrders: {
      type: [vendorOrderSchema],
      default: [],
    },

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

    paymentProvider: {
      type: String,
      default: 'stripe',
    },

    paymentIntentId: {
      type: String,
      // unique + sparse: prevents two orders ever being created for the same
      // PaymentIntent if Stripe redelivers payment_intent.succeeded while an
      // earlier delivery's Order.create() is still in flight (a real race —
      // the check-then-act existence check in the webhook isn't atomic on
      // its own). sparse allows multiple documents with no paymentIntentId.
      unique: true,
      sparse: true,
    },

    paymentMethod: String,

    paymentStatus: {
      type: String,
      enum: [
        'pending',
        'paid',
        'failed',
        'refund_scheduled',
        'refund_processing',
        'refunded',
        'partially_refunded',
      ],
      default: 'pending',
      index: true,
    },

    refundStatus: {
      type: String,
      enum: [
        'none',
        'requested',
        'approved',
        'scheduled',
        'processing',
        'partially_refunded',
        'processed',
        'failed',
        'cancelled',
      ],
      default: 'none',
      index: true,
    },

    refundType: {
      type: String,
      enum: ['auto', 'vendor', 'admin'],
    },

    refundRequestedBy: {
      type: String,
      enum: ['customer', 'vendor', 'admin', 'system'],
    },

    refundAmount: { type: Number, default: 0 },
    refundReason: String,

    refundRequestedAt: Date,
    refundScheduledAt: Date,
    refundedAt: Date,

    stripeRefundId: {
      type: String,
      default: '',
    },

    stripeFeeAmount: { type: Number, default: 0 },  // actual fee in £, stored at payment time

    refundCancelledAt: Date,

    refundCancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    refundProcessedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    refundApprovedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    status: {
      type: String,
      enum: [
        'Pending',
        'Processing',
        'Shipped',
        'Delivered',
        'Partially Delivered',

        'Cancel Requested',
        'Cancel Approved',
        'Cancel Rejected',
        'Cancelled',

        'Return Requested',
        'Return Approved',
        'Return Rejected',
        'Partially Returned',
        'Returned',

        'Refund Requested',
        'Refund Scheduled',
        'Refund Processing',
        'Refunded',
        'Partially Refunded',
      ],
      default: 'Pending',
      index: true,
    },

    shippedAt: Date,
    deliveredAt: Date,
    cancelledAt: Date,

    cancelRequestedAt: Date,
    cancelApprovedAt: Date,
    cancelRejectedAt: Date,

    returnRequestedAt: Date,
    returnApprovedAt: Date,
    returnedAt: Date,

    shippingAddress: addressSchema,
    billingAddress: addressSchema,

    shippingMethod: String,
    trackingNumber: String,
    carrier: String,
    estimatedDelivery: Date,

    statusHistory: {
      type: [statusHistorySchema],
      default: [],
    },

    customerNote: String,
    adminNote: String,

    disputes: {
      type: [
        {
          _id: false,
          stripeDisputeId: { type: String, required: true },
          amount:          { type: Number, required: true },  // in £
          currency:        { type: String, default: 'GBP' },
          reason:          String,   // stripe reason code
          status:          String,   // stripe dispute status
          evidenceDueBy:   Date,
          stripeFee:       { type: Number, default: 15 },
          createdAt:       { type: Date, default: Date.now },
          updatedAt:       Date,
          resolvedAt:      Date,
        },
      ],
      default: [],
    },

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
orderSchema.index({ 'items.status': 1 });
orderSchema.index({ 'items.returnStatus': 1 });
orderSchema.index({ 'items.refundStatus': 1 });
orderSchema.index({ 'vendorOrders.vendorId': 1 });
orderSchema.index({ status: 1, paymentStatus: 1 });
orderSchema.index({ paymentStatus: 1, createdAt: -1 });
// paymentIntentId's unique+sparse index is already declared on the field itself.

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
        item.subtotal = Number(item.price || 0) * Number(item.quantity || 0);
      }
    });
  }
});

/* ==============================
   EXPORT
============================== */

export default mongoose.models.Order || mongoose.model('Order', orderSchema);
