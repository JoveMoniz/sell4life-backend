const form = document.getElementById('vendorForm');
const msg = document.getElementById('msg');
const slugPreview = document.getElementById('slug-preview');

document.getElementById('storeName').addEventListener('input', (e) => {
  const slug = e.target.value
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '');
  document.getElementById('storeSlug').value = slug;
  if (slugPreview) slugPreview.textContent = slug || '…';
});

document.getElementById('storeSlug').addEventListener('input', (e) => {
  if (slugPreview) slugPreview.textContent = e.target.value || '…';
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = 'Submitting…';
  msg.textContent = '';
  msg.style.color = '';

  const token = localStorage.getItem('s4l_token');
  if (!token) {
    window.location.replace('/account/signin.html');
    return;
  }

  const storeName = document.getElementById('storeName').value.trim();
  const storeSlug = document.getElementById('storeSlug').value
    .toLowerCase().trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '');
  const storeDescription = (document.getElementById('storeDescription')?.value || '').trim();
  const storeType = document.getElementById('storeType')?.value || 'casual';

  if (!storeName || storeName.length < 3) {
    msg.textContent = 'Store name must be at least 3 characters.';
    msg.style.color = '#dc2626';
    button.disabled = false;
    button.textContent = 'Apply to Sell';
    return;
  }

  if (!storeSlug || storeSlug.length < 3) {
    msg.textContent = 'Store URL must be at least 3 characters.';
    msg.style.color = '#dc2626';
    button.disabled = false;
    button.textContent = 'Apply to Sell';
    return;
  }

  try {
    const res = await fetch(`${window.API_BASE}/vendor/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ storeName, storeSlug, storeDescription, type: storeType }),
    });

    const data = await res.json();

    if (!res.ok) {
      msg.textContent = data.message || data.error || 'Something went wrong.';
      msg.style.color = '#dc2626';
      button.disabled = false;
      button.textContent = 'Apply to Sell';
      return;
    }

    // Success — show notice, hide form
    form.style.display = 'none';
    const notice = document.getElementById('successNotice');
    if (notice) notice.style.display = 'block';

    localStorage.setItem('s4l_isVendor', 'true');
    localStorage.setItem('s4l_vendorStatus', 'pending');

  } catch {
    msg.textContent = 'Server error. Please try again.';
    msg.style.color = '#dc2626';
    button.disabled = false;
    button.textContent = 'Apply to Sell';
  }
});
