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

  setFirebaseServices(firebaseServices) {
    this.firebaseServices = firebaseServices;
    this.checkReadiness();
    return this;
  }

  setStateManager(stateManager) {
    this.stateManager = stateManager;
    return this;
  }

  checkReadiness() {
    const wasReady = this.ready;
    this.ready = !!(this.firebaseServices &&
      this.firebaseServices.ready &&
      this.firebaseServices.auth &&
      this.firebaseServices.collections);
    if (!wasReady && this.ready && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('authServiceReady', { detail: { authService: this } }));
    }
    return this.ready;
  }

  isFirebaseReady() {
    return this.checkReadiness();
  }

  async waitForFirebase() {
    if (this.isFirebaseReady()) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve) => {
      const done = () => { resolve(); };
      const onReady = () => { if (this.isFirebaseReady()) { window.removeEventListener('firebaseReady', onReady); done(); } };
      if (typeof window !== 'undefined') {
        window.addEventListener('firebaseReady', onReady);
      }
      // fallback timeout
      setTimeout(() => {
        if (typeof window !== 'undefined') window.removeEventListener('firebaseReady', onReady);
        resolve();
      }, 12000);
    });

    return this.initPromise;
  }

  getDashboardRoute(role) {
    return this.dashboardRoutes[role] || this.dashboardRoutes.default;
  }

  // ---- Auth Core ----

  async signInWithEmailAndPassword(email, password, rememberMe = false) {
    await this.waitForFirebase();
    if (!this.isFirebaseReady()) throw new Error("Authentication service not available");

    try {
      await this.firebaseServices.setPersistence(rememberMe);
      const userCredential = await this.firebaseServices.signInWithEmailAndPassword(email, password);
      const uid = userCredential.user.uid;

      const userRef = this.firebaseServices.doc(this.firebaseServices.collections.users, uid);
      const userDoc = await this.firebaseServices.getDoc(userRef);

      if (!userDoc.exists()) {
        await this.firebaseServices.signOut();
        throw new Error("User data not found in Firestore.");
      }

      const userData = userDoc.data();
      const role = userData.role;
      const dashboard = this.getDashboardRoute(role);

      if (this.stateManager?.updateState) {
        this.stateManager.updateState({
          currentUser: { uid, ...userData },
          role
        });
      }

      return { user: userCredential.user, role, dashboard, userData };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async createUserWithEmailAndPassword(email, password, userData) {
    await this.waitForFirebase();
    if (!this.isFirebaseReady()) throw new Error("Authentication service not available");

    try {
      const cred = await this.firebaseServices.createUserWithEmailAndPassword(email, password);
      const uid = cred.user.uid;

      const completeUserData = {
        email,
        createdAt: this.firebaseServices.serverTimestamp(),
        ...userData
      };

      const userRef = this.firebaseServices.doc(this.firebaseServices.collections.users, uid);
      await this.firebaseServices.setDoc(userRef, completeUserData);

      if (this.stateManager?.updateState) {
        this.stateManager.updateState({
          currentUser: { uid, ...completeUserData },
          role: userData.role
        });
      }

      return { user: cred.user, role: userData.role, userData: completeUserData };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async checkAuthAndRedirect() {
    await this.waitForFirebase();
    if (!this.isFirebaseReady()) return { isAuthenticated: false };

    return new Promise((resolve) => {
      const unsubscribe = this.firebaseServices.onAuthStateChanged(this.firebaseServices.auth, async (user) => {
        unsubscribe?.();
        if (!user) return resolve({ isAuthenticated: false });

        try {
          const userRef = this.firebaseServices.doc(this.firebaseServices.collections.users, user.uid);
          const userDoc = await this.firebaseServices.getDoc(userRef);
          if (!userDoc.exists()) return resolve({ isAuthenticated: false });

          const userData = userDoc.data();
          const role = userData.role;
          const dashboard = this.getDashboardRoute(role);

          resolve({ isAuthenticated: true, dashboard, role, user, userData });
        } catch (error) {
          console.error(error);
          resolve({ isAuthenticated: false });
        }
      });
    });
  }

  async getCurrentUserRole() {
    await this.waitForFirebase();
    if (!this.isFirebaseReady()) return null;

    const user = this.firebaseServices.auth.currentUser;
    if (!user) return null;

    try {
      const userRef = this.firebaseServices.doc(this.firebaseServices.collections.users, user.uid);
      const userDoc = await this.firebaseServices.getDoc(userRef);
      return userDoc.exists() ? userDoc.data().role : null;
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  async isAuthenticated() {
    await this.waitForFirebase();
    if (!this.isFirebaseReady()) return false;
    return this.firebaseServices.auth.currentUser !== null;
  }

  async getCurrentUser() {
    await this.waitForFirebase();
    if (!this.isFirebaseReady()) return null;
    return this.firebaseServices.auth.currentUser;
  }

  async getCurrentUserData() {
    const user = await this.getCurrentUser();
    if (!user) return null;

    try {
      const userRef = this.firebaseServices.doc(this.firebaseServices.collections.users, user.uid);
      const userDoc = await this.firebaseServices.getDoc(userRef);
      return userDoc.exists() ? { uid: user.uid, ...userDoc.data() } : null;
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  async sendPasswordResetEmail(email) {
    await this.waitForFirebase();
    if (!this.isFirebaseReady()) throw new Error("Authentication service not available");
    try {
      return await this.firebaseServices.sendPasswordResetEmail(this.firebaseServices.auth, email);
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async signOut() {
    try {
      if (this.isFirebaseReady()) {
        await this.firebaseServices.signOut(this.firebaseServices.auth);
      }
    } catch (error) {
      console.error(error);
    }

    if (this.stateManager?.updateState) {
      this.stateManager.updateState({
        currentUser: null,
        role: "guest",
        favorites: []
      });
    }

    if (typeof window !== 'undefined') {
      window.location.replace('/');
    }
  }

  // ---- DOM Wiring ----

  init() {
    if (this.initialized || typeof document === 'undefined') return this;

    // Bind *immediately* to prevent native form submissions even if Firebase isn't ready yet.
    document.addEventListener('DOMContentLoaded', () => {
      this.bindCoreFormGuards();   // prevent query-string credential leaks
      this.setupEventListeners();  // wire full handlers (doesn't wait for Firebase)
      this.handleAuthRedirect();
    });

    this.initialized = true;
    return this;
  }

  // Prevent native submits & wire minimal UX guards right away
  bindCoreFormGuards() {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');

    const preventSubmit = (form) => {
      if (!form) return;
      form.addEventListener('submit', (e) => {
        // Always prevent native submission to avoid GET /login.html?email=...&password=...
        e.preventDefault();
      }, { capture: true });
    };

    preventSubmit(loginForm);
    preventSubmit(registerForm);
  }

  async handleAuthRedirect() {
    if (typeof window === 'undefined') return;

    const currentPath = window.location.pathname;
    if (currentPath.includes('login.html') || currentPath.includes('register.html')) {
      try {
        const { isAuthenticated, dashboard } = await this.checkAuthAndRedirect();
        if (isAuthenticated && dashboard) {
          window.location.replace(dashboard);
        }
      } catch (error) {
        console.error(error);
      }
    }
  }

  // Wire handlers (these do not block on Firebase; they call into auth when ready)
  setupEventListeners() {
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

  setupLoginForm(loginForm, errorDiv, successDiv) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      if (errorDiv) errorDiv.classList.add('hidden');
      if (successDiv) successDiv.classList.add('hidden');

      const email = document.getElementById('email')?.value?.trim();
      const password = document.getElementById('password')?.value;
      const rememberMe = document.getElementById('remember-me')?.checked || false;

      if (!email || !password) {
        if (errorDiv) {
          errorDiv.textContent = "Please enter both email and password.";
          errorDiv.classList.remove('hidden');
        }
        return;
      }

      const submitBtn = loginForm.querySelector('button[type="submit"]');
      const originalText = submitBtn?.textContent;
      if (submitBtn) { submitBtn.textContent = 'Signing in...'; submitBtn.disabled = true; }

      try {
        const { dashboard } = await this.signInWithEmailAndPassword(email, password, rememberMe);
        if (dashboard) window.location.replace(dashboard);
        else throw new Error("No dashboard route available.");
      } catch (error) {
        if (errorDiv) {
          errorDiv.textContent = error?.message || "Login failed. Please try again.";
          errorDiv.classList.remove('hidden');
        }
        console.error(error);
      } finally {
        if (submitBtn) { submitBtn.textContent = originalText; submitBtn.disabled = false; }
      }
    });
  }

  setupRegisterForm(registerForm, errorDiv) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      if (errorDiv) errorDiv.classList.add('hidden');

      const email = document.getElementById('email')?.value?.trim();
      const password = document.getElementById('password')?.value;
      const confirmPassword = document.getElementById('confirm-password')?.value;
      const role = document.getElementById('role')?.value || 'hunter';
      const name = document.getElementById('name')?.value || '';
      const phone = document.getElementById('phone')?.value || '';

      if (!email || !password) {
        if (errorDiv) {
          errorDiv.textContent = "Please enter both email and password.";
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
      const originalText = submitBtn?.textContent;
      if (submitBtn) { submitBtn.textContent = 'Creating account...'; submitBtn.disabled = true; }

      const userData = { role, name, phone };

      try {
        const { role: userRole } = await this.createUserWithEmailAndPassword(email, password, userData);
        const dashboard = this.getDashboardRoute(userRole);
        window.location.replace(dashboard);
      } catch (error) {
        if (errorDiv) {
          errorDiv.textContent = error?.message || "Failed to create account.";
          errorDiv.classList.remove('hidden');
        }
        console.error(error);
      } finally {
        if (submitBtn) { submitBtn.textContent = originalText; submitBtn.disabled = false; }
      }
    });
  }

  setupForgotPassword(forgotBtn, errorDiv, successDiv) {
    forgotBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      const email = document.getElementById('email')?.value?.trim();

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
        if (errorDiv) {
          errorDiv.textContent = "Failed to send password reset email.";
          errorDiv.classList.remove('hidden');
        }
        console.error(error);
      }
    });
  }

  setupAuthStateMonitoring() {
    if (!this.isFirebaseReady()) return;

    this.firebaseServices.onAuthStateChanged(this.firebaseServices.auth, async (user) => {
      const loginLink = document.querySelector('a[href="login.html"], a[href="/login.html"]');

      if (user && loginLink) {
        try {
          const role = await this.getCurrentUserRole();
          if (role) {
            loginLink.textContent = 'Dashboard';
            loginLink.href = this.getDashboardRoute(role);
          }
        } catch (error) {
          console.error(error);
        }
      } else if (!user && loginLink) {
        loginLink.textContent = 'Login';
        loginLink.href = '/login.html';
      }
    });
  }

  setupSignOutButtons() {
    document.addEventListener('click', (e) => {
      const isBtn = e.target?.classList?.contains('sign-out-btn') ||
                    e.target?.id === 'sign-out' ||
                    e.target?.closest?.('.sign-out-btn');
      if (isBtn) {
        e.preventDefault();
        this.signOut().catch(err => console.error(err));
      }
    });
  }

  getStatus() {
    return {
      initialized: this.initialized,
      ready: this.ready,
      firebaseReady: this.isFirebaseReady(),
      hasStateManager: !!this.stateManager
    };
  }
}

// Factory
export function createAuthService(firebaseServices = null, stateManager = null) {
  return new AuthService(firebaseServices, stateManager);
}

// Default instance w/ auto-init
const defaultAuthService = new AuthService();

if (typeof window !== 'undefined') {
  const initializeAuthService = () => {
    if (window.firebaseServices) defaultAuthService.setFirebaseServices(window.firebaseServices);
    if (window.state) defaultAuthService.setStateManager(window.state);
    defaultAuthService.init();
    window.authService = defaultAuthService;
  };

  if (window.firebaseServices?.ready) {
    initializeAuthService();
  } else {
    window.addEventListener('firebaseReady', () => {
      setTimeout(initializeAuthService, 50);
    }, { once: true });
  }

  window.addEventListener('stateManagerReady', (e) => {
    if (defaultAuthService && e.detail?.stateManager) {
      defaultAuthService.setStateManager(e.detail.stateManager);
    }
  });
}

export default defaultAuthService;
export { AuthService };
