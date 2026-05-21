// ======================================================
// VENDOR METRICS
// Aligned with vendor dashboard calculation:
// - grossRevenue: only paid/refunded orders
// - refunds: based on paymentStatus (not item.refundStatus)
// - uses vendorOrder.subtotal as single source of truth
// ======================================================

export function calculateVendorMetrics(ordersRaw, vendorId) {
  let grossRevenue = 0;
  let refunds = 0;
  let orderCount = 0;

  ordersRaw.forEach((order) => {
    const vendorOrder = (order.vendorOrders || []).find(
      (vo) => String(vo.vendorId) === String(vendorId)
    );

    if (!vendorOrder) return;

    orderCount++;

    const paymentStatus = (order.paymentStatus || '').toLowerCase();

    const isPaid =
      paymentStatus === 'paid' ||
      paymentStatus === 'refunded' ||
      paymentStatus === 'refund_scheduled' ||
      paymentStatus === 'partially_refunded';

    const isRefunded =
      paymentStatus === 'refunded' ||
      paymentStatus === 'refund_scheduled' ||
      paymentStatus === 'partially_refunded';

    const subtotal = Number(vendorOrder.subtotal || 0);

    if (isPaid) {
      grossRevenue += subtotal;
    }

    if (isRefunded) {
      refunds += subtotal;
    }
  });

  return {
    orders: orderCount,
    grossRevenue: Number(grossRevenue.toFixed(2)),
    refunds: Number(refunds.toFixed(2)),
    netRevenue: Number((grossRevenue - refunds).toFixed(2)),
  };
}
