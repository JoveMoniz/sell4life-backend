import mongoose from 'mongoose';

/* =================================
   ADDRESS SCHEMA
================================= */

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

/* =================================
   USER SCHEMA
================================= */

const userSchema = new mongoose.Schema(
  {
    /* =================================
       BASIC PROFILE
    ================================= */

    name: {
      type: String,
      required: true,
      trim: true,
    },

    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      minlength: 3,
      maxlength: 20,
      index: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    password: {
      type: String,
      required: true,
    },

    /* =================================
       ROLE SYSTEM
    ================================= */

    role: {
      type: String,
      enum: ['user', 'vendor', 'admin'],
      default: 'user',
      required: true,
      index: true,
    },

    /* =================================
       ACCOUNT STATUS
    ================================= */

    active: {
      type: Boolean,
      default: true,
    },

    banned: {
      type: Boolean,
      default: false,
    },

    emailVerified: {
      type: Boolean,
      default: false,
    },

    /* =================================
       PROFILE DETAILS
    ================================= */

    avatar: String,
    bio: String,
    phone: String,

    country: {
      type: String,
      default: 'GB',
      uppercase: true,
    },

    /* =================================
       ADDRESSES
    ================================= */
    defaultShippingAddress: {
      type: addressSchema,
      default: null,
    },

    addresses: {
      type: [addressSchema],
      default: [],
    },

    /* =================================
       SECURITY
    ================================= */

    lastLogin: Date,

    loginAttempts: {
      type: Number,
      default: 0,
    },

    passwordChangedAt: Date,

    /* =================================
       ANALYTICS (USER SIDE)
    ================================= */

    ordersCount: {
      type: Number,
      default: 0,
    },

    totalSpent: {
      type: Number,
      default: 0,
    },

    /* =================================
       FUTURE FLEXIBILITY
    ================================= */

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,

    toJSON: {
      transform(doc, ret) {
        ret.id = ret._id;

        delete ret._id;
        delete ret.__v;
        delete ret.password;

        return ret;
      },
    },
  }
);

/* =================================
   INDEXES
================================= */

userSchema.index({ username: 1 });
userSchema.index({ email: 1 });
userSchema.index({ role: 1 });

/* =================================
   EXPORT MODEL
================================= */

export default mongoose.models.User || mongoose.model('User', userSchema);
