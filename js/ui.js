// UI update functions
const ui = {
  // Show loading spinner
  showLoading: function() {
    const loadingElements = document.querySelectorAll('.loading-indicator');
    loadingElements.forEach(el => el.classList.remove('hidden'));
  },
  
  // Hide loading spinner
  hideLoading: function() {
    const loadingElements = document.querySelectorAll('.loading-indicator');
    loadingElements.forEach(el => el.classList.add('hidden'));
  },
  
  // Show error message
  showError: function(message, elementId = 'error-message') {
    const errorElement = document.getElementById(elementId);
    if (errorElement) {
      errorElement.textContent = message;
      errorElement.classList.remove('hidden');
    }
  },
  
  // Hide error message
  hideError: function(elementId = 'error-message') {
    const errorElement = document.getElementById(elementId);
    if (errorElement) {
      errorElement.classList.add('hidden');
    }
  },
  
  // Update navigation based on auth state
  updateNavigation: function() {
    const currentState = state.getState();
    const authLinks = document.querySelectorAll('[data-auth]');
    
    authLinks.forEach(link => {
      const requiredRole = link.getAttribute('data-auth');
      const shouldShow = 
        (currentState.userRole === requiredRole) ||
        (currentState.currentUser && requiredRole === 'authenticated') ||
        (!currentState.currentUser && requiredRole === 'guest');
      
      if (shouldShow) {
        link.classList.remove('hidden');
      } else {
        link.classList.add('hidden');
      }
    });
  },
  
  // Initialize date pickers
  initDatePickers: function() {
    const dateInputs = document.querySelectorAll('input[type="date"]');
    dateInputs.forEach(input => {
      if (!input.value) {
        const today = new Date().toISOString().split('T')[0];
        input.value = today;
      }
    });
  },
  
  // Initialize tooltips
  initTooltips: function() {
    // Implementation would use a library or custom code
    // Placeholder for tooltip initialization
  },
  
  // Initialize all UI components
  init: function() {
    this.updateNavigation();
    this.initDatePickers();
    this.initTooltips();
  }
};

// Initialize UI when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  ui.init();
});

// Expose UI to global scope
window.ui = ui;