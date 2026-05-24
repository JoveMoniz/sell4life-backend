import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
  token:     { type: String, required: true },
  expiresAt: { type: Date, required: true },
});

schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
schema.index({ token: 1 });

export default mongoose.models.EmailVerification || mongoose.model('EmailVerification', schema);
