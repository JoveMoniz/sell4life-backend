// Shared helpers for admin "search as you type" filters (users, vendors).
// Escapes regex metacharacters in admin-typed input so e.g. "." or "(" in a
// query can't be misread as regex syntax. A "contains anywhere" match on a
// single common letter turns up noise (matches buried mid-email or
// mid-domain) instead of the people/stores actually named that, so these
// anchor to a start-of-word boundary instead.

export function escapeRegex(q) {
  return q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Whole-field prefix match — for single-token fields like email/username.
export function prefixRegex(q) {
  return new RegExp('^' + escapeRegex(q), 'i');
}

// Matches the start of the string OR the start of any word after
// whitespace — so searching a surname like "Moniz" still finds
// "Jovelino Moniz", not just names/store names that begin with it.
export function wordPrefixRegex(q) {
  return new RegExp('(^|\\s)' + escapeRegex(q), 'i');
}
