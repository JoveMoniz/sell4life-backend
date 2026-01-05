// require-auth.js
(() => {
  const token = localStorage.getItem("s4l_token");
  if (!token) {
    window.location.href = "/account/signin.html";
  }
})();
