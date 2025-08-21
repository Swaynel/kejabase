// ==============================
// Authentication Service
// ==============================
const authService = {
  // Wait for Firebase to be ready
  waitForFirebase() {
    return new Promise(resolve => {
      if (window.firebaseServices && window.firebaseServices.ready) {
        resolve();
      } else {
        window.addEventListener('firebaseReady', () => resolve(), { once: true });
        const check = setInterval(() => {
          if (window.firebaseServices && window.firebaseServices.ready) {
            clearInterval(check);
            resolve();
          }
        }, 100);
        setTimeout(() => {
          clearInterval(check);
          console.error("Firebase initialization timeout in authService");
          resolve();
        }, 5000);
      }
    });
  },

  // Sign in with email/password & role-based redirect
  signInWithEmailAndPassword: async function(email, password, rememberMe = false) {
    await this.waitForFirebase();
    const persistence = rememberMe
      ? window.firebaseServices.auth.Auth.Persistence.LOCAL
      : window.firebaseServices.auth.Auth.Persistence.SESSION;

    return window.firebaseServices.auth.setPersistence(persistence)
      .then(() => window.firebaseServices.auth.signInWithEmailAndPassword(email, password))
      .then(userCredential => {
        const uid = userCredential.user.uid;
        return window.firebaseServices.collections.users.doc(uid).get()
          .then(doc => {
            if (!doc.exists) {
              window.firebaseServices.auth.signOut();
              throw new Error("User data not found in Firestore.");
            }
            const role = doc.data().role;
            let dashboard;
            switch (role) {
              case 'admin': dashboard = '/dashboard-admin.html'; break;
              case 'bnb': dashboard = '/dashboard-bnb.html'; break;
              case 'provider': dashboard = '/dashboard-provider.html'; break;
              case 'hunter': dashboard = '/dashboard-hunter.html'; break;
              default: dashboard = '/'; break;
            }
            return { user: userCredential.user, role, dashboard };
          });
      });
  },

  // Register new user
  createUserWithEmailAndPassword: async function(email, password, userData) {
    await this.waitForFirebase();
    return window.firebaseServices.auth.createUserWithEmailAndPassword(email, password)
      .then(userCredential => {
        const uid = userCredential.user.uid;
        return window.firebaseServices.collections.users.doc(uid).set({
          email,
          createdAt: window.firebaseServices.serverTimestamp(),
          ...userData
        }).then(() => ({ user: userCredential.user, role: userData.role }));
      });
  },

  // Check auth & redirect
  checkAuthAndRedirect: async function() {
    await this.waitForFirebase();
    return new Promise(resolve => {
      window.firebaseServices.auth.onAuthStateChanged(async user => {
        if (user) {
          try {
            const doc = await window.firebaseServices.collections.users.doc(user.uid).get();
            if (!doc.exists) return resolve({ isAuthenticated: false });
            const role = doc.data()?.role;
            let dashboard;
            switch (role) {
              case 'admin': dashboard = '/dashboard-admin.html'; break;
              case 'bnb': dashboard = '/dashboard-bnb.html'; break;
              case 'provider': dashboard = '/dashboard-provider.html'; break;
              case 'hunter': dashboard = '/dashboard-hunter.html'; break;
              default: dashboard = '/'; break;
            }
            resolve({ isAuthenticated: true, dashboard, role, user });
          } catch {
            resolve({ isAuthenticated: false });
          }
        } else resolve({ isAuthenticated: false });
      });
    });
  },

  getCurrentUserRole: async function() {
    await this.waitForFirebase();
    const user = window.firebaseServices.auth.currentUser;
    if (!user) return null;
    try {
      const doc = await window.firebaseServices.collections.users.doc(user.uid).get();
      return doc.exists ? doc.data().role : null;
    } catch {
      return null;
    }
  },

  isAuthenticated: async function() {
    await this.waitForFirebase();
    return window.firebaseServices.auth.currentUser !== null;
  },

  getCurrentUser: async function() {
    await this.waitForFirebase();
    return window.firebaseServices.auth.currentUser;
  },

  sendPasswordResetEmail: async function(email) {
    await this.waitForFirebase();
    return window.firebaseServices.auth.sendPasswordResetEmail(email);
  },

  signOut: async function() {
    await this.waitForFirebase();
    return window.firebaseServices.auth.signOut().then(() => {
      if (window.state?.updateState) window.state.updateState({ currentUser: null, role: null });
      window.location.href = '/';
    });
  }
};

// Auto-redirect function
async function handleAuthRedirect() {
  if (window.location.pathname.includes('login.html')) {
    const { isAuthenticated, dashboard } = await authService.checkAuthAndRedirect();
    if (isAuthenticated) window.location.href = dashboard;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await authService.waitForFirebase();

  // Forms
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const errorDiv = document.getElementById('error-message');
  const successDiv = document.getElementById('success-message');
  const forgotBtn = document.getElementById('forgot-password');

  handleAuthRedirect();

  if (loginForm) {
    loginForm.addEventListener('submit', e => {
      e.preventDefault();
      errorDiv?.classList.add('hidden');
      successDiv?.classList.add('hidden');

      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      const rememberMe = document.getElementById('remember-me')?.checked || false;

      const submitBtn = loginForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;
      submitBtn.textContent = 'Signing in...';
      submitBtn.disabled = true;

      authService.signInWithEmailAndPassword(email, password, rememberMe)
        .then(({ dashboard }) => window.location.href = dashboard)
        .catch(err => {
          errorDiv.textContent = err?.message || "An error occurred.";
          errorDiv.classList.remove('hidden');
          submitBtn.textContent = originalText;
          submitBtn.disabled = false;
        });
    });
  }

  if (forgotBtn) {
    forgotBtn.addEventListener('click', e => {
      e.preventDefault();
      const email = document.getElementById('email').value;
      if (!email) {
        errorDiv.textContent = "Please enter your email first.";
        errorDiv.classList.remove('hidden');
        return;
      }
      authService.sendPasswordResetEmail(email)
        .then(() => {
          successDiv.textContent = "Password reset email sent!";
          successDiv.classList.remove('hidden');
          errorDiv.classList.add('hidden');
        })
        .catch(() => {
          errorDiv.textContent = "Failed to send password reset email.";
          errorDiv.classList.remove('hidden');
        });
    });
  }

  if (registerForm) {
    registerForm.addEventListener('submit', e => {
      e.preventDefault();

      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      const confirmPassword = document.getElementById('confirm-password')?.value;
      const role = document.getElementById('role')?.value || 'hunter';
      const name = document.getElementById('name')?.value || '';
      const phone = document.getElementById('phone')?.value || '';

      if (confirmPassword && password !== confirmPassword) {
        errorDiv.textContent = "Passwords do not match.";
        errorDiv.classList.remove('hidden');
        return;
      }

      const submitBtn = registerForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;
      submitBtn.textContent = 'Creating account...';
      submitBtn.disabled = true;

      const userData = { role, name, phone };

      authService.createUserWithEmailAndPassword(email, password, userData)
        .then(({ role }) => {
          let dashboard;
          switch (role) {
            case 'admin': dashboard = '/dashboard-admin.html'; break;
            case 'bnb': dashboard = '/dashboard-bnb.html'; break;
            case 'provider': dashboard = '/dashboard-provider.html'; break;
            case 'hunter': dashboard = '/dashboard-hunter.html'; break;
            default: dashboard = '/'; break;
          }
          window.location.href = dashboard;
        })
        .catch(() => {
          errorDiv.textContent = "Failed to create account.";
          errorDiv.classList.remove('hidden');
          submitBtn.textContent = originalText;
          submitBtn.disabled = false;
        });
    });
  }

  // Global Auth State Monitor for nav updates
  window.firebaseServices.auth.onAuthStateChanged(user => {
    const loginLink = document.querySelector('a[href="login.html"]');
    if (user && loginLink) {
      authService.getCurrentUserRole().then(role => {
        if (!role) return;
        loginLink.textContent = 'Dashboard';
        let dashboard;
        switch (role) {
          case 'admin': dashboard = 'dashboard-admin.html'; break;
          case 'bnb': dashboard = 'dashboard-bnb.html'; break;
          case 'provider': dashboard = 'dashboard-provider.html'; break;
          case 'hunter': dashboard = 'dashboard-hunter.html'; break;
          default: dashboard = 'index.html'; break;
        }
        loginLink.href = dashboard;
      });
    } else if (!user && loginLink) {
      loginLink.textContent = 'Login';
      loginLink.href = 'login.html';
    }
  });

  // Sign out buttons
  document.addEventListener('click', e => {
    if (e.target.classList.contains('sign-out-btn') || e.target.id === 'sign-out') {
      e.preventDefault();
      authService.signOut();
    }
  });
});

// Expose globally
window.authService = authService;
