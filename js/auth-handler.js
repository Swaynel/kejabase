// js/auth-handler.js
import authService from "./authService.js";

// Helpers for showing/hiding error messages
const showError = (id, msg) => {
  const el = document.getElementById(id);
  if (el) { el.textContent = msg; el.classList.remove("hidden"); }
};

const hideError = (id) => {
  const el = document.getElementById(id);
  if (el) el.classList.add("hidden");
};

// ---------------- LOGIN ----------------
const loginForm = document.getElementById("login-form");
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideError("error-message");

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    try {
      await authService.signInWithEmail(email, password);
      const userData = await authService.getCurrentUserData();
      if (!userData || !userData.role) throw new Error("User role not found");

      switch (userData.role) {
        case "admin": window.location.href = "/dashboard-admin.html"; break;
        case "bnb": window.location.href = "/dashboard-bnb.html"; break;
        case "provider": window.location.href = "/dashboard-provider.html"; break;
        case "hunter": window.location.href = "/browse.html"; break;
        default: window.location.href = "/browse.html";
      }
    } catch (err) {
      console.error(err);
      showError("error-message", err.message || "Login failed");
    }
  });
}

// ---------------- REGISTER ----------------
const registerForm = document.getElementById("register-form");
if (registerForm) {
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideError("error-message");

    const role = document.getElementById("role").value;
    const name = document.getElementById("name").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const confirmPassword = document.getElementById("confirm-password").value;
    const phone = document.getElementById("phone").value.trim();

    if (password !== confirmPassword) {
      showError("error-message", "Passwords do not match");
      return;
    }

    try {
      const userCredential = await authService.registerWithEmail(email, password);
      await authService.createUserInFirestore(userCredential.user.uid, {
        name,
        email,
        role,
        phone,
        createdAt: new Date().toISOString()
      });

      // Redirect based on role
      switch (role) {
        case "admin": window.location.href = "/dashboard-admin.html"; break;
        case "bnb": window.location.href = "/dashboard-bnb.html"; break;
        case "provider": window.location.href = "/dashboard-provider.html"; break;
        case "hunter": window.location.href = "/browse.html"; break;
        default: window.location.href = "/browse.html";
      }
    } catch (err) {
      console.error(err);
      showError("error-message", err.message || "Registration failed");
    }
  });
}
