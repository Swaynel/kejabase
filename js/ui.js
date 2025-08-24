// js/ui.js
// ==============================
// UI Manager
// ==============================

import { stateManager } from './state.js';

class UIManager {
  constructor(stateManagerInstance) {
    this.stateManager = stateManagerInstance;
    this.userEmailElement = document.getElementById('user-email');
    this.authButtons = document.getElementById('auth-buttons');
    this.logoutButton = document.getElementById('logout-btn');
    this.listingsContainer = document.getElementById('listings');
    this.favoritesContainer = document.getElementById('favorites');
    this.navLinks = document.querySelectorAll('#nav-links a');

    this.firebaseReady = false;
    this.stateReady = false;
    this.readyTimeout = null;
  }

  async initialize() {
    // Handle readiness events
    window.addEventListener('firebaseReady', () => {
      this.firebaseReady = true;
      this.tryInitialize();
    });

    window.addEventListener('stateReady', () => {
      this.stateReady = true;
      this.tryInitialize();
    });

    // Fallback timeout
    this.readyTimeout = setTimeout(() => {
      if (!this.firebaseReady || !this.stateReady) {
        console.error('[UI] Initialization timeout: Firebase or State not ready.');
        this.initUI(); // proceed anyway
      }
    }, 5000);

    // Also poll as safety net
    this.pollForReadiness();
  }

  pollForReadiness() {
    const checkReady = () => {
      if (this.firebaseReady && this.stateReady) {
        this.tryInitialize();
      } else {
        setTimeout(checkReady, 200);
      }
    };
    checkReady();
  }

  tryInitialize() {
    if (this.firebaseReady && this.stateReady) {
      clearTimeout(this.readyTimeout);
      this.initUI();
    }
  }

  initUI() {
    if (!this.stateManager) {
      console.error('[UI] StateManager not available.');
      return;
    }

    // Initial UI state
    this.updateUI();

    // State change listener
    this.stateManager.onAuthChange((user) => {
      this.updateUI(user);
    });

    // Event listeners
    if (this.logoutButton) {
      this.logoutButton.addEventListener('click', async () => {
        try {
          await this.stateManager.logout();
        } catch (err) {
          console.error('[UI] Logout failed:', err);
        }
      });
    }

    if (this.navLinks) {
      this.navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          this.navigateTo(link.getAttribute('href'));
        });
      });
    }

    console.info('[UI] Initialized successfully.');
  }

  updateUI(user = this.stateManager.getCurrentUser()) {
    if (!this.userEmailElement || !this.authButtons || !this.logoutButton) return;

    if (user) {
      this.userEmailElement.textContent = user.email;
      this.authButtons.style.display = 'none';
      this.logoutButton.style.display = 'inline-block';
    } else {
      this.userEmailElement.textContent = '';
      this.authButtons.style.display = 'flex';
      this.logoutButton.style.display = 'none';
    }
  }

  navigateTo(page) {
    if (!page) return;
    console.info(`[UI] Navigating to ${page}`);
    window.location.href = page;
  }

  renderListings(listings) {
    if (!this.listingsContainer) return;
    this.listingsContainer.innerHTML = listings.map(listing => `
      <div class="listing-card">
        <h3>${listing.title}</h3>
        <p>${listing.description}</p>
        <button onclick="uiManager.toggleFavorite('${listing.id}')">
          ${this.stateManager.isFavorite(listing.id) ? 'Remove Favorite' : 'Add Favorite'}
        </button>
      </div>
    `).join('');
  }

  renderFavorites(favorites) {
    if (!this.favoritesContainer) return;
    this.favoritesContainer.innerHTML = favorites.map(fav => `
      <div class="favorite-card">
        <h4>${fav.title}</h4>
        <button onclick="uiManager.toggleFavorite('${fav.id}')">Remove</button>
      </div>
    `).join('');
  }

  toggleFavorite(listingId) {
    try {
      this.stateManager.toggleFavorite(listingId);
      this.renderFavorites(this.stateManager.getFavorites());
    } catch (err) {
      console.error('[UI] Failed to toggle favorite:', err);
    }
  }
}

export const uiManager = new UIManager(stateManager);
