// ==============================
// UI update functions
// ==============================
const ui = {
  // Show/hide loading spinner
  showLoading() {
    document.querySelectorAll('.loading-indicator')
      .forEach(el => el.classList.remove('hidden'));
  },
  hideLoading() {
    document.querySelectorAll('.loading-indicator')
      .forEach(el => el.classList.add('hidden'));
  },

  // Show/hide error messages
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

  // Update navigation links based on auth state
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

  // Initialize date pickers with today as default
  initDatePickers() {
    document.querySelectorAll('input[type="date"]').forEach(input => {
      if (!input.value) input.value = new Date().toISOString().split('T')[0];
    });
  },

  // Update favorites button
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

  // Render listings in a container
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
          </div>
          <div class="p-4">
            <h3 class="font-semibold text-lg mb-1">${listing.title}</h3>
            <p class="text-gray-600 text-sm mb-2">${listing.location}</p>
            <span class="font-bold">$${listing.price}${listing.type==='bnb'?'/night':'/month'}</span>
          </div>
        </a>`;
      container.appendChild(div);
    });
  },

  // Initialize all filters
  initFilters() {
    // Type dropdown
    const typeSelect = document.getElementById('filter-type');
    if (typeSelect) {
      typeSelect.addEventListener('change', (e) => {
        state.AppState.filters.type = e.target.value;
        ui.renderListings(state.applyFilters());
      });
    }

    // Location input
    const locInput = document.getElementById('filter-location');
    if (locInput) {
      locInput.addEventListener('input', (e) => {
        state.AppState.filters.location = e.target.value;
        ui.renderListings(state.applyFilters());
      });
    }

    // Price range min/max
    const priceMinInput = document.getElementById('filter-price-min');
    const priceMaxInput = document.getElementById('filter-price-max');
    const updatePriceFilter = () => {
      const min = parseFloat(priceMinInput?.value) || null;
      const max = parseFloat(priceMaxInput?.value) || null;
      state.AppState.filters.priceRange = (min !== null && max !== null) ? [min, max] : null;
      ui.renderListings(state.applyFilters());
    };
    if (priceMinInput) priceMinInput.addEventListener('input', updatePriceFilter);
    if (priceMaxInput) priceMaxInput.addEventListener('input', updatePriceFilter);

    // Amenities checkboxes
    const amenityCheckboxes = document.querySelectorAll('input[name="filter-amenities"]');
    amenityCheckboxes.forEach(cb => {
      cb.addEventListener('change', () => {
        const selected = Array.from(amenityCheckboxes)
          .filter(c => c.checked)
          .map(c => c.value);
        state.AppState.filters.amenities = selected;
        ui.renderListings(state.applyFilters());
      });
    });
  },

  init() {
    this.updateNavigation();
    this.initDatePickers();
    this.initFilters();
  }
};

document.addEventListener('DOMContentLoaded', () => ui.init());
window.ui = ui;
