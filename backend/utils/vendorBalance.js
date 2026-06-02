import Order  from '../models/order.js';
import Vendor from '../models/vendor.js';
import Payout from '../models/payout.js';

export const COMMISSION_RATE = 0.08;
export const HOLD_DAYS       = 30;
export const RESERVE_DAYS    = 90;
export const RESERVE_STANDARD = 0.10;
export const RESERVE_TRUSTED  = 0.05;
export const TRUSTED_MONTHS   = 6;
export const MIN_PAYOUT        = 20;

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

export async function computeVendorBalance(vendorId) {
  const [ordersRaw, vendor] = await Promise.all([
    Order.find({ 'vendorOrders.vendorId': vendorId }),
    Vendor.findById(vendorId).select('approvedAt').lean(),
  ]);

  const { rate: RESERVE_RATE, trusted } = resolveReserveRate(vendor || {}, ordersRaw);

  const now       = Date.now();
  const holdMs    = HOLD_DAYS    * 24 * 60 * 60 * 1000;
  const reserveMs = RESERVE_DAYS * 24 * 60 * 60 * 1000;

  let totalGross    = 0;
  let totalReserved = 0;
  let totalRefunds  = 0;
  let nextClearanceMs      = null;
  let nextReserveReleaseMs = null;

  ordersRaw.forEach(order => {
    const vendorItems = (order.items || []).filter(
      item => String(item.vendorId) === String(vendorId)
    );
    const ps     = (order.paymentStatus || '').toLowerCase();
    const isPaid = ['paid', 'refunded', 'refund_scheduled', 'partially_refunded'].includes(ps);
    if (!isPaid) return;

    vendorItems.forEach(item => {
      if (item.status !== 'Delivered') return;
      const deliveredAt = item.deliveredAt ? new Date(item.deliveredAt).getTime() : 0;
      if (!deliveredAt) return;

      const clearsAt          = deliveredAt + holdMs;
      const reserveReleasesAt = deliveredAt + reserveMs;
      const itemValue         = Number(item.price || 0) * Number(item.quantity || 0);

      if (now < clearsAt) {
        if (!nextClearanceMs || clearsAt < nextClearanceMs) nextClearanceMs = clearsAt;
        return;
      }
      if (now >= reserveReleasesAt) {
        totalGross += itemValue;
      } else {
        totalGross    += itemValue * (1 - RESERVE_RATE);
        totalReserved += itemValue * RESERVE_RATE;
        if (!nextReserveReleaseMs || reserveReleasesAt < nextReserveReleaseMs)
          nextReserveReleaseMs = reserveReleasesAt;
      }
    });

    vendorItems.forEach(item => {
      const price = Number(item.price || 0);
      if (item.status === 'Cancelled') {
        totalRefunds += price * Number(item.quantity || 0);
      } else if (Number(item.refundedQuantity) > 0) {
        totalRefunds += Number(item.refundedAmount) || price * Number(item.refundedQuantity);
      } else if (Number(item.returnQuantity) > 0) {
        totalRefunds += price * Number(item.returnQuantity);
      }
    });
  });

  const netSales    = Math.max(0, totalGross - totalRefunds);
  const commission  = Number((netSales * COMMISSION_RATE).toFixed(2));
  const netAfterFees = Number((netSales - commission).toFixed(2));

  let totalChargebacks = 0;
  ordersRaw.forEach(order => {
    const vendorItems = (order.items || []).filter(
      item => String(item.vendorId) === String(vendorId)
    );
    const itemsTotal = vendorItems.reduce(
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

  const pendingBalance  = Number(Math.max(0, netAfterFees - totalChargebacks - totalPaidOut).toFixed(2));
  const reservedBalance = Number((totalReserved * (1 - COMMISSION_RATE)).toFixed(2));

  return {
    pendingBalance, reservedBalance,
    grossRevenue:  Number(totalGross.toFixed(2)),
    totalRefunds:  Number(totalRefunds.toFixed(2)),
    commission, netAfterFees, totalChargebacks, totalPaidOut,
    reserveRate: RESERVE_RATE, trustedSeller: trusted,
    holdDays: HOLD_DAYS, reserveDays: RESERVE_DAYS,
    nextClearanceDate:      nextClearanceMs      ? new Date(nextClearanceMs).toISOString()      : null,
    nextReserveReleaseDate: nextReserveReleaseMs ? new Date(nextReserveReleaseMs).toISOString() : null,
  };
}
