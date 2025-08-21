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
    console.log("Setting firebaseServices in StateManager:", firebaseServices);
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
  async toggleFavorite(listingId, callback) {
    if (!window.authService?.isFirebaseReady() || !this.state.currentUser) {
      console.warn("AuthService not ready or no user, cannot toggle favorite");
      if (typeof callback === "function") callback();
      return this;
    }

    try {
      const index = this.state.favorites.indexOf(listingId);
      const { collections, query, where, getDocs, addDoc, deleteDoc } = this.firebaseServices;
      const favQuery = query(
        collections.favorites,
        where("userId", "==", this.state.currentUser.uid),
        where("listingId", "==", listingId)
      );

      if (index >= 0) {
        // Remove from favorites
        this.state.favorites.splice(index, 1);
        const snapshot = await getDocs(favQuery);
        snapshot.forEach(doc => deleteDoc(doc.ref));
      } else {
        // Add to favorites
        this.state.favorites.push(listingId);
        await addDoc(collections.favorites, {
          userId: this.state.currentUser.uid,
          listingId,
          createdAt: this.firebaseServices.serverTimestamp()
        });
      }

      this.notify();
      if (typeof callback === "function") callback();
    } catch (err) {
      console.error("Error toggling favorite:", err);
      this.setError("Failed to update favorites");
      if (typeof callback === "function") callback();
    }
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

  // Check if Firebase services are properly initialized
  isFirebaseReady() {
    return window.authService?.isFirebaseReady() || false;
  }

  // Firebase integration methods
  async fetchCollection(collectionName, publicOnly = false) {
    if (!this.isFirebaseReady()) {
      console.warn("AuthService not ready, skipping collection fetch");
      return [];
    }

    try {
      const { collections, query, where, getDocs } = this.firebaseServices;
      let q = collections[collectionName];
      
      if (!q) {
        console.warn(`Collection ${collectionName} not found`);
        return [];
      }
      
      if (publicOnly) {
        q = query(q, where("public", "==", true));
      }
      
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        type: collectionName === "houses" ? "house" : "bnb",
        ...doc.data()
      }));
    } catch (err) {
      console.error(`Error fetching collection ${collectionName}:`, err);
      return [];
    }
  }

  async loadUserData() {
    if (!this.isFirebaseReady()) {
      console.warn("AuthService not ready, setting guest state");
      this.state.currentUser = null;
      this.state.role = "guest";
      return;
    }
    
    const userData = await window.authService.getCurrentUserData();
    this.state.currentUser = userData || null;
    this.state.role = userData ? userData.role || "guest" : "guest";
  }

  async loadListings() {
    if (!this.isFirebaseReady()) {
      console.warn("AuthService not ready, skipping listings load");
      this.state.listings = [];
      return;
    }
    
    try {
      const { currentUser } = this.state;
      const houses = await this.fetchCollection("houses", !currentUser);
      const bnbs = await this.fetchCollection("bnbs", !currentUser);
      this.state.listings = [...houses, ...bnbs];
    } catch (err) {
      console.error("Error loading listings:", err);
      this.state.listings = [];
    }
  }

  async loadFavorites() {
    if (!this.isFirebaseReady() || !this.state.currentUser) {
      console.warn("AuthService not ready or no user, skipping favorites load");
      this.state.favorites = [];
      return;
    }

    try {
      const { collections, query, where, getDocs } = this.firebaseServices;
      const favQuery = query(
        collections.favorites, 
        where("userId", "==", this.state.currentUser.uid)
      );
      const favSnap = await getDocs(favQuery);
      this.state.favorites = favSnap.docs.map(doc => doc.data().listingId);
    } catch (err) {
      console.error("Error loading favorites:", err);
      this.state.favorites = [];
    }
  }

  // Initialize state by fetching from Firebase
  async initializeState(callback) {
    try {
      if (!this.isFirebaseReady()) {
        console.warn("AuthService not initialized, initializing with guest state");
        this.state.currentUser = null;
        this.state.role = "guest";
        this.state.listings = [];
        this.state.favorites = [];
        this.notify();
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
      this.notify();
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

// Create default instance
const defaultStateManager = new StateManager();

// Auto-initialize with window.firebaseServices if available
if (typeof window !== 'undefined') {
  console.log("Checking window.firebaseServices for StateManager initialization");
  const initializeStateManager = () => {
    if (window.firebaseServices && window.authService?.isFirebaseReady()) {
      console.log("Setting firebaseServices in defaultStateManager");
      defaultStateManager.setFirebaseServices(window.firebaseServices);
      window.state = defaultStateManager;
    }
  };

  if (window.firebaseServices?.ready && window.authService?.isFirebaseReady()) {
    console.log("Firebase and AuthService ready, initializing StateManager");
    initializeStateManager();
  } else {
    console.log("Waiting for firebaseReady event to initialize StateManager");
    window.addEventListener('firebaseReady', () => {
      console.log("firebaseReady event received, initializing StateManager");
      initializeStateManager();
    }, { once: true });
  }
}

// Export for module usage
export default defaultStateManager;
export { StateManager };