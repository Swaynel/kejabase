// ==============================
// firebase.js – Modular Firebase Setup with CRUD helpers
// ==============================

// 1️⃣ Import modular Firebase functions
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  getFirestore,
  collection,
  persistentLocalCache,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  increment,
  Timestamp,
  addDoc,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where
} from "firebase/firestore";
import { getStorage } from "firebase/storage";

// 2️⃣ Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyDsE-FHOqm9LRmC4ug82YeJ6Nyw8C1zWrc",
  authDomain: "kejabase.firebaseapp.com",
  projectId: "kejabase",
  storageBucket: "kejabase.appspot.com",
  messagingSenderId: "375634491997",
  appId: "1:375634491997:web:7e67eb1c06c7afbc83ebb4",
  measurementId: "G-JTFBB4SG03"
};

// 3️⃣ Initialize Firebase App
const app = initializeApp(firebaseConfig);

// 4️⃣ Initialize Services
const auth = getAuth(app);
const db = getFirestore(app, {
  localCache: persistentLocalCache()
});
const storage = getStorage(app);

// 5️⃣ Helper to create CRUD wrapper for a collection
const createCollectionWrapper = (colRef) => ({
  add: (data) => addDoc(colRef, data),
  getAll: async () => {
    const snapshot = await getDocs(colRef);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },
  getById: async (id) => {
    const docRef = doc(db, colRef.id, id);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
  },
  update: async (id, data) => {
    const docRef = doc(db, colRef.id, id);
    return updateDoc(docRef, data);
  },
  delete: async (id) => {
    const docRef = doc(db, colRef.id, id);
    return deleteDoc(docRef);
  },
  query: async (field, op, value) => {
    const q = query(colRef, where(field, op, value));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }
});

// 6️⃣ Define collections with CRUD wrappers
const usersCollection = createCollectionWrapper(collection(db, "users"));
const housesCollection = createCollectionWrapper(collection(db, "houses"));
const bnbsCollection = createCollectionWrapper(collection(db, "bnbs"));
const bookingsCollection = createCollectionWrapper(collection(db, "bookings"));
const feedbackCollection = createCollectionWrapper(collection(db, "feedback"));
const reportsCollection = createCollectionWrapper(collection(db, "reports"));

// 7️⃣ Utilities
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

// 8️⃣ Expose globally
window.firebaseServices = firebaseServices;

console.log("🔥 Firebase modular services with CRUD helpers loaded successfully");
