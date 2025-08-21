// js/authService.js
// ==============================
// Modular Authentication Service
// ==============================

class AuthService {
  constructor(firebaseServices = null, stateManager = null) {
    this.firebaseServices = firebaseServices;
    this.stateManager = stateManager;
    this.initialized = false;
    this.dashboardRoutes = {
      admin: '/dashboard-admin.html',
      bnb: '/dashboard-bnb.html',
      provider: '/dashboard-provider.html',
      hunter: '/dashboard-hunter.html',
      default: '/'
    };
  }

  // Set Firebase services
  setFirebaseServices(firebaseServices) {
    console.log("Setting firebaseServices:", firebaseServices);
    this.firebaseServices = firebaseServices;
    return this;
  }

  // Set state manager
  setStateManager(stateManager) {
    this.stateManager = stateManager;
    return this;
  }

  // Check if Firebase is ready
  isFirebaseReady() {
    return this.firebaseServices && 
           this.firebaseServices.ready && 
           this.firebaseServices.auth &&
           this.firebaseServices.collections;
  }

  // Wait for Firebase to be ready
  async waitForFirebase() {
    return new Promise((resolve) => {
      console.log("Checking Firebase readiness:", {
        firebaseServices: !!this.firebaseServices,
        ready: this.firebaseServices?.ready,
        auth: !!this.firebaseServices?.auth,
        collections: !!this.firebaseServices?.collections
      });

      if (this.isFirebaseReady()) {
        console.log("Firebase is ready");
        resolve();
        return;
      }

      const onFirebaseReady = () => {
        console.log("firebaseReady event received");
        if (typeof window !== 'undefined') {
          window.removeEventListener('firebaseReady', onFirebaseReady);
        }
        resolve();
      };

      if (typeof window !== 'undefined') {
        console.log("Adding firebaseReady event listener");
        window.addEventListener('firebaseReady', onFirebaseReady, { once: true });
      }

      const checkInterval = setInterval(() => {
        if (this.isFirebaseReady()) {
          console.log("Firebase became ready via interval check");
          clearInterval(checkInterval);
          if (typeof window !== 'undefined') {
            window.removeEventListener('firebaseReady', onFirebaseReady);
          }
          resolve();
        }
      }, 100);

      setTimeout(() => {
        clearInterval(checkInterval);
        if (typeof window !== 'undefined') {
          window.removeEventListener('firebaseReady', onFirebaseReady);
        }
        console.error("Firebase initialization timeout in authService");
        resolve();
      }, 10000); // Increased to 10 seconds
    });
  }

  // Get dashboard route for role
  getDashboardRoute(role) {
    return this.dashboardRoutes[role] || this.dashboardRoutes.default;
  }

  // Sign in with email and password
  async signInWithEmailAndPassword(email, password, rememberMe = false) {
    await this.waitForFirebase();
    
    if (!this.isFirebaseReady()) {
      console.warn("Firebase services not available, cannot sign in");
      return null;
    }

    try {
      await this.firebaseServices.setPersistence(rememberMe); // Updated for Firebase v9
      const userCredential = await this.firebaseServices.signInWithEmailAndPassword(email, password);
      const uid = userCredential.user.uid;
      const userDoc = await this.firebaseServices.collections.users.doc(uid).get();
      
      if (!userDoc.exists) {
        await this.firebaseServices.signOut();
        throw new Error("User data not found in Firestore.");
      }

      const userData = userDoc.data();
      const role = userData.role;
      const dashboard = this.getDashboardRoute(role);

      if (this.stateManager?.updateState) {
        this.stateManager.updateState({
          currentUser: { uid, ...userData },
          role: role
        });
      }

      return { user: userCredential.user, role, dashboard, userData };
    } catch (error) {
      console.error("Sign in error:", error);
      throw error;
    }
  }

  // Create new user account
  async createUserWithEmailAndPassword(email, password, userData) {
    await this.waitForFirebase();
    
    if (!this.isFirebaseReady()) {
      console.warn("Firebase services not available, cannot create user");
      return null;
    }

    try {
      const userCredential = await this.firebaseServices.createUserWithEmailAndPassword(email, password);
      const uid = userCredential.user.uid;
      const completeUserData = {
        email,
        createdAt: this.firebaseServices.serverTimestamp(),
        ...userData
      };

      await this.firebaseServices.collections.users.doc(uid).set(completeUserData);

      if (this.stateManager?.updateState) {
        this.stateManager.updateState({
          currentUser: { uid, ...completeUserData },
          role: userData.role
        });
      }

      return { 
        user: userCredential.user, 
        role: userData.role,
        userData: completeUserData
      };
    } catch (error) {
      console.error("Registration error:", error);
      throw error;
    }
  }

  // Check authentication and get redirect info
  async checkAuthAndRedirect() {
    await this.waitForFirebase();
    
    if (!this.isFirebaseReady()) {
      console.warn("Firebase services not available, skipping auth check");
      return { isAuthenticated: false };
    }

    return new Promise((resolve) => {
      this.firebaseServices.onAuthStateChanged(async (user) => {
        if (user) {
          try {
            const userDoc = await this.firebaseServices.collections.users.doc(user.uid).get();
            if (!userDoc.exists) {
              resolve({ isAuthenticated: false });
              return;
            }

            const userData = userDoc.data();
            const role = userData.role;
            const dashboard = this.getDashboardRoute(role);

            resolve({ 
              isAuthenticated: true, 
              dashboard, 
              role, 
              user,
              userData 
            });
          } catch (error) {
            console.error("Error checking auth:", error);
            resolve({ isAuthenticated: false });
          }
        } else {
          resolve({ isAuthenticated: false });
        }
      });
    });
  }

  // Get current user's role
  async getCurrentUserRole() {
    await this.waitForFirebase();
    
    if (!this.isFirebaseReady()) {
      console.warn("Firebase services not available, cannot get user role");
      return null;
    }

    const user = this.firebaseServices.auth.currentUser;
    if (!user) return null;

    try {
      const userDoc = await this.firebaseServices.collections.users.doc(user.uid).get();
      return userDoc.exists ? userDoc.data().role : null;
    } catch (error) {
      console.error("Error getting user role:", error);
      return null;
    }
  }

  // Check if user is authenticated
  async isAuthenticated() {
    await this.waitForFirebase();
    
    if (!this.isFirebaseReady()) {
      console.warn("Firebase services not available, assuming not authenticated");
      return false;
    }

    return this.firebaseServices.auth.currentUser !== null;
  }

  // Get current user
  async getCurrentUser() {
    await this.waitForFirebase();
    
    if (!this.isFirebaseReady()) {
      console.warn("Firebase services not available, cannot get current user");
      return null;
    }

    return this.firebaseServices.auth.currentUser;
  }

  // Get current user data from Firestore
  async getCurrentUserData() {
    const user = await this.getCurrentUser();
    if (!user) return null;

    try {
      const userDoc = await this.firebaseServices.collections.users.doc(user.uid).get();
      return userDoc.exists ? { uid: user.uid, ...userDoc.data() } : null;
    } catch (error) {
      console.error("Error getting user data:", error);
      return null;
    }
  }

  // Send password reset email
  async sendPasswordResetEmail(email) {
    await this.waitForFirebase();
    
    if (!this.isFirebaseReady()) {
      console.warn("Firebase services not available, cannot send password reset email");
      throw new Error("Firebase services not available");
    }

    try {
      return await this.firebaseServices.sendPasswordResetEmail(email);
    } catch (error) {
      console.error("Password reset email error:", error);
      throw error;
    }
  }

  // Sign out
  async signOut() {
    await this.waitForFirebase();
    
    if (!this.isFirebaseReady()) {
      console.warn("Firebase services not available, proceeding with sign out");
      if (this.stateManager?.updateState) {
        this.stateManager.updateState({ currentUser: null, role: null });
      }
      if (typeof window !== 'undefined') {
        window.location.href = '/';
      }
      return;
    }

    try {
      await this.firebaseServices.signOut();

      if (this.stateManager?.updateState) {
        this.stateManager.updateState({ currentUser: null, role: null });
      }

      if (typeof window !== 'undefined') {
        window.location.href = '/';
      }
    } catch (error) {
      console.error("Sign out error:", error);
      throw error;
    }
  }

  // Initialize auth service with DOM event listeners
  init() {
    if (this.initialized || typeof document === 'undefined') return this;

    document.addEventListener('DOMContentLoaded', () => {
      console.log("DOMContentLoaded, setting up event listeners and handling auth redirect");
      this.setupEventListeners();
      this.handleAuthRedirect();
    });

    this.initialized = true;
    return this;
  }

  // Handle automatic redirect for authenticated users
  async handleAuthRedirect() {
    if (typeof window === 'undefined') return;
    
    if (window.location.pathname.includes('login.html')) {
      try {
        const { isAuthenticated, dashboard } = await this.checkAuthAndRedirect();
        if (isAuthenticated && dashboard) {
          console.log("Redirecting authenticated user to:", dashboard);
          window.location.href = dashboard;
        }
      } catch (error) {
        console.error("Auth redirect error:", error);
      }
    }
  }

  // Set up DOM event listeners
  async setupEventListeners() {
    await this.waitForFirebase();
    if (!this.isFirebaseReady()) {
      console.warn("Firebase services not available, skipping event listener setup");
      return;
    }

    console.log("Setting up event listeners for forms and buttons");
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const errorDiv = document.getElementById('error-message');
    const successDiv = document.getElementById('success-message');
    const forgotBtn = document.getElementById('forgot-password');

    if (loginForm) this.setupLoginForm(loginForm, errorDiv, successDiv);
    if (registerForm) this.setupRegisterForm(registerForm, errorDiv);
    if (forgotBtn) this.setupForgotPassword(forgotBtn, errorDiv, successDiv);

    this.setupAuthStateMonitoring();
    this.setupSignOutButtons();
  }

  // Setup login form handler
  setupLoginForm(loginForm, errorDiv, successDiv) {
    loginForm.addEventListener('submit', async (e) => {
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

      try {
        const { dashboard } = await this.signInWithEmailAndPassword(email, password, rememberMe);
        if (dashboard) {
          console.log("Login successful, redirecting to:", dashboard);
          window.location.href = dashboard;
        } else {
          throw new Error("No dashboard route available");
        }
      } catch (error) {
        console.error("Login error:", error);
        if (errorDiv) {
          errorDiv.textContent = error?.message || "An error occurred.";
          errorDiv.classList.remove('hidden');
        }
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
      }
    });
  }

  // Setup registration form handler
  setupRegisterForm(registerForm, errorDiv) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      const confirmPassword = document.getElementById('confirm-password')?.value;
      const role = document.getElementById('role')?.value || 'hunter';
      const name = document.getElementById('name')?.value || '';
      const phone = document.getElementById('phone')?.value || '';

      if (confirmPassword && password !== confirmPassword) {
        if (errorDiv) {
          errorDiv.textContent = "Passwords do not match.";
          errorDiv.classList.remove('hidden');
        }
        return;
      }

      const submitBtn = registerForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;
      submitBtn.textContent = 'Creating account...';
      submitBtn.disabled = true;

      const userData = { role, name, phone };

      try {
        const { role: userRole } = await this.createUserWithEmailAndPassword(email, password, userData);
        const dashboard = this.getDashboardRoute(userRole);
        console.log("Registration successful, redirecting to:", dashboard);
        window.location.href = dashboard;
      } catch (error) {
        console.error("Registration form error:", error);
        if (errorDiv) {
          errorDiv.textContent = error?.message || "Failed to create account.";
          errorDiv.classList.remove('hidden');
        }
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
      }
    });
  }

  // Setup forgot password handler
  setupForgotPassword(forgotBtn, errorDiv, successDiv) {
    forgotBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      const email = document.getElementById('email').value;

      if (!email) {
        if (errorDiv) {
          errorDiv.textContent = "Please enter your email first.";
          errorDiv.classList.remove('hidden');
        }
        return;
      }

      try {
        await this.sendPasswordResetEmail(email);
        if (successDiv) {
          successDiv.textContent = "Password reset email sent!";
          successDiv.classList.remove('hidden');
        }
        if (errorDiv) errorDiv.classList.add('hidden');
      } catch (error) {
        console.error("Forgot password error:", error);
        if (errorDiv) {
          errorDiv.textContent = "Failed to send password reset email.";
          errorDiv.classList.remove('hidden');
        }
      }
    });
  }

  // Setup auth state monitoring for navigation
  setupAuthStateMonitoring() {
    if (!this.isFirebaseReady()) {
      console.warn("Firebase services not available, skipping auth state monitoring");
      return;
    }

    this.firebaseServices.onAuthStateChanged(async (user) => {
      const loginLink = document.querySelector('a[href="login.html"], a[href="/login.html"]');

      if (user && loginLink) {
        try {
          const role = await this.getCurrentUserRole();
          if (role) {
            loginLink.textContent = 'Dashboard';
            loginLink.href = this.getDashboardRoute(role);
            console.log("Updated navigation link to dashboard:", loginLink.href);
          }
        } catch (error) {
          console.error("Error updating navigation:", error);
        }
      } else if (!user && loginLink) {
        loginLink.textContent = 'Login';
        loginLink.href = '/login.html';
        console.log("Reset navigation link to login");
      }
    });
  }

  // Setup sign out button handlers
  setupSignOutButtons() {
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('sign-out-btn') || e.target.id === 'sign-out') {
        e.preventDefault();
        console.log("Sign out button clicked");
        this.signOut().catch((error) => console.error("Sign out failed:", error));
      }
    });
  }
}

// Factory function
export function createAuthService(firebaseServices = null, stateManager = null) {
  return new AuthService(firebaseServices, stateManager);
}

// Create default instance
const defaultAuthService = new AuthService();

// Auto-initialize with window globals if available
if (typeof window !== 'undefined') {
  const initializeAuthService = () => {
    console.log("Initializing AuthService with firebaseServices:", window.firebaseServices);
    if (window.firebaseServices) {
      defaultAuthService.setFirebaseServices(window.firebaseServices);
    }
    if (window.state) {
      defaultAuthService.setStateManager(window.state);
    }
    defaultAuthService.init();
    window.authService = defaultAuthService;
  };

  if (window.firebaseServices?.ready) {
    console.log("Firebase services already ready, initializing AuthService");
    initializeAuthService();
  } else {
    console.log("Waiting for firebaseReady event to initialize AuthService");
    window.addEventListener('firebaseReady', () => {
      console.log("firebaseReady event received, initializing AuthService");
      initializeAuthService();
    }, { once: true });
  }
}

// Export for module usage
export default defaultAuthService;
export { AuthService };