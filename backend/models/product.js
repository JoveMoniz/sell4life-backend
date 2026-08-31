import mongoose from 'mongoose';

/* =================================
   ADD-ON SCHEMA
================================= */

const addOnSchema = new mongoose.Schema(
  {
    name:  { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    description: { type: String, default: '' },
    image: { type: String, default: '' },
  },
  { _id: false }
);

/* =================================
   VARIANT SCHEMA
================================= */

const variantSchema = new mongoose.Schema(
  {
    _id: false,

    sku: {
      type: String,
      trim: true,
    },

    attributes: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    price: {
      type: Number,
      min: 0,
    },

    stock: {
      type: Number,
      default: 0,
      min: 0,
    },

    image: String,
    color: { type: String, default: '' },
    displayMode: { type: String, enum: ['color', 'image'], default: 'image' },

    // CJ's internal variant id (numeric), captured during CJ sync.
    // Required for freight quotes — CJ's freight API rejects human SKUs.
    cjVid: { type: String, default: '' },

    // A vendor-supplied CJ variant identifier from a bulk CSV import, used
    // to find this product on CJ before any sync has ever run (cjVid above
    // only exists AFTER a successful sync, so it can't bootstrap the first
    // one). cjProductSync.js's syncProductFromCj() has always read this
    // exact field name — it just never existed on the schema, so a
    // vendor's "Supplier Variant ID" CSV column silently went nowhere.
    supplierVariantRef: { type: String, default: '' },
  },
  { _id: false }
);

/* =================================
   PRODUCT SCHEMA
================================= */

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      default: '',
    },

    shortDescription: {
      type: String,
      default: '',
    },

    bulletPoints: {
      type: String,
      default: '',
    },

    /* ==============================
       PRICING
    ============================== */

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    comparePrice: {
      type: Number,
      min: 0,
    },

    costPrice: {
      type: Number,
      min: 0,
    },

    shippingCost: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Buyer must collect in person — distinct from shippingCost:0, which
    // means the seller ships it themselves at no charge. Both look like
    // "£0.00" on shippingCost alone, so this needs its own flag.
    collectionOnly: {
      type: Boolean,
      default: false,
    },

    shipIncluded: {
      type: Boolean,
      default: false,
    },

    // Where the seller is willing to ship this item at all — 'worldwide' is
    // the default so existing products keep behaving exactly as before this
    // was added. For CJ-sourced items this is combined with (never
    // overrides) CJ's own live per-country freight availability — a seller
    // saying "worldwide" doesn't force CJ to ship somewhere it genuinely
    // can't; it just means "don't restrict beyond what CJ can already do".
    // For a vendor's own non-CJ stock (e.g. a used bicycle), this is the
    // only availability check there is, since there's no supplier API to
    // ask instead.
    shippingScope: {
      type: String,
      enum: ['worldwide', 'uk', 'uk_eu', 'custom'],
      default: 'worldwide',
    },

    // Only used when shippingScope === 'custom' — ISO 3166-1 alpha-2 codes.
    shippingCountries: {
      type: [String],
      default: [],
    },

    markupPct: {
      type: Number,
      default: null,
      min: 0,
    },

    /* ==============================
       IMAGES
    ============================== */

    images: {
      type: [String],
      default: [],
    },

    videoUrl: {
      type: String,
      default: '',
    },

    videoUrl2: {
      type: String,
      default: '',
    },

    videoUrl3: {
      type: String,
      default: '',
    },

    videoUrl4: {
      type: String,
      default: '',
    },

    videoUrl5: {
      type: String,
      default: '',
    },

    variantDisplay: {
      type: String,
      enum: ['color', 'image'],
      default: 'image',
    },

    /* ==============================
       INVENTORY
    ============================== */

    stock: {
      type: Number,
      default: 0,
      min: 0,
    },

    sku: {
      type: String,
      trim: true,
    },

    trackInventory: {
      type: Boolean,
      default: true,
    },

    allowBackorder: {
      type: Boolean,
      default: false,
    },

    /* ==============================
       SUPPLIER (private — dropshipping sourcing, never shown to buyers)
    ============================== */

    supplier: {
      type: String,
      default: '',
      trim: true,
    },

    supplierUrl: {
      type: String,
      default: '',
      trim: true,
    },

    // Same purpose as variantSchema's supplierVariantRef, for products
    // imported without variants (a single-SKU CSV row builds an empty
    // variants[] — see routes/vendor.js's /products/import) — otherwise a
    // single-SKU import had literally nowhere to store a vendor-supplied
    // CJ variant id at all.
    supplierVariantRef: {
      type: String,
      default: '',
      trim: true,
    },

    /* ==============================
       VARIANTS
    ============================== */

    variants: {
      type: [variantSchema],
      default: [],
    },

    addOns: {
      type: [addOnSchema],
      default: [],
    },

    /* ==============================
       CATEGORY
    ============================== */

    category: {
      type: String,
      index: true,
      default: '',
    },

    subcategory: {
      type: String,
      index: true,
      default: '',
    },

    tags: {
      type: [String],
      default: [],
    },

    /* ==============================
       SEO
    ============================== */

    slug: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },

    seoTitle: {
      type: String,
      default: '',
    },

    seoDescription: {
      type: String,
      default: '',
    },

    /* ==============================
       OWNER
    ============================== */

    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      required: true,
      index: true,
    },

    /* ==============================
       STATUS
    ============================== */

    active: {
      type: Boolean,
      default: true,
      index: true,
    },

    archived: {
      type: Boolean,
      default: false,
    },

    // Soft delete — set when a vendor "deletes" a product so it can be restored
    // from the Trash tab. Only a permanent-delete action actually removes the document.
    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },

    // Admin takedown for cause (miscategorised, reported, policy violation) —
    // distinct from the vendor's own `active` toggle. Forces active:false and,
    // unlike a vendor-initiated unpublish, the vendor's own edit route refuses
    // to clear this — only an admin can lift it. Avoids the previous all-or-
    // nothing choice between hard-deleting an (unorderable) listing or
    // suspending the vendor's entire account over one bad product.
    adminSuspended: {
      type: Boolean,
      default: false,
    },
    adminSuspendedReason: {
      type: String,
      default: '',
    },
    adminSuspendedAt: {
      type: Date,
      default: null,
    },

    // Simple condition grade for casual sellers (distinct from the refurbished
    // tier's conditionGrade below, which carries its own warranty/testing fields).
    condition: {
      type: String,
      enum: ['New', 'Like New', 'Very Good', 'Good', 'Fair', 'For Parts', ''],
      default: '',
    },

    // Casual sellers default to accepting offers; buyers see an "Ask/Offer" affordance.
    acceptOffers: {
      type: Boolean,
      default: false,
    },

    /* ==============================
       REFURBISHED FIELDS
    ============================== */

    conditionGrade: {
      type: String,
      enum: ['Excellent', 'Good', 'Fair', 'For Parts', ''],
      default: '',
    },

    warrantyPeriod: {
      type: String,
      default: '',
    },

    testedStatus: {
      type: String,
      enum: ['Fully Tested', 'Partially Tested', 'Untested', ''],
      default: '',
    },

    refurbishmentNotes: {
      type: String,
      default: '',
    },

    serialNumber: {
      type: String,
      default: '',
    },

    /* ==============================
       SHIPPING
    ============================== */

    weight: {
      type: Number,
      default: 0,
    },

    dimensions: {
      width: Number,
      height: Number,
      length: Number,
    },

    estDeliveryMinDays: {
      type: Number,
      default: 3,
      min: 0,
    },

    estDeliveryMaxDays: {
      type: Number,
      default: 7,
      min: 0,
    },

    // Per-product override of the vendor's free-returns setting.
    // null/unset = inherit the vendor's store-wide default.
    freeReturns: {
      type: Boolean,
      default: null,
    },

    // CJ has no freight route to the UK for this product's variant(s) —
    // set by checkUkShippingForAllProducts() (utils/cjProductSync.js),
    // called both on-demand (admin route) and by the periodic sync worker.
    // null = never checked; true/false = last known result.
    shippingUnavailableUK: {
      type: Boolean,
      default: null,
    },
    shippingCheckedAt: {
      type: Date,
      default: null,
    },

    /* ==============================
       ANALYTICS
    ============================== */

    views: {
      type: Number,
      default: 0,
    },

    salesCount: {
      type: Number,
      default: 0,
    },

    /* ==============================
       RATINGS (denormalised)
    ============================== */

    avgRating:   { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0, min: 0 },

    /* ==============================
       FLAGS
    ============================== */

    featured: {
      type: Boolean,
      default: false,
    },

    bestseller: {
      type: Boolean,
      default: false,
    },

    comingSoon: {
      type: Boolean,
      default: false,
    },

    /* ==============================
       FLEX
    ============================== */

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
    },
    toObject: {
      virtuals: true,
    },
  }
);

/* =================================
   VIRTUAL IMAGE
================================= */

productSchema.virtual('image').get(function () {
  const basePath = '/assets/images/products/';

  if (Array.isArray(this.images) && this.images.length > 0) {
    return basePath + this.images[0];
  }

  return basePath + 'sell4life-placeholder.png';
});

/* =================================
   INDEXES
================================= */

productSchema.index({
  name: 'text',
  description: 'text',
  shortDescription: 'text',
  tags: 'text',
  category: 'text',
  subcategory: 'text',
});

productSchema.index({ vendor: 1 });
productSchema.index({ category: 1, subcategory: 1 });
productSchema.index({ slug: 1 });
productSchema.index({ price: 1 });

/* =================================
   EXPORT
================================= */

export default mongoose.models.Product || mongoose.model('Product', productSchema);
