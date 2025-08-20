// ==============================
// Authentication Service
// ==============================
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

  // Check if user is already authenticated and redirect appropriately
  checkAuthAndRedirect: function() {
    return new Promise((resolve) => {
      firebaseServices.auth.onAuthStateChanged(async (user) => {
        if (user) {
          try {
            const userDoc = await firebaseServices.collections.users.doc(user.uid).get();
            if (!userDoc.exists) {
              resolve({ isAuthenticated: false });
              return;
            }
            
            const role = userDoc.data()?.role;
            let dashboard;
            switch(role) {
              case 'admin': dashboard = '/dashboard-admin.html'; break;
              case 'bnb': dashboard = '/dashboard-bnb.html'; break;
              case 'provider': dashboard = '/dashboard-provider.html'; break;
              case 'hunter': dashboard = '/dashboard-hunter.html'; break;
              default: dashboard = '/'; break;
            }
            resolve({ isAuthenticated: true, dashboard, role, user });
          } catch (error) {
            console.error('Error checking auth state:', error);
            resolve({ isAuthenticated: false });
          }
        } else {
          resolve({ isAuthenticated: false });
        }
      });
    });
  },

  // Get current user role
  getCurrentUserRole: function() {
    return new Promise((resolve) => {
      const user = firebaseServices.auth.currentUser;
      if (user) {
        firebaseServices.collections.users.doc(user.uid).get()
          .then(doc => {
            if (doc.exists) {
              resolve(doc.data().role);
            } else {
              resolve(null);
            }
          })
          .catch(() => resolve(null));
      } else {
        resolve(null);
      }
    });
  },

  // Check if user is authenticated (simple boolean check)
  isAuthenticated: function() {
    return firebaseServices.auth.currentUser !== null;
  },

  // Get current user data
  getCurrentUser: function() {
    return firebaseServices.auth.currentUser;
  },

  // Password reset
  sendPasswordResetEmail: function(email) {
    return firebaseServices.auth.sendPasswordResetEmail(email);
  },

  // Sign out
  signOut: function() {
    return firebaseServices.auth.signOut().then(() => {
      // Clear any cached state
      if (window.state && window.state.updateState) {
        window.state.updateState({ currentUser: null, role: null });
      }
      // Redirect to home page
      window.location.href = '/';
    });
  },

  // Register new user
  createUserWithEmailAndPassword: function(email, password, userData) {
    return firebaseServices.auth.createUserWithEmailAndPassword(email, password)
      .then(userCredential => {
        const uid = userCredential.user.uid;
        // Save user data to Firestore
        return firebaseServices.collections.users.doc(uid).set({
          email: email,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          ...userData
        }).then(() => {
          return { user: userCredential.user, role: userData.role };
        });
      });
  }
};

// ==============================
// Auto-redirect for authenticated users
// ==============================
function handleAuthRedirect() {
  // Only run on login page
  if (window.location.pathname.includes('login.html')) {
    authService.checkAuthAndRedirect().then(({ isAuthenticated, dashboard }) => {
      if (isAuthenticated) {
        window.location.href = dashboard;
      }
    });
  }
}

// ==============================
// DOM Event Handlers
// ==============================
document.addEventListener('DOMContentLoaded', function() {
  const loginForm = document.getElementById('login-form');
  const errorDiv = document.getElementById('error-message');
  const successDiv = document.getElementById('success-message');
  const forgotBtn = document.getElementById('forgot-password');

  // Auto-redirect if already authenticated
  handleAuthRedirect();

  // Handle login form submission
  if (loginForm) {
    loginForm.addEventListener('submit', function(e) {
      e.preventDefault();
      errorDiv?.classList.add('hidden');
      successDiv?.classList.add('hidden');

      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      const rememberMe = document.getElementById('remember-me')?.checked || false;

      // Show loading state
      const submitBtn = loginForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;
      submitBtn.textContent = 'Signing in...';
      submitBtn.disabled = true;

      authService.signInWithEmailAndPassword(email, password, rememberMe)
        .then(({ dashboard }) => {
          window.location.href = dashboard;
        })
        .catch(error => {
          if (errorDiv) {
            errorDiv.textContent = error.message;
            errorDiv.classList.remove('hidden');
          }
          // Reset button
          submitBtn.textContent = originalText;
          submitBtn.disabled = false;
        });
    });
  }

  // Handle forgot password
  if (forgotBtn) {
    forgotBtn.addEventListener('click', function(e) {
      e.preventDefault();
      const email = document.getElementById('email').value;
      if (!email) {
        if (errorDiv) {
          errorDiv.textContent = "Please enter your email first.";
          errorDiv.classList.remove('hidden');
        }
        return;
      }

      authService.sendPasswordResetEmail(email)
        .then(() => {
          if (successDiv) {
            successDiv.textContent = "Password reset email sent! Check your inbox.";
            successDiv.classList.remove('hidden');
          }
          if (errorDiv) {
            errorDiv.classList.add('hidden');
          }
        })
        .catch(error => {
          if (errorDiv) {
            errorDiv.textContent = error.message;
            errorDiv.classList.remove('hidden');
          }
        });
    });
  }

  // Handle registration form if present
  const registerForm = document.getElementById('register-form');
  if (registerForm) {
    registerForm.addEventListener('submit', function(e) {
      e.preventDefault();
      
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      const confirmPassword = document.getElementById('confirm-password')?.value;
      const role = document.getElementById('role')?.value || 'hunter';
      const name = document.getElementById('name')?.value || '';
      const phone = document.getElementById('phone')?.value || '';

      // Basic validation
      if (confirmPassword && password !== confirmPassword) {
        if (errorDiv) {
          errorDiv.textContent = "Passwords do not match.";
          errorDiv.classList.remove('hidden');
        }
        return;
      }

      // Show loading state
      const submitBtn = registerForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;
      submitBtn.textContent = 'Creating account...';
      submitBtn.disabled = true;

      const userData = {
        role: role,
        name: name,
        phone: phone
      };

      authService.createUserWithEmailAndPassword(email, password, userData)
        .then(({ role }) => {
          // Redirect based on role
          let dashboard;
          switch(role) {
            case 'admin': dashboard = '/dashboard-admin.html'; break;
            case 'bnb': dashboard = '/dashboard-bnb.html'; break;
            case 'provider': dashboard = '/dashboard-provider.html'; break;
            case 'hunter': dashboard = '/dashboard-hunter.html'; break;
            default: dashboard = '/'; break;
          }
          window.location.href = dashboard;
        })
        .catch(error => {
          if (errorDiv) {
            errorDiv.textContent = error.message;
            errorDiv.classList.remove('hidden');
          }
          // Reset button
          submitBtn.textContent = originalText;
          submitBtn.disabled = false;
        });
    });
  }

  // Handle sign out buttons
  document.addEventListener('click', function(e) {
    if (e.target.classList.contains('sign-out-btn') || e.target.id === 'sign-out') {
      e.preventDefault();
      authService.signOut();
    }
  });
});

// ==============================
// Global Auth State Monitor
// ==============================
firebaseServices.auth.onAuthStateChanged(function(user) {
  // Update navigation based on auth state
  const loginLink = document.querySelector('a[href="login.html"]');
  const listPropertyLink = document.querySelector('a[href*="List Your Property"], .list-property-btn');
  
  if (user && loginLink) {
    // User is logged in, update navigation
    authService.getCurrentUserRole().then(role => {
      if (role) {
        // Replace login link with user menu or dashboard link
        loginLink.textContent = 'Dashboard';
        let dashboard;
        switch(role) {
          case 'admin': dashboard = 'dashboard-admin.html'; break;
          case 'bnb': dashboard = 'dashboard-bnb.html'; break;
          case 'provider': dashboard = 'dashboard-provider.html'; break;
          case 'hunter': dashboard = 'dashboard-hunter.html'; break;
          default: dashboard = 'index.html'; break;
        }
        loginLink.href = dashboard;
      }
    });
  } else if (!user && loginLink) {
    // User is not logged in, ensure login link is correct
    loginLink.textContent = 'Login';
    loginLink.href = 'login.html';
  }
});

// ==============================
// Expose globally
// ==============================
window.authService = authService;