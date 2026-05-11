import { pushUniqueHistory } from './historyLogic.js';

const REFUND_DELAY_MS = Number(process.env.REFUND_DELAY_MS || 15000);

export function scheduleRefund(order) {
  // 🚫 Prevent duplicate scheduling FIRST
  if (order.refundScheduledAt) return;

  const now = new Date();
  const refundTime = new Date(now.getTime() + REFUND_DELAY_MS);

  // ========================
  // PAYMENT STATE
  // ========================
  order.paymentStatus = 'refund_scheduled';
  order.refundScheduledAt = refundTime;

  order.refundStatus = 'scheduled';
  order.refundType = 'auto';
  order.refundRequestedBy = 'system';

  // ========================
  // HISTORY (single source of truth)
  // ========================
  pushUniqueHistory(
    order,
    'Refund Scheduled',
    'Auto refund scheduled',
    new Date(now.getTime() + 1000)
  );

  // ========================
  // VENDOR SYNC
  // ========================
  order.vendorOrders.forEach((vo) => {
    if (!vo.refundScheduledAt) {
      vo.refundScheduledAt = refundTime;
    }
  });
}
