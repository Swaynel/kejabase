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

  setFirebaseServices(firebaseServices) {
    this.firebaseServices = firebaseServices;
    return this;
  }

  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) this.listeners.splice(index, 1);
    };
  }

  notify() {
    this.listeners.forEach(listener => {
      try { listener(this.state); } catch (err) { console.error(err); }
    });
  }

  updateState(updates, callback) {
    Object.assign(this.state, updates);
    this.notify();
    if (typeof callback === "function") callback();
    return this;
  }

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

  async toggleFavorite(listingId, callback) {
    if (!this.isFirebaseReady() || !this.state.currentUser) {
      // optimistic UI update even when offline / guest
      const idx = this.state.favorites.indexOf(listingId);
      if (idx >= 0) this.state.favorites.splice(idx, 1);
      else this.state.favorites.push(listingId);
      this.notify();
      if (typeof callback === "function") callback();
      return this;
    }

    try {
      const idx = this.state.favorites.indexOf(listingId);
      const { collections, query, where, getDocs, addDoc, deleteDoc, serverTimestamp } = this.firebaseServices;
      const favQuery = query(
        collections.favorites,
        where("userId", "==", this.state.currentUser.uid),
        where("listingId", "==", listingId)
      );

      if (idx >= 0) {
        // remove
        this.state.favorites.splice(idx, 1);
        const snapshot = await getDocs(favQuery);
        const deletePromises = snapshot.docs.map(docSnap => deleteDoc(docSnap.ref));
        await Promise.all(deletePromises);
      } else {
        // add
        this.state.favorites.push(listingId);
        await addDoc(collections.favorites, {
          userId: this.state.currentUser.uid,
          listingId,
          createdAt: serverTimestamp()
        });
      }

      this.notify();
      if (typeof callback === "function") callback();
    } catch (err) {
      console.error(err);
      // revert UI
      const idx = this.state.favorites.indexOf(listingId);
      if (idx >= 0) this.state.favorites.splice(idx, 1);
      else this.state.favorites.push(listingId);
      this.setError("Failed to update favorites");
      if (typeof callback === "function") callback();
    }
    return this;
  }

  setError(error, callback) {
    console.error(error);
    this.state.error = error;
    this.notify();
    if (typeof callback === "function") callback();
    return this;
  }

  clearError(callback) {
    this.state.error = null;
    this.notify();
    if (typeof callback === "function") callback();
    return this;
  }

  setOfflineStatus(isOffline, callback) {
    if (this.state.isOffline !== isOffline) {
      this.state.isOffline = isOffline;
      this.notify();
    }
    if (typeof callback === "function") callback();
    return this;
  }

  matchesPrice(listingPrice, priceRange) {
    const min = priceRange?.[0] || 0;
    const max = priceRange?.[1] || Infinity;
    return listingPrice >= min && listingPrice <= max;
  }

  matchesLocation(listingLocation, filterLocation) {
    if (!filterLocation) return true;
    return (listingLocation || "").toLowerCase().includes(filterLocation.toLowerCase());
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

  matchesFilters(listing, filters = this.state.filters) {
    const { location, priceRange, type, amenities } = filters;
    return this.matchesPrice(listing.price, priceRange) &&
           this.matchesLocation(listing.location, location) &&
           this.matchesType(listing.type, type) &&
           this.matchesAmenities(listing.amenities, amenities);
  }

  applyFilters(customFilters = null) {
    const filters = customFilters || this.state.filters;
    return (this.state.listings || []).filter(listing => this.matchesFilters(listing, filters));
  }

  getFilteredListings() { return this.applyFilters(); }

  isFirebaseReady() {
    return !!(this.firebaseServices &&
              this.firebaseServices.ready &&
              this.firebaseServices.auth &&
              this.firebaseServices.collections &&
              window.authService?.isFirebaseReady?.());
  }

  async fetchCollection(collectionName, publicOnly = false) {
    if (!this.isFirebaseReady()) return [];
    try {
      const { collections, query, where, getDocs } = this.firebaseServices;
      let colRef = collections[collectionName];
      if (!colRef) return [];

      let q = colRef;
      if (publicOnly) q = query(colRef, where("public", "==", true));

      const snapshot = await getDocs(q);
      return snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        type: collectionName === "houses" ? "house" : "bnb",
        ...docSnap.data()
      }));
    } catch (err) {
      console.error(err);
      this.setOfflineStatus(true);
      return [];
    }
  }

  async loadUserData() {
    if (!this.isFirebaseReady()) {
      this.state.currentUser = null;
      this.state.role = "guest";
      return;
    }

    try {
      const userData = await window.authService.getCurrentUserData();
      this.state.currentUser = userData || null;
      this.state.role = userData?.role || "guest";
    } catch (err) {
      console.error(err);
      this.state.currentUser = null;
      this.state.role = "guest";
    }
  }

  async loadListings() {
    if (!this.isFirebaseReady()) {
      this.state.listings = this.getFallbackListings();
      this.setOfflineStatus(true);
      return;
    }

    try {
      const { currentUser } = this.state;
      const publicOnly = !currentUser;
      const [houses, bnbs] = await Promise.all([
        this.fetchCollection("houses", publicOnly),
        this.fetchCollection("bnbs", publicOnly)
      ]);

      this.state.listings = [...houses, ...bnbs];

      if (this.state.listings.length === 0) {
        this.state.listings = this.getFallbackListings();
        this.setOfflineStatus(true);
      } else {
        this.setOfflineStatus(false);
      }
    } catch (err) {
      console.error(err);
      this.state.listings = this.getFallbackListings();
      this.setOfflineStatus(true);
    }
  }

  async loadFavorites() {
    if (!this.isFirebaseReady() || !this.state.currentUser) {
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
      this.state.favorites = favSnap.docs.map(docSnap => docSnap.data().listingId);
    } catch (err) {
      console.error(err);
      this.state.favorites = [];
    }
  }

  getFallbackListings() {
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

  async initializeState(callback) {
    if (this.initialized) {
      if (typeof callback === "function") callback();
      return this;
    }

    try {
      if (!this.isFirebaseReady()) {
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

      await this.loadUserData();
      await this.loadListings();
      await this.loadFavorites();

      this.setOfflineStatus(false);
      this.initialized = true;
      this.notify();
      if (typeof callback === "function") callback();
    } catch (err) {
      console.error(err);
      this.setError(err?.message || "Error loading data");

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

  async reinitialize() {
    this.initialized = false;
    return this.initializeState();
  }

  getCurrentUser() { return this.state.currentUser; }
  isAuthenticated() { return this.state.currentUser !== null; }
  getRole() { return this.state.role; }
  getError() { return this.state.error; }
  hasError() { return this.state.error !== null; }
  isOfflineMode() { return this.state.isOffline; }
  isInitialized() { return this.initialized; }
  getState() { return { ...this.state }; }

  getListingStats() {
    const stats = this.state.listings.reduce((acc, listing) => {
      acc[listing.type] = (acc[listing.type] || 0) + 1;
      acc.total += 1;
      return acc;
    }, { total: 0, house: 0, bnb: 0 });
    return stats;
  }

  searchListings(searchTerm) {
    if (!searchTerm) return this.state.listings;
    const term = searchTerm.toLowerCase();
    return this.state.listings.filter(listing =>
      listing.title?.toLowerCase().includes(term) ||
      listing.location?.toLowerCase().includes(term) ||
      listing.amenities?.some(a => a.toLowerCase().includes(term))
    );
  }
}

// Factory
export function createStateManager(firebaseServices = null) {
  return new StateManager(firebaseServices);
}

// Default instance (auto-wired from window.firebaseServices)
const defaultStateManager = new StateManager();

if (typeof window !== 'undefined') {
  const initializeStateManager = () => {
    if (window.firebaseServices?.ready) {
      defaultStateManager.setFirebaseServices(window.firebaseServices);
      window.state = defaultStateManager;

      window.dispatchEvent(new CustomEvent('stateManagerReady', {
        detail: { stateManager: defaultStateManager }
      }));
    }
  };

  if (window.firebaseServices?.ready) {
    initializeStateManager();
  } else {
    window.addEventListener('firebaseReady', () => {
      setTimeout(initializeStateManager, 100);
    }, { once: true });
  }
}

export default defaultStateManager;
export { StateManager };
