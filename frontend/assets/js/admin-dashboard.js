const token = localStorage.getItem("s4l_token");
const role  = localStorage.getItem("s4l_role");

if (!token || role !== "admin") {
  window.location.href = "/account/admin/signin.html";
}

document.getElementById("logoutBtn").addEventListener("click", () => {
  localStorage.removeItem("s4l_token");
  localStorage.removeItem("s4l_role");
  window.location.href = "/account/admin/signin.html";
});
