// js/initCoordinator.js
// ==============================
// Service Initialization Coordinator
// ==============================

class InitializationCoordinator {
  constructor() {
    this.services = {
      firebase: { ready: false, instance: null },
      state: { ready: false, instance: null },
      auth: { ready: false, instance: null },
      ui: { ready: false, instance: null }
    };
    this.listeners = [];
    this.allReady = false;
    this.checkInterval = null;
  }

  // Register a service
  registerService(name, instance) {
    console.log(`Registering service: ${name}`);
    if (this.services[name]) {
      this.services[name].instance = instance;
      this.checkServiceReadiness(name);
    }
  }

  // Check if a specific service is ready
  checkServiceReadiness(serviceName) {
    const service = this.services[serviceName];
    if (!service || !service.instance) return false;

    let isReady = false;
    
    switch (serviceName) {
      case 'firebase':
        isReady = service.instance.ready && 
                  service.instance.auth && 
                  service.instance.collections;
        break;
        
      case 'state':
        isReady = typeof service.instance.getState === 'function' &&
                  service.instance.firebaseServices !== null;
        break;
        
      case 'auth':
        isReady = typeof service.instance.isFirebaseReady === 'function' &&
                  service.instance.isFirebaseReady();
        break;
        
      case 'ui':
        isReady = typeof service.instance.renderListings === 'function' &&
                  service.instance.stateManager !== null;
        break;
        
      default:
        isReady = true;
    }

    const wasReady = service.ready;
    service.ready = isReady;
    
    if (!wasReady && isReady) {
      console.log(`✅ Service ${serviceName} is now ready`);
      this.notifyServiceReady(serviceName);
      this.checkAllReady();
    }

    return isReady;
  }

  // Check if all services are ready
  checkAllReady() {
    const allServicesReady = Object.values(this.services).every(service => service.ready);
    
    if (!this.allReady && allServicesReady) {
      console.log("🎉 All services are ready!");
      this.allReady = true;
      this.notifyAllReady();
      
      if (this.checkInterval) {
        clearInterval(this.checkInterval);
        this.checkInterval = null;
      }
    }
  }

  // Start monitoring services
  startMonitoring() {
    console.log("Starting service monitoring...");
    
    // Initial check
    Object.keys(this.services).forEach(serviceName => {
      this.checkServiceReadiness(serviceName);
    });

    // Periodic check
    this.checkInterval = setInterval(() => {
      Object.keys(this.services).forEach(serviceName => {
        this.checkServiceReadiness(serviceName);
      });
    }, 200);

    // Stop monitoring after 15 seconds
    setTimeout(() => {
      if (this.checkInterval) {
        console.log("⏰ Service monitoring timeout - stopping checks");
        clearInterval(this.checkInterval);
        this.checkInterval = null;
        
        // Force ready state for debugging
        if (!this.allReady) {
          console.log("📊 Final service status:");
          Object.entries(this.services).forEach(([name, service]) => {
            console.log(`  ${name}: ${service.ready ? '✅' : '❌'} ${service.instance ? '(instance available)' : '(no instance)'}`);
          });
        }
      }
    }, 15000);
  }

  // Subscribe to all-ready event
  onAllReady(callback) {
    if (this.allReady) {
      callback();
      return () => {};
    }

    this.listeners.push(callback);
    return () => {
      const index = this.listeners.indexOf(callback);
      if (index > -1) this.listeners.splice(index, 1);
    };
  }

  // Notify when a service becomes ready
  notifyServiceReady(serviceName) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(`${serviceName}ServiceReady`, {
        detail: { 
          serviceName,
          service: this.services[serviceName].instance,
          coordinator: this 
        }
      }));
    }
  }

  // Notify when all services are ready
  notifyAllReady() {
    this.listeners.forEach(callback => {
      try {
        callback();
      } catch (err) {
        console.error("Error in all-ready callback:", err);
      }
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('allServicesReady', {
        detail: { 
          services: this.services,
          coordinator: this 
        }
      }));
    }
  }

  // Get current status
  getStatus() {
    return {
      allReady: this.allReady,
      services: Object.fromEntries(
        Object.entries(this.services).map(([name, service]) => [
          name, 
          { 
            ready: service.ready, 
            hasInstance: !!service.instance 
          }
        ])
      )
    };
  }

  // Force initialization sequence
  async initializeInSequence() {
    console.log("🚀 Starting coordinated service initialization...");
    
    try {
      // Wait for Firebase first
      await this.waitForService('firebase', 5000);
      console.log("Step 1: Firebase ready ✅");
      
      // Initialize State Manager with Firebase
      if (this.services.state.instance && this.services.firebase.instance) {
        this.services.state.instance.setFirebaseServices(this.services.firebase.instance);
      }
      
      // Initialize Auth Service with Firebase and State
      if (this.services.auth.instance) {
        if (this.services.firebase.instance) {
          this.services.auth.instance.setFirebaseServices(this.services.firebase.instance);
        }
        if (this.services.state.instance) {
          this.services.auth.instance.setStateManager(this.services.state.instance);
        }
      }
      
      // Wait for Auth to be ready
      await this.waitForService('auth', 3000);
      console.log("Step 2: Auth ready ✅");
      
      // Initialize UI with State Manager
      if (this.services.ui.instance && this.services.state.instance) {
        this.services.ui.instance.setStateManager(this.services.state.instance);
      }
      
      // Wait for all services
      await this.waitForAllServices(5000);
      console.log("Step 3: All services ready ✅");
      
      return true;
    } catch (error) {
      console.error("❌ Service initialization failed:", error);
      return false;
    }
  }

  // Wait for a specific service
  async waitForService(serviceName, timeout = 10000) {
    return new Promise((resolve, reject) => {
      if (this.services[serviceName]?.ready) {
        resolve();
        return;
      }

      const timeoutId = setTimeout(() => {
        reject(new Error(`Service ${serviceName} initialization timeout`));
      }, timeout);

      const checkReady = () => {
        if (this.services[serviceName]?.ready) {
          clearTimeout(timeoutId);
          resolve();
        } else {
          setTimeout(checkReady, 100);
        }
      };

      checkReady();
    });
  }

  // Wait for all services
  async waitForAllServices(timeout = 15000) {
    return new Promise((resolve, reject) => {
      if (this.allReady) {
        resolve();
        return;
      }

      const timeoutId = setTimeout(() => {
        reject(new Error("All services initialization timeout"));
      }, timeout);

      this.onAllReady(() => {
        clearTimeout(timeoutId);
        resolve();
      });
    });
  }
}

// Create global coordinator instance
const coordinator = new InitializationCoordinator();

// Auto-setup with window globals
if (typeof window !== 'undefined') {
  window.initCoordinator = coordinator;
  
  // Register services as they become available
  const registerFromWindow = () => {
    if (window.firebaseServices) {
      coordinator.registerService('firebase', window.firebaseServices);
    }
    if (window.state) {
      coordinator.registerService('state', window.state);
    }
    if (window.authService) {
      coordinator.registerService('auth', window.authService);
    }
    if (window.ui) {
      coordinator.registerService('ui', window.ui);
    }
  };

  // Initial registration
  registerFromWindow();

  // Listen for service events
  window.addEventListener('firebaseReady', () => {
    console.log("🔥 Firebase ready event received by coordinator");
    registerFromWindow();
  });

  window.addEventListener('stateManagerReady', () => {
    console.log("📊 State manager ready event received by coordinator");
    registerFromWindow();
  });

  window.addEventListener('authServiceReady', () => {
    console.log("🔐 Auth service ready event received by coordinator");
    registerFromWindow();
  });

  window.addEventListener('uiManagerReady', () => {
    console.log("🎨 UI manager ready event received by coordinator");
    registerFromWindow();
  });

  // Start monitoring when DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM ready - starting service coordination");
    registerFromWindow();
    coordinator.startMonitoring();
    
    // Also try coordinated initialization
    setTimeout(() => {
      if (!coordinator.allReady) {
        console.log("🔄 Attempting coordinated initialization...");
        coordinator.initializeInSequence();
      }
    }, 1000);
  });
}

export default coordinator;
export { InitializationCoordinator };