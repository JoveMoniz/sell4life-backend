// ======================================================
// COMMISSION — shared refund-proration rule
//
// The platform only earns commission on money it actually kept. A full
// refund/cancellation must zero the commission; a partial refund scales
// it down proportionally to the refunded fraction of gross. Every place
// that charges commission must go through this function — three separate
// hand-rolled versions of this same formula (financials, vendor ledger,
// vendor payout balance) drifted out of sync and each undercounted or
// overcounted refunds differently before this was consolidated.
// ======================================================

export function commissionAfterRefund(commission, gross, refunded) {
  const g = Number(gross) || 0;
  const c = Number(commission) || 0;
  if (g <= 0) return Math.round(c * 100) / 100;

  const r = Math.min(Number(refunded) || 0, g);
  const keptFraction = Math.max(0, (g - r) / g);

  return Math.round(c * keptFraction * 100) / 100;
}
