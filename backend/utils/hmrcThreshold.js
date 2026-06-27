// ======================================================
// HMRC DIGITAL PLATFORM REPORTING — THRESHOLD TRACKER
// UK DPRR thresholds (calendar year Jan–Dec):
//   30+ transactions  OR  £1,700+ gross payout
// ======================================================

import Order from '../models/order.js';
import Vendor from '../models/vendor.js';

const THRESHOLD_TRANSACTIONS  = 30;
const THRESHOLD_GROSS_GBP     = 1700;
const APPROACHING_FACTOR      = 0.8;   // 80% of either threshold triggers "approaching"

const PAID_STATUSES = ['paid', 'refunded', 'refund_scheduled', 'partially_refunded'];

/**
 * Recalculates the HMRC reporting status for a single vendor based on their
 * paid orders in the current calendar year.  Writes the result back to the
 * vendor document.  Safe to call multiple times — idempotent.
 *
 * @param {string|ObjectId} vendorId
 * @returns {{ reportingStatus, transactionCount, grossPayoutTotal, year }}
 */
export async function recalcHmrcStatus(vendorId) {
  const year      = new Date().getFullYear();
  const yearStart = new Date(year, 0, 1);
  const yearEnd   = new Date(year + 1, 0, 1);

  const orders = await Order.find({
    'vendorOrders.vendorId': vendorId,
    paymentStatus: { $in: PAID_STATUSES },
    createdAt: { $gte: yearStart, $lt: yearEnd },
  })
    .select('items paymentStatus createdAt')
    .lean();

  let transactionCount = 0;
  let grossPayoutTotal = 0;

  for (const order of orders) {
    const vendorItems = (order.items || []).filter(
      item => String(item.vendorId) === String(vendorId)
    );
    const itemsTotal = vendorItems.reduce(
      (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
      0
    );
    if (itemsTotal > 0) {
      transactionCount++;
      grossPayoutTotal += itemsTotal;
    }
  }

  grossPayoutTotal = Number(grossPayoutTotal.toFixed(2));

  let reportingStatus = 'none';
  if (
    transactionCount >= THRESHOLD_TRANSACTIONS ||
    grossPayoutTotal >= THRESHOLD_GROSS_GBP
  ) {
    reportingStatus = 'required';
  } else if (
    transactionCount >= Math.ceil(THRESHOLD_TRANSACTIONS * APPROACHING_FACTOR) ||
    grossPayoutTotal >= THRESHOLD_GROSS_GBP * APPROACHING_FACTOR
  ) {
    reportingStatus = 'approaching';
  }

  await Vendor.findByIdAndUpdate(vendorId, {
    reportingStatus,
    'hmrcReporting.year':             year,
    'hmrcReporting.transactionCount': transactionCount,
    'hmrcReporting.grossPayoutTotal': grossPayoutTotal,
  });

  return { reportingStatus, transactionCount, grossPayoutTotal, year };
}
