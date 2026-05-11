// ======================================================
// REFUND GUARD
// SINGLE SOURCE OF TRUTH
// ======================================================

export function canRefund(order) {
  const payment = (order.paymentStatus || '').toLowerCase();

  const refund = (order.refundStatus || '').toLowerCase();

  const hasScheduledRefund =
    !!order.refundScheduledAt ||
    order.vendorOrders?.some((vo) => !!vo.refundScheduledAt) ||
    order.items?.some(
      (item) =>
        !!item.refundScheduledAt ||
        ['scheduled', 'processing', 'processed'].includes((item.refundStatus || '').toLowerCase())
    );

  const financiallyLocked =
    hasScheduledRefund ||
    ['refunded', 'refund_scheduled', 'refund_processing'].includes(payment) ||
    ['scheduled', 'processing', 'processed'].includes(refund);

  if (financiallyLocked) {
    return {
      ok: false,

      error: 'Refund already scheduled, processing, or completed',
    };
  }

  return { ok: true };
}
