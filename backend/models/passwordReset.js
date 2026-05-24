import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  email:     { type: String, required: true, lowercase: true },
  token:     { type: String, required: true },
  expiresAt: { type: Date,   required: true },
});

// MongoDB TTL — auto-delete expired documents
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.PasswordReset || mongoose.model('PasswordReset', schema);
