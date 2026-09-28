import mongoose from 'mongoose';

const payoutSchema = new mongoose.Schema({
  vendorId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
  // Always GBP — the platform's canonical accounting figure, unrelated to
  // what currency actually moved. computeVendorBalance's totalPaidOut sums
  // this field assuming GBP, so it must never be repurposed.
  amount:      { type: Number, required: true },
  currency:    { type: String, default: 'GBP' },
  status:      { type: String, enum: ['requested', 'paid', 'rejected'], default: 'requested' },
  requestedAt: { type: Date, default: Date.now },
  paidAt:      Date,
  reference:   String,
  note:        String,
  processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  stripeTransferId: { type: String, default: '' },
  // What was ACTUALLY transferred via Stripe — set once at transfer time,
  // never recomputed. GBP vendors: payoutCurrency 'GBP', payoutToGbpRate 1,
  // payoutAmount === amount. Non-GBP vendors (e.g. US): real currency/rate
  // used for that transfer, mirroring Order's chargeCurrency/chargeAmount.
  payoutCurrency:   { type: String, default: 'GBP' },
  payoutAmount:     { type: Number },
  payoutToGbpRate:  { type: Number, default: 1 },
}, { timestamps: true });

export default mongoose.model('Payout', payoutSchema);
