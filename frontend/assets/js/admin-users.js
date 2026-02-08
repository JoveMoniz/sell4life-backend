import { API_BASE } from "./config.js";

/* ================================
   AUTH GUARD (TOKEN ONLY)
================================ */
const token = localStorage.getItem("s4l_token");

if (!token) {
  window.location.href = "/account/admin/signin.html";
}

/* ================================
   LOAD USERS (ADMIN ENFORCED BY API)
================================ */
async function loadUsers() {
  const res = await fetch(`${API_BASE}/api/admin/users`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  // Backend decides admin access
  if (res.status === 401 || res.status === 403) {
    window.location.href = "/account/admin/signin.html";
    return;
  }

  const data = await res.json();
  const tbody = document.getElementById("usersTable");
  tbody.innerHTML = "";

  data.users.forEach(user => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${user.email}</td>
      <td>
        <select class="role-select" data-user-id="${user.id}">
          <option value="user" ${user.role === "user" ? "selected" : ""}>user</option>
          <option value="admin" ${user.role === "admin" ? "selected" : ""}>admin</option>
        </select>
      </td>
      <td>
        <button class="save-btn" data-user-id="${user.id}">
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
document.addEventListener("click", async (e) => {
  if (!e.target.classList.contains("save-btn")) return;

  const userId = e.target.dataset.userId;
  const select = document.querySelector(
    `.role-select[data-user-id="${userId}"]`
  );

  if (!select) return;

  const newRole = select.value;

  try {
    const res = await fetch(
      `${API_BASE}/api/admin/users/${userId}/role`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ role: newRole })
      }
    );

    if (!res.ok) {
      alert("Failed to update role");
      return;
    }

    // If current user changed their own role → force logout
    const currentUser = JSON.parse(localStorage.getItem("s4l_user") || "null");
    if (currentUser?.id === userId) {
      alert("Your role changed. Please sign in again.");
      localStorage.clear();
      window.location.href = "/account/admin/signin.html";
      return;
    }

    alert("Role updated. User must sign out and sign in again.");
    await loadUsers();

  } catch (err) {
    console.error("Update error:", err);
  }
});

/* ================================
   INIT
================================ */
loadUsers();
