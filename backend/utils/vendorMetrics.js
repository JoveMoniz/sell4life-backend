// ======================================================
// VENDOR METRICS
// ITEM-LEVEL REFUND SAFE
// ======================================================

export function calculateVendorMetrics(ordersRaw, vendorId) {
  let grossRevenue = 0;
  let refunds = 0;
  let orderCount = 0;

  ordersRaw.forEach((order) => {
    const vendorItems = (order.items || []).filter(
      (item) => String(item.vendorId) === String(vendorId)
    );

    if (!vendorItems.length) return;

    orderCount++;

    vendorItems.forEach((item) => {
      const subtotal = Number(item.subtotal || 0);

      grossRevenue += subtotal;

      const refundedQty = Number(item.refundedQuantity || 0);
      const itemQty = Number(item.quantity || 0);

      // ==================================================
      // FULL REFUND
      // ==================================================

      if (item.refundStatus === 'processed' && refundedQty >= itemQty) {
        refunds += subtotal;
      }

      // ==================================================
      // PARTIAL REFUND
      // ==================================================
      else if (refundedQty > 0) {
        refunds += Number(item.price || 0) * refundedQty;
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
