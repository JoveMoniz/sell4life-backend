import mongoose from 'mongoose';

// Lightweight audit trail for lifecycle/marketing emails (welcome, seller
// invite) — lets admin see exactly what was sent, to whom, and when,
// rather than only a per-user "last sent" timestamp with no history.
const emailLogSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['welcome', 'seller_invite'],
      required: true,
      index: true,
    },
    to: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    userName: { type: String, default: '' },
  },
  { timestamps: true }
);

emailLogSchema.index({ createdAt: -1 });

export default mongoose.models.EmailLog || mongoose.model('EmailLog', emailLogSchema);
