// ==============================
// Global Application State
// ==============================
const AppState = {
  currentUser: null,
  role: null,
  listings: [],
  filters: {
    location: "",
    type: "",
    priceRange: null,
    amenities: [], // ✅ Added amenities filter
  },
  favorites: [],
  error: null,
};

// ==============================
// Persistence Helpers
// ==============================
function saveStateToStorage() {
  try {
    const stateToSave = {
      currentUser: AppState.currentUser,
      role: AppState.role,
      favorites: AppState.favorites,
    };
    localStorage.setItem("appState", JSON.stringify(stateToSave));
  } catch (e) {
    console.error("Error saving state:", e);
  }
}

function loadStateFromStorage() {
  try {
    const saved = localStorage.getItem("appState");
    if (saved) {
      const parsed = JSON.parse(saved);
      AppState.currentUser = parsed.currentUser || null;
      AppState.role = parsed.role || null;
      AppState.favorites = parsed.favorites || [];
    }
  } catch (e) {
    console.error("Error loading state:", e);
  }
}

// ==============================
// State Updater
// ==============================
function updateState(newState) {
  Object.assign(AppState, newState);
  saveStateToStorage(); // persist after every update
  console.log("State updated:", AppState);
}

// ==============================
// Filter Helpers
// ==============================
function resetFilters() {
  AppState.filters = { location: "", type: "", priceRange: null, amenities: [] };
  saveStateToStorage();
}

function applyFilters() {
  return AppState.listings.filter((listing) => {
    const { location, type, priceRange, amenities } = AppState.filters;

    const matchesLocation = location
      ? listing.location?.toLowerCase().includes(location.toLowerCase())
      : true;
    const matchesType = type ? listing.type === type : true;
    const matchesPrice = priceRange
      ? listing.price >= priceRange[0] && listing.price <= priceRange[1]
      : true;
    const matchesAmenities =
      amenities?.length > 0
        ? amenities.every((a) => listing.tags?.includes(a))
        : true;

    return matchesLocation && matchesType && matchesPrice && matchesAmenities;
  });
}

// ==============================
// Favorites Management
// ==============================
function toggleFavorite(listingId) {
  const idx = AppState.favorites.indexOf(listingId);
  if (idx > -1) {
    AppState.favorites.splice(idx, 1);
  } else {
    AppState.favorites.push(listingId);
  }
  saveStateToStorage();
}

// ==============================
// Firebase Integration
// ==============================
async function initializeState() {
  try {
    const [housesSnap, bnbsSnap] = await Promise.all([
      firebaseServices.collections.houses.get(),
      firebaseServices.collections.bnbs.get(),
    ]);

    const houses = housesSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      type: "house",
      tags: doc.data().tags || [],
    }));

    const bnbs = bnbsSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      type: "bnb",
      tags: doc.data().tags || [],
    }));

    updateState({ listings: [...houses, ...bnbs] });
  } catch (err) {
    console.error("Error initializing state:", err);
    AppState.error = err.message || "Error loading listings";
  }
}

// ==============================
// Auth State Watcher
// ==============================
firebaseServices.auth.onAuthStateChanged(async (user) => {
  if (user) {
    const userDoc = await firebaseServices.collections.users.doc(user.uid).get();
    const userData = userDoc.data();

    updateState({
      currentUser: { uid: user.uid, ...userData },
      role: userData?.role || "guest",
    });
  } else {
    updateState({ currentUser: null, role: null });
  }
});

// ==============================
// Initialize on Page Load
// ==============================
loadStateFromStorage(); // restore state before Firebase re-checks auth
initializeState(); // load listings

// Expose state globally
window.state = {
  AppState,
  updateState,
  resetFilters,
  applyFilters,
  toggleFavorite,
  initializeState,
};
