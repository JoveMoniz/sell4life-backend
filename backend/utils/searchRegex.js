// Shared helpers for admin "search as you type" filters (users, vendors).
// Escapes regex metacharacters in admin-typed input so e.g. "." or "(" in a
// query can't be misread as regex syntax, then anchors it to the start of
// the field — a "contains anywhere" match on a single common letter turns
// up noise (matches buried mid-email or mid-domain) instead of the
// people/stores actually named that.

export function escapeRegex(q) {
  return q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function prefixRegex(q) {
  return new RegExp('^' + escapeRegex(q), 'i');
}
