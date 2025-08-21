// js/ui.js
// ==============================
// Modular UI Manager
// ==============================

class UIManager {
  constructor(stateManager = null) {
    this.stateManager = stateManager;
    this.unsubscribe = null;
    this.eventListeners = new Map();
  }

  // Set the state manager
  setStateManager(stateManager) {
    // Unsubscribe from previous state manager
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    
    this.stateManager = stateManager;
    
    // Subscribe to state changes if state manager supports it
    if (stateManager && typeof stateManager.subscribe === 'function') {
      this.unsubscribe = stateManager.subscribe(() => {
        this.updateFromState();
      });
    }
    
    return this;
  }

  // Get current state
  getState() {
    return this.stateManager?.getState?.() || this.stateManager?.state || {};
  }

  // Loading indicators
  showLoading() {
    document.querySelectorAll('.loading-indicator').forEach(el => {
      el.classList.remove('hidden');
    });
    return this;
  }

  hideLoading() {
    document.querySelectorAll('.loading-indicator').forEach(el => {
      el.classList.add('hidden');
    });
    return this;
  }

  // Error handling
  showError(message, elementId = 'error-message') {
    const el = document.getElementById(elementId);
    if (el) {
      el.textContent = message;
      el.classList.remove('hidden');
    }
    return this;
  }

  hideError(elementId = 'error-message') {
    const el = document.getElementById(elementId);
    if (el) {
      el.classList.add('hidden');
    }
    return this;
  }

  // Navigation updates
  updateNavigation() {
    const currentState = this.getState();
    const currentUser = currentState.currentUser;
    const role = currentState.role;

    document.querySelectorAll('[data-auth]').forEach(link => {
      const requiredAuth = link.getAttribute('data-auth');
      const shouldShow = 
        (role === requiredAuth) ||
        (currentUser && requiredAuth === 'authenticated') ||
        (!currentUser && requiredAuth === 'guest');
      
      link.classList.toggle('hidden', !shouldShow);
    });
    
    return this;
  }

  // Date picker initialization
  initDatePickers() {
    const today = new Date().toISOString().split('T')[0];
    document.querySelectorAll('input[type="date"]').forEach(input => {
      if (!input.value) {
        input.value = today;
      }
    });
    return this;
  }

  // Favorite button updates
  updateFavoriteButton(listingId) {
    const btn = document.getElementById('favorite-button');
    if (!btn) return this;

    const currentState = this.getState();
    const isFavorite = currentState.favorites?.includes(listingId) || false;
    
    btn.textContent = isFavorite ? 'Remove from Favorites' : 'Add to Favorites';
    
    // Update button styles
    if (isFavorite) {
      btn.className = 'mt-4 px-4 py-2 rounded bg-red-500 hover:bg-red-600 text-white';
    } else {
      btn.className = 'mt-4 px-4 py-2 rounded bg-gray-200 hover:bg-gray-300 text-gray-800';
    }
    
    return this;
  }

  // Create listing card HTML
  createListingCard(listing) {
    const currentState = this.getState();
    const isFavorite = currentState.favorites?.includes(listing.id) || false;
    
    return `
      <div class="bg-white rounded-lg overflow-hidden shadow-md hover:shadow-lg transition-shadow">
        <a href="/house-detail.html?id=${listing.id}">
          <div class="relative">
            <img src="${listing.images?.[0] || '/images/placeholder.jpg'}" 
                 alt="${listing.title}" class="w-full h-48 object-cover">
            <div class="absolute top-2 right-2">
              <button class="favorite-btn p-2 bg-white rounded-full shadow-md" data-id="${listing.id}">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 ${
                  isFavorite ? 'text-red-500 fill-red-500' : 'text-gray-400'
                }" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                        d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </button>
            </div>
          </div>
          <div class="p-4">
            <h3 class="font-semibold text-lg mb-1">${listing.title}</h3>
            <p class="text-gray-600 text-sm mb-2">${listing.location}</p>
            <div class="flex justify-between items-center">
              <span class="font-bold">$${listing.price}${listing.type === 'bnb' ? '/night' : '/month'}</span>
            </div>
          </div>
        </a>
      </div>`;
  }

  // Handle favorite button clicks
  handleFavoriteClick(listingId, element) {
    if (!this.stateManager?.toggleFavorite) {
      console.warn('State manager does not support toggleFavorite');
      return;
    }

    this.stateManager.toggleFavorite(listingId);

    // Update UI immediately for better UX
    const svg = element.querySelector('svg');
    const currentState = this.getState();
    const isFavorite = currentState.favorites?.includes(listingId) || false;

    if (isFavorite) {
      svg.classList.add('text-red-500', 'fill-red-500');
      svg.classList.remove('text-gray-400');
    } else {
      svg.classList.remove('text-red-500', 'fill-red-500');
      svg.classList.add('text-gray-400');
    }
  }

  // Render listings
  renderListings(listings) {
    const container = document.getElementById('listings-container');
    if (!container) return this;

    // Clear existing content
    container.innerHTML = '';

    // Handle empty listings
    if (!listings?.length) {
      container.innerHTML = `
        <div class="col-span-full text-center py-12">
          <p class="text-lg text-gray-600">No listings match your filters.</p>
        </div>`;
      return this;
    }

    // Render each listing
    listings.forEach(listing => {
      const div = document.createElement('div');
      div.innerHTML = this.createListingCard(listing);
      
      // Add favorite button event listener
      const favoriteBtn = div.querySelector('.favorite-btn');
      if (favoriteBtn) {
        favoriteBtn.addEventListener('click', (e) => {
          e.preventDefault();
          this.handleFavoriteClick(listing.id, favoriteBtn);
        });
      }
      
      container.appendChild(div.firstElementChild);
    });

    return this;
  }

  // Render listing detail page
  renderListingDetail(listing) {
    const container = document.getElementById('listing-detail-container');
    if (!container) return this;

    const currentState = this.getState();
    const isFavorite = currentState.favorites?.includes(listing.id) || false;
    
    const imagesHTML = listing.images?.length ? 
      listing.images.map(img => `<img src="${img}" class="w-full h-40 object-cover rounded">`).join('') : 
      '<p class="text-gray-500">No images available</p>';

    container.innerHTML = `
      <div class="bg-white rounded-lg shadow-md p-6">
        <h2 class="text-2xl font-bold mb-2">${listing.title}</h2>
        <p class="text-gray-600 mb-2">${listing.location}</p>
        <p class="text-gray-700 mb-4">${listing.description || 'No description available.'}</p>
        <p class="font-bold text-lg mb-2">$${listing.price}${listing.type === 'bnb' ? '/night' : '/month'}</p>
        <div class="grid grid-cols-2 gap-2 mb-4">
          ${imagesHTML}
        </div>
        <button id="favorite-button" class="mt-4 px-4 py-2 rounded ${
          isFavorite ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-800'
        }">
          ${isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
        </button>
      </div>`;

    // Add favorite button event listener
    const favBtn = document.getElementById('favorite-button');
    if (favBtn) {
      favBtn.addEventListener('click', () => {
        if (this.stateManager?.toggleFavorite) {
          this.stateManager.toggleFavorite(listing.id);
          this.updateFavoriteButton(listing.id);
        }
      });
    }

    return this;
  }

  // Filter event handlers
  setupFilterHandlers() {
    // Remove existing listeners
    this.removeEventListeners();

    // Type filter
    const typeSelect = document.getElementById('filter-type');
    if (typeSelect) {
      const handler = (e) => {
        if (this.stateManager?.updateState) {
          const currentState = this.getState();
          const newFilters = { ...currentState.filters, type: e.target.value };
          this.stateManager.updateState({ filters: newFilters });
          this.renderListings(this.stateManager.applyFilters?.() || []);
        }
      };
      typeSelect.addEventListener('change', handler);
      this.eventListeners.set(typeSelect, { event: 'change', handler });
    }

    // Location filter
    const locationInput = document.getElementById('filter-location');
    if (locationInput) {
      const handler = (e) => {
        if (this.stateManager?.updateState) {
          const currentState = this.getState();
          const newFilters = { ...currentState.filters, location: e.target.value };
          this.stateManager.updateState({ filters: newFilters });
          this.renderListings(this.stateManager.applyFilters?.() || []);
        }
      };
      locationInput.addEventListener('input', handler);
      this.eventListeners.set(locationInput, { event: 'input', handler });
    }

    // Price filters
    const priceMinInput = document.getElementById('filter-price-min');
    const priceMaxInput = document.getElementById('filter-price-max');
    
    const updatePriceFilter = () => {
      if (this.stateManager?.updateState) {
        const min = parseFloat(priceMinInput?.value) || 0;
        const max = parseFloat(priceMaxInput?.value) || Infinity;
        const currentState = this.getState();
        const newFilters = { ...currentState.filters, priceRange: [min, max] };
        this.stateManager.updateState({ filters: newFilters });
        this.renderListings(this.stateManager.applyFilters?.() || []);
      }
    };

    if (priceMinInput) {
      priceMinInput.addEventListener('input', updatePriceFilter);
      this.eventListeners.set(priceMinInput, { event: 'input', handler: updatePriceFilter });
    }
    if (priceMaxInput) {
      priceMaxInput.addEventListener('input', updatePriceFilter);
      this.eventListeners.set(priceMaxInput, { event: 'input', handler: updatePriceFilter });
    }

    // Amenity filters
    const amenityCheckboxes = document.querySelectorAll('input[name="filter-amenities"]');
    const amenityHandler = () => {
      if (this.stateManager?.updateState) {
        const selectedAmenities = Array.from(amenityCheckboxes)
          .filter(checkbox => checkbox.checked)
          .map(checkbox => checkbox.value);
        
        const currentState = this.getState();
        const newFilters = { ...currentState.filters, amenities: selectedAmenities };
        this.stateManager.updateState({ filters: newFilters });
        this.renderListings(this.stateManager.applyFilters?.() || []);
      }
    };

    amenityCheckboxes.forEach(checkbox => {
      checkbox.addEventListener('change', amenityHandler);
      this.eventListeners.set(checkbox, { event: 'change', handler: amenityHandler });
    });

    return this;
  }

  // Remove event listeners
  removeEventListeners() {
    this.eventListeners.forEach((listenerData, element) => {
      element.removeEventListener(listenerData.event, listenerData.handler);
    });
    this.eventListeners.clear();
    return this;
  }

  // Update UI from state changes
  updateFromState() {
    this.updateNavigation();
    
    // Update listings if on listings page
    const listingsContainer = document.getElementById('listings-container');
    if (listingsContainer && this.stateManager?.applyFilters) {
      this.renderListings(this.stateManager.applyFilters());
    }

    // Handle errors
    const currentState = this.getState();
    if (currentState.error) {
      this.showError(currentState.error);
    } else {
      this.hideError();
    }

    return this;
  }

  // Initialize UI
  init() {
    this.updateNavigation();
    this.initDatePickers();
    this.setupFilterHandlers();
    
    // Initial state update
    if (this.stateManager) {
      this.updateFromState();
    }
    
    return this;
  }

  // Cleanup method
  destroy() {
    this.removeEventListeners();
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    return this;
  }
}

// Factory function to create a UI manager
export function createUIManager(stateManager = null) {
  return new UIManager(stateManager);
}

// Create default instance for backward compatibility
const defaultUIManager = new UIManager();

// Auto-initialize with window.state if available
if (typeof window !== 'undefined' && window.state) {
  defaultUIManager.setStateManager(window.state);
}

// Initialize on DOM ready
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    defaultUIManager.init();
  });
}

// Expose on window for backward compatibility
if (typeof window !== 'undefined') {
  window.ui = defaultUIManager;
  // Also expose the update function globally for compatibility
  window.updateUIFromState = () => defaultUIManager.updateFromState();
}

// Export for module usage
export default defaultUIManager;
export { UIManager };