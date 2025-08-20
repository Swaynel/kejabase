// ==============================
// App.js – Main Application Logic
// ==============================

// Wait until DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  // Initialize state (listings, auth)
  state.initializeState();

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
  const mobileMenuButton = document.getElementById("mobile-menu-button");
  if (mobileMenuButton) {
    mobileMenuButton.addEventListener("click", toggleMobileMenu);
  }

  // Page-specific initialization
  const path = window.location.pathname;
  if (path.includes("browse.html")) initBrowsePage();
  else if (path.includes("bnb.html")) initBnbPage();
  else if (path.includes("house-detail.html")) initHouseDetailPage();
  else if (path.includes("dashboard-")) initDashboardPage();

  // Initial UI sync
  updateUIFromState();
});

// ==============================
// Mobile Menu
// ==============================
function toggleMobileMenu() {
  const mobileMenu = document.getElementById("mobile-menu");
  if (mobileMenu) mobileMenu.classList.toggle("hidden");
}

// ==============================
// Browse Page
// ==============================
function initBrowsePage() {
  const locationFilter = document.getElementById("location-filter");
  const priceFilter = document.getElementById("price-filter");
  const typeFilter = document.getElementById("type-filter");
  const resetBtn = document.getElementById("reset-filters");

  if (locationFilter)
    locationFilter.addEventListener("input", () => {
      state.updateState({
        filters: { ...state.AppState.filters, location: locationFilter.value },
      });
      renderListings(state.applyFilters());
    });

  if (priceFilter)
    priceFilter.addEventListener("change", () => {
      const [min, max] = priceFilter.value.split("-").map(Number);
      state.updateState({
        filters: { ...state.AppState.filters, priceRange: [min || 0, max || Infinity] },
      });
      renderListings(state.applyFilters());
    });

  if (typeFilter)
    typeFilter.addEventListener("change", () => {
      state.updateState({
        filters: { ...state.AppState.filters, type: typeFilter.value },
      });
      renderListings(state.applyFilters());
    });

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      state.resetFilters();
      renderListings(state.AppState.listings);
    });
  }

  // Render initial listings
  renderListings(state.AppState.listings);
}

// ==============================
// BnB Page
// ==============================
function initBnbPage() {
  initBrowsePage();

  const amenitiesFilter = document.getElementById("amenities-filter");
  if (amenitiesFilter)
    amenitiesFilter.addEventListener("change", () => {
      const selectedAmenities = Array.from(amenitiesFilter.selectedOptions).map((opt) => opt.value);
      // Treat amenities as tags filter
      state.updateState({
        filters: { ...state.AppState.filters, amenities: selectedAmenities },
      });
      renderListings(state.applyFilters());
    });
}

// ==============================
// House Detail Page
// ==============================
function initHouseDetailPage() {
  const urlParams = new URLSearchParams(window.location.search);
  const listingId = urlParams.get("id");
  if (!listingId) return (window.location.href = "/browse.html");

  let listing = state.AppState.listings.find((l) => l.id === listingId);

  // Fetch from Firestore if not in state
  if (!listing) {
    const collections =
      state.AppState.listings.find((l) => l.id === listingId)?.type === "bnb"
        ? firebaseServices.collections.bnbs
        : firebaseServices.collections.houses;

    collections
      .doc(listingId)
      .get()
      .then((doc) => {
        if (doc.exists) {
          listing = { id: doc.id, ...doc.data() };
          state.updateState({ listings: [...state.AppState.listings, listing] });
          renderListingDetail(listing);
        } else window.location.href = "/browse.html";
      })
      .catch((err) => {
        console.error(err);
        window.location.href = "/browse.html";
      });
  } else renderListingDetail(listing);

  // Booking form
  const bookingForm = document.getElementById("booking-form");
  if (bookingForm)
    bookingForm.addEventListener("submit", (e) => {
      e.preventDefault();
      handleBooking(listingId, listing.type);
    });

  // Favorite button
  const favoriteButton = document.getElementById("favorite-button");
  if (favoriteButton) {
    favoriteButton.addEventListener("click", () => state.toggleFavorite(listingId));
  }
}

// ==============================
// Booking
// ==============================
function handleBooking(listingId, listingType) {
  const bookingForm = document.getElementById("booking-form");
  if (!bookingForm) return;

  const formData = new FormData(bookingForm);
  const bookingData = {
    listingId,
    listingType,
    userId: state.AppState.currentUser.uid,
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

function generateBookingReceipt(booking) {
  const listing = state.AppState.listings.find((l) => l.id === booking.listingId);
  if (!listing) return;

  const receiptHTML = `
    <div class="bg-white p-6 rounded-lg shadow-md max-w-2xl mx-auto">
      <h2 class="text-2xl font-bold mb-4">Booking Confirmation</h2>
      <div class="mb-6">
        <h3 class="text-lg font-semibold mb-2">${listing.title}</h3>
        <p class="text-gray-600">${listing.location}</p>
      </div>
      <div class="grid grid-cols-2 gap-4 mb-6">
        <div><p class="text-sm text-gray-500">Check-in</p><p>${new Date(
          booking.startDate
        ).toLocaleDateString()}</p></div>
        <div><p class="text-sm text-gray-500">Check-out</p><p>${new Date(
          booking.endDate
        ).toLocaleDateString()}</p></div>
        <div><p class="text-sm text-gray-500">Guests</p><p>${booking.guests}</p></div>
        <div><p class="text-sm text-gray-500">Booking ID</p><p>${booking.id}</p></div>
      </div>
      <div class="mb-6">
        <h4 class="font-semibold mb-2">Price Summary</h4>
        <div class="border-t border-b border-gray-200 py-2">
          <div class="flex justify-between py-1">
            <span>${listing.price} x ${Math.ceil(
    (new Date(booking.endDate) - new Date(booking.startDate)) / (1000 * 60 * 60 * 24)
  )} nights</span>
            <span>$${(listing.price *
    Math.ceil((new Date(booking.endDate) - new Date(booking.startDate)) / (1000 * 60 * 60 * 24)
  )).toFixed(2)}</span>
          </div>
          <div class="flex justify-between py-1 font-semibold">
            <span>Total</span>
            <span>$${(listing.price *
    Math.ceil((new Date(booking.endDate) - new Date(booking.startDate)) / (1000 * 60 * 60 * 24)
  )).toFixed(2)}</span>
          </div>
        </div>
      </div>
      <div class="flex justify-between">
        <button onclick="window.print()" class="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700">Print Receipt</button>
        <button onclick="document.getElementById('receipt-modal').classList.add('hidden')" class="bg-gray-200 px-4 py-2 rounded-md hover:bg-gray-300">Close</button>
      </div>
    </div>
  `;

  const receiptModal = document.getElementById("receipt-modal");
  if (receiptModal) {
    receiptModal.innerHTML = receiptHTML;
    receiptModal.classList.remove("hidden");
  }
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
                state.AppState.favorites.includes(listing.id) ? 'text-red-500 fill-red-500' : 'text-gray-400'
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

    // Favorite button event
    el.querySelector(".favorite-btn")?.addEventListener("click", (e) => {
      e.preventDefault();
      state.toggleFavorite(listing.id);
      renderListings(listings);
    });
  });
}

// ==============================
// Render Listing Detail
// ==============================
function renderListingDetail(listing) {
  if (!listing) return;
  document.title = `${listing.title} | Kejabase`;

  const titleElement = document.getElementById("listing-title");
  const locationElement = document.getElementById("listing-location");
  const priceElement = document.getElementById("listing-price");
  
  if (titleElement) titleElement.textContent = listing.title;
  if (locationElement) locationElement.textContent = listing.location;
  if (priceElement) {
    priceElement.textContent = `$${listing.price}${listing.type === "bnb" ? "/night" : "/month"}`;
  }

  // Gallery
  const gallery = document.getElementById("listing-gallery");
  if (gallery) {
    gallery.innerHTML = "";
    listing.images?.forEach((img) => {
      const div = document.createElement("div");
      div.className = "rounded-lg overflow-hidden";
      div.innerHTML = `<img src="${img}" alt="${listing.title}" class="w-full h-full object-cover">`;
      gallery.appendChild(div);
    });
  }

  // Tags / amenities
  const amenities = document.getElementById("amenities-list");
  if (amenities) {
    amenities.innerHTML = "";
    listing.tags?.forEach((tag) => {
      const li = document.createElement("li");
      li.className = "flex items-center space-x-2";
      li.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-green-500" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
        </svg>
        <span>${tag}</span>`;
      amenities.appendChild(li);
    });
  }

  const descriptionElement = document.getElementById("listing-description");
  if (descriptionElement) {
    descriptionElement.textContent = listing.description;
  }
}

// ==============================
// Dashboard Page
// ==============================
function initDashboardPage() {
  // Dashboard-specific initialization
  console.log("Dashboard page initialized");
}

// ==============================
// UI State Sync
// ==============================
function updateUIFromState() {
  // Update auth-related UI
  const authElements = document.querySelectorAll("[data-auth]");
  authElements.forEach(el => {
    const authState = el.getAttribute("data-auth");
    if (authState === "authenticated") {
      el.style.display = state.AppState.currentUser ? "block" : "none";
    } else if (authState === "unauthenticated") {
      el.style.display = state.AppState.currentUser ? "none" : "block";
    }
  });

  // Update role-based UI
  const roleElements = document.querySelectorAll("[data-role]");
  roleElements.forEach(el => {
    const requiredRole = el.getAttribute("data-role");
    el.style.display = state.AppState.role === requiredRole ? "block" : "none";
  });
}