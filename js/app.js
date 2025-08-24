// js/app.js
import firebaseServices from './firebase.js';
import state from './state.js';
import ui from './ui.js';

// ==============================
// App Controller Class
// ==============================
class AppController {
  constructor() {
    this.state = state;
    this.ui = ui;
    this.initialized = false;
    this.firebaseReady = false;
    this.authServiceReady = false;
    this.initializationAttempts = 0;
    this.maxInitializationAttempts = 3;
    this.serviceReadyPromise = null;
  }

  async init() {
    if (this.initialized) return;

    this.registerServiceWorker();
    this.initMobileMenu();
    this.ui.setStateManager(this.state);

    try {
      await this.ensureServicesReady();

      if (this.firebaseReady && this.authServiceReady) {
        if (!this.state.firebaseServices) {
          this.state.setFirebaseServices(firebaseServices);
        }
        await this.setupAuthListener();
        await this.state.initializeState();
      } else {
        await this.handleUserLogout();
      }
    } catch (err) {
      console.error(err);
      await this.handleUserLogout();

      if (this.initializationAttempts < this.maxInitializationAttempts) {
        this.initializationAttempts++;
        setTimeout(() => this.init(), 2000);
        return;
      }
    }

    this.initPageSpecificFunctionality();
    this.initialized = true;
  }

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      // Unregister for development
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (let registration of registrations) {
          registration.unregister();
        }
      });

      // Enable in production (uncomment to use)
      /*
      navigator.serviceWorker.register('/service-worker.js')
        .then(() => console.log('ServiceWorker registered'))
        .catch(err => console.error('ServiceWorker registration failed:', err));
      */
    }
  }

  initMobileMenu() {
    const mobileMenuButton = document.getElementById('mobile-menu-button');
    if (mobileMenuButton) {
      mobileMenuButton.addEventListener('click', () => this.toggleMobileMenu());
    }
  }

  toggleMobileMenu() {
    const mobileMenu = document.getElementById('mobile-menu');
    if (mobileMenu) mobileMenu.classList.toggle('hidden');
  }

  async ensureServicesReady() {
    if (this.serviceReadyPromise) return this.serviceReadyPromise;

    this.serviceReadyPromise = new Promise((resolve) => {
      this.checkServiceStates();
      if (this.firebaseReady && this.authServiceReady) return resolve();

      let resolved = false;
      const resolveOnce = () => { if (!resolved) { resolved = true; resolve(); } };

      const onFirebaseReady = () => {
        this.checkServiceStates();
        if (this.firebaseReady && this.authServiceReady) resolveOnce();
      };

      window.addEventListener('firebaseReady', onFirebaseReady);
      const interval = setInterval(() => {
        this.checkServiceStates();
        if (this.firebaseReady && this.authServiceReady) {
          window.removeEventListener('firebaseReady', onFirebaseReady);
          clearInterval(interval);
          resolveOnce();
        }
      }, 200);

      setTimeout(() => {
        window.removeEventListener('firebaseReady', onFirebaseReady);
        clearInterval(interval);
        this.checkServiceStates();
        resolveOnce();
      }, 12000);
    });

    return this.serviceReadyPromise;
  }

  checkServiceStates() {
    const wasFirebaseReady = this.firebaseReady;
    this.firebaseReady = !!(firebaseServices &&
                            firebaseServices.ready &&
                            firebaseServices.auth &&
                            firebaseServices.collections);

    const wasAuthServiceReady = this.authServiceReady;
    this.authServiceReady = !!(window.authService &&
                              typeof window.authService.isFirebaseReady === 'function' &&
                              window.authService.isFirebaseReady());

    if (wasFirebaseReady !== this.firebaseReady && !this.firebaseReady) {
      console.warn('Firebase not ready.');
    }
    if (wasAuthServiceReady !== this.authServiceReady && !this.authServiceReady) {
      console.warn('AuthService not ready.');
    }
  }

  async setupAuthListener() {
    if (!this.firebaseReady || !firebaseServices.auth) {
      await this.handleUserLogout();
      return;
    }

    try {
      firebaseServices.onAuthStateChanged(firebaseServices.auth, async (user) => {
        try {
          if (user) {
            await this.handleUserLogin(user);
          } else {
            await this.handleUserLogout();
          }
        } catch (err) {
          console.error(err);
          this.state.setError(err?.message || 'Authentication error');
        }
      });
    } catch (err) {
      console.error(err);
      await this.handleUserLogout();
    }
  }

  async handleUserLogin(user) {
    try {
      if (!this.authServiceReady) {
        this.state.updateState({
          currentUser: { uid: user.uid, email: user.email },
          role: 'guest',
        });
        return;
      }

      const userData = await window.authService.getCurrentUserData();
      if (userData) {
        this.state.updateState({
          currentUser: userData,
          role: userData.role || 'guest',
        });
      } else {
        this.state.updateState({
          currentUser: { uid: user.uid, email: user.email },
          role: 'guest',
        });
      }

      await this.state.loadListings();
      await this.state.loadFavorites();
    } catch (err) {
      console.error(err);
      this.state.setError('Error loading user data');
    }
  }

  async handleUserLogout() {
    this.state.updateState({
      currentUser: null,
      role: 'guest',
    });
    await this.state.initializeState();
  }

  initPageSpecificFunctionality() {
    const path = window.location.pathname;

    if (path.includes('browse.html')) {
      this.initBrowsePage();
    } else if (path.includes('bnb.html')) {
      this.initBnbPage();
    } else if (path.includes('house-detail.html')) {
      this.initHouseDetailPage();
    } else if (path.includes('dashboard-')) {
      this.initDashboardPage();
    }
  }

  initBrowsePage() {
    const locationFilter = document.getElementById('location-filter');
    const priceFilter = document.getElementById('price-filter');
    const typeFilter = document.getElementById('type-filter');
    const resetBtn = document.getElementById('reset-filters');

    if (locationFilter) {
      locationFilter.addEventListener('input', (e) => {
        const currentState = this.state.getState();
        const newFilters = { ...currentState.filters, location: e.target.value };
        this.state.updateState({ filters: newFilters });
        this.ui.renderListings(this.state.applyFilters());
      });
    }

    if (priceFilter) {
      priceFilter.addEventListener('change', (e) => {
        const [min, max] = e.target.value.split('-').map(Number);
        const currentState = this.state.getState();
        const newFilters = { ...currentState.filters, priceRange: [min || 0, max || Infinity] };
        this.state.updateState({ filters: newFilters });
        this.ui.renderListings(this.state.applyFilters());
      });
    }

    if (typeFilter) {
      typeFilter.addEventListener('change', (e) => {
        const currentState = this.state.getState();
        const newFilters = { ...currentState.filters, type: e.target.value };
        this.state.updateState({ filters: newFilters });
        this.ui.renderListings(this.state.applyFilters());
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        this.state.resetFilters();
        const currentState = this.state.getState();
        this.ui.renderListings(currentState.listings);
      });
    }

    this.state.subscribe(() => {
      this.ui.renderListings(this.state.applyFilters());
    });

    const currentState = this.state.getState();
    this.ui.renderListings(currentState.listings);
  }

  initBnbPage() {
    this.initBrowsePage();

    const amenitiesFilter = document.getElementById('amenities-filter');
    if (amenitiesFilter) {
      amenitiesFilter.addEventListener('change', (e) => {
        const selectedAmenities = Array.from(e.target.selectedOptions).map((opt) => opt.value);
        const currentState = this.state.getState();
        const newFilters = { ...currentState.filters, amenities: selectedAmenities };
        this.state.updateState({ filters: newFilters });
        this.ui.renderListings(this.state.applyFilters());
      });
    }
  }

  async initHouseDetailPage() {
    const listingId = new URLSearchParams(window.location.search).get('id');
    if (!listingId) {
      window.location.href = '/browse.html';
      return;
    }

    try {
      const currentState = this.state.getState();
      let listing = currentState.listings?.find((l) => l.id === listingId);

      if (!listing && this.authServiceReady) {
        listing = await this.fetchListingById(listingId);
        if (!listing) {
          window.location.href = '/browse.html';
          return;
        }

        this.state.updateState({
          listings: [...(currentState.listings || []), listing],
        });
      }

      if (listing) {
        this.ui.renderListingDetail(listing);
        this.setupBookingForm(listingId, listing.type);
        this.setupFavoriteButton(listingId);
      } else {
        window.location.href = '/browse.html';
      }
    } catch (err) {
      console.error(err);
      window.location.href = '/browse.html';
    }
  }

  async fetchListingById(listingId) {
    if (!this.authServiceReady) return null;

    try {
      // Try houses
      const houseDocRef = firebaseServices.doc(firebaseServices.collections.houses, listingId);
      const houseDoc = await firebaseServices.getDoc(houseDocRef);
      if (houseDoc.exists()) {
        return { id: houseDoc.id, ...houseDoc.data(), type: 'house' };
      }

      // Try bnbs
      const bnbDocRef = firebaseServices.doc(firebaseServices.collections.bnbs, listingId);
      const bnbDoc = await firebaseServices.getDoc(bnbDocRef);
      if (bnbDoc.exists()) {
        return { id: bnbDoc.id, ...bnbDoc.data(), type: 'bnb' };
      }

      return null;
    } catch (err) {
      console.error(err);
      return null;
    }
  }

  setupBookingForm(listingId, listingType) {
    const bookingForm = document.getElementById('booking-form');
    if (bookingForm) {
      bookingForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleBooking(listingId, listingType);
      });
    }
  }

  setupFavoriteButton(listingId) {
    const favoriteButton = document.getElementById('favorite-button');
    if (favoriteButton) {
      favoriteButton.addEventListener('click', () => {
        this.state.toggleFavorite(listingId);
        this.ui.updateFavoriteButton(listingId);
      });
    }
  }

  async handleBooking(listingId, listingType) {
    if (!this.authServiceReady) {
      alert('Please try again later.');
      return;
    }

    const currentState = this.state.getState();

    if (!currentState.currentUser) {
      alert('Please login to make a booking.');
      return;
    }

    const bookingForm = document.getElementById('booking-form');
    if (!bookingForm) return;

    try {
      this.ui.showLoading?.();

      const formData = new FormData(bookingForm);
      const bookingData = {
        listingId,
        listingType,
        userId: currentState.currentUser.uid,
        startDate: formData.get('start-date'),
        endDate: formData.get('end-date'),
        guests: parseInt(formData.get('guests')),
        specialRequests: formData.get('special-requests'),
        status: 'pending',
        createdAt: firebaseServices.serverTimestamp(),
      };

      const docRef = await firebaseServices.addDoc(firebaseServices.collections.bookings, bookingData);
      this.generateBookingReceipt({ id: docRef.id, ...bookingData });

      alert('Booking submitted successfully!');
      bookingForm.reset();
    } catch (err) {
      console.error(err);
      alert('Booking failed. Please try again.');
    } finally {
      this.ui.hideLoading?.();
    }
  }

  initDashboardPage() {
    // extend as needed
  }

  generateBookingReceipt(bookingData) {
    // extend as needed
    // intentionally minimal (noisy logs removed)
  }

  isReady() {
    return this.initialized && this.firebaseReady && this.authServiceReady;
  }

  getStatus() {
    return {
      initialized: this.initialized,
      firebaseReady: this.firebaseReady,
      authServiceReady: this.authServiceReady,
      isReady: this.isReady(),
    };
  }
}

// ==============================
// Initialize Application
// ==============================
const appController = new AppController();

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    appController.init().catch((err) => console.error(err));
  });
}

window.app = appController;

// Back-compat exports
export function toggleMobileMenu() { return appController.toggleMobileMenu(); }
export function waitForFirebase() { return appController.ensureServicesReady(); }
export function updateUIFromState() { return appController.ui.updateFromState(); }
export function initBrowsePage() { return appController.initBrowsePage(); }
export function initBnbPage() { return appController.initBnbPage(); }
export function initHouseDetailPage() { return appController.initHouseDetailPage(); }
export function initDashboardPage() { return appController.initDashboardPage(); }
export function handleBooking(listingId, listingType) { return appController.handleBooking(listingId, listingType); }
export function generateBookingReceipt(bookingData) { return appController.generateBookingReceipt(bookingData); }

export default appController;