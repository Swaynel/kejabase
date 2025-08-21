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

  updateState(updates) {
    Object.assign(AppState, updates);
    if (typeof updateUIFromState === "function") updateUIFromState();
  },

  resetFilters() {
    AppState.filters = {
      location: "",
      priceRange: [0, Infinity],
      type: "",
      amenities: [],
    };
  },

  toggleFavorite(listingId) {
    const index = AppState.favorites.indexOf(listingId);
    if (index >= 0) AppState.favorites.splice(index, 1);
    else AppState.favorites.push(listingId);
  },

  applyFilters() {
    return AppState.listings.filter((listing) => {
      const { location, priceRange, type, amenities } = AppState.filters;
      const priceOk =
        listing.price >= (priceRange?.[0] || 0) &&
        listing.price <= (priceRange?.[1] || Infinity);
      const locationOk = !location || listing.location.toLowerCase().includes(location.toLowerCase());
      const typeOk = !type || listing.type === type;
      const amenitiesOk =
        !amenities?.length || (listing.amenities && amenities.every((a) => listing.amenities.includes(a)));

      return priceOk && locationOk && typeOk && amenitiesOk;
    });
  },

  async initializeState() {
    try {
      // Check if firebaseServices is available
      if (!window.firebaseServices || !window.firebaseServices.collections) {
        console.warn("Firebase services not yet initialized, skipping state initialization");
        return;
      }

      let houses = [];
      let bnbs = [];
      let favorites = [];

      const currentUser = window.firebaseServices.auth.currentUser;
      AppState.currentUser = currentUser;

      // Fetch houses
      let housesQuery = window.firebaseServices.collections.houses;
      if (!currentUser) housesQuery = housesQuery.where("public", "==", true);
      const housesSnap = await housesQuery.get();
      houses = housesSnap.docs.map(doc => ({ id: doc.id, type: "house", ...doc.data() }));

      // Fetch bnbs
      let bnbsQuery = window.firebaseServices.collections.bnbs;
      if (!currentUser) bnbsQuery = bnbsQuery.where("public", "==", true);
      const bnbsSnap = await bnbsQuery.get();
      bnbs = bnbsSnap.docs.map(doc => ({ id: doc.id, type: "bnb", ...doc.data() }));

      AppState.listings = [...houses, ...bnbs];

      // Fetch user favorites if logged in
      if (currentUser) {
        const favSnap = await window.firebaseServices.collections.favorites
          .where("userId", "==", currentUser.uid)
          .get();
        favorites = favSnap.docs.map(doc => doc.data().listingId);
      }
      AppState.favorites = favorites;

    } catch (err) {
      console.error("Error initializing state:", err);
      AppState.error = err.message || "Error loading listings";
      AppState.listings = [];
      AppState.favorites = [];
    }
  }
};

window.state = state;