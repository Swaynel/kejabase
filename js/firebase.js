// ==============================
// Firebase Configuration & Initialization
// ==============================

// Your Firebase config (replace with your actual config)
const firebaseConfig = {
  apiKey: "your-api-key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "your-app-id"
};

// Initialize Firebase (only if not already initialized)
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
} else {
  firebase.app(); // if already initialized, use that one
}

// Initialize services
const auth = firebase.auth();
const firestore = firebase.firestore();
const storage = firebase.storage();

// ==============================
// Firebase Services Object
// ==============================
const firebaseServices = {
  auth: auth,
  firestore: firestore,
  storage: storage,
  
  // Collections shortcuts
  collections: {
    users: firestore.collection('users'),
    houses: firestore.collection('houses'),
    bnbs: firestore.collection('bnbs'),
    bookings: firestore.collection('bookings')
  },
  
  // Utility functions
  serverTimestamp: firebase.firestore.FieldValue.serverTimestamp,
  arrayUnion: firebase.firestore.FieldValue.arrayUnion,
  arrayRemove: firebase.firestore.FieldValue.arrayRemove,
  increment: firebase.firestore.FieldValue.increment
};

// ==============================
// Export services globally
// ==============================
window.firebaseServices = firebaseServices;
window.firebase = firebase;

// ==============================
// Connection Status Monitor
// ==============================
firestore.enableNetwork().then(() => {
  console.log("Firebase connected successfully");
}).catch((error) => {
  console.error("Firebase connection error:", error);
});

// ==============================
// Auth State Persistence Setup
// ==============================
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
  .then(() => {
    console.log("Auth persistence set to LOCAL");
  })
  .catch((error) => {
    console.error("Auth persistence error:", error);
  });