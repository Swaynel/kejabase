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
  }

  // Initialize the application
  async init() {
    if (this.initialized) return;
    
    // Register service worker
    this.registerServiceWorker();
    
    // Set up mobile menu
    this.initMobileMenu();
    
    // Connect UI to state
    this.ui.setStateManager(this.state);
    
    try {
      // Wait for Firebase and AuthService to be ready
      await this.waitForServices();
      
      // Set Firebase services for state
      this.state.setFirebaseServices(firebaseServices);
      
      // Set up auth listener
      await this.setupAuthListener();
      
      // Initialize state
      await this.state.initializeState();
      
    } catch (err) {
      console.error("Error during app initialization:", err);
      // Continue initialization with guest state
      await this.handleUserLogout();
    }
    
    // Initialize page-specific functionality
    this.initPageSpecificFunctionality();
    
    this.initialized = true;
  }

  // Register service worker
  registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      // Unregister Service Worker for development
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (let registration of registrations) {
          registration.unregister();
          console.log("Service Worker unregistered for development:", registration);
        }
      });

      // Enable in production
      /*
      navigator.serviceWorker.register("/service-worker.js")
        .then(() => console.log("ServiceWorker registered"))
        .catch(err => console.error("ServiceWorker registration failed:", err));
      */
    }
  }

  // Initialize mobile menu
  initMobileMenu() {
    const mobileMenuButton = document.getElementById("mobile-menu-button");
    if (mobileMenuButton) {
      mobileMenuButton.addEventListener("click", () => this.toggleMobileMenu());
    }
  }

  // Toggle mobile menu
  toggleMobileMenu() {
    const mobileMenu = document.getElementById("mobile-menu");
    if (mobileMenu) {
      mobileMenu.classList.toggle("hidden");
    }
  }

  // Wait for Firebase and AuthService to be ready
  async waitForServices() {
    return new Promise((resolve) => {
      if (firebaseServices.ready && window.authService?.isFirebaseReady()) {
        console.log("Firebase and AuthService ready, proceeding with app initialization");
        resolve();
        return;
      }

      console.log("Waiting for firebaseReady event in app.js");
      const onFirebaseReady = () => {
        if (window.authService?.isFirebaseReady()) {
          console.log("firebaseReady event received and AuthService ready in app.js");
          window.removeEventListener("firebaseReady", onFirebaseReady);
          resolve();
        }
      };
      window.addEventListener("firebaseReady", onFirebaseReady, { once: true });

      // Polling fallback
      const checkInterval = setInterval(() => {
        if (firebaseServices.ready && window.authService?.isFirebaseReady()) {
          console.log("Firebase and AuthService became ready via interval check");
          clearInterval(checkInterval);
          window.removeEventListener("firebaseReady", onFirebaseReady);
          resolve();
        }
      }, 100);

      // Timeout after 10 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        window.removeEventListener("firebaseReady", onFirebaseReady);
        console.warn("Firebase or AuthService initialization timeout in app.js");
        resolve(); // Proceed without Firebase to avoid blocking
      }, 10000);
    });
  }

  // Set up Firebase auth listener
  async setupAuthListener() {
    if (!firebaseServices.auth || !window.authService?.isFirebaseReady()) {
      console.warn("Firebase auth or AuthService not available, setting guest state");
      await this.handleUserLogout();
      return;
    }

    firebaseServices.auth.onAuthStateChanged(async (user) => {
      try {
        if (user) {
          await this.handleUserLogin(user);
        } else {
          await this.handleUserLogout();
        }
      } catch (err) {
        console.error("Auth state change error:", err);
        this.state.setError(err.message || "Authentication error");
      }
    });
  }

  // Handle user login
  async handleUserLogin(user) {
    try {
      if (!window.authService?.isFirebaseReady()) {
        console.warn("AuthService not ready, setting guest state");
        this.state.updateState({
          currentUser: { uid: user.uid, email: user.email },
          role: "guest"
        });
        return;
      }

      const userData = await window.authService.getCurrentUserData();
      if (userData) {
        this.state.updateState({
          currentUser: userData,
          role: userData.role || "guest"
        });
      } else {
        console.warn("User document not found for:", user.uid);
        this.state.updateState({
          currentUser: { uid: user.uid, email: user.email },
          role: "guest"
        });
      }
      
      // Load user-specific data
      await this.state.initializeState();
    } catch (err) {
      console.error("Error loading user data:", err);
      this.state.setError("Error loading user data");
    }
  }

  // Handle user logout
  async handleUserLogout() {
    this.state.updateState({
      currentUser: null,
      role: "guest"
    });
    
    // Initialize with public data only
    await this.state.initializeState();
  }

  // Initialize page-specific functionality
  initPageSpecificFunctionality() {
    const path = window.location.pathname;
    
    if (path.includes("browse.html")) {
      this.initBrowsePage();
    } else if (path.includes("bnb.html")) {
      this.initBnbPage();
    } else if (path.includes("house-detail.html")) {
      this.initHouseDetailPage();
    } else if (path.includes("dashboard-")) {
      this.initDashboardPage();
    }
  }

  // Browse page initialization
  initBrowsePage() {
    const locationFilter = document.getElementById("location-filter");
    const priceFilter = document.getElementById("price-filter");
    const typeFilter = document.getElementById("type-filter");
    const resetBtn = document.getElementById("reset-filters");

    if (locationFilter) {
      locationFilter.addEventListener("input", (e) => {
        const currentState = this.state.getState();
        const newFilters = { ...currentState.filters, location: e.target.value };
        this.state.updateState({ filters: newFilters });
        this.ui.renderListings(this.state.applyFilters());
      });
    }

    if (priceFilter) {
      priceFilter.addEventListener("change", (e) => {
        const [min, max] = e.target.value.split("-").map(Number);
        const currentState = this.state.getState();
        const newFilters = { ...currentState.filters, priceRange: [min || 0, max || Infinity] };
        this.state.updateState({ filters: newFilters });
        this.ui.renderListings(this.state.applyFilters());
      });
    }

    if (typeFilter) {
      typeFilter.addEventListener("change", (e) => {
        const currentState = this.state.getState();
        const newFilters = { ...currentState.filters, type: e.target.value };
        this.state.updateState({ filters: newFilters });
        this.ui.renderListings(this.state.applyFilters());
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        this.state.resetFilters();
        const currentState = this.state.getState();
        this.ui.renderListings(currentState.listings);
      });
    }

    // Initial render
    const currentState = this.state.getState();
    this.ui.renderListings(currentState.listings);
  }

  // BnB page initialization
  initBnbPage() {
    this.initBrowsePage();
    
    const amenitiesFilter = document.getElementById("amenities-filter");
    if (amenitiesFilter) {
      amenitiesFilter.addEventListener("change", (e) => {
        const selectedAmenities = Array.from(e.target.selectedOptions).map(opt => opt.value);
        const currentState = this.state.getState();
        const newFilters = { ...currentState.filters, amenities: selectedAmenities };
        this.state.updateState({ filters: newFilters });
        this.ui.renderListings(this.state.applyFilters());
      });
    }
  }

  // House detail page initialization
  async initHouseDetailPage() {
    const listingId = new URLSearchParams(window.location.search).get("id");
    if (!listingId) {
      window.location.href = "/browse.html";
      return;
    }

    try {
      const currentState = this.state.getState();
      let listing = currentState.listings?.find(l => l.id === listingId);

      if (!listing && window.authService?.isFirebaseReady()) {
        listing = await this.fetchListingById(listingId);
        if (!listing) {
          window.location.href = "/browse.html";
          return;
        }

        this.state.updateState({
          listings: [...(currentState.listings || []), listing]
        });
      }

      if (listing) {
        this.ui.renderListingDetail(listing);
        this.setupBookingForm(listingId, listing.type);
        this.setupFavoriteButton(listingId);
      } else {
        window.location.href = "/browse.html";
      }
    } catch (err) {
      console.error("Error initializing house detail page:", err);
      window.location.href = "/browse.html";
    }
  }

  // Fetch listing by ID from Firebase
  async fetchListingById(listingId) {
    if (!window.authService?.isFirebaseReady()) {
      console.warn("AuthService not ready, cannot fetch listing");
      return null;
    }

    try {
      const houseDoc = await firebaseServices.collections.houses.doc(listingId).get();
      if (houseDoc.exists) {
        return { id: houseDoc.id, ...houseDoc.data(), type: "house" };
      }

      const bnbDoc = await firebaseServices.collections.bnbs.doc(listingId).get();
      if (bnbDoc.exists) {
        return { id: bnbDoc.id, ...bnbDoc.data(), type: "bnb" };
      }

      return null;
    } catch (err) {
      console.error("Error fetching listing:", err);
      return null;
    }
  }

  // Set up booking form
  setupBookingForm(listingId, listingType) {
    const bookingForm = document.getElementById("booking-form");
    if (bookingForm) {
      bookingForm.addEventListener("submit", (e) => {
        e.preventDefault();
        this.handleBooking(listingId, listingType);
      });
    }
  }

  // Set up favorite button
  setupFavoriteButton(listingId) {
    const favoriteButton = document.getElementById("favorite-button");
    if (favoriteButton) {
      favoriteButton.addEventListener("click", () => {
        this.state.toggleFavorite(listingId);
        this.ui.updateFavoriteButton(listingId);
      });
    }
  }

  // Handle booking submission
  async handleBooking(listingId, listingType) {
    if (!window.authService?.isFirebaseReady()) {
      console.warn("AuthService not ready, cannot submit booking");
      alert("Please try again later.");
      return;
    }

    const currentState = this.state.getState();
    
    if (!currentState.currentUser) {
      alert("Please login to make a booking.");
      return;
    }

    const bookingForm = document.getElementById("booking-form");
    if (!bookingForm) return;

    try {
      this.ui.showLoading();

      const formData = new FormData(bookingForm);
      const bookingData = {
        listingId,
        listingType,
        userId: currentState.currentUser.uid,
        startDate: formData.get("start-date"),
        endDate: formData.get("end-date"),
        guests: parseInt(formData.get("guests")),
        specialRequests: formData.get("special-requests"),
        status: "pending",
        createdAt: firebaseServices.serverTimestamp()
      };

      const docRef = await firebaseServices.collections.bookings.add(bookingData);
      this.generateBookingReceipt({ id: docRef.id, ...bookingData });
      
      alert("Booking submitted successfully!");
      bookingForm.reset();
    } catch (err) {
      console.error("Booking error:", err);
      alert("Booking failed. Please try again.");
    } finally {
      this.ui.hideLoading();
    }
  }

  // Dashboard page initialization
  initDashboardPage() {
    console.log("Dashboard page initialized");
  }

  // Generate booking receipt
  generateBookingReceipt(bookingData) {
    console.log("Booking receipt generated for:", bookingData);
  }
}

// ==============================
// Initialize Application
// ==============================
const appController = new AppController();

// DOM ready event
if (typeof document !== 'undefined') {
  document.addEventListener("DOMContentLoaded", () => {
    console.log("DOMContentLoaded, starting app initialization");
    appController.init().catch(err => {
      console.error("App initialization failed:", err);
    });
  });
}

// Export for global access and testing
window.app = appController;

// Export individual functions for backward compatibility
export function toggleMobileMenu() {
  return appController.toggleMobileMenu();
}

export function waitForFirebase() {
  return appController.waitForServices();
}

export function updateUIFromState() {
  return appController.ui.updateFromState();
}

export function initBrowsePage() {
  return appController.initBrowsePage();
}

export function initBnbPage() {
  return appController.initBnbPage();
}

export function initHouseDetailPage() {
  return appController.initHouseDetailPage();
}

export function initDashboardPage() {
  return appController.initDashboardPage();
}

export function handleBooking(listingId, listingType) {
  return appController.handleBooking(listingId, listingType);
}

export function generateBookingReceipt(bookingData) {
  return appController.generateBookingReceipt(bookingData);
}

export default appController;