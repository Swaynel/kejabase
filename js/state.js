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
  AppState.filters = { location: "", type: "", priceRange: null };
  saveStateToStorage();
}

function applyFilters() {
  return AppState.listings.filter((listing) => {
    const { location, type, priceRange } = AppState.filters;

    const matchesLocation = location
      ? listing.location?.toLowerCase().includes(location.toLowerCase())
      : true;
    const matchesType = type ? listing.type === type : true;
    const matchesPrice = priceRange
      ? listing.price >= priceRange[0] && listing.price <= priceRange[1]
      : true;

    return matchesLocation && matchesType && matchesPrice;
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
    // Fetch houses + bnbs
    const [housesSnap, bnbsSnap] = await Promise.all([
      firebaseServices.firestore.collection("houses").get(),
      firebaseServices.firestore.collection("bnbs").get(),
    ]);

    const houses = housesSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      type: "house",
    }));

    const bnbs = bnbsSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      type: "bnb",
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
    // Always fetch fresh user data from Firestore
    const userDoc = await firebaseServices.firestore.collection("users").doc(user.uid).get();
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
loadStateFromStorage();  // restore state before Firebase re-checks auth
initializeState();       // load listings

// Expose state globally
window.state = {
  AppState,
  updateState,
  resetFilters,
  applyFilters,
  toggleFavorite,
  initializeState,
};
