if (localStorage.getItem("s4l_token")) {
  window.location.href = "/account/orders.html";
}



document.getElementById("registerForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = document.getElementById("name").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();
    const msg = document.getElementById("msg");

    msg.textContent = "Creating account...";
    msg.style.color = "white";

    try {
        const res = await fetch("http://localhost:3000/api/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, email, password })
        });

        const data = await res.json();

        if (!res.ok) {
            msg.textContent = data.error;
            msg.style.color = "red";
            return;
        }

        msg.textContent = "Account created! Redirecting...";
        msg.style.color = "lightgreen";

        // Save user session
        localStorage.setItem("s4l_user", JSON.stringify(data.user));

        setTimeout(() => {
            window.location.href = "/account/orders.html";
        }, 900);

    } catch (err) {
        msg.textContent = "Server error.";
        msg.style.color = "red";
    }
});
