// js/authService.js
// ==============================
// Modular Authentication Service
// ==============================

class AuthService {
  constructor(firebaseServices = null, stateManager = null) {
    this.firebaseServices = firebaseServices;
    this.stateManager = stateManager;
    this.initialized = false;
    this.ready = false;
    this.dashboardRoutes = {
      admin: '/dashboard-admin.html',
      bnb: '/dashboard-bnb.html',
      provider: '/dashboard-provider.html',
      hunter: '/dashboard-hunter.html',
      default: '/'
    };
    this.initPromise = null;
  }

  // Set Firebase services
  setFirebaseServices(firebaseServices) {
    console.log("Setting firebaseServices in AuthService:", firebaseServices);
    this.firebaseServices = firebaseServices;
    this.checkReadiness();
    return this;
  }

  // Set state manager
  setStateManager(stateManager) {
    console.log("Setting stateManager in AuthService:", stateManager);
    this.stateManager = stateManager;
    return this;
  }

  // Check and update readiness status
  checkReadiness() {
    const wasReady = this.ready;
    this.ready = this.firebaseServices && 
                 this.firebaseServices.ready && 
                 this.firebaseServices.auth &&
                 this.firebaseServices.collections;
    
    if (!wasReady && this.ready) {
      console.log("AuthService is now ready");
      // Dispatch readiness event
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('authServiceReady', {
          detail: { authService: this }
        }));
      }
    }
    
    return this.ready;
  }

  // Check if Firebase is ready
  isFirebaseReady() {
    return this.checkReadiness();
  }

  // Wait for Firebase to be ready
  async waitForFirebase() {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise((resolve) => {
      console.log("Checking Firebase readiness in AuthService:", {
        firebaseServices: !!this.firebaseServices,
        ready: this.firebaseServices?.ready,
        auth: !!this.firebaseServices?.auth,
        collections: !!this.firebaseServices?.collections
      });

      if (this.isFirebaseReady()) {
        console.log("Firebase is ready for AuthService");
        resolve();
        return;
      }

      let resolved = false;
      const resolveOnce = () => {
        if (resolved) return;
        resolved = true;
        console.log("AuthService Firebase initialization completed");
        resolve();
      };

      const onFirebaseReady = () => {
        console.log("firebaseReady event received in AuthService");
        if (this.isFirebaseReady()) {
          resolveOnce();
        }
      };

      if (typeof window !== 'undefined') {
        console.log("Adding firebaseReady event listener in AuthService");
        window.addEventListener('firebaseReady', onFirebaseReady, { once: false });
      }

      const checkInterval = setInterval(() => {
        if (this.isFirebaseReady()) {
          console.log("Firebase became ready via interval check in AuthService");
          clearInterval(checkInterval);
          if (typeof window !== 'undefined') {
            window.removeEventListener('firebaseReady', onFirebaseReady);
          }
          resolveOnce();
        }
      }, 100);

      setTimeout(() => {
        clearInterval(checkInterval);
        if (typeof window !== 'undefined') {
          window.removeEventListener('firebaseReady', onFirebaseReady);
        }
        console.warn("Firebase initialization timeout in authService");
        resolveOnce();
      }, 12000);
    });

    return this.initPromise;
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
      throw new Error("Authentication service not available");
    }

    try {
      console.log("Attempting sign in for:", email);
      await this.firebaseServices.setPersistence(rememberMe);
      const userCredential = await this.firebaseServices.signInWithEmailAndPassword(email, password);
      const uid = userCredential.user.uid;
      
      console.log("User signed in, fetching user document:", uid);
      const userDoc = await this.firebaseServices.collections.users.doc(uid).get();
      
      if (!userDoc.exists) {
        await this.firebaseServices.signOut();
        throw new Error("User data not found in Firestore.");
      }

      const userData = userDoc.data();
      const role = userData.role;
      const dashboard = this.getDashboardRoute(role);

      console.log("Sign in successful:", { uid, role, dashboard });

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
      throw new Error("Authentication service not available");
    }

    try {
      console.log("Creating new user account for:", email);
      const userCredential = await this.firebaseServices.createUserWithEmailAndPassword(email, password);
      const uid = userCredential.user.uid;
      const completeUserData = {
        email,
        createdAt: this.firebaseServices.serverTimestamp(),
        ...userData
      };

      console.log("Creating user document in Firestore:", uid);
      await this.firebaseServices.collections.users.doc(uid).set(completeUserData);

      console.log("User registration successful:", { uid, role: userData.role });

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
      const unsubscribe = this.firebaseServices.onAuthStateChanged(async (user) => {
        unsubscribe(); // Unsubscribe after first check
        
        if (user) {
          try {
            console.log("Checking auth for user:", user.uid);
            const userDoc = await this.firebaseServices.collections.users.doc(user.uid).get();
            if (!userDoc.exists) {
              console.warn("User document not found:", user.uid);
              resolve({ isAuthenticated: false });
              return;
            }

            const userData = userDoc.data();
            const role = userData.role;
            const dashboard = this.getDashboardRoute(role);

            console.log("Auth check successful:", { uid: user.uid, role, dashboard });
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
          console.log("No authenticated user found");
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
    if (!user) {
      console.log("No current user for role check");
      return null;
    }

    try {
      const userDoc = await this.firebaseServices.collections.users.doc(user.uid).get();
      const role = userDoc.exists ? userDoc.data().role : null;
      console.log("Current user role:", role);
      return role;
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

    const isAuth = this.firebaseServices.auth.currentUser !== null;
    console.log("Authentication check:", isAuth);
    return isAuth;
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
    if (!user) {
      console.log("No current user for data fetch");
      return null;
    }

    try {
      console.log("Fetching user data for:", user.uid);
      const userDoc = await this.firebaseServices.collections.users.doc(user.uid).get();
      const userData = userDoc.exists ? { uid: user.uid, ...userDoc.data() } : null;
      console.log("User data fetched:", userData ? "Success" : "Not found");
      return userData;
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
      throw new Error("Authentication service not available");
    }

    try {
      console.log("Sending password reset email to:", email);
      return await this.firebaseServices.sendPasswordResetEmail(email);
    } catch (error) {
      console.error("Password reset email error:", error);
      throw error;
    }
  }

  // Sign out
  async signOut() {
    console.log("Signing out user");
    
    if (this.isFirebaseReady()) {
      try {
        await this.firebaseServices.signOut();
      } catch (error) {
        console.error("Firebase sign out error:", error);
      }
    }

    if (this.stateManager?.updateState) {
      this.stateManager.updateState({ 
        currentUser: null, 
        role: "guest",
        favorites: []
      });
    }

    if (typeof window !== 'undefined') {
      console.log("Redirecting to home page after sign out");
      window.location.href = '/';
    }
  }

  // Initialize auth service with DOM event listeners
  init() {
    if (this.initialized || typeof document === 'undefined') return this;

    console.log("Initializing AuthService");
    
    document.addEventListener('DOMContentLoaded', () => {
      console.log("DOMContentLoaded in AuthService, setting up functionality");
      this.setupEventListeners();
      this.handleAuthRedirect();
    });

    this.initialized = true;
    return this;
  }

  // Handle automatic redirect for authenticated users
  async handleAuthRedirect() {
    if (typeof window === 'undefined') return;
    
    const currentPath = window.location.pathname;
    console.log("Checking auth redirect for path:", currentPath);
    
    if (currentPath.includes('login.html') || currentPath.includes('register.html')) {
      try {
        console.log("On auth page, checking if user is already authenticated");
        const { isAuthenticated, dashboard } = await this.checkAuthAndRedirect();
        if (isAuthenticated && dashboard) {
          console.log("User already authenticated, redirecting to:", dashboard);
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
      console.warn("Firebase services not available, setting up limited event listeners");
    }

    console.log("Setting up AuthService event listeners");
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const errorDiv = document.getElementById('error-message');
    const successDiv = document.getElementById('success-message');
    const forgotBtn = document.getElementById('forgot-password');

    if (loginForm) {
      console.log("Setting up login form handler");
      this.setupLoginForm(loginForm, errorDiv, successDiv);
    }
    
    if (registerForm) {
      console.log("Setting up register form handler");
      this.setupRegisterForm(registerForm, errorDiv);
    }
    
    if (forgotBtn) {
      console.log("Setting up forgot password handler");
      this.setupForgotPassword(forgotBtn, errorDiv, successDiv);
    }

    this.setupAuthStateMonitoring();
    this.setupSignOutButtons();
  }

  // Setup login form handler
  setupLoginForm(loginForm, errorDiv, successDiv) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      console.log("Login form submitted");
      
      if (errorDiv) errorDiv.classList.add('hidden');
      if (successDiv) successDiv.classList.add('hidden');

      const email = document.getElementById('email')?.value;
      const password = document.getElementById('password')?.value;
      const rememberMe = document.getElementById('remember-me')?.checked || false;

      if (!email || !password) {
        if (errorDiv) {
          errorDiv.textContent = "Please enter both email and password";
          errorDiv.classList.remove('hidden');
        }
        return;
      }

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
        console.error("Login form error:", error);
        if (errorDiv) {
          errorDiv.textContent = error?.message || "Login failed. Please try again.";
          errorDiv.classList.remove('hidden');
        }
      } finally {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
      }
    });
  }

  // Setup registration form handler
  setupRegisterForm(registerForm, errorDiv) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      console.log("Register form submitted");

      if (errorDiv) errorDiv.classList.add('hidden');

      const email = document.getElementById('email')?.value;
      const password = document.getElementById('password')?.value;
      const confirmPassword = document.getElementById('confirm-password')?.value;
      const role = document.getElementById('role')?.value || 'hunter';
      const name = document.getElementById('name')?.value || '';
      const phone = document.getElementById('phone')?.value || '';

      if (!email || !password) {
        if (errorDiv) {
          errorDiv.textContent = "Please enter both email and password";
          errorDiv.classList.remove('hidden');
        }
        return;
      }

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
      } finally {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
      }
    });
  }

  // Setup forgot password handler
  setupForgotPassword(forgotBtn, errorDiv, successDiv) {
    forgotBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      console.log("Forgot password clicked");
      
      const email = document.getElementById('email')?.value;

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

    console.log("Setting up auth state monitoring");
    this.firebaseServices.onAuthStateChanged(async (user) => {
      console.log("Auth state changed:", user ? user.uid : "signed out");
      
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
    console.log("Setting up sign out button handlers");
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('sign-out-btn') || 
          e.target.id === 'sign-out' || 
          e.target.closest('.sign-out-btn')) {
        e.preventDefault();
        console.log("Sign out button clicked");
        this.signOut().catch((error) => console.error("Sign out failed:", error));
      }
    });
  }

  // Get service status
  getStatus() {
    return {
      initialized: this.initialized,
      ready: this.ready,
      firebaseReady: this.isFirebaseReady(),
      hasStateManager: !!this.stateManager
    };
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
  console.log("Setting up AuthService auto-initialization");
  
  const initializeAuthService = () => {
    console.log("Initializing AuthService with available services");
    if (window.firebaseServices) {
      defaultAuthService.setFirebaseServices(window.firebaseServices);
    }
    if (window.state) {
      defaultAuthService.setStateManager(window.state);
    }
    defaultAuthService.init();
    window.authService = defaultAuthService;
    
    console.log("AuthService initialized and ready");
  };

  // Check if Firebase is already ready
  if (window.firebaseServices?.ready) {
    console.log("Firebase services already ready, initializing AuthService immediately");
    initializeAuthService();
  } else {
    console.log("Waiting for firebaseReady event to initialize AuthService");
    window.addEventListener('firebaseReady', () => {
      console.log("firebaseReady event received, initializing AuthService");
      // Small delay to ensure proper initialization order
      setTimeout(initializeAuthService, 50);
    }, { once: true });
  }

  // Listen for state manager ready event
  window.addEventListener('stateManagerReady', (e) => {
    console.log("stateManagerReady event received");
    if (defaultAuthService && e.detail?.stateManager) {
      defaultAuthService.setStateManager(e.detail.stateManager);
    }
  });
}

// Export for module usage
export default defaultAuthService;
export { AuthService };