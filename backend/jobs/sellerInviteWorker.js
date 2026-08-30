// ======================================================
// SELLER INVITE WORKER
// A couple of days after signup, invites buyers who aren't vendors yet
// to open a free Casual seller account ("got stuff to sell?"). Sent
// separately from the immediate welcome email so it doesn't read as an
// upsell bolted onto the welcome — see mailWelcome vs mailSellerInvite
// in utils/email.js. Delay/country/on-off are admin-configurable via
// PlatformConfig.marketingEmails (account/admin/emails.html).
// ======================================================
import User from '../models/user.js';
import Vendor from '../models/vendor.js';
import EmailLog from '../models/emailLog.js';
import { getPlatformConfig } from '../models/platformConfig.js';
import { mailSellerInvite } from '../utils/email.js';

const BATCH_LIMIT = 200; // safety cap per tick — plenty for current volume

export async function processSellerInvites() {
  const cfg = await getPlatformConfig();
  const { sellerInviteEnabled, sellerInviteDelayDays, sellerInviteCountry } = cfg.marketingEmails;
  if (!sellerInviteEnabled) return { disabled: true, candidates: 0, sent: 0, skippedAlreadyVendor: 0 };

  const cutoff = new Date(Date.now() - sellerInviteDelayDays * 24 * 60 * 60 * 1000);

  const candidates = await User.find({
    sellerInviteEmailSentAt: null,
    createdAt: { $lte: cutoff },
    active: true,
    banned: { $ne: true },
    // Deliberately NOT gated on emailVerified — turns out most real
    // signups never click the verification link, and a welcome/invite
    // email isn't sensitive enough to require it first (worst case an
    // invalid address just bounces harmlessly).
    ...(sellerInviteCountry ? { country: sellerInviteCountry } : {}),
  })
    .select('email name')
    .limit(BATCH_LIMIT)
    .lean();

  let sent = 0;
  let skippedAlreadyVendor = 0;

  for (const user of candidates) {
    const isVendor = await Vendor.exists({ userId: user._id });
    if (isVendor) {
      // Already a seller — mark as handled so this row stops being
      // re-scanned every tick, but no email needed.
      await User.updateOne({ _id: user._id }, { sellerInviteEmailSentAt: new Date() });
      skippedAlreadyVendor++;
      continue;
    }

    try {
      await mailSellerInvite({ to: user.email, name: user.name });
      await User.updateOne({ _id: user._id }, { sellerInviteEmailSentAt: new Date() });
      await EmailLog.create({ type: 'seller_invite', to: user.email, userId: user._id, userName: user.name });
      sent++;
    } catch (err) {
      console.error('[seller-invite] send failed for', user.email, err.message);
      // Leave sellerInviteEmailSentAt unset so it's retried next tick.
    }
  }

  return { candidates: candidates.length, sent, skippedAlreadyVendor };
}

export function startSellerInviteWorker() {
  const INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours

  setInterval(async () => {
    console.log('⏱ Seller invite worker tick:', new Date().toISOString());
    try {
      const summary = await processSellerInvites();
      if (summary.sent > 0) {
        console.log(`✉️ Seller invite: ${summary.sent} sent, ${summary.skippedAlreadyVendor} already vendors`);
      }
    } catch (err) {
      console.error('💥 SELLER INVITE WORKER ERROR:', err.message);
    }
  }, INTERVAL_MS);
}
