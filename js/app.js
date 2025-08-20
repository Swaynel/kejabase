// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  // Initialize state
  state.initializeState();
  
  // Register service worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js')
        .then(registration => {
          console.log('ServiceWorker registration successful');
        })
        .catch(err => {
          console.log('ServiceWorker registration failed: ', err);
        });
    });
  }
  
  // Mobile menu toggle
  const mobileMenuButton = document.getElementById('mobile-menu-button');
  if (mobileMenuButton) {
    mobileMenuButton.addEventListener('click', toggleMobileMenu);
  }
  
  // Initialize page-specific functionality
  const path = window.location.pathname;
  if (path.includes('browse.html')) {
    initBrowsePage();
  } else if (path.includes('bnb.html')) {
    initBnbPage();
  } else if (path.includes('house-detail.html')) {
    initHouseDetailPage();
  } else if (path.includes('dashboard-')) {
    initDashboardPage();
  }
});

// Toggle mobile menu
function toggleMobileMenu() {
  const mobileMenu = document.getElementById('mobile-menu');
  if (mobileMenu) {
    mobileMenu.classList.toggle('hidden');
  }
}

// Initialize browse page functionality
function initBrowsePage() {
  // Set up filter controls
  const locationFilter = document.getElementById('location-filter');
  const priceFilter = document.getElementById('price-filter');
  const tagsFilter = document.getElementById('tags-filter');
  const resetFiltersBtn = document.getElementById('reset-filters');
  
  if (locationFilter) {
    locationFilter.addEventListener('input', function() {
      const currentState = state.getState();
      state.updateState({
        activeFilters: {
          ...currentState.activeFilters,
          location: this.value
        }
      });
      state.applyFilters();
    });
  }
  
  if (priceFilter) {
    priceFilter.addEventListener('change', function() {
      const currentState = state.getState();
      const priceRange = this.value.split('-');
      state.updateState({
        activeFilters: {
          ...currentState.activeFilters,
          minPrice: parseInt(priceRange[0]) || 0,
          maxPrice: parseInt(priceRange[1]) || Infinity
        }
      });
      state.applyFilters();
    });
  }
  
  if (tagsFilter) {
    tagsFilter.addEventListener('change', function() {
      const currentState = state.getState();
      const selectedTags = Array.from(this.selectedOptions).map(opt => opt.value);
      state.updateState({
        activeFilters: {
          ...currentState.activeFilters,
          tags: selectedTags
        }
      });
      state.applyFilters();
    });
  }
  
  if (resetFiltersBtn) {
    resetFiltersBtn.addEventListener('click', state.resetFilters);
  }
}

// Initialize BnB page functionality
function initBnbPage() {
  // Similar to browse page but with BnB-specific filters
  initBrowsePage();
  
  // Add BnB-specific filters if needed
  const amenitiesFilter = document.getElementById('amenities-filter');
  if (amenitiesFilter) {
    amenitiesFilter.addEventListener('change', function() {
      const currentState = state.getState();
      const selectedAmenities = Array.from(this.selectedOptions).map(opt => opt.value);
      state.updateState({
        activeFilters: {
          ...currentState.activeFilters,
          tags: selectedAmenities
        }
      });
      state.applyFilters();
    });
  }
}

// Initialize house detail page functionality
function initHouseDetailPage() {
  // Get listing ID from URL
  const urlParams = new URLSearchParams(window.location.search);
  const listingId = urlParams.get('id');
  
  if (!listingId) {
    // Redirect if no ID provided
    window.location.href = '/browse.html';
    return;
  }
  
  // Load listing details
  const currentState = state.getState();
  const listing = currentState.listings.find(l => l.id === listingId);
  
  if (!listing) {
    // Fetch listing from Firestore if not in state
    const collection = listing.type === 'bnb' 
      ? firebaseServices.collections.bnbs 
      : firebaseServices.collections.houses;
    
    collection.doc(listingId).get()
      .then(doc => {
        if (doc.exists) {
          state.updateState({
            listings: [...currentState.listings, { id: doc.id, ...doc.data() }]
          });
          renderListingDetail({ id: doc.id, ...doc.data() });
        } else {
          // Listing not found, redirect
          window.location.href = '/browse.html';
        }
      })
      .catch(error => {
        console.error("Error fetching listing:", error);
        window.location.href = '/browse.html';
      });
  } else {
    renderListingDetail(listing);
  }
  
  // Set up booking form
  const bookingForm = document.getElementById('booking-form');
  if (bookingForm) {
    bookingForm.addEventListener('submit', function(e) {
      e.preventDefault();
      handleBooking(listingId, listing.type);
    });
  }
  
  // Set up favorite button
  const favoriteButton = document.getElementById('favorite-button');
  if (favoriteButton) {
    favoriteButton.addEventListener('click', function() {
      state.toggleFavorite(listingId);
    });
  }
}

// Handle booking submission
function handleBooking(listingId, listingType) {
  const bookingForm = document.getElementById('booking-form');
  const formData = new FormData(bookingForm);
  
  const bookingData = {
    listingId,
    listingType,
    userId: state.getState().currentUser.uid,
    startDate: formData.get('start-date'),
    endDate: formData.get('end-date'),
    guests: parseInt(formData.get('guests')),
    specialRequests: formData.get('special-requests'),
    status: 'pending',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  
  firebaseServices.collections.bookings.add(bookingData)
    .then(docRef => {
      // Generate and show booking receipt
      generateBookingReceipt({ id: docRef.id, ...bookingData });
    })
    .catch(error => {
      console.error("Error creating booking:", error);
      alert("There was an error processing your booking. Please try again.");
    });
}

// Generate booking receipt
function generateBookingReceipt(booking) {
  // Get listing details
  const listing = state.getState().listings.find(l => l.id === booking.listingId);
  
  // Create receipt HTML
  const receiptHTML = `
    <div class="bg-white p-6 rounded-lg shadow-md max-w-2xl mx-auto">
      <h2 class="text-2xl font-bold mb-4">Booking Confirmation</h2>
      <div class="mb-6">
        <h3 class="text-lg font-semibold mb-2">${listing.title}</h3>
        <p class="text-gray-600">${listing.location}</p>
      </div>
      
      <div class="grid grid-cols-2 gap-4 mb-6">
        <div>
          <p class="text-sm text-gray-500">Check-in</p>
          <p>${new Date(booking.startDate).toLocaleDateString()}</p>
        </div>
        <div>
          <p class="text-sm text-gray-500">Check-out</p>
          <p>${new Date(booking.endDate).toLocaleDateString()}</p>
        </div>
        <div>
          <p class="text-sm text-gray-500">Guests</p>
          <p>${booking.guests}</p>
        </div>
        <div>
          <p class="text-sm text-gray-500">Booking ID</p>
          <p>${booking.id}</p>
        </div>
      </div>
      
      <div class="mb-6">
        <h4 class="font-semibold mb-2">Price Summary</h4>
        <div class="border-t border-b border-gray-200 py-2">
          <div class="flex justify-between py-1">
            <span>${listing.price} x ${Math.ceil((new Date(booking.endDate) - new Date(booking.startDate)) / (1000 * 60 * 60 * 24))} nights</span>
            <span>$${(listing.price * Math.ceil((new Date(booking.endDate) - new Date(booking.startDate)) / (1000 * 60 * 60 * 24))).toFixed(2)}</span>
          </div>
          <div class="flex justify-between py-1 font-semibold">
            <span>Total</span>
            <span>$${(listing.price * Math.ceil((new Date(booking.endDate) - new Date(booking.startDate)) / (1000 * 60 * 60 * 24))).toFixed(2)}</span>
          </div>
        </div>
      </div>
      
      <div class="flex justify-between">
        <button onclick="window.print()" class="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700">Print Receipt</button>
        <button onclick="document.getElementById('receipt-modal').classList.add('hidden')" class="bg-gray-200 px-4 py-2 rounded-md hover:bg-gray-300">Close</button>
      </div>
    </div>
  `;
  
  // Show receipt in modal
  const receiptModal = document.getElementById('receipt-modal');
  if (receiptModal) {
    receiptModal.innerHTML = receiptHTML;
    receiptModal.classList.remove('hidden');
  }
}

// Update UI based on current state
function updateUIFromState() {
  const currentState = state.getState();
  
  // Update auth-related UI
  const authElements = document.querySelectorAll('[data-auth]');
  authElements.forEach(el => {
    const requiredRole = el.getAttribute('data-auth');
    
    if (currentState.userRole === requiredRole || 
        (currentState.currentUser && requiredRole === 'authenticated') ||
        (!currentState.currentUser && requiredRole === 'guest')) {
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  });
  
  // Update loading state
  if (currentState.isLoading) {
    document.getElementById('loading-indicator')?.classList.remove('hidden');
  } else {
    document.getElementById('loading-indicator')?.classList.add('hidden');
  }
  
  // Update error display
  if (currentState.error) {
    const errorElement = document.getElementById('error-message');
    if (errorElement) {
      errorElement.textContent = currentState.error;
      errorElement.classList.remove('hidden');
    }
  }
  
  // Update listings display
  if (document.getElementById('listings-container')) {
    renderListings(currentState.filteredListings);
  }
  
  // Update favorites display
  if (document.getElementById('favorite-button')) {
    const favoriteButton = document.getElementById('favorite-button');
    if (currentState.favorites.includes(getCurrentListingId())) {
      favoriteButton.textContent = 'Remove from Favorites';
      favoriteButton.classList.add('bg-red-500', 'hover:bg-red-600');
      favoriteButton.classList.remove('bg-gray-200', 'hover:bg-gray-300');
    } else {
      favoriteButton.textContent = 'Add to Favorites';
      favoriteButton.classList.add('bg-gray-200', 'hover:bg-gray-300');
      favoriteButton.classList.remove('bg-red-500', 'hover:bg-red-600');
    }
  }
}

// Render listings in browse/bnb pages
function renderListings(listings) {
  const listingsContainer = document.getElementById('listings-container');
  if (!listingsContainer) return;
  
  listingsContainer.innerHTML = '';
  
  if (listings.length === 0) {
    listingsContainer.innerHTML = `
      <div class="col-span-full text-center py-12">
        <p class="text-lg text-gray-600">No listings match your filters. Try adjusting your search criteria.</p>
      </div>
    `;
    return;
  }
  
  listings.forEach(listing => {
    const listingElement = document.createElement('div');
    listingElement.className = 'bg-white rounded-lg overflow-hidden shadow-md hover:shadow-lg transition-shadow';
    listingElement.innerHTML = `
      <a href="/house-detail.html?id=${listing.id}">
        <div class="relative">
          <img src="${listing.images[0] || '/images/placeholder.jpg'}" alt="${listing.title}" class="w-full h-48 object-cover">
          <div class="absolute top-2 right-2">
            <button class="favorite-btn p-2 bg-white rounded-full shadow-md" data-id="${listing.id}">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 ${state.getState().favorites.includes(listing.id) ? 'text-red-500 fill-red-500' : 'text-gray-400'}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </button>
          </div>
        </div>
        <div class="p-4">
          <h3 class="font-semibold text-lg mb-1">${listing.title}</h3>
          <p class="text-gray-600 text-sm mb-2">${listing.location}</p>
          <div class="flex justify-between items-center">
            <span class="font-bold">$${listing.price}${listing.type === 'bnb' ? '/night' : '/month'}</span>
            <div class="flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-yellow-500" viewBox="0 0 20 20" fill="currentColor">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              <span class="ml-1 text-sm">${listing.rating || 'New'}</span>
            </div>
          </div>
        </div>
      </a>
    `;
    
    listingsContainer.appendChild(listingElement);
    
    // Add event listener to favorite button
    const favoriteBtn = listingElement.querySelector('.favorite-btn');
    if (favoriteBtn) {
      favoriteBtn.addEventListener('click', function(e) {
        e.preventDefault();
        state.toggleFavorite(this.getAttribute('data-id'));
      });
    }
  });
}

// Get current listing ID from URL
function getCurrentListingId() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('id');
}

// Render listing details on detail page
function renderListingDetail(listing) {
  if (!listing) return;
  
  document.title = `${listing.title} | Kejabase`;
  
  // Update main listing info
  if (document.getElementById('listing-title')) {
    document.getElementById('listing-title').textContent = listing.title;
  }
  
  if (document.getElementById('listing-location')) {
    document.getElementById('listing-location').textContent = listing.location;
  }
  
  if (document.getElementById('listing-price')) {
    document.getElementById('listing-price').textContent = 
      `$${listing.price}${listing.type === 'bnb' ? '/night' : '/month'}`;
  }
  
  // Update images gallery
  const gallery = document.getElementById('listing-gallery');
  if (gallery) {
    gallery.innerHTML = '';
    listing.images.forEach(image => {
      const imgElement = document.createElement('div');
      imgElement.className = 'rounded-lg overflow-hidden';
      imgElement.innerHTML = `
        <img src="${image}" alt="${listing.title}" class="w-full h-full object-cover">
      `;
      gallery.appendChild(imgElement);
    });
  }
  
  // Update amenities/tags
  const amenitiesList = document.getElementById('amenities-list');
  if (amenitiesList) {
    amenitiesList.innerHTML = '';
    listing.tags.forEach(tag => {
      const li = document.createElement('li');
      li.className = 'flex items-center space-x-2';
      li.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-green-500" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
        </svg>
        <span>${tag}</span>
      `;
      amenitiesList.appendChild(li);
    });
  }
  
  // Update description
  if (document.getElementById('listing-description')) {
    document.getElementById('listing-description').textContent = listing.description;
  }
  
  // Update availability calendar (placeholder)
  if (document.getElementById('availability-calendar')) {
    // In a real app, we would integrate with a calendar library
    document.getElementById('availability-calendar').innerHTML = `
      <p class="text-gray-600">Check availability by selecting dates in the booking form.</p>
    `;
  }
}