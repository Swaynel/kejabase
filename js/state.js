// ==============================
// state.js – Global Application State
// ==============================

const AppState = {
  currentUser: null,
  role: null,
  listings: [],
  filters: {
    location: "",
    type: "",       // "house", "bnb", or empty for all
    priceRange: null,
    amenities: [],
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
  saveStateToStorage();
  console.log("State updated:", AppState);

  if (window.ui) {
    ui.updateNavigation?.();
    ui.renderListings?.(applyFilters());
  }
}

// ==============================
// Filter Helpers
// ==============================
function resetFilters() {
  AppState.filters = { location: "", type: "", priceRange: null, amenities: [] };
  saveStateToStorage();
  if (window.ui) ui.renderListings?.(applyFilters());
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
  if (idx > -1) AppState.favorites.splice(idx, 1);
  else AppState.favorites.push(listingId);

  saveStateToStorage();
  if (window.ui) ui.updateFavoriteButton?.(listingId);
}

// ==============================
// Firebase Integration
// ==============================
async function initializeState() {
  try {
    const houseSnap = await firebaseServices.collections.houses.get();
    const bnbSnap = await firebaseServices.collections.bnbs.get();

    const houses = houseSnap.docs.map((doc) => ({
      id: doc.id,
      type: "house",
      tags: doc.data().tags || [],
      ...doc.data(),
    }));

    const bnbs = bnbSnap.docs.map((doc) => ({
      id: doc.id,
      type: "bnb",
      tags: doc.data().tags || [],
      ...doc.data(),
    }));

    const allListings = [...houses, ...bnbs];
    updateState({ listings: allListings });
  } catch (err) {
    console.error("Error initializing state:", err);
    AppState.error = err.message || "Error loading listings";
  }
}

// ==============================
// Load persisted state
// ==============================
loadStateFromStorage();

// ==============================
// Expose state globally
// ==============================
window.state = {
  AppState,
  updateState,
  resetFilters,
  applyFilters,
  toggleFavorite,
  initializeState,
};
