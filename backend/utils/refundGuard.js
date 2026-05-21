// ======================================================
// REFUND GUARD
// SINGLE SOURCE OF TRUTH
// ======================================================

export function canRefund(order) {
  const payment = (order.paymentStatus || '').toLowerCase();

  const orderRefund = (order.refundStatus || '').toLowerCase();

  // ====================================================
  // ITEM LOCKS
  // ====================================================

  const itemLocked = (order.items || []).some((item) => {
    const status = (item.refundStatus || '').toLowerCase();

    return (
      !!item.refundScheduledAt ||
      ['scheduled', 'processing', 'processed', 'partially_refunded'].includes(status)
    );
  });

  // ====================================================
  // VENDOR LOCKS
  // ====================================================

  const vendorLocked = (order.vendorOrders || []).some((vo) => {
    const status = (vo.refundStatus || '').toLowerCase();

    return (
      !!vo.refundScheduledAt ||
      ['scheduled', 'processing', 'processed', 'partially_refunded'].includes(status)
    );
  });

  // ====================================================
  // ORDER LOCKS
  // ====================================================

  const orderLocked =
    !!order.refundScheduledAt ||
    ['scheduled', 'processing', 'processed', 'partially_refunded'].includes(orderRefund);

  // ====================================================
  // PAYMENT LOCKS
  // ====================================================

  const paymentLocked = [
    'refund_scheduled',
    'refund_processing',
    'refunded',
    'partially_refunded',
  ].includes(payment);

  // ====================================================
  // FINAL DECISION
  // ====================================================

  if (itemLocked || vendorLocked || orderLocked || paymentLocked) {
    return {
      ok: false,
      error: 'Refund already scheduled, processing, or completed',
    };
  }

  return { ok: true };
}
