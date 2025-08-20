// ==============================
// app.js – Main Application Logic
// ==============================

document.addEventListener("DOMContentLoaded", () => {
  // Register service worker
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/service-worker.js")
        .then(() => console.log("ServiceWorker registered"))
        .catch((err) => console.log("ServiceWorker registration failed:", err));
    });
  }

  // Mobile menu toggle
  document.getElementById("mobile-menu-button")?.addEventListener("click", toggleMobileMenu);

  // Page-specific initialization
  const path = window.location.pathname;
  if (path.includes("browse.html")) initBrowsePage();
  else if (path.includes("bnb.html")) initBnbPage();
  else if (path.includes("house-detail.html")) initHouseDetailPage();
  else if (path.includes("dashboard-")) initDashboardPage();
});

// ==============================
// Mobile Menu
// ==============================
function toggleMobileMenu() {
  const mobileMenu = document.getElementById("mobile-menu");
  if (mobileMenu) mobileMenu.classList.toggle("hidden");
}

// ==============================
// Auth State Listener
// ==============================
firebaseServices.auth.onAuthStateChanged(async (user) => {
  if (user) {
    try {
      const userDoc = await firebaseServices.collections.users.doc(user.uid).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        window.state.updateState({
          currentUser: { uid: user.uid, ...userData },
          role: userData.role || "guest",
        });

        // Initialize listings safely
        await window.state.initializeState();
        updateUIFromState();
      } else {
        console.warn("User document not found in Firestore.");
        window.state.updateState({ currentUser: null, role: null });
        updateUIFromState();
      }
    } catch (err) {
      console.error("Error loading user data:", err);
      window.state.AppState.error = err.message || "Error loading user";
      updateUIFromState();
    }
  } else {
    // Guest user
    window.state.updateState({ currentUser: null, role: null });

    // Optional: Load public listings if Firestore rules allow
    // await window.state.initializeState();

    updateUIFromState();
  }
});

// ==============================
// Browse Page
// ==============================
function initBrowsePage() {
  const locationFilter = document.getElementById("location-filter");
  const priceFilter = document.getElementById("price-filter");
  const typeFilter = document.getElementById("type-filter");
  const resetBtn = document.getElementById("reset-filters");

  locationFilter?.addEventListener("input", () => {
    window.state.updateState({
      filters: { ...window.state.AppState.filters, location: locationFilter.value },
    });
    renderListings(window.state.applyFilters());
  });

  priceFilter?.addEventListener("change", () => {
    const [min, max] = priceFilter.value.split("-").map(Number);
    window.state.updateState({
      filters: { ...window.state.AppState.filters, priceRange: [min || 0, max || Infinity] },
    });
    renderListings(window.state.applyFilters());
  });

  typeFilter?.addEventListener("change", () => {
    window.state.updateState({
      filters: { ...window.state.AppState.filters, type: typeFilter.value },
    });
    renderListings(window.state.applyFilters());
  });

  resetBtn?.addEventListener("click", () => {
    window.state.resetFilters();
    renderListings(window.state.AppState.listings);
  });

  renderListings(window.state.AppState.listings);
}

// ==============================
// BnB Page
// ==============================
function initBnbPage() {
  initBrowsePage();

  const amenitiesFilter = document.getElementById("amenities-filter");
  amenitiesFilter?.addEventListener("change", () => {
    const selectedAmenities = Array.from(amenitiesFilter.selectedOptions).map((opt) => opt.value);
    window.state.updateState({
      filters: { ...window.state.AppState.filters, amenities: selectedAmenities },
    });
    renderListings(window.state.applyFilters());
  });
}

// ==============================
// House Detail Page
// ==============================
async function initHouseDetailPage() {
  const listingId = new URLSearchParams(window.location.search).get("id");
  if (!listingId) return (window.location.href = "/browse.html");

  let listing = window.state.AppState.listings.find((l) => l.id === listingId);

  if (!listing && firebaseServices.auth.currentUser) {
    try {
      const houseDoc = await firebaseServices.collections.houses.doc(listingId).get();
      const bnbDoc = await firebaseServices.collections.bnbs.doc(listingId).get();

      if (houseDoc.exists) listing = { id: houseDoc.id, ...houseDoc.data(), type: "house" };
      else if (bnbDoc.exists) listing = { id: bnbDoc.id, ...bnbDoc.data(), type: "bnb" };
      else return (window.location.href = "/browse.html");

      window.state.updateState({ listings: [...window.state.AppState.listings, listing] });
      renderListingDetail(listing);
    } catch (err) {
      console.error(err);
      window.location.href = "/browse.html";
    }
  } else renderListingDetail(listing);

  // Booking form
  const bookingForm = document.getElementById("booking-form");
  bookingForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    handleBooking(listingId, listing.type);
  });

  // Favorite button
  const favoriteButton = document.getElementById("favorite-button");
  favoriteButton?.addEventListener("click", () => window.state.toggleFavorite(listingId));
}

// ==============================
// Booking
// ==============================
function handleBooking(listingId, listingType) {
  if (!window.state.AppState.currentUser) {
    alert("Please login to make a booking.");
    return;
  }

  const bookingForm = document.getElementById("booking-form");
  if (!bookingForm) return;

  const formData = new FormData(bookingForm);
  const bookingData = {
    listingId,
    listingType,
    userId: window.state.AppState.currentUser.uid,
    startDate: formData.get("start-date"),
    endDate: formData.get("end-date"),
    guests: parseInt(formData.get("guests")),
    specialRequests: formData.get("special-requests"),
    status: "pending",
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  };

  firebaseServices.collections.bookings
    .add(bookingData)
    .then((docRef) => generateBookingReceipt({ id: docRef.id, ...bookingData }))
    .catch((err) => {
      console.error(err);
      alert("Booking failed. Please try again.");
    });
}

// ==============================
// Render Listings
// ==============================
function renderListings(listings) {
  const container = document.getElementById("listings-container");
  if (!container) return;

  container.innerHTML = "";

  if (listings.length === 0) {
    container.innerHTML = `<div class="col-span-full text-center py-12"><p class="text-lg text-gray-600">No listings match your filters.</p></div>`;
    return;
  }

  listings.forEach((listing) => {
    const el = document.createElement("div");
    el.className = "bg-white rounded-lg overflow-hidden shadow-md hover:shadow-lg transition-shadow";
    el.innerHTML = `
      <a href="/house-detail.html?id=${listing.id}">
        <div class="relative">
          <img src="${listing.images?.[0] || '/images/placeholder.jpg'}" alt="${listing.title}" class="w-full h-48 object-cover">
          <div class="absolute top-2 right-2">
            <button class="favorite-btn p-2 bg-white rounded-full shadow-md" data-id="${listing.id}">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 ${
                window.state.AppState.favorites.includes(listing.id) ? 'text-red-500 fill-red-500' : 'text-gray-400'
              }" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </button>
          </div>
        </div>
        <div class="p-4">
          <h3 class="font-semibold text-lg mb-1">${listing.title}</h3>
          <p class="text-gray-600 text-sm mb-2">${listing.location}</p>
          <div class="flex justify-between items-center">
            <span class="font-bold">$${listing.price}${listing.type==='bnb'?'/night':'/month'}</span>
          </div>
        </div>
      </a>
    `;
    container.appendChild(el);

    const favBtn = el.querySelector(".favorite-btn");
    favBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      window.state.toggleFavorite(listing.id);
      const svg = e.currentTarget.querySelector("svg");
      if (window.state.AppState.favorites.includes(listing.id)) {
        svg.classList.add("text-red-500", "fill-red-500");
        svg.classList.remove("text-gray-400");
      } else {
        svg.classList.remove("text-red-500", "fill-red-500");
        svg.classList.add("text-gray-400");
      }
    });
  });
}

// ==============================
// UI State Sync
// ==============================
function updateUIFromState() {
  document.querySelectorAll("[data-auth]").forEach(el => {
    const authState = el.getAttribute("data-auth");
    if (authState === "authenticated") el.style.display = window.state.AppState.currentUser ? "block" : "none";
    else if (authState === "unauthenticated") el.style.display = window.state.AppState.currentUser ? "none" : "block";
  });

  document.querySelectorAll("[data-role]").forEach(el => {
    const requiredRole = el.getAttribute("data-role");
    el.style.display = window.state.AppState.role === requiredRole ? "block" : "none";
  });
}

// ==============================
// Dashboard Page
// ==============================
function initDashboardPage() {
  console.log("Dashboard page initialized");
}
