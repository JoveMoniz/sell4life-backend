// Accounts created before this date are grandfathered — verification
// wasn't enforced yet when they signed up, so we don't retroactively lock
// out people who've been using the site normally. Anyone who registered
// from this date on must verify their email before doing anything that
// needs to be logged in.
export const VERIFY_ENFORCED_FROM = new Date('2026-06-27T00:00:00Z');

export function mustVerifyEmail(user) {
  if (!user || user.emailVerified) return false;
  if (!user.createdAt) return false;
  return new Date(user.createdAt) >= VERIFY_ENFORCED_FROM;
}
