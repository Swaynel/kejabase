// js/firebase.js
// ==============================
// Firebase initialization (modular v9)
// ==============================

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  enableIndexedDbPersistence,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  increment,
  Timestamp,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js";

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyDsE-FHOqm9LRmC4ug82YeJ6Nyw8C1zWrc",
  authDomain: "kejabase.firebaseapp.com",
  projectId: "kejabase",
  storageBucket: "kejabase.appspot.com",
  messagingSenderId: "375634491997",
  appId: "1:375634491997:web:7e67eb1c06c7afbc83ebb4",
  measurementId: "G-JTFBB4SG03"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Enable offline persistence
enableIndexedDbPersistence(db).catch(err => {
  if (err.code === "failed-precondition") {
    console.warn("⚠️ Multiple tabs open; persistence only works in one tab.");
  } else if (err.code === "unimplemented") {
    console.warn("⚠️ Persistence not supported in this browser.");
  }
});

// Collections
const usersCollection = collection(db, "users");
const housesCollection = collection(db, "houses");
const bnbsCollection = collection(db, "bnbs");
const bookingsCollection = collection(db, "bookings");
const feedbackCollection = collection(db, "feedback");
const reportsCollection = collection(db, "reports");
const favoritesCollection = collection(db, "favorites");

// Helper functions
const handleError = (error) => {
  console.error("Firebase Error:", error);
  const messages = {
    "permission-denied": "You don't have permission to perform this action",
    "unauthenticated": "Please sign in to continue",
    "not-found": "The requested item was not found"
  };
  return { error: true, message: messages[error.code] || error.message || "Unexpected error" };
};

// Consolidate Firebase services
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
    reports: reportsCollection,
    favorites: favoritesCollection
  },
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  increment,
  toTimestamp: date => Timestamp.fromDate(date),
  setPersistence: (rememberMe) => {
    const persistence = rememberMe ? browserLocalPersistence : browserSessionPersistence;
    return setPersistence(auth, persistence);
  },
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  handleError,
  ready: true
};

// Export the services for modular import
export default firebaseServices;

// Optional: fire an event for listeners in your app (still ESLint-safe)
if (typeof window !== "undefined") {
  window.dispatchEvent(new CustomEvent("firebaseReady", { detail: { firebaseServices } }));
}

console.log("🔥 Firebase v9 modular services loaded successfully");
