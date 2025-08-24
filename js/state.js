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
      isOffline: false,
    };
    this.listeners = [];
    this.initialized = false;
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
    this.listeners.forEach(listener => {
      try {
        listener(this.state);
      } catch (err) {
        console.error("Error in state listener:", err);
      }
    });
  }

  // Update state with new values
  updateState(updates, callback) {
    const prevState = { ...this.state };
    Object.assign(this.state, updates);
    
    // Log state changes for debugging
    console.log("State updated:", { 
      changes: updates, 
      newState: { ...this.state } 
    });
    
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
    if (!this.isFirebaseReady() || !this.state.currentUser) {
      console.warn("Firebase not ready or no user, updating UI only");
      // Still update UI state for better UX
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
        const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
        await Promise.all(deletePromises);
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
      // Revert UI changes on error
      const index = this.state.favorites.indexOf(listingId);
      if (index >= 0) {
        this.state.favorites.splice(index, 1);
      } else {
        this.state.favorites.push(listingId);
      }
      this.setError("Failed to update favorites");
      if (typeof callback === "function") callback();
    }
    return this;
  }

  // Set error
  setError(error, callback) {
    console.error("State error:", error);
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

  // Set offline status
  setOfflineStatus(isOffline, callback) {
    if (this.state.isOffline !== isOffline) {
      console.log("Offline status changed:", isOffline);
      this.state.isOffline = isOffline;
      this.notify();
    }
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
    return this.firebaseServices && 
           this.firebaseServices.ready &&
           this.firebaseServices.auth &&
           this.firebaseServices.collections &&
           window.authService?.isFirebaseReady();
  }

  // Firebase integration methods
  async fetchCollection(collectionName, publicOnly = false) {
    if (!this.isFirebaseReady()) {
      console.warn("Firebase not ready, skipping collection fetch for:", collectionName);
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
      
      console.log(`Fetching ${collectionName} collection (public only: ${publicOnly})`);
      const snapshot = await getDocs(q);
      const results = snapshot.docs.map(doc => ({
        id: doc.id,
        type: collectionName === "houses" ? "house" : "bnb",
        ...doc.data()
      }));
      
      console.log(`Fetched ${results.length} items from ${collectionName}`);
      return results;
    } catch (err) {
      console.error(`Error fetching collection ${collectionName}:`, err);
      this.setOfflineStatus(true);
      return [];
    }
  }

  async loadUserData() {
    if (!this.isFirebaseReady()) {
      console.warn("Firebase not ready, setting guest state");
      this.state.currentUser = null;
      this.state.role = "guest";
      return;
    }
    
    try {
      console.log("Loading user data from AuthService");
      const userData = await window.authService.getCurrentUserData();
      this.state.currentUser = userData || null;
      this.state.role = userData ? userData.role || "guest" : "guest";
      console.log("User data loaded:", { user: this.state.currentUser, role: this.state.role });
    } catch (err) {
      console.error("Error loading user data:", err);
      this.state.currentUser = null;
      this.state.role = "guest";
    }
  }

  async loadListings() {
    console.log("Loading listings...");
    
    if (!this.isFirebaseReady()) {
      console.warn("Firebase not ready, loading fallback listings");
      this.state.listings = this.getFallbackListings();
      this.setOfflineStatus(true);
      return;
    }
    
    try {
      const { currentUser } = this.state;
      const isPublicOnly = !currentUser;
      
      console.log("Fetching listings from Firebase (public only:", isPublicOnly, ")");
      const [houses, bnbs] = await Promise.all([
        this.fetchCollection("houses", isPublicOnly),
        this.fetchCollection("bnbs", isPublicOnly)
      ]);
      
      this.state.listings = [...houses, ...bnbs];
      
      // If we couldn't load any listings from Firebase, use fallback
      if (this.state.listings.length === 0) {
        console.warn("No listings loaded from Firebase, using fallback");
        this.state.listings = this.getFallbackListings();
        this.setOfflineStatus(true);
      } else {
        console.log(`Loaded ${this.state.listings.length} listings from Firebase`);
        this.setOfflineStatus(false);
      }
    } catch (err) {
      console.error("Error loading listings:", err);
      this.state.listings = this.getFallbackListings();
      this.setOfflineStatus(true);
    }
  }

  async loadFavorites() {
    if (!this.isFirebaseReady() || !this.state.currentUser) {
      console.warn("Cannot load favorites - Firebase not ready or no user");
      this.state.favorites = [];
      return;
    }

    try {
      console.log("Loading user favorites for:", this.state.currentUser.uid);
      const { collections, query, where, getDocs } = this.firebaseServices;
      const favQuery = query(
        collections.favorites, 
        where("userId", "==", this.state.currentUser.uid)
      );
      const favSnap = await getDocs(favQuery);
      this.state.favorites = favSnap.docs.map(doc => doc.data().listingId);
      console.log(`Loaded ${this.state.favorites.length} favorites`);
    } catch (err) {
      console.error("Error loading favorites:", err);
      this.state.favorites = [];
    }
  }

  // Get fallback listings for offline mode
  getFallbackListings() {
    console.log("Using fallback listings");
    return [
      {
        id: "fallback-1",
        type: "house",
        title: "Cozy Downtown Apartment",
        location: "New York",
        price: 120,
        bedrooms: 2,
        bathrooms: 1,
        amenities: ["wifi", "kitchen", "tv"],
        image: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?ixlib=rb-1.2.1&auto=format&fit=crop&w=500&q=60",
        public: true
      },
      {
        id: "fallback-2",
        type: "bnb",
        title: "Lakeside Cabin Retreat",
        location: "Lake Tahoe",
        price: 210,
        bedrooms: 3,
        bathrooms: 2,
        amenities: ["wifi", "kitchen", "parking", "fireplace"],
        image: "https://images.unsplash.com/photo-1449158743715-0a90ebb6d2d8?ixlib=rb-1.2.1&auto=format&fit=crop&w=500&q=60",
        public: true
      },
      {
        id: "fallback-3",
        type: "house",
        title: "Modern Beach House",
        location: "Miami",
        price: 350,
        bedrooms: 4,
        bathrooms: 3,
        amenities: ["wifi", "pool", "ocean-view", "kitchen"],
        image: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?ixlib=rb-1.2.1&auto=format&fit=crop&w=500&q=60",
        public: true
      },
      {
        id: "fallback-4",
        type: "house",
        title: "Mountain View Cottage",
        location: "Colorado Springs",
        price: 180,
        bedrooms: 2,
        bathrooms: 1,
        amenities: ["wifi", "kitchen", "fireplace", "parking"],
        image: "https://images.unsplash.com/photo-1518780664697-55e3ad937233?ixlib=rb-1.2.1&auto=format&fit=crop&w=500&q=60",
        public: true
      },
      {
        id: "fallback-5",
        type: "bnb",
        title: "Urban Loft Experience",
        location: "Chicago",
        price: 95,
        bedrooms: 1,
        bathrooms: 1,
        amenities: ["wifi", "kitchen", "tv", "ac"],
        image: "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?ixlib=rb-1.2.1&auto=format&fit=crop&w=500&q=60",
        public: true
      }
    ];
  }

  // Initialize state by fetching from Firebase or using fallbacks
  async initializeState(callback) {
    if (this.initialized) {
      console.log("StateManager already initialized");
      if (typeof callback === "function") callback();
      return this;
    }

    console.log("Initializing StateManager state...");
    
    try {
      if (!this.isFirebaseReady()) {
        console.warn("Firebase not ready, initializing with guest state and fallback data");
        this.state.currentUser = null;
        this.state.role = "guest";
        this.state.listings = this.getFallbackListings();
        this.state.favorites = [];
        this.setOfflineStatus(true);
        this.notify();
        this.initialized = true;
        if (typeof callback === "function") callback();
        return this;
      }

      // Load data in sequence for better error handling
      await this.loadUserData();
      await this.loadListings();
      await this.loadFavorites();

      console.log("StateManager initialization completed:", {
        user: this.state.currentUser?.uid || "guest",
        role: this.state.role,
        listingsCount: this.state.listings.length,
        favoritesCount: this.state.favorites.length,
        isOffline: this.state.isOffline
      });

      this.setOfflineStatus(false);
      this.initialized = true;
      this.notify();
      if (typeof callback === "function") callback();
    } catch (err) {
      console.error("Error initializing StateManager:", err);
      this.setError(err.message || "Error loading data");
      
      // Fallback to guest state with fallback data
      this.state.currentUser = null;
      this.state.role = "guest";
      this.state.listings = this.getFallbackListings();
      this.state.favorites = [];
      this.setOfflineStatus(true);
      this.initialized = true;
      this.notify();
      if (typeof callback === "function") callback();
    }
    return this;
  }

  // Reinitialize state (useful for auth state changes)
  async reinitialize() {
    console.log("Reinitializing StateManager...");
    this.initialized = false;
    return this.initializeState();
  }

  // Utility getters
  getCurrentUser() {
    return this.state.currentUser;
  }

  isAuthenticated() {
    return this.state.currentUser !== null;
  }

  getRole() {
    return this.state.role;
  }

  getError() {
    return this.state.error;
  }

  hasError() {
    return this.state.error !== null;
  }

  isOfflineMode() {
    return this.state.isOffline;
  }

  isInitialized() {
    return this.initialized;
  }

  // Get current state (read-only)
  getState() {
    return { ...this.state };
  }

  // Get listings count by type
  getListingStats() {
    const stats = this.state.listings.reduce((acc, listing) => {
      acc[listing.type] = (acc[listing.type] || 0) + 1;
      acc.total += 1;
      return acc;
    }, { total: 0, house: 0, bnb: 0 });
    
    return stats;
  }

  // Search listings
  searchListings(searchTerm) {
    if (!searchTerm) return this.state.listings;
    
    const term = searchTerm.toLowerCase();
    return this.state.listings.filter(listing => 
      listing.title.toLowerCase().includes(term) ||
      listing.location.toLowerCase().includes(term) ||
      listing.amenities?.some(amenity => amenity.toLowerCase().includes(term))
    );
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
    if (window.firebaseServices && window.firebaseServices.ready) {
      console.log("Setting firebaseServices in defaultStateManager");
      defaultStateManager.setFirebaseServices(window.firebaseServices);
      window.state = defaultStateManager;
      
      // Dispatch custom event to notify other services
      window.dispatchEvent(new CustomEvent('stateManagerReady', {
        detail: { stateManager: defaultStateManager }
      }));
    }
  };

  // Check if Firebase is already ready
  if (window.firebaseServices?.ready) {
    console.log("Firebase services already ready, initializing StateManager immediately");
    initializeStateManager();
  } else {
    console.log("Waiting for firebaseReady event to initialize StateManager");
    window.addEventListener('firebaseReady', () => {
      console.log("firebaseReady event received, initializing StateManager");
      // Small delay to ensure AuthService is also initialized
      setTimeout(initializeStateManager, 100);
    }, { once: true });
  }
}

// Export for module usage
export default defaultStateManager;
export { StateManager };