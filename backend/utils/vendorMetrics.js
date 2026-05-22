// ======================================================
// VENDOR METRICS
// - grossRevenue: original item prices × qty for paid/refunded orders
// - refunds: only money that has ACTUALLY moved (cancelled + Stripe-refunded
//   + physically returned). returnApprovedQuantity is excluded because the
//   money has not moved yet — it is informational only.
// - net = grossRevenue - refunds
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

    const vendorItems = (order.items || []).filter(
      item => String(item.vendorId) === String(vendorId)
    );

    // Gross revenue = original full item prices × quantities (before any deductions)
    const itemsTotal = vendorItems.reduce(
      (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0
    );

    if (isPaid) {
      grossRevenue += itemsTotal;
    }

    // Sum cancelled and returned items for this vendor.
    // returnApprovedQuantity is zeroed when the item is marked returned,
    // so walk from most-progressed to least to avoid missing returned items.
    vendorItems.forEach(item => {
      const price = Number(item.price || 0);

      if (item.status === 'Cancelled') {
        refunds += price * Number(item.quantity || 0);
      } else {
        if (Number(item.refundedQuantity) > 0) {
          refunds += Number(item.refundedAmount) || price * Number(item.refundedQuantity);
        } else if (Number(item.returnQuantity) > 0) {
          refunds += price * Number(item.returnQuantity);
        }
        // returnApprovedQuantity intentionally excluded — return approved but
        // item not yet received back, so no money has moved yet.
      }
    });
  });

  return {
    orders: orderCount,
    grossRevenue: Number(grossRevenue.toFixed(2)),
    refunds: Number(refunds.toFixed(2)),
    netRevenue: Number((grossRevenue - refunds).toFixed(2)),
  };
}
