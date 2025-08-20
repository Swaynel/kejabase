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

  // Update state partially
  updateState(updates) {
    Object.assign(AppState, updates);
    if (typeof updateUIFromState === "function") updateUIFromState();
  },

  // Reset filters
  resetFilters() {
    AppState.filters = {
      location: "",
      priceRange: [0, Infinity],
      type: "",
      amenities: [],
    };
  },

  // Toggle favorite listing
  toggleFavorite(listingId) {
    const index = AppState.favorites.indexOf(listingId);
    if (index >= 0) AppState.favorites.splice(index, 1);
    else AppState.favorites.push(listingId);
  },

  // Apply filters and return filtered listings
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

  // Initialize state (load listings from Firestore)
  async initializeState() {
    try {
      let houses = [];
      let bnbs = [];

      if (firebaseServices.auth.currentUser) {
        // Fetch houses and BnBs
        const housesSnap = await firebaseServices.collections.houses.get();
        houses = housesSnap.docs.map((doc) => ({ id: doc.id, type: "house", ...doc.data() }));

        const bnbsSnap = await firebaseServices.collections.bnbs.get();
        bnbs = bnbsSnap.docs.map((doc) => ({ id: doc.id, type: "bnb", ...doc.data() }));

        AppState.listings = [...houses, ...bnbs];

        // Optionally fetch user favorites
        const favSnap = await firebaseServices.collections.favorites
          .where("userId", "==", firebaseServices.auth.currentUser.uid)
          .get();
        AppState.favorites = favSnap.docs.map((doc) => doc.data().listingId);
      } else {
        // Guest users: optionally load only public listings
        const housesSnap = await firebaseServices.collections.houses
          .where("public", "==", true)
          .get();
        houses = housesSnap.docs.map((doc) => ({ id: doc.id, type: "house", ...doc.data() }));

        const bnbsSnap = await firebaseServices.collections.bnbs
          .where("public", "==", true)
          .get();
        bnbs = bnbsSnap.docs.map((doc) => ({ id: doc.id, type: "bnb", ...doc.data() }));

        AppState.listings = [...houses, ...bnbs];
        AppState.favorites = [];
      }
    } catch (err) {
      console.error("Error initializing state:", err);
      AppState.error = err.message || "Error loading listings";
      AppState.listings = [];
      AppState.favorites = [];
    }
  },
};

// Expose globally
window.state = state;
