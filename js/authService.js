// Authentication Service
const authService = {
  // Sign in with email/password & Firestore role check
  signInWithEmailAndPassword: function(email, password, rememberMe = false) {
    const persistence = rememberMe
      ? firebase.auth.Auth.Persistence.LOCAL
      : firebase.auth.Auth.Persistence.SESSION;

    return firebaseServices.auth.setPersistence(persistence)
      .then(() => firebaseServices.auth.signInWithEmailAndPassword(email, password))
      .then(userCredential => {
        const uid = userCredential.user.uid;
        return firebaseServices.collections.users.doc(uid).get()
          .then(doc => {
            if (!doc.exists) {
              firebaseServices.auth.signOut();
              throw new Error("User data not found in Firestore.");
            }
            const role = doc.data().role;

            // Redirect based on Firestore role
            let dashboard;
            switch(role) {
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

  // Password reset
  sendPasswordResetEmail: function(email) {
    return firebaseServices.auth.sendPasswordResetEmail(email);
  },

  // Sign out
  signOut: function() {
    return firebaseServices.auth.signOut();
  }
};

// Handle login form
document.addEventListener('DOMContentLoaded', function() {
  const loginForm = document.getElementById('login-form');
  const errorDiv = document.getElementById('error-message');
  const successDiv = document.getElementById('success-message');
  const forgotBtn = document.getElementById('forgot-password');

  if (loginForm) {
    loginForm.addEventListener('submit', function(e) {
      e.preventDefault();
      errorDiv.classList.add('hidden');
      successDiv.classList.add('hidden');

      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      const rememberMe = document.getElementById('remember-me').checked;

      authService.signInWithEmailAndPassword(email, password, rememberMe)
        .then(({ dashboard }) => {
          window.location.href = dashboard;
        })
        .catch(error => {
          errorDiv.textContent = error.message;
          errorDiv.classList.remove('hidden');
        });
    });
  }

  if (forgotBtn) {
    forgotBtn.addEventListener('click', function(e) {
      e.preventDefault();
      const email = document.getElementById('email').value;
      if (!email) {
        errorDiv.textContent = "Please enter your email first.";
        errorDiv.classList.remove('hidden');
        return;
      }

      authService.sendPasswordResetEmail(email)
        .then(() => {
          successDiv.textContent = "Password reset email sent! Check your inbox.";
          successDiv.classList.remove('hidden');
        })
        .catch(error => {
          errorDiv.textContent = error.message;
          errorDiv.classList.remove('hidden');
        });
    });
  }
});

// Expose globally
window.authService = authService;
