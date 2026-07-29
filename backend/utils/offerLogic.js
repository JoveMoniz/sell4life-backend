import Conversation from '../models/conversation.js';

// Resolves the agreed price for an accepted, unexpired offer. This is the
// only place either checkout code path (create-payment-intent, stripe
// webhook) may use a price other than the product's own price/variant
// price — always re-derived here from the stored message, never trusted
// from client input, so a buyer can't pass an arbitrary offerAmount.
export async function resolveAcceptedOffer({ offerMessageId, buyerId, productId }) {
  if (!offerMessageId) return null;

  const convo = await Conversation.findOne({ 'messages._id': offerMessageId });
  if (!convo) return null;
  if (String(convo.buyer) !== String(buyerId)) return null;
  if (String(convo.product) !== String(productId)) return null;

  const msg = convo.messages.id(offerMessageId);
  if (!msg || msg.type !== 'offer' || msg.offerStatus !== 'accepted') return null;
  if (!msg.offerExpiresAt || msg.offerExpiresAt < new Date()) return null;

  return { amount: msg.offerAmount, convo, msg };
}

// Marks an accepted offer as consumed once the order is actually created,
// so it can't be reused for a second purchase.
export async function markOfferCompleted(convo, msg) {
  msg.offerStatus = 'completed';
  await convo.save();
}
