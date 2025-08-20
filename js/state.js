// Global application state
const AppState = {
  currentUser: null,
  userRole: null,
  listings: [],
  filteredListings: [],
  activeFilters: {
    location: '',
    minPrice: 0,
    maxPrice: Infinity,
    tags: []
  },
  favorites: [],
  isLoading: false,
  error: null
};

// Update state and sync UI
function updateState(newState) {
  Object.assign(AppState, newState);
  updateUIFromState();
}

// Get current state
function getState() {
  return AppState;
}

// Reset filters to default
function resetFilters() {
  AppState.activeFilters = {
    location: '',
    minPrice: 0,
    maxPrice: Infinity,
    tags: []
  };
  AppState.filteredListings = AppState.listings;
  updateUIFromState();
}

// Apply filters to listings
function applyFilters() {
  const { location, minPrice, maxPrice, tags } = AppState.activeFilters;
  
  AppState.filteredListings = AppState.listings.filter(listing => {
    const matchesLocation = !location || 
      listing.location.toLowerCase().includes(location.toLowerCase());
    const matchesPrice = listing.price >= minPrice && listing.price <= maxPrice;
    const matchesTags = tags.length === 0 || 
      tags.every(tag => listing.tags.includes(tag));
    
    return matchesLocation && matchesPrice && matchesTags;
  });
  
  updateUIFromState();
}

// Toggle favorite status for a listing
function toggleFavorite(listingId) {
  const index = AppState.favorites.indexOf(listingId);
  if (index === -1) {
    AppState.favorites.push(listingId);
  } else {
    AppState.favorites.splice(index, 1);
  }
  updateUIFromState();
  
  // Save favorites to Firestore if user is logged in
  if (AppState.currentUser) {
    firebaseServices.collections.users
      .doc(AppState.currentUser.uid)
      .update({
        favorites: AppState.favorites
      })
      .catch(error => {
        console.error("Error updating favorites:", error);
      });
  }
}

// Initialize state from Firebase
async function initializeState() {
  try {
    updateState({ isLoading: true });
    
    // Load listings
    const housesSnapshot = await firebaseServices.collections.houses.get();
    const bnbsSnapshot = await firebaseServices.collections.bnbs.get();
    
    const houses = housesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      type: 'house'
    }));
    
    const bnbs = bnbsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      type: 'bnb'
    }));
    
    const allListings = [...houses, ...bnbs];
    
    updateState({ 
      listings: allListings,
      filteredListings: allListings,
      isLoading: false 
    });
    
    // Load user favorites if logged in
    if (AppState.currentUser) {
      const userDoc = await firebaseServices.collections.users
        .doc(AppState.currentUser.uid)
        .get();
      
      if (userDoc.exists) {
        updateState({ 
          favorites: userDoc.data().favorites || [] 
        });
      }
    }
  } catch (error) {
    updateState({ 
      isLoading: false,
      error: error.message 
    });
  }
}

// Listen for auth state changes
firebaseServices.auth.onAuthStateChanged(user => {
  if (user) {
    // User is signed in
    firebaseServices.collections.users
      .doc(user.uid)
      .get()
      .then(doc => {
        if (doc.exists) {
          updateState({
            currentUser: user,
            userRole: doc.data().role,
            favorites: doc.data().favorites || []
          });
        } else {
          // User doc doesn't exist, sign them out
          firebaseServices.auth.signOut();
        }
      })
      .catch(error => {
        console.error("Error getting user document:", error);
      });
  } else {
    // User is signed out
    updateState({
      currentUser: null,
      userRole: null,
      favorites: []
    });
  }
});

// Expose state functions to global scope
window.state = {
  updateState,
  getState,
  resetFilters,
  applyFilters,
  toggleFavorite,
  initializeState
};