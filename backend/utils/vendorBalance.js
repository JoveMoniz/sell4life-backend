import Order  from '../models/order.js';
import Vendor from '../models/vendor.js';
import Payout from '../models/payout.js';
import { resolveCommissionRateForOrder, resolveReserveRateAtTime, getFeeConfig } from './feeConfig.js';
import { commissionAfterRefund } from './commission.js';

export const VENDOR_COMMISSION   = 0.08; // kept for external imports; runtime uses resolveCommissionRate
export const HOLD_DAYS         = 30;
export const RESERVE_DAYS      = 90;
export const RESERVE_STANDARD  = 0.10;
export const RESERVE_TRUSTED   = 0.05;
export const TRUSTED_MONTHS    = 6;
export const MIN_PAYOUT        = 20;
export const STRIPE_PCT   = 0.014;
export const STRIPE_FIXED = 0.20;

export function resolveReserveRate(vendor, ordersRaw) {
  const approvedAt = vendor.approvedAt ? new Date(vendor.approvedAt).getTime() : Date.now();
  const monthsApproved = (Date.now() - approvedAt) / (30 * 24 * 60 * 60 * 1000);
  if (monthsApproved < TRUSTED_MONTHS) return { rate: RESERVE_STANDARD, trusted: false };

  const cutoff = Date.now() - TRUSTED_MONTHS * 30 * 24 * 60 * 60 * 1000;
  const hasRecentLostDispute = ordersRaw.some(order =>
    (order.disputes || []).some(d =>
      d.status === 'lost' && new Date(d.createdAt || 0).getTime() > cutoff
    )
  );
  return hasRecentLostDispute
    ? { rate: RESERVE_STANDARD, trusted: false }
    : { rate: RESERVE_TRUSTED,  trusted: true  };
}

// Same "isPaid" definition used throughout this file. A standalone helper so
// eligibility for Founding Seller free sales (below) and the admin "used X/Y"
// display both count paid orders identically without duplicating the logic.
function isPaidOrder(order) {
  const ps = (order.paymentStatus || '').toLowerCase();
  return ['paid', 'refunded', 'refund_scheduled', 'partially_refunded'].includes(ps);
}

// Counts a vendor's paid orders, oldest first — used standalone by the admin
// vendor list for "free sales used X/Y". computeVendorBalance below computes
// the same rank inline (it already has the sorted order list) rather than
// calling this, to avoid a second DB round-trip.
export async function countVendorPaidOrders(vendorId) {
  const orders = await Order.find({ 'vendorOrders.vendorId': vendorId })
    .select('paymentStatus createdAt')
    .lean();
  return orders.filter(isPaidOrder).length;
}

export async function computeVendorBalance(vendorId) {
  const [ordersRaw, vendor] = await Promise.all([
    Order.find({ 'vendorOrders.vendorId': vendorId }).sort({ createdAt: 1 }),
    Vendor.findById(vendorId).select('approvedAt type commissionOverride commissionOverrideSetAt foundingSeller').lean(),
  ]);

  const { trusted } = resolveReserveRate(vendor || {}, ordersRaw);
  // Commission for payout math uses current effective rate
  const VENDOR_COMMISSION = await resolveCommissionRateForOrder(vendor || {}, new Date());
  // Platform config needed for per-order reserve rate resolution + display rate
  const cfg = await getFeeConfig();
  const RESERVE_RATE = resolveReserveRateAtTime(vendor || {}, cfg, new Date());

  const now       = Date.now();
  const holdMs    = HOLD_DAYS    * 24 * 60 * 60 * 1000;
  const reserveMs = RESERVE_DAYS * 24 * 60 * 60 * 1000;

  let totalGross              = 0;
  let totalReserved           = 0;
  let totalReservedNet        = 0; // reserved gross minus per-order commission — for reservedBalance
  let totalGrossAllTime       = 0;
  let totalGrossAllPaid       = 0;
  let totalCommissionAllPaid  = 0; // per-order accumulated commission (respects rate-at-time)
  let totalRefunds            = 0;
  let totalRefundsNonCancelled = 0; // excludes cancelled-item refunds — those items already contribute $0 to the gross totals above, so their refund must not be subtracted again
  let totalStripeFees         = 0;
  let totalShippingCleared    = 0;
  let totalShippingAllTime    = 0;
  let nextClearanceMs         = null;
  let nextReserveReleaseMs    = null;
  const reserveByDate         = {}; // stores net-of-commission amount per release date

  // Founding Seller free-sale rank — incremented once per paid order (not
  // per item) as we walk orders oldest-first, so "is this order among the
  // vendor's first N paid orders" is derived fresh every call rather than
  // trusted from a stored counter that could drift out of sync.
  let paidOrderRank = 0;

  for (const order of ordersRaw) {
    const vendorItems = (order.items || []).filter(
      item => String(item.vendorId) === String(vendorId)
    );
    if (!isPaidOrder(order)) continue;
    paidOrderRank++;

    // Per-order commission and reserve rates (date-aware)
    const isFreeFoundingSale = !!vendor?.foundingSeller?.enrolled
      && vendor.foundingSeller.freeSalesLimit != null
      && paidOrderRank <= vendor.foundingSeller.freeSalesLimit;
    const ORDER_COMMISSION_RATE = isFreeFoundingSale
      ? 0
      : await resolveCommissionRateForOrder(vendor, order.createdAt);
    const ORDER_RESERVE_RATE    = resolveReserveRateAtTime(vendor, cfg, order.createdAt);

    // Count ALL paid items for all-time commission (per-order rate — respects timestamp gates)
    vendorItems.forEach(item => {
      if (['Cancelled'].includes(item.status)) return;
      const itemGross = Number(item.price || 0) * Number(item.quantity || 0);
      totalGrossAllPaid       += itemGross;
      totalCommissionAllPaid  += itemGross * ORDER_COMMISSION_RATE;
    });

    vendorItems.forEach(item => {
      if (item.status !== 'Delivered') return;

      const deliveredAt = item.deliveredAt
        ? new Date(item.deliveredAt).getTime()
        : new Date(order.createdAt || 0).getTime();
      if (!deliveredAt) return;

      const clearsAt          = deliveredAt + holdMs;
      const reserveReleasesAt = deliveredAt + reserveMs;
      const grossValue        = Number(item.price || 0) * Number(item.quantity || 0);
      const shippingValue     = Number(item.shippingCost || 0);

      // Platform-paid goodwill refunds are absorbed by Sell4Life, not the vendor —
      // exclude them so the vendor's payout isn't reduced for a refund they didn't pay.
      const isPlatformPaidGoodwill = item.goodwillRefund && item.goodwillPaidBy === 'platform';

      let refunded = 0;
      if (!isPlatformPaidGoodwill) {
        if (Number(item.refundedQuantity) > 0) {
          refunded = Number(item.refundedAmount) || Number(item.price || 0) * Number(item.refundedQuantity);
        } else if (Number(item.returnQuantity) > 0) {
          refunded = Number(item.price || 0) * Number(item.returnQuantity);
        }
      }
      const itemValue = Math.max(0, grossValue - refunded);

      totalGrossAllTime += grossValue;
      totalShippingAllTime += shippingValue;

      if (now >= clearsAt) {
        totalShippingCleared += shippingValue;
      } else {
        if (!nextClearanceMs || clearsAt < nextClearanceMs) nextClearanceMs = clearsAt;
      }

      if (itemValue === 0) return;

      if (now >= reserveReleasesAt) {
        totalGross += itemValue;
      } else {
        const reserveHeld    = itemValue * ORDER_RESERVE_RATE;
        const reserveHeldNet = reserveHeld * (1 - ORDER_COMMISSION_RATE);
        totalReserved    += reserveHeld;
        totalReservedNet += reserveHeldNet;

        if (!nextReserveReleaseMs || reserveReleasesAt < nextReserveReleaseMs)
          nextReserveReleaseMs = reserveReleasesAt;

        const releaseDateKey = new Date(reserveReleasesAt).toISOString().slice(0, 10);
        reserveByDate[releaseDateKey] = (reserveByDate[releaseDateKey] || 0) + reserveHeldNet;

        if (now < clearsAt) {
          if (!nextClearanceMs || clearsAt < nextClearanceMs) nextClearanceMs = clearsAt;
        } else {
          totalGross += itemValue * (1 - ORDER_RESERVE_RATE);
        }
      }
    });

    vendorItems.forEach(item => {
      if (item.goodwillRefund && item.goodwillPaidBy === 'platform') return;
      const price = Number(item.price || 0);
      if (item.status === 'Cancelled') {
        // Cancelled items already contribute $0 to totalGross/totalGrossAllPaid
        // (excluded above), so their refund must NOT reduce those totals again —
        // only totalRefundsNonCancelled feeds the netSales/commission formulas.
        totalRefunds += price * Number(item.quantity || 0);
      } else if (Number(item.refundedQuantity) > 0) {
        const amt = Number(item.refundedAmount) || price * Number(item.refundedQuantity);
        totalRefunds += amt;
        totalRefundsNonCancelled += amt;
      } else if (Number(item.returnQuantity) > 0) {
        const amt = price * Number(item.returnQuantity);
        totalRefunds += amt;
        totalRefundsNonCancelled += amt;
      }
    });

    const itemsTotal      = vendorItems.reduce((s, i) => s + Number(i.price || 0) * Number(i.quantity || 0), 0);
    const orderTotal      = Number(order.total || 0);
    const vendorFraction  = (orderTotal > 0 && itemsTotal > 0) ? itemsTotal / orderTotal : 0;
    const rawFee          = Number(order.stripeFeeAmount || 0);
    const estimatedFee    = Number((orderTotal * STRIPE_PCT + STRIPE_FIXED).toFixed(2));
    const orderFee        = rawFee > 0 ? rawFee : estimatedFee;
    totalStripeFees      += Number((orderFee * vendorFraction).toFixed(2));
  }

  // Cleared balance (payout-eligible) — totalGross is already net of each
  // delivered item's own refund (see itemValue above), so it must NOT be
  // reduced by totalRefunds again here.
  const netSales     = Math.max(0, totalGross);
  const commission   = Number((netSales * VENDOR_COMMISSION).toFixed(2));
  const netAfterFees = Number((netSales - commission).toFixed(2));

  // All-time commission: per-order rates summed, then scaled down via the shared
  // refund-proration rule. Uses totalRefundsNonCancelled (not totalRefunds) because
  // cancelled items were already excluded from totalGrossAllPaid/totalCommissionAllPaid
  // above — including their refund here would subtract money never counted as gross.
  const netSalesAllTime     = Math.max(0, totalGrossAllPaid - totalRefundsNonCancelled);
  const commissionAllTime   = commissionAfterRefund(totalCommissionAllPaid, totalGrossAllPaid, totalRefundsNonCancelled);
  const netAfterFeesAllTime = Number((netSalesAllTime - commissionAllTime).toFixed(2));

  let totalChargebacks = 0;
  ordersRaw.forEach(order => {
    const vendorItems = (order.items || []).filter(
      item => String(item.vendorId) === String(vendorId)
    );
    const itemsTotal  = vendorItems.reduce(
      (s, item) => s + Number(item.price || 0) * Number(item.quantity || 0), 0
    );
    const orderTotal  = Number(order.total || 0);
    const vendorShare = (orderTotal > 0 && itemsTotal > 0) ? itemsTotal / orderTotal : 0;
    (order.disputes || []).forEach(d => {
      if (d.status === 'lost') totalChargebacks += d.amount * vendorShare;
    });
  });
  totalChargebacks = Number(totalChargebacks.toFixed(2));

  const paidPayouts  = await Payout.find({ vendorId, status: 'paid' });
  const totalPaidOut = Number(paidPayouts.reduce((s, p) => s + p.amount, 0).toFixed(2));

  const shippingCleared = Number(totalShippingCleared.toFixed(2));
  const pendingBalance  = Number(Math.max(0, netAfterFees + shippingCleared - totalChargebacks - totalPaidOut).toFixed(2));
  const reservedBalance = Number(totalReservedNet.toFixed(2)); // per-order rate already applied

  return {
    pendingBalance, reservedBalance,
    // Cleared-only figures (for payout math)
    grossRevenue: Number(totalGross.toFixed(2)),
    totalRefunds: Number(totalRefunds.toFixed(2)),
    commission, netAfterFees, totalChargebacks, totalPaidOut,
    shippingCleared,
    // All-time figures (for display — matches transactions page)
    grossRevenueAllTime:  Number(totalGrossAllTime.toFixed(2)),
    shippingAllTime: Number(totalShippingAllTime.toFixed(2)),
    commissionAllTime,
    netAfterFeesAllTime,
    totalStripeFees: Number(totalStripeFees.toFixed(2)),
    // Current effective rate for display on payouts page
    commissionRate: VENDOR_COMMISSION,
    // Reserve & trust
    reserveRate: RESERVE_RATE, trustedSeller: trusted,
    holdDays: HOLD_DAYS, reserveDays: RESERVE_DAYS,
    nextClearanceDate:      nextClearanceMs      ? new Date(nextClearanceMs).toISOString()      : null,
    nextReserveReleaseDate: nextReserveReleaseMs ? new Date(nextReserveReleaseMs).toISOString() : null,
    // Upcoming reserve releases: [{ date, amount }] — amount already net of per-order commission
    reserveSchedule: Object.entries(reserveByDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, amount]) => ({
        date,
        amount: Number(amount.toFixed(2)),
      })),
  };
}
