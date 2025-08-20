// ==============================
// Modular Firebase Initialization (v9+)
// ==============================
import { initializeApp } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  enableIndexedDbPersistence,
  CACHE_SIZE_UNLIMITED,
  collection,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  increment,
  Timestamp
} from "firebase/firestore";
import { getStorage } from "firebase/storage";

// ==============================
// Firebase Config
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
// Initialize App
// ==============================
const app = initializeApp(firebaseConfig);

// ==============================
// Initialize Firestore with settings first
// ==============================
const db = initializeFirestore(app, {
  cacheSizeBytes: CACHE_SIZE_UNLIMITED,
  experimentalForceLongPolling: true
});

// Enable offline persistence safely
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code === 'failed-precondition') {
    console.warn("⚠️ Multiple tabs open; persistence can only be enabled in one tab.");
  } else if (err.code === 'unimplemented') {
    console.warn("⚠️ Persistence is not supported in this browser.");
  }
});

// ==============================
// Initialize Auth and set persistence
// ==============================
const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence)
  .then(() => console.log("✅ Auth persistence set to LOCAL"))
  .catch(err => console.error("❌ Auth persistence error:", err));

// ==============================
// Initialize Storage
// ==============================
const storage = getStorage(app);

// ==============================
// Collections (modular)
// ==============================
const usersCollection = collection(db, 'users');
const housesCollection = collection(db, 'houses');
const bnbsCollection = collection(db, 'bnbs');
const bookingsCollection = collection(db, 'bookings');
const feedbackCollection = collection(db, 'feedback');
const reportsCollection = collection(db, 'reports');

// ==============================
// Utility functions
// ==============================
const firebaseServices = {
  auth,
  db,
  storage,
  collections: {
    users: usersCollection,
    houses: housesCollection,
    bnbs: bnbsCollection,
    bookings: bookingsCollection,
    feedback: feedbackCollection,
    reports: reportsCollection
  },
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  increment,
  toTimestamp: (date) => Timestamp.fromDate(date),
  handleError: (error) => {
    console.error("Firebase Error:", error);
    const messages = {
      "permission-denied": "You don't have permission to perform this action",
      "unauthenticated": "Please sign in to continue",
      "not-found": "The requested item was not found"
    };
    return { error: true, message: messages[error.code] || error.message || "Unexpected error" };
  }
};

// ==============================
// Export globally
// ==============================
window.firebaseServices = firebaseServices;

console.log("🔥 Modular Firebase services loaded successfully");
