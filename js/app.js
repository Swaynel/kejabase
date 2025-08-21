// js/app.js
import firebaseServices from './firebase.js';
import { state } from './state.js';
import { ui } from './ui.js';

// ==============================
// Main Initialization
// ==============================
document.addEventListener("DOMContentLoaded", () => {
  // Register service worker
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/service-worker.js")
      .then(() => console.log("ServiceWorker registered"))
      .catch(err => console.error("ServiceWorker registration failed:", err));
  }

  // Mobile menu toggle
  document.getElementById("mobile-menu-button")?.addEventListener("click", toggleMobileMenu);

  // Wait for Firebase
  waitForFirebase().then(() => {
    const path = window.location.pathname;
    if (path.includes("browse.html")) initBrowsePage();
    else if (path.includes("bnb.html")) initBnbPage();
    else if (path.includes("house-detail.html")) initHouseDetailPage();
    else if (path.includes("dashboard-")) initDashboardPage();
  });
});

// ==============================
// Wait for Firebase Ready
// ==============================
export function waitForFirebase() {
  return new Promise(resolve => {
    if (firebaseServices.ready) resolve();
    else {
      window.addEventListener("firebaseReady", () => resolve(), { once: true });
      const check = setInterval(() => {
        if (firebaseServices.ready) {
          clearInterval(check);
          resolve();
        }
      }, 100);
      setTimeout(() => { clearInterval(check); console.error("Firebase init timeout"); resolve(); }, 10000);
    }
  });
}

// ==============================
// Mobile Menu
// ==============================
export function toggleMobileMenu() {
  const mobileMenu = document.getElementById("mobile-menu");
  if (mobileMenu) mobileMenu.classList.toggle("hidden");
}

// ==============================
// UI State Sync
// ==============================
export function updateUIFromState() {
  document.querySelectorAll("[data-auth]").forEach(el => {
    const authState = el.getAttribute("data-auth");
    el.style.display = (authState === "authenticated")
      ? (state.AppState.currentUser ? "block" : "none")
      : (state.AppState.currentUser ? "none" : "block");
  });

  document.querySelectorAll("[data-role]").forEach(el => {
    const requiredRole = el.getAttribute("data-role");
    el.style.display = state.AppState.role === requiredRole ? "block" : "none";
  });
}

// ==============================
// Auth Listener
// ==============================
waitForFirebase().then(() => {
  firebaseServices.auth.onAuthStateChanged(async (user) => {
    if (user) {
      try {
        const userDoc = await firebaseServices.collections.users.doc(user.uid).get();
        if (userDoc.exists) {
          const userData = userDoc.data();
          await state.updateState({ currentUser: { uid: user.uid, ...userData }, role: userData.role || "guest" }, async () => {
            await state.initializeState(updateUIFromState);
          });
        } else {
          console.warn("User document not found.");
          await state.updateState({ currentUser: null, role: null }, updateUIFromState);
        }
      } catch (err) {
        console.error("Error loading user:", err);
        state.AppState.error = err.message || "Error loading user";
        updateUIFromState();
      }
    } else {
      await state.updateState({ currentUser: null, role: null }, async () => {
        await state.initializeState(updateUIFromState);
      });
    }
  });
});

// ==============================
// Browse Page
// ==============================
export function initBrowsePage() {
  const locationFilter = document.getElementById("location-filter");
  const priceFilter = document.getElementById("price-filter");
  const typeFilter = document.getElementById("type-filter");
  const resetBtn = document.getElementById("reset-filters");

  locationFilter?.addEventListener("input", () => {
    state.updateState({ filters: { ...state.AppState.filters, location: locationFilter.value } }, () => ui.renderListings(state.applyFilters()));
  });

  priceFilter?.addEventListener("change", () => {
    const [min, max] = priceFilter.value.split("-").map(Number);
    state.updateState({ filters: { ...state.AppState.filters, priceRange: [min || 0, max || Infinity] } }, () => ui.renderListings(state.applyFilters()));
  });

  typeFilter?.addEventListener("change", () => {
    state.updateState({ filters: { ...state.AppState.filters, type: typeFilter.value } }, () => ui.renderListings(state.applyFilters()));
  });

  resetBtn?.addEventListener("click", () => {
    state.resetFilters(() => ui.renderListings(state.AppState.listings));
  });

  ui.renderListings(state.AppState.listings);
}

// ==============================
// BnB Page
// ==============================
export function initBnbPage() {
  initBrowsePage();
  const amenitiesFilter = document.getElementById("amenities-filter");
  amenitiesFilter?.addEventListener("change", () => {
    const selectedAmenities = Array.from(amenitiesFilter.selectedOptions).map(opt => opt.value);
    state.updateState({ filters: { ...state.AppState.filters, amenities: selectedAmenities } }, () => ui.renderListings(state.applyFilters()));
  });
}

// ==============================
// House Detail Page
// ==============================
export async function initHouseDetailPage() {
  const listingId = new URLSearchParams(window.location.search).get("id");
  if (!listingId) return (window.location.href = "/browse.html");

  let listing = state.AppState.listings.find(l => l.id === listingId);

  if (!listing && firebaseServices.auth.currentUser) {
    try {
      const houseDoc = await firebaseServices.collections.houses.doc(listingId).get();
      const bnbDoc = await firebaseServices.collections.bnbs.doc(listingId).get();
      if (houseDoc.exists) listing = { id: houseDoc.id, ...houseDoc.data(), type: "house" };
      else if (bnbDoc.exists) listing = { id: bnbDoc.id, ...bnbDoc.data(), type: "bnb" };
      else return (window.location.href = "/browse.html");

      state.updateState({ listings: [...state.AppState.listings, listing] }, () => ui.renderListingDetail(listing));
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
  favoriteButton?.addEventListener("click", () => state.toggleFavorite(listingId, updateUIFromState));
}

// ==============================
// Booking
// ==============================
export function handleBooking(listingId, listingType) {
  if (!state.AppState.currentUser) return alert("Please login to make a booking.");

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
    createdAt: firebaseServices.serverTimestamp()
  };

  firebaseServices.collections.bookings.add(bookingData)
    .then(docRef => generateBookingReceipt({ id: docRef.id, ...bookingData }))
    .catch(err => { console.error(err); alert("Booking failed. Please try again."); });
}

// ==============================
// Dashboard Page
// ==============================
export function initDashboardPage() {
  console.log("Dashboard page initialized");
}

// ==============================
// Booking Receipt Stub
// ==============================
export function generateBookingReceipt(bookingData) {
  console.log("Booking receipt generated for:", bookingData);
}
