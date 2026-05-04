const API = window.API_BASE;
/* ================================
   AUTH GUARD (TOKEN ONLY)
================================ */
const token = localStorage.getItem('s4l_token');

if (!token) {
  window.location.href = '/account/admin/signin.html';
}

// 🔥 decode + validate
try {
  const payload = token.split('.')[1];
  const decoded = JSON.parse(atob(payload));

  // expired token
  if (decoded.exp && Date.now() >= decoded.exp * 1000) {
    localStorage.clear();
    window.location.href = '/account/admin/signin.html';
  }

  // 🔥 ADMIN CHECK (YOU WERE MISSING THIS)
  const role = localStorage.getItem('s4l_role');
  if (role !== 'admin') {
    window.location.href = '/account/signin.html';
  }
} catch (err) {
  localStorage.clear();
  window.location.href = '/account/admin/signin.html';
}
/* ================================
   LOAD USERS (ADMIN ENFORCED BY API)
================================ */
async function loadUsers(query = '') {
  const tbody = document.getElementById('usersTable');

  let url = `${API}/admin/users`;

  if (query) {
    url += `?q=${encodeURIComponent(query)}`;
  }

  tbody.innerHTML = '<tr><td colspan="3">Loading...</td></tr>';

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (res.status === 401 || res.status === 403) {
    window.location.href = '/account/admin/signin.html';
    return;
  }

  const data = await res.json();

  tbody.innerHTML = '';

  if (!data.users || !Array.isArray(data.users)) {
    tbody.innerHTML = '<tr><td colspan="3">No users found</td></tr>';
    return;
  }

  data.users.forEach((user) => {
    const tr = document.createElement('tr');

    tr.innerHTML = `
      <td>${user.email}</td>
      <td>
        <select class="role-select" data-user-id="${user._id}">
          <option value="user" ${user.role === 'user' ? 'selected' : ''}>user</option>
          <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>admin</option>
        </select>
      </td>
      <td>
        <button class="save-btn" data-user-id="${user._id}">
          Save
        </button>
      </td>
    `;

    tbody.appendChild(tr);
  });
}
/* ================================
   SAVE ROLE (DELEGATED)
================================ */
document.addEventListener('click', async (e) => {
  if (!e.target.classList.contains('save-btn')) return;

  const userId = e.target.dataset.userId;
  const select = document.querySelector(`.role-select[data-user-id="${userId}"]`);

  if (!select) return;

  const newRole = select.value;

  try {
    const res = await fetch(`${API}/admin/users/${userId}/role`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ role: newRole }),
    });

    if (!res.ok) {
      alert('Failed to update role');
      return;
    }

    // If current user changed their own role → force logout
    const currentUser = JSON.parse(localStorage.getItem('s4l_user') || 'null');
    if (currentUser?.id === userId) {
      alert('Your role changed. Please sign in again.');
      localStorage.clear();
      window.location.href = '/account/admin/signin.html';
      return;
    }

    alert('Role updated. User must sign out and sign in again.');
    await loadUsers();
  } catch (err) {
    console.error('Update error:', err);
  }
});

/* ================================
   USER SEARCH
================================ */

const searchInput = document.getElementById('userSearch');
let searchTimer;

if (searchInput) {
  searchInput.addEventListener('input', () => {
    const value = searchInput.value.trim();

    clearTimeout(searchTimer);

    searchTimer = setTimeout(() => {
      loadUsers(value);
    }, 300);
  });
}

/* ================================
   INIT
================================ */
loadUsers();
