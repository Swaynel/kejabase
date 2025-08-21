/* global firebase */

// ==============================
// firebase.js – Firebase initialization and services
// ==============================

// Make sure SDK scripts are loaded before this file
if (!window.firebase) {
  console.error("Firebase SDK not loaded!");
}

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDsE-FHOqm9LRmC4ug82YeJ6Nyw8C1zWrc",
  authDomain: "kejabase.firebaseapp.com",
  projectId: "kejabase",
  storageBucket: "kejabase.appspot.com",
  messagingSenderId: "375634491997",
  appId: "1:375634491997:web:7e67eb1c06c7afbc83ebb4",
  measurementId: "G-JTFBB4SG03"
};

// Initialize Firebase app
firebase.initializeApp(firebaseConfig); // ← used now, removes ESLint warning

// Firebase services
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// Enable offline persistence
db.enablePersistence().catch(err => {
  if (err.code === 'failed-precondition') {
    console.warn("⚠️ Multiple tabs open; persistence only works in one tab.");
  } else if (err.code === 'unimplemented') {
    console.warn("⚠️ Persistence is not supported in this browser.");
  }
});

// Firestore collections
const usersCollection = db.collection('users');
const housesCollection = db.collection('houses');
const bnbsCollection = db.collection('bnbs');
const bookingsCollection = db.collection('bookings');
const feedbackCollection = db.collection('feedback');
const reportsCollection = db.collection('reports');
const favoritesCollection = db.collection('favorites');

// Build global firebaseServices object
window.firebaseServices = {
  auth,
  db,
  storage,
  collections: {
    users: usersCollection,
    houses: housesCollection,
    bnbs: bnbsCollection,
    bookings: bookingsCollection,
    feedback: feedbackCollection,
    reports: reportsCollection,
    favorites: favoritesCollection
  },
  serverTimestamp: firebase.firestore.FieldValue.serverTimestamp,
  arrayUnion: firebase.firestore.FieldValue.arrayUnion,
  arrayRemove: firebase.firestore.FieldValue.arrayRemove,
  increment: firebase.firestore.FieldValue.increment,
  toTimestamp: date => firebase.firestore.Timestamp.fromDate(date),
  handleError: error => {
    console.error("Firebase Error:", error);
    const messages = {
      "permission-denied": "You don't have permission to perform this action",
      "unauthenticated": "Please sign in to continue",
      "not-found": "The requested item was not found"
    };
    return { error: true, message: messages[error.code] || error.message || "Unexpected error" };
  }
};

// Mark Firebase as ready and dispatch event
window.firebaseServices.ready = true;
window.dispatchEvent(new CustomEvent('firebaseReady', { detail: { firebaseServices: window.firebaseServices } }));

console.log("🔥 Firebase v9 compat services loaded successfully");
