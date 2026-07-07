// ======================================================
// VENDOR PAYOUT WORKER
// Automatically pays out any Stripe-connected vendor whose
// balance has cleared the hold/reserve window and crossed
// the minimum payout threshold — no manual request/approval
// needed once a vendor is connected.
// ======================================================
import Vendor from '../models/vendor.js';
import Payout from '../models/payout.js';
import stripe from '../config/stripe.js';
import { computeVendorBalance, MIN_PAYOUT } from '../utils/vendorBalance.js';
import { mailPayoutProcessed } from '../utils/email.js';

async function processAutoPayouts() {
  const vendors = await Vendor.find({
    status: 'approved',
    stripeAccountId: { $nin: [null, ''] },
    payoutEnabled: true,
  }).populate('userId', 'email');

  for (const vendor of vendors) {
    try {
      // HMRC: same gate as the manual request route — don't pay out until
      // required tax info has been submitted.
      if (vendor.reportingStatus === 'required' && !vendor.taxInfoCompletedAt) continue;

      // Skip if a payout is already in flight for this vendor (manual or auto).
      const existing = await Payout.findOne({ vendorId: vendor._id, status: 'requested' });
      if (existing) continue;

      const { pendingBalance } = await computeVendorBalance(vendor._id);
      if (pendingBalance < MIN_PAYOUT) continue;

      const payout = await Payout.create({ vendorId: vendor._id, amount: pendingBalance });

      const transfer = await stripe.transfers.create({
        amount: Math.round(pendingBalance * 100),
        currency: 'gbp',
        destination: vendor.stripeAccountId,
        description: `Sell4Life auto payout ${payout._id}`,
        metadata: { payoutId: String(payout._id), vendorId: String(vendor._id), auto: 'true' },
      });

      payout.status = 'paid';
      payout.paidAt = new Date();
      payout.reference = transfer.id;
      payout.stripeTransferId = transfer.id;
      payout.note = 'Automatic payout';
      await payout.save();

      console.log(`💸 Auto payout sent: vendor ${vendor._id} £${pendingBalance} (${transfer.id})`);

      const vendorEmail = vendor.userId?.email;
      if (vendorEmail) {
        mailPayoutProcessed({
          to: vendorEmail,
          storeName: vendor.storeName || 'Your Store',
          amount: payout.amount,
          reference: payout.reference,
        }).catch(() => {});
      }
    } catch (err) {
      console.error(`💥 Auto payout error for vendor ${vendor._id}:`, err.message);
    }
  }
}

export function startVendorPayoutWorker() {
  const INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours

  setInterval(async () => {
    console.log('⏱ Vendor payout worker tick:', new Date().toISOString());
    try {
      await processAutoPayouts();
    } catch (err) {
      console.error('💥 VENDOR PAYOUT WORKER ERROR:', err.message);
    }
  }, INTERVAL_MS);
}
