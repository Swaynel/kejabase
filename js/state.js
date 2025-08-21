// js/state.js
// ==============================
// state.js – Global Application State
// ==============================

const AppState = {
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

const state = {
  AppState,

  // Update state with new values
  updateState(updates, callback) {
    Object.assign(AppState, updates);
    if (typeof callback === "function") callback();
  },

  // Reset filters
  resetFilters(callback) {
    AppState.filters = {
      location: "",
      priceRange: [0, Infinity],
      type: "",
      amenities: [],
    };
    if (typeof callback === "function") callback();
  },

  // Toggle favorite listings
  toggleFavorite(listingId, callback) {
    const index = AppState.favorites.indexOf(listingId);
    if (index >= 0) AppState.favorites.splice(index, 1);
    else AppState.favorites.push(listingId);

    if (typeof callback === "function") callback();
  },

  // Apply current filters to listings
  applyFilters() {
    const { listings, filters } = AppState;
    return listings.filter(listing => {
      const { location, priceRange, type, amenities } = filters;
      const priceOk = listing.price >= (priceRange?.[0] || 0) && listing.price <= (priceRange?.[1] || Infinity);
      const locationOk = !location || listing.location.toLowerCase().includes(location.toLowerCase());
      const typeOk = !type || listing.type === type;
      const amenitiesOk = !amenities?.length || (listing.amenities && amenities.every(a => listing.amenities.includes(a)));
      return priceOk && locationOk && typeOk && amenitiesOk;
    });
  },

  // Initialize state by fetching from Firebase (using firebaseServices wrapper)
  async initializeState(callback) {
    try {
      const { auth, collections, firestore } = window.firebaseServices || {};
      if (!auth || !collections || !firestore) {
        console.warn("Firebase services not yet initialized, skipping state initialization");
        if (typeof callback === "function") callback();
        return;
      }

      const currentUser = auth.currentUser || null;
      AppState.currentUser = currentUser;
      AppState.role = currentUser ? "authenticated" : "guest";

      // Helper function to fetch a collection, optionally filtered by public=true
      const fetchCollection = async (colName, publicOnly = false) => {
        let q = collections[colName];
        if (!q) return [];
        if (publicOnly) {
          q = firestore.query(q, firestore.where("public", "==", true));
        }
        const snap = await firestore.getDocs(q);
        return snap.docs.map(doc => ({ id: doc.id, type: colName === "houses" ? "house" : "bnb", ...doc.data() }));
      };

      // Fetch listings
      const houses = await fetchCollection("houses", !currentUser);
      const bnbs = await fetchCollection("bnbs", !currentUser);
      AppState.listings = [...houses, ...bnbs];

      // Fetch favorites for logged-in user
      let favorites = [];
      if (currentUser) {
        const favQuery = firestore.query(collections.favorites, firestore.where("userId", "==", currentUser.uid));
        const favSnap = await firestore.getDocs(favQuery);
        favorites = favSnap.docs.map(doc => doc.data().listingId);
      }
      AppState.favorites = favorites;

      if (typeof callback === "function") callback();
    } catch (err) {
      console.error("Error initializing state:", err);
      AppState.error = err.message || "Error loading listings";
      AppState.listings = [];
      AppState.favorites = [];
      if (typeof callback === "function") callback();
    }
  }
};

// Expose state globally
window.state = state;
