// js/authService.js
// ==============================
// Modular Authentication Service (full)
// - Preserves your features
// - Adds role guard, smarter redirects, mobile-menu toggle on auth pages
// - Works with your firebaseServices + state.js patterns
// ==============================

class AuthService {
  constructor(firebaseServices = null, stateManager = null) {
    this.firebaseServices = firebaseServices;
    this.stateManager = stateManager;

    this.initialized = false;
    this.ready = false;
    this.initPromise = null;

    // Centralized dashboard routes
    this.dashboardRoutes = {
      admin: '/dashboard-admin.html',
      bnb: '/dashboard-bnb.html',
      provider: '/dashboard-provider.html',
      hunter: '/dashboard-hunter.html',
      default: '/'
    };
  }

  // ----------------------------
  // Wiring
  // ----------------------------
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
    this.ready = !!(
      this.firebaseServices &&
      this.firebaseServices.ready &&
      this.firebaseServices.auth &&
      this.firebaseServices.collections &&
      typeof this.firebaseServices.onAuthStateChanged === 'function'
    );
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
      const done = () => resolve();
      const onReady = () => {
        if (this.isFirebaseReady()) {
          window.removeEventListener('firebaseReady', onReady);
          done();
        }
      };
      if (typeof window !== 'undefined') {
        window.addEventListener('firebaseReady', onReady);
      }
      setTimeout(() => {
        if (typeof window !== 'undefined') window.removeEventListener('firebaseReady', onReady);
        resolve();
      }, 12000);
    });

    return this.initPromise;
  }

  // ----------------------------
  // Helpers
  // ----------------------------
  getDashboardRoute(role) {
    return this.dashboardRoutes[role] || this.dashboardRoutes.default;
  }

  toAbsPath(path) {
    // Accepts "/x.html" or "x.html" and returns an absolute path
    if (!path) return '/';
    return path.startsWith('/') ? path : `/${path}`;
  }

  safeReplace(path) {
    try {
      window.location.replace(this.toAbsPath(path));
    } catch {
      window.location.href = this.toAbsPath(path);
    }
  }

  getQueryParam(name) {
    try {
      const url = new URL(window.location.href);
      return url.searchParams.get(name);
    } catch {
      return null;
    }
  }

  buildNextParam() {
    try {
      const { pathname, search, hash } = window.location;
      const full = `${pathname}${search || ''}${hash || ''}`;
      return encodeURIComponent(full);
    } catch {
      return encodeURIComponent('/');
    }
  }

  postAuthRedirect(role) {
    // Prefer ?next=... if present, otherwise route by role
    const next = this.getQueryParam('next');
    const fallback = this.getDashboardRoute(role);

    // Minimal sanitization: prevent navigating to external protocol origins
    if (next && /^\/[^\s]*$/.test(next)) {
      // If next is an auth page, ignore and go to dashboard
      if (next.includes('login.html') || next.includes('register.html')) {
        return fallback;
      }
      return next;
    }
    return fallback;
  }

  // ----------------------------
  // Core Auth API (Firestore-backed profile)
  // ----------------------------
  async signInWithEmailAndPassword(email, password, rememberMe = false) {
    await this.waitForFirebase();
    if (!this.isFirebaseReady()) throw new Error("Authentication service not available");

    try {
      // Persistence via your wrapper (falls back if not provided)
      if (typeof this.firebaseServices.setPersistence === 'function') {
        await this.firebaseServices.setPersistence(rememberMe);
      }

      const userCredential = await this.firebaseServices.signInWithEmailAndPassword(email, password);
      const uid = userCredential.user.uid;

      // Load Firestore profile
      const userRef = this.firebaseServices.doc(this.firebaseServices.collections.users, uid);
      const userDoc = await this.firebaseServices.getDoc(userRef);

      if (!userDoc.exists()) {
        await this.firebaseServices.signOut?.();
        throw new Error("User data not found in Firestore.");
      }

      const userData = userDoc.data();
      const role = userData.role;
      const redirect = this.postAuthRedirect(role);

      // Update app state
      this.stateManager?.updateState?.({
        currentUser: { uid, ...userData },
        role
      });

      return { user: userCredential.user, role, dashboard: redirect, userData };
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

      // Update state
      this.stateManager?.updateState?.({
        currentUser: { uid, ...completeUserData },
        role: completeUserData.role || 'hunter'
      });

      return { user: cred.user, role: completeUserData.role, userData: completeUserData };
    } catch (error) {
      console.error(error);
      throw error;
    }
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

  async getCurrentUserRole() {
    const data = await this.getCurrentUserData();
    return data?.role || null;
  }

  async isAuthenticated() {
    await this.waitForFirebase();
    if (!this.isFirebaseReady()) return false;
    return this.firebaseServices.auth.currentUser !== null;
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

    this.stateManager?.updateState?.({
      currentUser: null,
      role: "guest",
      favorites: []
    });

    // Always return to home after sign-out
    this.safeReplace('/');
  }

  // ----------------------------
  // Role Guard (per-page protection)
  // ----------------------------
  /**
   * enforceRoleGuard("admin") or enforceRoleGuard(["provider", "bnb"])
   * - Not logged in -> redirect to /login.html?next=<current>
   * - Wrong role     -> redirect to their correct dashboard
   */
  async enforceRoleGuard(requiredRoleOrRoles) {
    await this.waitForFirebase();
    const requiredRoles = Array.isArray(requiredRoleOrRoles)
      ? requiredRoleOrRoles
      : [requiredRoleOrRoles];

    const user = await this.getCurrentUser();
    if (!user) {
      const next = this.buildNextParam();
      this.safeReplace(`/login.html?next=${next}`);
      return false;
    }

    try {
      const userData = await this.getCurrentUserData();
      const role = userData?.role;
      if (!role) throw new Error("Missing role on user.");

      if (!requiredRoles.includes(role)) {
        this.safeReplace(this.getDashboardRoute(role));
        return false;
      }

      return true;
    } catch (err) {
      console.error("Role guard error:", err);
      await this.signOut();
      return false;
    }
  }

  // ----------------------------
  // Page bootstrap & redirects
  // ----------------------------
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
          const dashboard = this.postAuthRedirect(role);

          resolve({ isAuthenticated: true, dashboard, role, user, userData });
        } catch (error) {
          console.error(error);
          resolve({ isAuthenticated: false });
        }
      });
    });
  }

  async handleAuthRedirect() {
    if (typeof window === 'undefined') return;

    const path = window.location.pathname;
    if (path.includes('login.html') || path.includes('register.html')) {
      try {
        const { isAuthenticated, dashboard } = await this.checkAuthAndRedirect();
        if (isAuthenticated && dashboard) {
          this.safeReplace(dashboard);
        }
      } catch (error) {
        console.error(error);
      }
    }
  }

  // ----------------------------
  // DOM bindings (forms + UX)
  // ----------------------------
  init() {
    if (this.initialized || typeof document === 'undefined') return this;

    document.addEventListener('DOMContentLoaded', () => {
      // Always guard forms early (prevents GET submits with creds)
      this.bindCoreFormGuards();

      // Wire form handlers, forgot password, navbar state, signout buttons
      this.setupEventListeners();

      // Enable mobile menu on auth pages (login/register) without app.js
      this.setupMobileMenuToggle();

      // If already logged in, kick off redirects away from auth pages
      this.handleAuthRedirect();
    });

    this.initialized = true;
    return this;
  }

  bindCoreFormGuards() {
    const stopNativeSubmit = (form) => {
      if (!form) return;
      form.addEventListener('submit', (e) => e.preventDefault(), { capture: true });
    };
    stopNativeSubmit(document.getElementById('login-form'));
    stopNativeSubmit(document.getElementById('register-form'));
  }

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

      errorDiv?.classList.add('hidden');
      successDiv?.classList.add('hidden');

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
        if (!dashboard) throw new Error("No dashboard route available.");
        this.safeReplace(dashboard);
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
      errorDiv?.classList.add('hidden');

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
        const { role: createdRole } = await this.createUserWithEmailAndPassword(email, password, userData);
        const redirect = this.postAuthRedirect(createdRole);
        this.safeReplace(redirect);
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
        successDiv && (successDiv.textContent = "Password reset email sent!", successDiv.classList.remove('hidden'));
        errorDiv?.classList.add('hidden');
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

  setupMobileMenuToggle() {
    // Provide a lightweight mobile-menu toggle for pages that
    // don’t include app.js (e.g., login/register).
    const btn = document.getElementById('mobile-menu-button');
    const menu = document.getElementById('mobile-menu');
    if (!btn || !menu) return;
    btn.addEventListener('click', () => {
      menu.classList.toggle('hidden');
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

// Default instance w/ auto-init + window glue
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
