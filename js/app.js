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

  // Initialize the application
  async init() {
    if (this.initialized) return;
    
    console.log("Starting app initialization - Attempt", this.initializationAttempts + 1);
    
    // Register service worker
    this.registerServiceWorker();
    
    // Set up mobile menu
    this.initMobileMenu();
    
    // Connect UI to state
    this.ui.setStateManager(this.state);
    
    try {
      // Wait for services to be ready
      await this.ensureServicesReady();
      
      if (this.firebaseReady && this.authServiceReady) {
        console.log("All services ready, proceeding with full initialization");
        
        // Set Firebase services for state if not already set
        if (!this.state.firebaseServices) {
          console.log("Setting Firebase services in state manager");
          this.state.setFirebaseServices(firebaseServices);
        }
        
        // Set up auth listener
        await this.setupAuthListener();
        
        // Initialize state
        await this.state.initializeState();
      } else {
        console.warn("Services not fully ready, initializing in guest mode");
        await this.handleUserLogout();
      }
      
    } catch (err) {
      console.error("Error during app initialization:", err);
      // Continue initialization with guest state
      await this.handleUserLogout();
      
      // Retry initialization if needed
      if (this.initializationAttempts < this.maxInitializationAttempts) {
        this.initializationAttempts++;
        console.log(`Retrying initialization (${this.initializationAttempts}/${this.maxInitializationAttempts})`);
        setTimeout(() => this.init(), 2000);
        return;
      }
    }
    
    // Initialize page-specific functionality
    this.initPageSpecificFunctionality();
    
    this.initialized = true;
    console.log("App initialization completed");
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

  // Ensure all services are ready - improved version
  async ensureServicesReady() {
    if (this.serviceReadyPromise) {
      return this.serviceReadyPromise;
    }

    this.serviceReadyPromise = new Promise((resolve) => {
      console.log("Checking service readiness...");
      
      // Check current state
      this.checkServiceStates();
      
      if (this.firebaseReady && this.authServiceReady) {
        console.log("All services already ready");
        resolve();
        return;
      }

      let resolved = false;
      let checkInterval = null;
      let timeoutId = null;
      
      const resolveOnce = () => {
        if (resolved) return;
        resolved = true;
        if (checkInterval) clearInterval(checkInterval);
        if (timeoutId) clearTimeout(timeoutId);
        console.log(`Services ready - Firebase: ${this.firebaseReady}, AuthService: ${this.authServiceReady}`);
        resolve();
      };
      
      // Set up event listener for firebaseReady
      const onFirebaseReady = () => {
        console.log("firebaseReady event received in app controller");
        this.checkServiceStates();
        if (this.firebaseReady && this.authServiceReady) {
          resolveOnce();
        }
      };
      
      window.addEventListener("firebaseReady", onFirebaseReady, { once: false });
      
      // Polling check for service readiness
      checkInterval = setInterval(() => {
        this.checkServiceStates();
        
        if (this.firebaseReady && this.authServiceReady) {
          window.removeEventListener("firebaseReady", onFirebaseReady);
          resolveOnce();
        }
      }, 200);
      
      // Timeout after 12 seconds
      timeoutId = setTimeout(() => {
        console.warn("Service initialization timeout - proceeding with available services");
        this.checkServiceStates();
        window.removeEventListener("firebaseReady", onFirebaseReady);
        resolveOnce();
      }, 12000);
    });

    return this.serviceReadyPromise;
  }

  // Check and update service states
  checkServiceStates() {
    // Check Firebase
    const wasFirebaseReady = this.firebaseReady;
    this.firebaseReady = firebaseServices && 
                         firebaseServices.ready && 
                         firebaseServices.auth &&
                         firebaseServices.collections;
    
    // Check AuthService
    const wasAuthServiceReady = this.authServiceReady;
    this.authServiceReady = window.authService && 
                           typeof window.authService.isFirebaseReady === 'function' &&
                           window.authService.isFirebaseReady();
    
    // Log state changes
    if (wasFirebaseReady !== this.firebaseReady) {
      console.log("Firebase ready state changed:", this.firebaseReady);
    }
    if (wasAuthServiceReady !== this.authServiceReady) {
      console.log("AuthService ready state changed:", this.authServiceReady);
    }
  }

  // Set up Firebase auth listener
  async setupAuthListener() {
    if (!this.firebaseReady || !firebaseServices.auth) {
      console.warn("Firebase auth not available, setting guest state");
      await this.handleUserLogout();
      return;
    }

    try {
      console.log("Setting up Firebase auth state listener");
      firebaseServices.auth.onAuthStateChanged(async (user) => {
        try {
          if (user) {
            console.log("User signed in:", user.uid);
            await this.handleUserLogin(user);
          } else {
            console.log("User signed out");
            await this.handleUserLogout();
          }
        } catch (err) {
          console.error("Auth state change error:", err);
          this.state.setError(err.message || "Authentication error");
        }
      });
    } catch (err) {
      console.error("Error setting up auth listener:", err);
      await this.handleUserLogout();
    }
  }

  // Handle user login
  async handleUserLogin(user) {
    try {
      console.log("Handling user login for:", user.uid);
      
      if (!this.authServiceReady) {
        console.warn("AuthService not ready, using basic user data");
        this.state.updateState({
          currentUser: { uid: user.uid, email: user.email },
          role: "guest"
        });
        return;
      }

      const userData = await window.authService.getCurrentUserData();
      if (userData) {
        console.log("User data loaded:", userData);
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
      await this.state.loadListings();
      await this.state.loadFavorites();
      
    } catch (err) {
      console.error("Error handling user login:", err);
      this.state.setError("Error loading user data");
    }
  }

  // Handle user logout
  async handleUserLogout() {
    console.log("Handling user logout - setting guest state");
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
    console.log("Initializing page-specific functionality for:", path);
    
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
    console.log("Initializing browse page");
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

    // Subscribe to state changes for automatic UI updates
    this.state.subscribe((newState) => {
      console.log("State updated, re-rendering listings");
      this.ui.renderListings(this.state.applyFilters());
    });

    // Initial render
    const currentState = this.state.getState();
    this.ui.renderListings(currentState.listings);
  }

  // BnB page initialization
  initBnbPage() {
    console.log("Initializing BnB page");
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
    console.log("Initializing house detail page");
    const listingId = new URLSearchParams(window.location.search).get("id");
    if (!listingId) {
      console.warn("No listing ID found, redirecting to browse");
      window.location.href = "/browse.html";
      return;
    }

    try {
      const currentState = this.state.getState();
      let listing = currentState.listings?.find(l => l.id === listingId);

      if (!listing && this.authServiceReady) {
        console.log("Fetching listing from Firebase:", listingId);
        listing = await this.fetchListingById(listingId);
        if (!listing) {
          console.warn("Listing not found:", listingId);
          window.location.href = "/browse.html";
          return;
        }

        this.state.updateState({
          listings: [...(currentState.listings || []), listing]
        });
      }

      if (listing) {
        console.log("Rendering listing detail:", listing);
        this.ui.renderListingDetail(listing);
        this.setupBookingForm(listingId, listing.type);
        this.setupFavoriteButton(listingId);
      } else {
        console.warn("No listing found, redirecting to browse");
        window.location.href = "/browse.html";
      }
    } catch (err) {
      console.error("Error initializing house detail page:", err);
      window.location.href = "/browse.html";
    }
  }

  // Fetch listing by ID from Firebase
  async fetchListingById(listingId) {
    if (!this.authServiceReady) {
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
    if (!this.authServiceReady) {
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

  // Utility method to check if app is ready
  isReady() {
    return this.initialized && this.firebaseReady && this.authServiceReady;
  }

  // Get current status
  getStatus() {
    return {
      initialized: this.initialized,
      firebaseReady: this.firebaseReady,
      authServiceReady: this.authServiceReady,
      isReady: this.isReady()
    };
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
  return appController.ensureServicesReady();
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