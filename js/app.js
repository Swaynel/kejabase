/*global ui*/

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

  // Wait for Firebase to be ready before initializing pages
  waitForFirebase().then(() => {
    const path = window.location.pathname;
    if (path.includes("browse.html")) initBrowsePage();
    else if (path.includes("bnb.html")) initBnbPage();
    else if (path.includes("house-detail.html")) initHouseDetailPage();
    else if (path.includes("dashboard-")) initDashboardPage();
  });
});

// ==============================
// Wait for Firebase to be ready
// ==============================
function waitForFirebase() {
  return new Promise((resolve) => {
    if (window.firebaseServices && window.firebaseServices.ready) {
      resolve();
    } else {
      window.addEventListener("firebaseReady", () => resolve(), { once: true });

      const checkFirebase = setInterval(() => {
        if (window.firebaseServices && window.firebaseServices.ready) {
          clearInterval(checkFirebase);
          resolve();
        }
      }, 100);

      setTimeout(() => {
        clearInterval(checkFirebase);
        console.error("Firebase initialization timeout");
        resolve();
      }, 10000);
    }
  });
}
window.waitForFirebase = waitForFirebase;

// ==============================
// Mobile Menu
// ==============================
function toggleMobileMenu() {
  const mobileMenu = document.getElementById("mobile-menu");
  if (mobileMenu) mobileMenu.classList.toggle("hidden");
}
window.toggleMobileMenu = toggleMobileMenu;

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
window.updateUIFromState = updateUIFromState;

// ==============================
// Auth State Listener
// ==============================
waitForFirebase().then(() => {
  window.firebaseServices.auth.onAuthStateChanged(async (user) => {
    if (user) {
      try {
        const userDoc = await window.firebaseServices.collections.users.doc(user.uid).get();
        if (userDoc.exists) {
          const userData = userDoc.data();
          await window.state.updateState(
            { currentUser: { uid: user.uid, ...userData }, role: userData.role || "guest" },
            async () => {
              await window.state.initializeState(updateUIFromState);
            }
          );
        } else {
          console.warn("User document not found in Firestore.");
          await window.state.updateState({ currentUser: null, role: null }, updateUIFromState);
        }
      } catch (err) {
        console.error("Error loading user data:", err);
        window.state.AppState.error = err.message || "Error loading user";
        updateUIFromState();
      }
    } else {
      // Guest user
      await window.state.updateState({ currentUser: null, role: null }, async () => {
        await window.state.initializeState(updateUIFromState);
      });
    }
  });
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
    window.state.updateState(
      { filters: { ...window.state.AppState.filters, location: locationFilter.value } },
      () => ui.renderListings(window.state.applyFilters())
    );
  });

  priceFilter?.addEventListener("change", () => {
    const [min, max] = priceFilter.value.split("-").map(Number);
    window.state.updateState(
      { filters: { ...window.state.AppState.filters, priceRange: [min || 0, max || Infinity] } },
      () => ui.renderListings(window.state.applyFilters())
    );
  });

  typeFilter?.addEventListener("change", () => {
    window.state.updateState(
      { filters: { ...window.state.AppState.filters, type: typeFilter.value } },
      () => ui.renderListings(window.state.applyFilters())
    );
  });

  resetBtn?.addEventListener("click", () => {
    window.state.resetFilters(() => ui.renderListings(window.state.AppState.listings));
  });

  ui.renderListings(window.state.AppState.listings);
}
window.initBrowsePage = initBrowsePage;

// ==============================
// BnB Page
// ==============================
function initBnbPage() {
  initBrowsePage();

  const amenitiesFilter = document.getElementById("amenities-filter");
  amenitiesFilter?.addEventListener("change", () => {
    const selectedAmenities = Array.from(amenitiesFilter.selectedOptions).map((opt) => opt.value);
    window.state.updateState(
      { filters: { ...window.state.AppState.filters, amenities: selectedAmenities } },
      () => ui.renderListings(window.state.applyFilters())
    );
  });
}
window.initBnbPage = initBnbPage;

// ==============================
// House Detail Page
// ==============================
async function initHouseDetailPage() {
  const listingId = new URLSearchParams(window.location.search).get("id");
  if (!listingId) return (window.location.href = "/browse.html");

  let listing = window.state.AppState.listings.find((l) => l.id === listingId);

  if (!listing && window.firebaseServices.auth.currentUser) {
    try {
      const houseDoc = await window.firebaseServices.collections.houses.doc(listingId).get();
      const bnbDoc = await window.firebaseServices.collections.bnbs.doc(listingId).get();

      if (houseDoc.exists) listing = { id: houseDoc.id, ...houseDoc.data(), type: "house" };
      else if (bnbDoc.exists) listing = { id: bnbDoc.id, ...bnbDoc.data(), type: "bnb" };
      else return (window.location.href = "/browse.html");

      window.state.updateState(
        { listings: [...window.state.AppState.listings, listing] },
        () => ui.renderListingDetail(listing)
      );
    } catch (err) {
      console.error(err);
      window.location.href = "/browse.html";
    }
  } else ui.renderListingDetail(listing);

  const bookingForm = document.getElementById("booking-form");
  bookingForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    handleBooking(listingId, listing.type);
  });

  const favoriteButton = document.getElementById("favorite-button");
  favoriteButton?.addEventListener("click", () => window.state.toggleFavorite(listingId, updateUIFromState));
}
window.initHouseDetailPage = initHouseDetailPage;

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
    createdAt: window.firebaseServices.serverTimestamp()
  };

  window.firebaseServices.collections.bookings
    .add(bookingData)
    .then((docRef) => generateBookingReceipt({ id: docRef.id, ...bookingData }))
    .catch((err) => {
      console.error(err);
      alert("Booking failed. Please try again.");
    });
}
window.handleBooking = handleBooking;

// ==============================
// Dashboard Page
// ==============================
function initDashboardPage() {
  console.log("Dashboard page initialized");
}
window.initDashboardPage = initDashboardPage;

// ==============================
// Stub function to satisfy ESLint
// ==============================
function generateBookingReceipt(bookingData) {
  console.log("Booking receipt generated for:", bookingData);
}
window.generateBookingReceipt = generateBookingReceipt;
