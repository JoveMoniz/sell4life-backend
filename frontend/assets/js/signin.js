if (localStorage.getItem("s4l_token")) {
  window.location.href = "/account/orders.html";
}



console.log("signin.js loaded");

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("signinForm");
  const msg = document.getElementById("msg");

  if (!form) {
    console.error("signinForm not found");
    return;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();

    msg.textContent = "Checking...";
    msg.style.color = "white";

    try {
      const res = await fetch("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();
      console.log("LOGIN RESPONSE FROM BACKEND:", data);

     if (!data.ok) {
  msg.textContent = data.msg || "Login failed";
  msg.style.color = "red";
  return;
}


      // ✅ ONLY store token AFTER success
      console.log("TOKEN TO STORE:", data.token);

      localStorage.setItem("s4l_token", data.token);
      localStorage.setItem("s4l_user", JSON.stringify(data.user));

      msg.textContent = "Login successful";
      msg.style.color = "lightgreen";

      setTimeout(() => {
        window.location.href = "/account/orders.html";
      }, 800);

    } catch (err) {
      console.error(err);
      msg.textContent = "Server error";
      msg.style.color = "red";
    }
  });
});
