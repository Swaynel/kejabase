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
      // Wait for Firebase and initialize
      await this.waitForFirebase();
      
      // Only set Firebase services if they're actually ready
      if (firebaseServices.ready && firebaseServices.collections && firebaseServices.firestore) {
        this.state.setFirebaseServices(firebaseServices);
      } else {
        console.warn("Firebase services not fully ready, continuing without Firebase");
      }
      
      // Set up auth listener
      this.setupAuthListener();
      
      // Initialize with current state (may be empty if Firebase not ready)
      await this.state.initializeState();
      
    } catch (err) {
      console.error("Error during app initialization:", err);
      // Continue initialization even if Firebase fails
    }
    
    // Initialize page-specific functionality
    this.initPageSpecificFunctionality();
    
    this.initialized = true;
  }

  // Register service worker
  registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/service-worker.js")
        .then(() => console.log("ServiceWorker registered"))
        .catch(err => console.error("ServiceWorker registration failed:", err));
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

  // Wait for Firebase to be ready
  async waitForFirebase() {
    return new Promise((resolve) => {
      if (firebaseServices.ready) {
        resolve();
        return;
      }

      // Listen for firebaseReady event
      const onFirebaseReady = () => {
        window.removeEventListener("firebaseReady", onFirebaseReady);
        resolve();
      };
      window.addEventListener("firebaseReady", onFirebaseReady);

      // Polling fallback
      const checkInterval = setInterval(() => {
        if (firebaseServices.ready) {
          clearInterval(checkInterval);
          window.removeEventListener("firebaseReady", onFirebaseReady);
          resolve();
        }
      }, 100);

      // Timeout after 10 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        window.removeEventListener("firebaseReady", onFirebaseReady);
        console.error("Firebase initialization timeout");
        resolve();
      }, 10000);
    });
  }

  // Set up Firebase auth listener
  setupAuthListener() {
    if (!firebaseServices.auth) {
      console.warn("Firebase auth not available, skipping auth listener setup");
      // Initialize with guest state
      this.handleUserLogout().catch(console.error);
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
      if (!this.state.isFirebaseReady()) {
        // If Firebase isn't ready, just set basic user info
        this.state.updateState({
          currentUser: { uid: user.uid, email: user.email },
          role: "guest"
        });
        return;
      }

      const userDocRef = firebaseServices.collections.users.doc(user.uid);
      const userDoc = await userDocRef.get();
      
      if (userDoc.exists) {
        const userData = userDoc.data();
        this.state.updateState({
          currentUser: { uid: user.uid, ...userData },
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
    // Initialize browse page functionality first
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

      // If listing not found in state, try to fetch from Firebase
      if (!listing && firebaseServices.auth.currentUser) {
        listing = await this.fetchListingById(listingId);
        if (!listing) {
          window.location.href = "/browse.html";
          return;
        }

        // Add to state
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
    // Add dashboard-specific functionality here
  }

  // Generate booking receipt (placeholder)
  generateBookingReceipt(bookingData) {
    console.log("Booking receipt generated for:", bookingData);
    // Implement receipt generation logic here
  }
}

// ==============================
// Initialize Application
// ==============================
const appController = new AppController();

// DOM ready event
document.addEventListener("DOMContentLoaded", () => {
  appController.init().catch(err => {
    console.error("App initialization failed:", err);
  });
});

// Export for global access and testing
window.app = appController;

// Export individual functions for backward compatibility
export function toggleMobileMenu() {
  return appController.toggleMobileMenu();
}

export function waitForFirebase() {
  return appController.waitForFirebase();
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