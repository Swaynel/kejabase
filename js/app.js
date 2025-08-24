// js/app.js
// ==============================
// Full application orchestrator
// Integrates: firebaseServices, state.js, authService.js, ui.js
// Preserves all features: auth, role redirects, browse, bnb, house detail,
// bookings, favorites, receipts, dashboards, admin moderation.
// ==============================

import firebaseServices from './firebase.js';
import state from './state.js';
import authService from './authService.js';

// Defensive ui import: some versions exported `uiManager`, others default.
// Try to import named then default at runtime.
import * as uiModule from './ui.js';
const uiManager = uiModule.uiManager || uiModule.default || null;

// AppController
class AppController {
  constructor() {
    this.state = state;                    // defaultStateManager
    this.ui = uiManager;                   // uiManager instance (or null)
    this.firebase = firebaseServices;      // firebaseServices wrapper
    this.auth = authService;               // auth service
    this.initialized = false;
    this.firebaseReady = !!(this.firebase && this.firebase.ready);
    this.authReady = !!(this.auth && this.auth.isFirebaseReady && this.auth.isFirebaseReady());
    this.serviceReadyPromise = null;
    this.initAttempts = 0;
    this.maxInitAttempts = 3;
  }

  // Public init called on DOMContentLoaded
  async init() {
    if (this.initialized) return;

    this._wireMobileToggleShortcuts();
    this._wireNavSignOut();

    // attach state -> ui if available
    if (this.ui && typeof this.ui.setStateManager === 'function') {
      this.ui.setStateManager(this.state);
    }

    // Wait for firebase + auth service readiness
    try {
      await this.ensureServicesReady();

      // Give state the firebase services (if not already)
      if (!this.state.firebaseServices && this.firebase) {
        this.state.setFirebaseServices(this.firebase);
      }

      // Ensure auth service knows firebase + state
      if (this.auth && !this.auth.isFirebaseReady?.()) {
        this.auth.setFirebaseServices?.(this.firebase);
        this.auth.setStateManager?.(this.state);
      }

      // Wire auth listener and initialize app state
      await this.setupAuthListener();
      await this.state.initializeState();

      // Load page-specific features
      this.initPageSpecificFunctionality();

      // UI initialization if available
      if (this.ui && typeof this.ui.initialize === 'function') {
        this.ui.initialize();
        // ensure initial render
        if (typeof this.ui.updateUI === 'function') {
          this.ui.updateUI(this.state.getCurrentUser?.());
        }
      }

      this.initialized = true;
      console.info('[App] Initialized successfully.');
    } catch (err) {
      console.error('[App] Initialization failed:', err);
      // attempt fallback initialization
      if (this.initAttempts < this.maxInitAttempts) {
        this.initAttempts++;
        setTimeout(() => this.init(), 1500);
      } else {
        console.warn('[App] Max init attempts reached. Proceeding with degraded mode.');
        // proceed with offline/fallback state
        await this.state.initializeState();
        this.initPageSpecificFunctionality();
      }
    }
  }

  // Waits for firebaseReady + authServiceReady events (with timeout)
  ensureServicesReady() {
    if (this.serviceReadyPromise) return this.serviceReadyPromise;

    this.serviceReadyPromise = new Promise((resolve) => {
      // immediate check
      this._refreshReadyFlags();
      if (this.firebaseReady && this.authReady) return resolve();

      const onFirebase = () => {
        this._refreshReadyFlags();
        if (this.firebaseReady && this.authReady) finish();
      };
      const onAuth = () => {
        this._refreshReadyFlags();
        if (this.firebaseReady && this.authReady) finish();
      };

      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        window.removeEventListener('firebaseReady', onFirebase);
        window.removeEventListener('authServiceReady', onAuth);
        clearTimeout(timeout);
        resolve();
      };

      window.addEventListener('firebaseReady', onFirebase);
      window.addEventListener('authServiceReady', onAuth);

      const timeout = setTimeout(() => {
        // give up after 12s, still resolve so app can run offline/fallback
        console.warn('[App] service readiness timeout - proceeding anyway (degraded).');
        finish();
      }, 12000);
    });

    return this.serviceReadyPromise;
  }

  _refreshReadyFlags() {
    this.firebaseReady = !!(this.firebase && this.firebase.ready && this.firebase.auth && this.firebase.collections);
    try {
      this.authReady = !!(window.authService && typeof window.authService.isFirebaseReady === 'function' && window.authService.isFirebaseReady());
    } catch {
      this.authReady = !!(this.auth && this.auth.isFirebaseReady && this.auth.isFirebaseReady());
    }
  }

  // Auth listener uses firebaseServices.onAuthStateChanged (exposed in your wrapper)
  async setupAuthListener() {
    if (!this.firebase || !this.firebase.onAuthStateChanged) {
      console.warn('[App] firebase services missing onAuthStateChanged.');
      return;
    }

    // use the wrapper onAuthStateChanged to subscribe
    this.firebase.onAuthStateChanged(this.firebase.auth, async (user) => {
      try {
        if (user) {
          // load profile from Firestore
          const userRef = this.firebase.doc(this.firebase.collections.users, user.uid);
          const userDoc = await this.firebase.getDoc(userRef);
          const userData = userDoc.exists() ? userDoc.data() : { email: user.email };
          // update state
          this.state.updateState({ currentUser: { uid: user.uid, ...userData }, role: userData.role || 'guest' });
          // load dependent data
          await this.state.loadListings();
          await this.state.loadFavorites();
          // optionally redirect if on auth pages
          this._maybeRedirectFromAuthPage(userData.role);
          // update UI
          if (this.ui?.updateUI) this.ui.updateUI(this.state.getCurrentUser?.());
        } else {
          // logged out
          this.state.updateState({ currentUser: null, role: 'guest', favorites: [] });
          // if on dashboard pages, redirect to login
          this._maybeRedirectToLoginIfProtected();
          if (this.ui?.updateUI) this.ui.updateUI(null);
        }
      } catch (err) {
        console.error('[App] Auth change handler error:', err);
      }
    });
  }

  // If user is on login/register and already authenticated, redirect them
  _maybeRedirectFromAuthPage(role) {
    try {
      const path = window.location.pathname;
      if (path.includes('login.html') || path.includes('register.html')) {
        const route = this.auth.getDashboardRoute?.(role) || this._defaultDashboardForRole(role);
        if (route) this._safeReplace(route);
      }
    } catch (err) { /* ignore */ }
  }

  // If unauthenticated on dashboard pages, redirect to login with next param
  _maybeRedirectToLoginIfProtected() {
    try {
      const path = window.location.pathname;
      if (path.includes('dashboard-')) {
        const next = encodeURIComponent(window.location.pathname + (window.location.search || ''));
        this._safeReplace(`/login.html?next=${next}`);
      }
    } catch (err) { /* ignore */ }
  }

  // Page-specific initialization
  initPageSpecificFunctionality() {
    const path = window.location.pathname || '';

    // Global: mobile menu toggle (also used on auth pages)
    this._wireMobileMenuToggle();

    if (path.includes('browse.html')) {
      this.initBrowsePage();
    } else if (path.includes('bnb.html')) {
      this.initBnbPage();
    } else if (path.includes('house-detail.html')) {
      this.initHouseDetailPage();
    } else if (path.includes('booking.html')) {
      this.initBookingPage();
    } else if (path.includes('dashboard-admin.html')) {
      this.initAdminDashboard();
    } else if (path.includes('dashboard-bnb.html') || path.includes('dashboard-provider.html') || path.includes('dashboard-hunter.html')) {
      this.initDashboardPage();
    } else if (path.includes('login.html') || path.includes('register.html')) {
      // auth pages are mostly handled by authService
      // ensure ui updates if present
      if (this.ui?.updateUI) this.ui.updateUI(this.state.getCurrentUser?.());
    }

    // always init recent-activity or other common modules if present
    this.initCommonWidgets();
  }

  // ---------------------------
  // Browse page
  // ---------------------------
  initBrowsePage() {
    const root = document.getElementById('browse-root') || document.querySelector('[data-page="browse"]');
    if (!root) return;

    // initial render using state.listings (state.loadListings was called earlier)
    const listings = this.state.getState().listings || [];
    if (this.ui?.renderListings) {
      this.ui.renderListings(listings);
    } else {
      this._renderListingsFallback(listings);
    }

    // wiring filters (if elements exist)
    const locationInput = document.getElementById('location-filter');
    const priceSelect = document.getElementById('price-filter');
    const typeSelect = document.getElementById('type-filter');
    const resetBtn = document.getElementById('reset-filters');
    const searchInput = document.getElementById('search-input');

    if (locationInput) {
      locationInput.addEventListener('input', (e) => {
        const filters = { ...this.state.getState().filters, location: e.target.value };
        this.state.updateState({ filters });
        this._applyAndRenderFilters();
      });
    }
    if (priceSelect) {
      priceSelect.addEventListener('change', (e) => {
        const [min, max] = (e.target.value || '0-Infinity').split('-').map(v => (v === 'Infinity' ? Infinity : Number(v)));
        const filters = { ...this.state.getState().filters, priceRange: [min || 0, max || Infinity] };
        this.state.updateState({ filters });
        this._applyAndRenderFilters();
      });
    }
    if (typeSelect) {
      typeSelect.addEventListener('change', (e) => {
        const filters = { ...this.state.getState().filters, type: e.target.value };
        this.state.updateState({ filters });
        this._applyAndRenderFilters();
      });
    }
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        this.state.resetFilters();
        this._applyAndRenderFilters();
      });
    }
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const results = this.state.searchListings(e.target.value);
        if (this.ui?.renderListings) this.ui.renderListings(results);
        else this._renderListingsFallback(results);
      });
    }

    // subscribe to state changes to re-render listings
    this.state.subscribe((s) => {
      const filtered = this.state.applyFilters();
      if (this.ui?.renderListings) this.ui.renderListings(filtered);
      else this._renderListingsFallback(filtered);
    });
  }

  // ---------------------------
  // BnB page
  // ---------------------------
  initBnbPage() {
    const root = document.getElementById('bnb-root') || document.querySelector('[data-page="bnb"]');
    if (!root) return;

    // show bnb-specific filters (amenities)
    if (this.ui?.renderListings) {
      const allListings = this.state.getState().listings || [];
      const bnbs = allListings.filter(l => l.type === 'bnb' || l.type === 'bnb'); // conservative
      this.ui.renderListings(bnbs);
    }

    const amenitiesSelect = document.getElementById('amenities-filter');
    if (amenitiesSelect) {
      amenitiesSelect.addEventListener('change', (e) => {
        const selected = Array.from(e.target.selectedOptions).map(o => o.value);
        const filters = { ...this.state.getState().filters, amenities: selected };
        this.state.updateState({ filters });
        this._applyAndRenderFilters();
      });
    }

    // subscribe
    this.state.subscribe(() => {
      this._applyAndRenderFilters();
    });
  }

  // ---------------------------
  // House detail page
  // ---------------------------
  async initHouseDetailPage() {
    const root = document.getElementById('house-detail-root') || document.querySelector('[data-page="house-detail"]');
    if (!root) return;

    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');

    let listing = (this.state.getState().listings || []).find(l => l.id === id);

    if (!listing && this.authReady) {
      // try to fetch by id from houses or bnbs
      listing = await this.fetchListingById(id);
      if (listing) {
        // append to state listings for future use
        const current = this.state.getState().listings || [];
        this.state.updateState({ listings: [...current, listing] });
      }
    }

    if (!listing) {
      console.warn('[App] Listing not found, redirecting to browse.');
      window.location.href = '/browse.html';
      return;
    }

    // render details
    if (this.ui?.renderListingDetail) this.ui.renderListingDetail(listing);
    else this._renderListingDetailFallback(listing);

    // wire favorite button
    const favBtn = document.getElementById('favorite-button');
    if (favBtn) {
      favBtn.addEventListener('click', async () => {
        await this.state.toggleFavorite(listing.id);
        if (this.ui?.updateFavoriteButton) this.ui.updateFavoriteButton(listing.id);
      });
    }

    // wire booking form if present
    this.setupBookingForm(listing.id, listing.type);
  }

  // ---------------------------
  // Booking page
  // ---------------------------
  initBookingPage() {
    const root = document.getElementById('booking-root') || document.querySelector('[data-page="booking"]');
    if (!root) return;

    // if booking data stored in state, render it
    const currentBooking = this.state.getState().booking;
    if (currentBooking && this.ui?.renderBookingForm) {
      this.ui.renderBookingForm(currentBooking);
    }

    // wire submit
    const form = document.getElementById('booking-form');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this._handleBookingSubmit(form);
      });
    }
  }

  async _handleBookingSubmit(form) {
    const formData = new FormData(form);
    const listingId = formData.get('listingId') || this.state.getState().booking?.id;
    const start = formData.get('start-date');
    const end = formData.get('end-date');
    const guests = Number(formData.get('guests') || 1);

    if (!listingId) { alert('Invalid listing'); return; }

    if (!this.authReady || !this.state.getState().currentUser) {
      alert('Please login to make a booking.');
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      this._safeReplace(`/login.html?next=${next}`);
      return;
    }

    try {
      const booking = {
        listingId,
        userId: this.state.getState().currentUser.uid,
        startDate: start,
        endDate: end,
        guests,
        specialRequests: formData.get('special-requests') || '',
        status: 'pending',
        createdAt: this.firebase.serverTimestamp ? this.firebase.serverTimestamp() : this.firebase.toTimestamp(new Date())
      };

      const docRef = await this.firebase.addDoc(this.firebase.collections.bookings, booking);
      // optionally create receipt in state or display
      if (this.ui?.showToast) this.ui.showToast('Booking submitted successfully');
      form.reset();
      // Update local booking list if needed
      const bookings = this.state.getState().bookings || [];
      this.state.updateState({ bookings: [...bookings, { id: docRef.id, ...booking }] });
    } catch (err) {
      console.error('[App] Booking failed:', err);
      alert('Booking failed. Please try again.');
    }
  }

  setupBookingForm(listingId, listingType) {
    const bookingForm = document.getElementById('booking-form');
    if (!bookingForm) return;
    // pre-fill listingId
    const hidden = bookingForm.querySelector('input[name="listingId"]');
    if (hidden) hidden.value = listingId;
    bookingForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this._handleBookingSubmit(bookingForm);
    });
  }

  // ---------------------------
  // Dashboard pages (admin/provider/bnb/hunter)
  // ---------------------------
  async initDashboardPage() {
    const root = document.getElementById('dashboard-root') || document.querySelector('[data-page^="dashboard"]');
    if (!root) return;

    // enforce role guard if auth service available
    try {
      const path = window.location.pathname;
      let requiredRole = null;
      if (path.includes('dashboard-admin')) requiredRole = 'admin';
      else if (path.includes('dashboard-bnb')) requiredRole = 'bnb';
      else if (path.includes('dashboard-provider')) requiredRole = 'provider';
      else if (path.includes('dashboard-hunter')) requiredRole = 'hunter';

      if (requiredRole && this.auth) {
        const allowed = await this.auth.enforceRoleGuard(requiredRole);
        if (!allowed) return; // auth service will redirect
      }
    } catch (err) {
      console.error('[App] Dashboard role guard failed:', err);
    }

    // render dashboard widgets via ui
    if (this.ui?.renderDashboard) {
      const s = this.state.getState();
      this.ui.renderDashboard(s.role, s);
    } else {
      // fallback small summary
      const stats = this.state.getListingStats ? this.state.getListingStats() : {};
      const el = document.getElementById('dashboard-stats');
      if (el) el.innerText = `Listings: ${stats.total || 0}, Houses: ${stats.house || 0}, BnBs: ${stats.bnb || 0}`;
    }

    // wire admin actions (reports moderation)
    if (document.getElementById('moderation-list')) {
      this._loadPendingReports();
    }
  }

  // Admin dashboard: load pending reports
  async _loadPendingReports() {
    try {
      const snapshot = await this.firebase.getDocs(
        this.firebase.query(this.firebase.collections.reports, this.firebase.where('status', '==', 'pending'))
      );
      const reports = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      if (this.ui?.renderReports) this.ui.renderReports(reports);
      // else fallback
      const el = document.getElementById('moderation-list');
      if (el) el.innerHTML = reports.map(r => `<div>${r.type} - ${r.details}</div>`).join('');
    } catch (err) {
      console.error('[App] Load reports failed:', err);
    }
  }

  // Admin: quick stats loader for dashboard cards
  async loadAdminStats() {
    try {
      const usersSnap = await this.firebase.getDocs(this.firebase.collections.users);
      const housesSnap = await this.firebase.getDocs(this.firebase.collections.houses);
      const bnbsSnap = await this.firebase.getDocs(this.firebase.collections.bnbs);
      const pendingReportsSnap = await this.firebase.getDocs(
        this.firebase.query(this.firebase.collections.reports, this.firebase.where('status', '==', 'pending'))
      );

      document.getElementById('total-users')?.innerText = usersSnap.size;
      document.getElementById('total-listings')?.innerText = housesSnap.size + bnbsSnap.size;
      document.getElementById('pending-reports')?.innerText = pendingReportsSnap.size;

      // revenue placeholder - extend with bookings summation if you store pricing in bookings/listings
      document.getElementById('total-revenue')?.innerText = '$' + (this._calcRevenueEstimate() || '0');
    } catch (err) {
      console.error('[App] loadAdminStats error:', err);
    }
  }

  _calcRevenueEstimate() {
    // naive placeholder: sum booking.price if available
    const bookings = this.state.getState().bookings || [];
    return bookings.reduce((acc, b) => acc + (b.amount || 0), 0);
  }

  // ---------------------------
  // Utilities
  // ---------------------------
  async fetchListingById(listingId) {
    if (!this.firebase) return null;
    try {
      // try houses
      const houseRef = this.firebase.doc(this.firebase.collections.houses, listingId);
      const houseDoc = await this.firebase.getDoc(houseRef);
      if (houseDoc.exists()) return { id: houseDoc.id, ...houseDoc.data(), type: 'house' };

      // try bnbs
      const bnbRef = this.firebase.doc(this.firebase.collections.bnbs, listingId);
      const bnbDoc = await this.firebase.getDoc(bnbRef);
      if (bnbDoc.exists()) return { id: bnbDoc.id, ...bnbDoc.data(), type: 'bnb' };

      return null;
    } catch (err) {
      console.error('[App] fetchListingById failed:', err);
      return null;
    }
  }

  _safeReplace(path) {
    try { window.location.replace(path); } catch { window.location.href = path; }
  }

  _defaultDashboardForRole(role) {
    const map = { admin: '/dashboard-admin.html', bnb: '/dashboard-bnb.html', provider: '/dashboard-provider.html', hunter: '/browse.html' };
    return map[role] || '/';
  }

  // fallback renderer when uiManager not present
  _renderListingsFallback(listings) {
    const container = document.getElementById('listings') || document.querySelector('.listings');
    if (!container) return;
    container.innerHTML = listings.map(l => `
      <article class="p-4 border rounded mb-3">
        <h3 class="font-bold">${l.title || l.name || 'Untitled'}</h3>
        <p>${l.location || ''} · ${l.price ? ('$' + l.price) : ''}</p>
        <a href="/house-detail.html?id=${l.id}" class="text-indigo-600">View</a>
      </article>
    `).join('');
  }

  _renderListingDetailFallback(listing) {
    const el = document.getElementById('listing-detail') || document.querySelector('.listing-detail');
    if (!el) return;
    el.innerHTML = `
      <h1 class="text-2xl font-bold">${listing.title || listing.name}</h1>
      <p>${listing.description || ''}</p>
      <p>Location: ${listing.location || '—'}</p>
      <p>Price: ${listing.price ? ('$' + listing.price) : '—'}</p>
    `;
  }

  // common widget initialization (recent activity etc.)
  initCommonWidgets() {
    // recent activity might be present on many pages
    const recentRoot = document.getElementById('recent-activity') || document.querySelector('.recent-activity');
    if (recentRoot && this.ui?.renderRecentActivity) {
      // load recent activity from reports/bookings
      (async () => {
        try {
          const bookingsSnap = await this.firebase.getDocs(this.firebase.collections.bookings);
          const recent = bookingsSnap.docs.slice(-10).reverse().map(d => ({ id: d.id, ...d.data() }));
          this.ui.renderRecentActivity(recent);
        } catch (err) {
          console.error('[App] load recent activity failed:', err);
        }
      })();
    }
  }

  // mobile menu helpers
  _wireMobileMenuToggle() {
    const btn = document.getElementById('mobile-menu-button');
    const menu = document.getElementById('mobile-menu');
    if (!btn || !menu) return;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      menu.classList.toggle('hidden');
    });
  }

  _wireMobileToggleShortcuts() {
    // For pages that don't include app.js but do include authService (login/register),
    // authService also wires mobile toggle; this is a no-op if duplicate.
    this._wireMobileMenuToggle();
  }

  _wireNavSignOut() {
    // Delegated sign-out handling for elements with id="sign-out" or class "sign-out-btn"
    document.addEventListener('click', (e) => {
      const target = e.target;
      if (!target) return;
      if (target.id === 'sign-out' || target.closest('.sign-out-btn')) {
        e.preventDefault();
        // use auth service to sign out if available (it will update state)
        if (this.auth && typeof this.auth.signOut === 'function') {
          this.auth.signOut().catch(err => console.error('[App] signOut failed:', err));
        } else if (this.firebase && this.firebase.signOut) {
          this.firebase.signOut(this.firebase.auth).catch(err => console.error('[App] signOut failed:', err));
          this._safeReplace('/');
        } else {
          this._safeReplace('/');
        }
      }
    });
  }
}

// Auto-init on DOMContentLoaded
const app = new AppController();
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    app.init().catch(err => console.error('[App] init error', err));
  });
}

// Expose for debugging & back-compat
window.app = app;
export default app;
