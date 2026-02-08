import { API_BASE } from "./config.js";

/* ================================
   AUTH GUARD
================================ */
const token = localStorage.getItem("s4l_token");
if (!token) {
  window.location.href = "/account/admin/signin.html";
  throw new Error("Not authenticated");
}

/* ================================
   GET ORDER ID
================================ */
const params  = new URLSearchParams(window.location.search);
const orderId = params.get("id");

if (!orderId) {
  window.location.href = "/account/admin/orders.html";
  throw new Error("Missing order ID");
}

/* ================================
   ELEMENTS
================================ */
const statusSelect  = document.getElementById("statusSelect");
const updateBtn     = document.getElementById("updateStatus");
const result        = document.getElementById("result");
const historyList   = document.getElementById("statusHistory");
const productsTable = document.getElementById("productsTable");

/* ================================
   STATE
================================ */
let currentOrder = null;

/* ================================
   STATUS TRANSITIONS (SINGLE SOURCE)
================================ */
const TRANSITIONS = {
  processing: ["Processing", "Shipped", "Cancelled"],
  shipped:    ["Shipped", "Delivered"],
  delivered:  ["Delivered"],
  cancelled:  ["Cancelled"]
};

const FINAL_STATES = ["delivered", "cancelled"];

/* ================================
   LOAD ORDER
================================ */
async function loadOrder() {
  try {
    const res = await fetch(
      `${API_BASE}/api/admin/orders/${orderId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!res.ok) throw new Error("Failed to load order");

    const order = await res.json();
    currentOrder = order;

    /* ========= SUMMARY ========= */
    document.getElementById("orderId").textContent =
      `S4L-${order.id.slice(0, 10).toUpperCase()}`;

    document.getElementById("orderUser").textContent =
      order.user?.email || "-";

    document.getElementById("orderDate").textContent =
      new Date(order.createdAt).toLocaleString();

    document.getElementById("orderTotal").textContent =
      Number(order.total).toFixed(2);

    document.getElementById("orderStatus").textContent =
      order.status;

    /* ========= STATUS SELECT (INLINE-MATCHED) ========= */
    const backendStatus = order.status;            // "Processing"
    const currentStatus = backendStatus.toLowerCase();
    const isFinal = FINAL_STATES.includes(currentStatus);

    statusSelect.innerHTML = "";

    const allowedStatuses =
      TRANSITIONS[currentStatus] || [backendStatus];

    allowedStatuses.forEach(status => {
      const option = document.createElement("option");
      option.value = status;
      option.textContent = status;
      if (status === backendStatus) option.selected = true;
      statusSelect.appendChild(option);
    });

    statusSelect.disabled = isFinal;
    updateBtn.disabled = isFinal;

    if (isFinal) {
      result.textContent = "Final state – no further changes";
      result.className = "info";
    } else {
      result.textContent = "";
    }

    /* ========= PRODUCTS ========= */
    productsTable.innerHTML = "";

    const items = order.items || order.products || [];

    if (!items.length) {
      productsTable.innerHTML = `
        <tr>
          <td colspan="4" style="text-align:center; opacity:.6">
            No products found
          </td>
        </tr>
      `;
    } else {
      items.forEach(item => {
        const qty = Number(item.quantity || 0);
        const price = Number(item.price || 0);

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td class="product-cell">
            <img
              src="${item.image || "/assets/images/products/default.png"}"
              alt="${item.name}"
              class="product-thumb"
            />
            <span class="product-name">${item.name}</span>
          </td>
          <td>${qty}</td>
          <td>£${price.toFixed(2)}</td>
          <td>£${(qty * price).toFixed(2)}</td>
        `;
        productsTable.appendChild(tr);
      });
    }

    /* ========= STATUS HISTORY ========= */
    historyList.innerHTML = "";
    (order.statusHistory || []).forEach(h => {
      const li = document.createElement("li");
      li.textContent =
        `${h.status} – ${new Date(h.date).toLocaleString()}`;
      historyList.appendChild(li);
    });

  } catch (err) {
    console.error(err);
    result.textContent = "Failed to load order";
    result.className = "error";
  }
}

/* ================================
   UPDATE STATUS
================================ */
updateBtn.addEventListener("click", async () => {
  if (!currentOrder) return;

  updateBtn.disabled = true;
  updateBtn.textContent = "Updating…";
  result.textContent = "";

  try {
    const res = await fetch(
      `${API_BASE}/api/admin/orders/${orderId}/status`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          status: statusSelect.value   // BACKEND ENUM
        })
      }
    );

    if (!res.ok) throw new Error("Update failed");

    await loadOrder();

    result.textContent = "Status updated";
    result.className = "success";

  } catch (err) {
    console.error(err);
    result.textContent = "Error updating status";
    result.className = "error";
  } finally {
    updateBtn.textContent = "Update Status";
  }
});

/* ================================
   INIT
================================ */
loadOrder();
