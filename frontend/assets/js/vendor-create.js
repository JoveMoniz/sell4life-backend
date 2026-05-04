console.log('vendor-create loaded');

const form = document.getElementById('vendorForm');
const msg = document.getElementById('msg');

// runs while typing → helps user
document.getElementById('storeName').addEventListener('input', (e) => {
  const slug = e.target.value
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-');

  document.getElementById('storeSlug').value = slug;
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const button = form.querySelector('button');
  button.disabled = true;
  button.textContent = 'Creating...';

  const token = localStorage.getItem('s4l_token');

  const storeName = document.getElementById('storeName').value.trim();
  const storeSlug = document.getElementById('storeSlug').value.trim();

  const cleanSlug = document
    .getElementById('storeSlug')
    .value.toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '');

  msg.textContent = 'Creating store...';
  msg.style.color = 'white';

  try {
    if (!storeName || storeName.length < 3) {
      msg.textContent = 'Store name too short';
      msg.style.color = 'red';
      button.disabled = false;
      button.textContent = 'Create Store';
      return;
    }

    if (!cleanSlug || cleanSlug.length < 3) {
      msg.textContent = 'Store slug too short';
      msg.style.color = 'red';
      button.disabled = false;
      button.textContent = 'Create Store';
      return;
    }
    const res = await fetch(`${API_BASE}/vendor/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        storeName,
        storeSlug: cleanSlug,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      msg.textContent = data.message || data.error || 'Failed';
      msg.style.color = 'red';

      button.disabled = false;
      button.textContent = 'Create Store';
      return;
    }

    msg.textContent = 'Store created!';
    msg.style.color = 'lightgreen';

    window.location.href = '/account/vendor/dashboard.html';
  } catch (err) {
    console.error(err);
    msg.textContent = 'Server error';
    msg.style.color = 'red';

    button.disabled = false;
    button.textContent = 'Create Store';
  }
});
