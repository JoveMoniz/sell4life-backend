const token = localStorage.getItem('s4l_token');
const role = localStorage.getItem('s4l_role');

if (!token || role !== 'admin') {
  window.location.href = '/account/admin/signin.html';
}

document.getElementById('logoutBtn').addEventListener('click', () => {
  localStorage.removeItem('s4l_token');
  localStorage.removeItem('s4l_role');
  window.location.href = '/account/admin/signin.html';
});

/* ── Notification badges ── */
async function loadCounts() {
  try {
    const res = await fetch(`${window.API_BASE}/admin/vendors/counts`, {
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return;
    const { pendingVendors, pendingPayouts, pendingUpgrades } = await res.json();

    const vendorBadge = document.getElementById('badge-vendors');
    const payoutWrap = document.getElementById('badge-payouts-wrap');
    const payoutBadge = document.getElementById('badge-payouts');
    const payoutPlural = document.getElementById('badge-payouts-plural');

    if (vendorBadge) {
      const vendorTotal = (pendingVendors || 0) + (pendingUpgrades || 0);
      if (vendorTotal > 0) {
        vendorBadge.textContent = vendorTotal;
        vendorBadge.classList.remove('dash-badge--hidden');
      } else {
        vendorBadge.classList.add('dash-badge--hidden');
      }
    }

    if (payoutWrap && payoutBadge) {
      if (pendingPayouts > 0) {
        payoutBadge.textContent = pendingPayouts;
        if (payoutPlural) payoutPlural.textContent = pendingPayouts === 1 ? '' : 's';
        payoutWrap.classList.remove('dash-badge--hidden');
      } else {
        payoutWrap.classList.add('dash-badge--hidden');
      }
    }
  } catch (_) {}
}

loadCounts();
setInterval(loadCounts, 60000);
