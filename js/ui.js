/* global state */
// ==============================
// ui.js – UI Update Functions
// ==============================

const ui = {
  // Show/hide loading indicators
  showLoading() {
    document.querySelectorAll('.loading-indicator').forEach(el => el.classList.remove('hidden'));
  },
  hideLoading() {
    document.querySelectorAll('.loading-indicator').forEach(el => el.classList.add('hidden'));
  },

  // Show/hide errors
  showError(message, elementId = 'error-message') {
    const el = document.getElementById(elementId);
    if (el) {
      el.textContent = message;
      el.classList.remove('hidden');
    }
  },
  hideError(elementId = 'error-message') {
    const el = document.getElementById(elementId);
    if (el) el.classList.add('hidden');
  },

  // Update nav links based on auth state
  updateNavigation() {
    const currentState = state.AppState;
    document.querySelectorAll('[data-auth]').forEach(link => {
      const role = link.getAttribute('data-auth');
      const shouldShow =
        (currentState.role === role) ||
        (currentState.currentUser && role === 'authenticated') ||
        (!currentState.currentUser && role === 'guest');
      link.classList.toggle('hidden', !shouldShow);
    });
  },

  // Initialize date pickers
  initDatePickers() {
    document.querySelectorAll('input[type="date"]').forEach(input => {
      if (!input.value) input.value = new Date().toISOString().split('T')[0];
    });
  },

  // Update favorite button
  updateFavoriteButton(listingId) {
    const btn = document.getElementById('favorite-button');
    if (!btn) return;
    const isFav = state.AppState.favorites.includes(listingId);
    btn.textContent = isFav ? 'Remove from Favorites' : 'Add to Favorites';
    btn.classList.toggle('bg-red-500', isFav);
    btn.classList.toggle('hover:bg-red-600', isFav);
    btn.classList.toggle('bg-gray-200', !isFav);
    btn.classList.toggle('hover:bg-gray-300', !isFav);
  },

  // Render multiple listings in a container
  renderListings(listings) {
    const container = document.getElementById('listings-container');
    if (!container) return;

    container.innerHTML = '';
    if (!listings.length) {
      container.innerHTML = `
        <div class="col-span-full text-center py-12">
          <p class="text-lg text-gray-600">No listings match your filters.</p>
        </div>`;
      return;
    }

    listings.forEach(listing => {
      const div = document.createElement('div');
      div.className = 'bg-white rounded-lg overflow-hidden shadow-md hover:shadow-lg transition-shadow';
      div.innerHTML = `
        <a href="/house-detail.html?id=${listing.id}">
          <div class="relative">
            <img src="${listing.images?.[0] || '/images/placeholder.jpg'}" 
                 alt="${listing.title}" class="w-full h-48 object-cover">
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
        </a>`;
      container.appendChild(div);

      const favBtn = div.querySelector(".favorite-btn");
      favBtn?.addEventListener("click", (e) => {
        e.preventDefault();
        state.toggleFavorite(listing.id, window.updateUIFromState);

        const svg = e.currentTarget.querySelector("svg");
        if (state.AppState.favorites.includes(listing.id)) {
          svg.classList.add("text-red-500", "fill-red-500");
          svg.classList.remove("text-gray-400");
        } else {
          svg.classList.remove("text-red-500", "fill-red-500");
          svg.classList.add("text-gray-400");
        }
      });
    });
  },

  // Render single listing detail
  renderListingDetail(listing) {
    const container = document.getElementById('listing-detail-container');
    if (!container) return;

    container.innerHTML = `
      <div class="bg-white rounded-lg shadow-md p-6">
        <h2 class="text-2xl font-bold mb-2">${listing.title}</h2>
        <p class="text-gray-600 mb-2">${listing.location}</p>
        <p class="text-gray-700 mb-4">${listing.description || 'No description available.'}</p>
        <p class="font-bold text-lg mb-2">$${listing.price}${listing.type==='bnb'?'/night':'/month'}</p>
        <div class="grid grid-cols-2 gap-2">
          ${listing.images?.map(img => `<img src="${img}" class="w-full h-40 object-cover rounded">`).join('') || ''}
        </div>
        <button id="favorite-button" class="mt-4 px-4 py-2 rounded ${
          state.AppState.favorites.includes(listing.id) ? 'bg-red-500 text-white' : 'bg-gray-200'
        }">
          ${state.AppState.favorites.includes(listing.id) ? 'Remove from Favorites' : 'Add to Favorites'}
        </button>
      </div>`;

    const favBtn = document.getElementById('favorite-button');
    favBtn?.addEventListener('click', () => {
      state.toggleFavorite(listing.id, () => ui.updateFavoriteButton(listing.id));
    });
  },

  // Initialize filters
  initFilters() {
    const typeSelect = document.getElementById('filter-type');
    if (typeSelect) typeSelect.addEventListener('change', e => {
      state.AppState.filters.type = e.target.value;
      ui.renderListings(state.applyFilters());
    });

    const locInput = document.getElementById('filter-location');
    if (locInput) locInput.addEventListener('input', e => {
      state.AppState.filters.location = e.target.value;
      ui.renderListings(state.applyFilters());
    });

    const priceMinInput = document.getElementById('filter-price-min');
    const priceMaxInput = document.getElementById('filter-price-max');
    const updatePriceFilter = () => {
      const min = parseFloat(priceMinInput?.value) || 0;
      const max = parseFloat(priceMaxInput?.value) || Infinity;
      state.AppState.filters.priceRange = [min, max];
      ui.renderListings(state.applyFilters());
    };
    if (priceMinInput) priceMinInput.addEventListener('input', updatePriceFilter);
    if (priceMaxInput) priceMaxInput.addEventListener('input', updatePriceFilter);

    const amenityCheckboxes = document.querySelectorAll('input[name="filter-amenities"]');
    amenityCheckboxes.forEach(cb => cb.addEventListener('change', () => {
      state.AppState.filters.amenities = Array.from(amenityCheckboxes)
        .filter(c => c.checked)
        .map(c => c.value);
      ui.renderListings(state.applyFilters());
    }));
  },

  // Initialize UI
  init() {
    this.updateNavigation();
    this.initDatePickers();
    this.initFilters();
  }
};

document.addEventListener('DOMContentLoaded', () => ui.init());
window.ui = ui;
