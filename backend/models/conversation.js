import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  sender:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  senderRole: { type: String, enum: ['buyer', 'vendor'], required: true },
  body:       { type: String, required: true, maxlength: 2000, trim: true },

  // Make-an-offer (casual/refurbished only, product.acceptOffers must be
  // true) — an offer is just a specially-typed message so it renders inline
  // in the existing thread. offerAmount is the buyer's proposed price;
  // acceptance is server-verified again at checkout, never trusted from the
  // client, so this record is the sole source of truth for that price.
  type:            { type: String, enum: ['text', 'offer'], default: 'text' },
  offerAmount:     { type: Number, min: 0.01 },
  offerStatus:     { type: String, enum: ['pending', 'accepted', 'rejected', 'countered', 'expired', 'completed'] },
  offerExpiresAt:  { type: Date },
}, { timestamps: true });

const conversationSchema = new mongoose.Schema({
  product:     { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  productName: { type: String, required: true },
  productSlug: { type: String, default: '' },

  buyer:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  buyerName: { type: String, default: '' },

  vendor:     { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
  vendorName: { type: String, default: '' },

  messages:     [messageSchema],
  unreadBuyer:  { type: Number, default: 0 },
  unreadVendor: { type: Number, default: 0 },
  lastMessageAt: { type: Date, default: Date.now },
}, { timestamps: true });

conversationSchema.index({ buyer: 1, lastMessageAt: -1 });
conversationSchema.index({ vendor: 1, lastMessageAt: -1 });
conversationSchema.index({ buyer: 1, vendor: 1, product: 1 });

export default mongoose.models.Conversation || mongoose.model('Conversation', conversationSchema);
