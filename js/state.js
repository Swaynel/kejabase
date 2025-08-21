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

  // Initialize state by fetching from Firebase
  async initializeState(callback) {
    try {
      if (!window.firebaseServices || !window.firebaseServices.collections) {
        console.warn("Firebase services not yet initialized, skipping state initialization");
        if (typeof callback === "function") callback();
        return;
      }

      const currentUser = window.firebaseServices.auth.currentUser;
      AppState.currentUser = currentUser;

      let houses = [];
      let bnbs = [];
      let favorites = [];

      // Fetch houses
      let housesQuery = window.firebaseServices.collections.houses;
      if (!currentUser) housesQuery = housesQuery.where("public", "==", true);
      const housesSnap = await housesQuery.get();
      houses = housesSnap.docs.map(doc => ({ id: doc.id, type: "house", ...doc.data() }));

      // Fetch BnBs
      let bnbsQuery = window.firebaseServices.collections.bnbs;
      if (!currentUser) bnbsQuery = bnbsQuery.where("public", "==", true);
      const bnbsSnap = await bnbsQuery.get();
      bnbs = bnbsSnap.docs.map(doc => ({ id: doc.id, type: "bnb", ...doc.data() }));

      AppState.listings = [...houses, ...bnbs];

      // Fetch favorites for logged-in user
      if (currentUser) {
        const favSnap = await window.firebaseServices.collections.favorites
          .where("userId", "==", currentUser.uid)
          .get();
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

window.state = state;
