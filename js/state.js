// js/state.js
// ==============================
// Modular State Manager
// ==============================

class StateManager {
  constructor(firebaseServices = null) {
    this.firebaseServices = firebaseServices;
    this.state = {
      currentUser: null,
      role: null,
      listings: [],
      favorites: [],
      filters: {
        location: "",
        priceRange: [0, Infinity],
        type: "",
        amenities: [],
      },
      error: null,
    };
    this.listeners = [];
  }

  // Initialize with Firebase services
  setFirebaseServices(firebaseServices) {
    this.firebaseServices = firebaseServices;
    return this;
  }

  // Subscribe to state changes
  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) this.listeners.splice(index, 1);
    };
  }

  // Notify all listeners of state changes
  notify() {
    this.listeners.forEach(listener => listener(this.state));
  }

  // Update state with new values
  updateState(updates, callback) {
    Object.assign(this.state, updates);
    this.notify();
    if (typeof callback === "function") callback();
    return this;
  }

  // Reset filters
  resetFilters(callback) {
    this.state.filters = {
      location: "",
      priceRange: [0, Infinity],
      type: "",
      amenities: [],
    };
    this.notify();
    if (typeof callback === "function") callback();
    return this;
  }

  // Toggle favorite listings
  toggleFavorite(listingId, callback) {
    const index = this.state.favorites.indexOf(listingId);
    if (index >= 0) {
      this.state.favorites.splice(index, 1);
    } else {
      this.state.favorites.push(listingId);
    }
    this.notify();
    if (typeof callback === "function") callback();
    return this;
  }

  // Set error
  setError(error, callback) {
    this.state.error = error;
    this.notify();
    if (typeof callback === "function") callback();
    return this;
  }

  // Clear error
  clearError(callback) {
    this.state.error = null;
    this.notify();
    if (typeof callback === "function") callback();
    return this;
  }

  // Filter utilities
  matchesPrice(listingPrice, priceRange) {
    const min = priceRange?.[0] || 0;
    const max = priceRange?.[1] || Infinity;
    return listingPrice >= min && listingPrice <= max;
  }

  matchesLocation(listingLocation, filterLocation) {
    if (!filterLocation) return true;
    return listingLocation.toLowerCase().includes(filterLocation.toLowerCase());
  }

  matchesType(listingType, filterType) {
    if (!filterType) return true;
    return listingType === filterType;
  }

  matchesAmenities(listingAmenities, filterAmenities) {
    if (!filterAmenities?.length) return true;
    if (!listingAmenities) return false;
    return filterAmenities.every(amenity => listingAmenities.includes(amenity));
  }

  // Check if a listing matches the given filters
  matchesFilters(listing, filters = this.state.filters) {
    const { location, priceRange, type, amenities } = filters;
    
    return this.matchesPrice(listing.price, priceRange) &&
           this.matchesLocation(listing.location, location) &&
           this.matchesType(listing.type, type) &&
           this.matchesAmenities(listing.amenities, amenities);
  }

  // Apply current filters to listings
  applyFilters(customFilters = null) {
    const filters = customFilters || this.state.filters;
    return this.state.listings.filter(listing => 
      this.matchesFilters(listing, filters)
    );
  }

  // Get filtered listings
  getFilteredListings() {
    return this.applyFilters();
  }

  // Firebase integration methods
  async fetchCollection(collectionName, publicOnly = false) {
    if (!this.firebaseServices) {
      throw new Error("Firebase services not initialized");
    }

    const { collections, firestore } = this.firebaseServices;
    let query = collections[collectionName];
    
    if (!query) return [];
    
    if (publicOnly) {
      query = firestore.query(query, firestore.where("public", "==", true));
    }
    
    const snapshot = await firestore.getDocs(query);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      type: collectionName === "houses" ? "house" : "bnb",
      ...doc.data()
    }));
  }

  async loadUserData() {
    if (!this.firebaseServices?.auth) return;
    
    const currentUser = this.firebaseServices.auth.currentUser || null;
    this.state.currentUser = currentUser;
    this.state.role = currentUser ? "authenticated" : "guest";
  }

  async loadListings() {
    if (!this.firebaseServices) return;
    
    const { currentUser } = this.state;
    const houses = await this.fetchCollection("houses", !currentUser);
    const bnbs = await this.fetchCollection("bnbs", !currentUser);
    this.state.listings = [...houses, ...bnbs];
  }

  async loadFavorites() {
    if (!this.firebaseServices || !this.state.currentUser) {
      this.state.favorites = [];
      return;
    }

    const { collections, firestore } = this.firebaseServices;
    const favQuery = firestore.query(
      collections.favorites, 
      firestore.where("userId", "==", this.state.currentUser.uid)
    );
    const favSnap = await firestore.getDocs(favQuery);
    this.state.favorites = favSnap.docs.map(doc => doc.data().listingId);
  }

  // Initialize state by fetching from Firebase
  async initializeState(callback) {
    try {
      if (!this.firebaseServices) {
        console.warn("Firebase services not initialized, skipping state initialization");
        if (typeof callback === "function") callback();
        return this;
      }

      await this.loadUserData();
      await this.loadListings();
      await this.loadFavorites();

      this.notify();
      if (typeof callback === "function") callback();
    } catch (err) {
      console.error("Error initializing state:", err);
      this.setError(err.message || "Error loading listings");
      this.state.listings = [];
      this.state.favorites = [];
      if (typeof callback === "function") callback();
    }
    return this;
  }

  // Utility getters
  getCurrentUser() {
    return this.state.currentUser;
  }

  isAuthenticated() {
    return this.state.role === "authenticated";
  }

  getError() {
    return this.state.error;
  }

  hasError() {
    return this.state.error !== null;
  }

  // Get current state (read-only)
  getState() {
    return { ...this.state };
  }
}

// Factory function to create a state manager
export function createStateManager(firebaseServices = null) {
  return new StateManager(firebaseServices);
}

// Create default instance for backward compatibility
const defaultStateManager = new StateManager();

// Auto-initialize with window.firebaseServices if available
if (typeof window !== 'undefined' && window.firebaseServices) {
  defaultStateManager.setFirebaseServices(window.firebaseServices);
}

// Expose on window for backward compatibility
if (typeof window !== 'undefined') {
  window.state = defaultStateManager;
}

// Export for module usage
export default defaultStateManager;
export { StateManager };