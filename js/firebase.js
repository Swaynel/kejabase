// ==============================
// Firebase Configuration
// ==============================
const firebaseConfig = {
  apiKey: "AIzaSyDsE-FHOqm9LRmC4ug82YeJ6Nyw8C1zWrc",
  authDomain: "kejabase.firebaseapp.com",
  projectId: "kejabase",
  storageBucket: "kejabase.appspot.com",
  messagingSenderId: "375634491997",
  appId: "1:375634491997:web:7e67eb1c06c7afbc83ebb4",
  measurementId: "G-JTFBB4SG03"
};

// ==============================
// Firebase Initialization
// ==============================
try {
  // Initialize Firebase only if it hasn't been initialized
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
    console.log("✅ Firebase initialized successfully");
  } else {
    firebase.app(); // Use the already initialized instance
  }
} catch (error) {
  console.error("❌ Firebase initialization error:", error);
}

// ==============================
// Initialize Firebase Services
// ==============================
let auth, db, storage;

try {
  auth = firebase.auth();
  db = firebase.firestore();
  storage = firebase.storage();
  
  console.log("✅ Firebase services initialized");
} catch (error) {
  console.error("❌ Firebase services initialization error:", error);
}

// ==============================
// Firebase Collections Reference
// ==============================
const usersCollection = db && db.collection('users');
const housesCollection = db && db.collection('houses');
const bnbsCollection = db && db.collection('bnbs');
const bookingsCollection = db && db.collection('bookings');
const feedbackCollection = db && db.collection('feedback');
const reportsCollection = db && db.collection('reports');

// ==============================
// Firebase Services Object
// ==============================
const firebaseServices = {
  // Core services
  auth: auth,
  db: db,
  storage: storage,
  
  // Collections
  collections: {
    users: usersCollection,
    houses: housesCollection,
    bnbs: bnbsCollection,
    bookings: bookingsCollection,
    feedback: feedbackCollection,
    reports: reportsCollection
  },
  
  // Utility functions
  serverTimestamp: firebase.firestore.FieldValue.serverTimestamp,
  arrayUnion: firebase.firestore.FieldValue.arrayUnion,
  arrayRemove: firebase.firestore.FieldValue.arrayRemove,
  increment: firebase.firestore.FieldValue.increment,
  
  // Timestamp converter
  toTimestamp: (date) => firebase.firestore.Timestamp.fromDate(date),
  
  // Error handler
  handleError: (error) => {
    console.error("Firebase Error:", error);
    let message = "An error occurred";
    
    // Common Firebase error codes
    if (error.code) {
      switch (error.code) {
        case 'permission-denied':
          message = "You don't have permission to perform this action";
          break;
        case 'unauthenticated':
          message = "Please sign in to continue";
          break;
        case 'not-found':
          message = "The requested item was not found";
          break;
        default:
          message = error.message || "An unexpected error occurred";
      }
    }
    
    return { error: true, message };
  }
};

// ==============================
// Firestore Persistence & Settings
// ==============================
if (db) {
  // Enable offline persistence
  db.enablePersistence()
    .catch((err) => {
      if (err.code === 'failed-precondition') {
        console.warn("Multiple tabs open, persistence can only be enabled in one tab at a time.");
      } else if (err.code === 'unimplemented') {
        console.warn("The current browser doesn't support all of the features required to enable persistence");
      }
    });
  
  // Set Firestore settings
  db.settings({
    cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED
  });
}

// ==============================
// Auth State Persistence
// ==============================
if (auth) {
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
    .then(() => {
      console.log("✅ Auth persistence set to LOCAL");
    })
    .catch((error) => {
      console.error("❌ Auth persistence error:", error);
    });
}

// ==============================
// Connection Status Monitoring
// ==============================
if (db) {
  db.enableNetwork().then(() => {
    console.log("✅ Firebase Firestore connected successfully");
  }).catch((error) => {
    console.error("❌ Firebase Firestore connection error:", error);
  });
}

// ==============================
// Export to Global Scope
// ==============================
window.firebaseServices = firebaseServices;
window.firebase = firebase;

// ==============================
// Utility Functions
// ==============================
// Function to check Firebase connection
firebaseServices.checkConnection = () => {
  return new Promise((resolve) => {
    if (!db) {
      resolve({ connected: false, error: "Firestore not initialized" });
      return;
    }
    
    // Try a simple operation to test connection
    db.collection('test').doc('connection-test').get()
      .then(() => resolve({ connected: true }))
      .catch(error => resolve({ connected: false, error: error.message }));
  });
};

// Function to get current user data
firebaseServices.getCurrentUserData = async () => {
  try {
    const user = auth.currentUser;
    if (!user) return null;
    
    const userDoc = await usersCollection.doc(user.uid).get();
    return userDoc.exists ? userDoc.data() : null;
  } catch (error) {
    console.error("Error getting user data:", error);
    return null;
  }
};

console.log("🔥 Firebase services loaded successfully");