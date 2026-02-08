import { API_BASE } from "./config.js";

/* ================================
   AUTH GUARD (ADMIN ONLY)
================================ */
const token = localStorage.getItem("s4l_token");
const role  = localStorage.getItem("s4l_role");

if (!token || role !== "admin") {
  window.location.href = "/account/admin/signin.html";
}

/* ================================
   HELPERS
================================ */
async function updateOrderStatus(orderId, status) {
  const res = await fetch(
    `${API_BASE}/api/admin/orders/${orderId}/status`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ status })
    }
  );

  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || "Status update failed");
  }
}

/* ================================
   STATE
================================ */
let currentPage = 1;
const STATUSES = ["Processing", "Shipped", "Delivered", "Cancelled"];
const STATUS_FLOW = ["Processing", "Shipped", "Delivered"];

/* ================================
   LOAD ORDERS
================================ */
async function loadOrders(page = 1) {
  const res = await fetch(`${API_BASE}/api/admin/orders?page=${page}`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (res.status === 401 || res.status === 403) {
    window.location.href = "/account/admin/signin.html";
    return;
  }

  const data = await res.json();
  const tbody = document.getElementById("ordersTable");
  tbody.innerHTML = "";

  data.orders.forEach(order => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>S4L-${order.id.slice(0, 10).toUpperCase()}</td>
      <td>${order.user?.email || "-"}</td>
      <td>£${Number(order.total || 0).toFixed(2)}</td>
      <td>
        <span class="status status-${order.status.toLowerCase()}">
          ${order.status}
        </span>
      </td>
      <td>${new Date(order.createdAt).toLocaleString()}</td>
      <td>
        <button class="view-order" data-id="${order.id}">View</button>
      </td>
    `;

    tbody.appendChild(tr);
  });

  renderPagination(data.page, data.totalPages);
}

/* ================================
   PAGINATION
================================ */
function renderPagination(current, total) {
  const container = document.getElementById("pagination");
  if (!container || total <= 1) return;

  container.innerHTML = "";

  for (let i = 1; i <= total; i++) {
    const btn = document.createElement("button");
    btn.textContent = i;
    if (i === current) btn.classList.add("active");

    btn.addEventListener("click", () => {
      if (i === current) return;
      currentPage = i;
      loadOrders(i);
    });

    container.appendChild(btn);
  }
}

/* ================================
   INLINE DETAILS + STATUS UPDATE
================================ */
document.getElementById("ordersTable").addEventListener("click", async (e) => {

  /* ===============================
     OPEN / CLOSE INLINE DETAILS
  =============================== */
  const viewBtn = e.target.closest(".view-order");
  if (viewBtn) {
    const row = viewBtn.closest("tr");
    const orderId = viewBtn.dataset.id;

    // Backend status (as displayed)
    const backendStatus = row.children[3].textContent.trim();

    // Normalized for logic
    const currentStatus = backendStatus.toLowerCase();

    const FINAL_STATES = ["delivered", "cancelled"];
    const isFinal = FINAL_STATES.includes(currentStatus);

    // Toggle same row
    let detailsRow = row.nextElementSibling;
    if (detailsRow && detailsRow.classList.contains("order-details-row")) {
      detailsRow.style.display =
        detailsRow.style.display === "table-row" ? "none" : "table-row";
      return;
    }

    // Close others
    document.querySelectorAll(".order-details-row").forEach(r => r.remove());

    /* -------- STATUS TRANSITIONS (LOGIC ONLY) -------- */
    const TRANSITIONS = {
      processing: ["Processing", "Shipped", "Cancelled"],
      shipped: ["Shipped", "Delivered"],
      delivered: ["Delivered"],
      cancelled: ["Cancelled"]
    };

    const allowedStatuses =
      TRANSITIONS[currentStatus] || [backendStatus];

    const optionsHtml = allowedStatuses.map(status => `
      <option value="${status}" ${status === backendStatus ? "selected" : ""}>
        ${status}
      </option>
    `).join("");

    /* -------- BUILD ROW -------- */
    detailsRow = document.createElement("tr");
    detailsRow.className = "order-details-row";
    detailsRow.style.display = "table-row";

    const cell = document.createElement("td");
    cell.colSpan = 6;

    cell.innerHTML = `
      <div class="inline-order-grid">
        <div>
          <strong>Order ID:</strong>
          <span class="inline-order-id">
            S4L-${orderId.slice(0, 10).toUpperCase()}
          </span><br><br>

          <strong>User</strong><br>
          ${row.children[1].textContent}<br><br>

          <strong>Created</strong><br>
          ${row.children[4].textContent}
        </div>

        <div>
          <strong>Total</strong><br>
          ${row.children[2].textContent}<br><br>

          <strong>Status</strong><br>

          ${
            isFinal
              ? `<span class="status status-${currentStatus}">
                   ${backendStatus}
                 </span>`
              : `
                <select class="inline-status" data-id="${orderId}">
                  ${optionsHtml}
                </select>
              `
          }

          <br><br>

          ${
            isFinal
              ? `<em style="opacity:.6">Final state – no further changes</em>`
              : `<button class="inline-update" data-id="${orderId}">
                   Update status
                 </button>`
          }

          <br><br>

          <a href="/account/admin/order-details.html?id=${orderId}">
            Open full details →
          </a>
        </div>
      </div>
    `;

    detailsRow.appendChild(cell);
    row.after(detailsRow);
    return;
  }

  /* ===============================
     SAVE STATUS
  =============================== */
  const saveBtn = e.target.closest(".inline-update");
  if (!saveBtn) return;

  const orderId = saveBtn.dataset.id;
  const select = document.querySelector(
    `.inline-status[data-id="${orderId}"]`
  );
  if (!select) return;

  // IMPORTANT: send backend enum, NOT lowercase
  const newStatus = select.value;

  saveBtn.disabled = true;
  saveBtn.textContent = "Saving…";

try {
  await updateOrderStatus(orderId, newStatus);

  const detailsRow = saveBtn.closest("tr");
  const mainRow = detailsRow.previousElementSibling;
  const statusCell = mainRow.children[3];

  statusCell.textContent = newStatus;
  statusCell.className = `status status-${newStatus.toLowerCase()}`;

  // 🔴 THIS IS THE FIX
  detailsRow.remove();

} catch (err) {
  console.error(err);
  saveBtn.textContent = "Error";
}


  setTimeout(() => {
    saveBtn.textContent = "Update status";
    saveBtn.disabled = false;
  }, 1200);
});



/* ================================
   INIT
================================ */
loadOrders(currentPage);
