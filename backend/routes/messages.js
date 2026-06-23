import { Router } from 'express';
import mongoose from 'mongoose';
import authMiddleware from '../middleware/authMiddleware.js';
import Conversation from '../models/conversation.js';
import Product from '../models/product.js';
import Vendor from '../models/vendor.js';
import User from '../models/user.js';
import { mailNewMessage } from '../utils/email.js';

const router = Router();

// Resolve the vendor record for the current user (null if not a vendor)
async function getMyVendor(userId) {
  return Vendor.findOne({ userId });
}

// ── Start or retrieve a conversation (buyer) ─────────────────
// POST /api/messages
// Body: { productId, body }
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { productId, body } = req.body;

    if (!productId || !body?.trim()) {
      return res.status(400).json({ error: 'productId and message body are required.' });
    }
    if (body.trim().length > 2000) {
      return res.status(400).json({ error: 'Message cannot exceed 2000 characters.' });
    }

    const product = await Product.findById(productId).lean();
    if (!product) return res.status(404).json({ error: 'Product not found.' });

    const vendorId = product.vendor;
    if (!vendorId) return res.status(400).json({ error: 'This product has no seller.' });

    const vendor = await Vendor.findById(vendorId).lean();
    if (!vendor) return res.status(404).json({ error: 'Seller not found.' });

    // Prevent vendors messaging their own products
    if (String(vendor.userId) === String(req.user._id)) {
      return res.status(400).json({ error: 'You cannot message your own product.' });
    }

    // Find or create conversation
    let convo = await Conversation.findOne({
      buyer: req.user._id,
      vendor: vendorId,
      product: productId,
    });

    const isNew = !convo;

    if (!convo) {
      convo = new Conversation({
        product:     productId,
        productName: product.name,
        productSlug: product.slug || '',
        buyer:       req.user._id,
        buyerName:   req.user.name || req.user.username || 'Buyer',
        vendor:      vendorId,
        vendorName:  vendor.storeName || 'Seller',
      });
    }

    convo.messages.push({
      sender:     req.user._id,
      senderRole: 'buyer',
      body:       body.trim(),
    });
    convo.unreadVendor += 1;
    convo.lastMessageAt = new Date();
    await convo.save();

    // Email vendor (fire-and-forget)
    try {
      const vendorUser = await User.findById(vendor.userId).lean();
      if (vendorUser?.email) {
        mailNewMessage({
          to:          vendorUser.email,
          senderName:  convo.buyerName,
          productName: convo.productName,
          role:        'vendor',
          convoId:     convo._id.toString(),
        });
      }
    } catch { /* non-fatal */ }

    res.status(isNew ? 201 : 200).json({ conversation: convo });
  } catch (err) {
    console.error('[messages] start error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ── Reply to an existing conversation ────────────────────────
// POST /api/messages/:id/reply
// Body: { body }
router.post('/:id/reply', authMiddleware, async (req, res) => {
  try {
    const { body } = req.body;
    if (!body?.trim()) return res.status(400).json({ error: 'Message body is required.' });
    if (body.trim().length > 2000) return res.status(400).json({ error: 'Message cannot exceed 2000 characters.' });

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid conversation ID.' });
    }

    const convo = await Conversation.findById(req.params.id);
    if (!convo) return res.status(404).json({ error: 'Conversation not found.' });

    const myVendor = await getMyVendor(req.user._id);
    const isBuyer  = String(convo.buyer) === String(req.user._id);
    const isVendor = myVendor && String(convo.vendor) === String(myVendor._id);

    if (!isBuyer && !isVendor) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const role = isBuyer ? 'buyer' : 'vendor';

    convo.messages.push({
      sender:     req.user._id,
      senderRole: role,
      body:       body.trim(),
    });

    if (role === 'buyer') convo.unreadVendor += 1;
    else                  convo.unreadBuyer  += 1;

    convo.lastMessageAt = new Date();
    await convo.save();

    // Email the other party
    try {
      if (role === 'vendor') {
        const buyer = await User.findById(convo.buyer).lean();
        if (buyer?.email) {
          mailNewMessage({
            to:          buyer.email,
            senderName:  convo.vendorName,
            productName: convo.productName,
            role:        'buyer',
            convoId:     convo._id.toString(),
          });
        }
      } else {
        const vendor = await Vendor.findById(convo.vendor).lean();
        const vendorUser = vendor ? await User.findById(vendor.userId).lean() : null;
        if (vendorUser?.email) {
          mailNewMessage({
            to:          vendorUser.email,
            senderName:  convo.buyerName,
            productName: convo.productName,
            role:        'vendor',
            convoId:     convo._id.toString(),
          });
        }
      }
    } catch { /* non-fatal */ }

    res.json({ conversation: convo });
  } catch (err) {
    console.error('[messages] reply error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ── Unread count for current user ────────────────────────────
// GET /api/messages/unread-count
router.get('/unread-count', authMiddleware, async (req, res) => {
  try {
    const myVendor = await getMyVendor(req.user._id);
    let unread = 0;
    if (myVendor) {
      unread = await Conversation.countDocuments({ vendor: myVendor._id, unreadVendor: { $gt: 0 } });
    } else {
      unread = await Conversation.countDocuments({ buyer: req.user._id, unreadBuyer: { $gt: 0 } });
    }
    res.json({ unread });
  } catch (err) {
    console.error('[messages] unread-count error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ── List conversations for current user ───────────────────────
// GET /api/messages
router.get('/', authMiddleware, async (req, res) => {
  try {
    const myVendor = await getMyVendor(req.user._id);

    let filter;
    if (myVendor) {
      // Vendors see all their store's conversations (most recent first)
      filter = { vendor: myVendor._id };
    } else {
      filter = { buyer: req.user._id };
    }

    const convos = await Conversation.find(filter)
      .sort({ lastMessageAt: -1 })
      .select('-messages')
      .lean();

    res.json({ conversations: convos });
  } catch (err) {
    console.error('[messages] list error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ── Get a single conversation with all messages ───────────────
// GET /api/messages/:id
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid conversation ID.' });
    }

    const convo = await Conversation.findById(req.params.id).lean();
    if (!convo) return res.status(404).json({ error: 'Conversation not found.' });

    const myVendor = await getMyVendor(req.user._id);
    const isBuyer  = String(convo.buyer) === String(req.user._id);
    const isVendor = myVendor && String(convo.vendor) === String(myVendor._id);

    if (!isBuyer && !isVendor) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    res.json({ conversation: convo });
  } catch (err) {
    console.error('[messages] get error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ── Mark conversation as read ─────────────────────────────────
// PATCH /api/messages/:id/read
router.patch('/:id/read', authMiddleware, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid conversation ID.' });
    }

    const convo = await Conversation.findById(req.params.id);
    if (!convo) return res.status(404).json({ error: 'Conversation not found.' });

    const myVendor = await getMyVendor(req.user._id);
    const isBuyer  = String(convo.buyer) === String(req.user._id);
    const isVendor = myVendor && String(convo.vendor) === String(myVendor._id);

    if (!isBuyer && !isVendor) return res.status(403).json({ error: 'Access denied.' });

    if (isBuyer)  convo.unreadBuyer  = 0;
    if (isVendor) convo.unreadVendor = 0;
    await convo.save();

    res.json({ ok: true });
  } catch (err) {
    console.error('[messages] read error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

export default router;
