import mongoose from 'mongoose';

const payoutSchema = new mongoose.Schema({
  vendorId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
  amount:      { type: Number, required: true },
  currency:    { type: String, default: 'GBP' },
  status:      { type: String, enum: ['requested', 'paid', 'rejected'], default: 'requested' },
  requestedAt: { type: Date, default: Date.now },
  paidAt:      Date,
  reference:   String,
  note:        String,
  processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

export default mongoose.model('Payout', payoutSchema);
