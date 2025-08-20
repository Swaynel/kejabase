// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDsE-FHOqm9LRmC4ug82YeJ6Nyw8C1zWrc",
  authDomain: "kejabase.firebaseapp.com",
  projectId: "kejabase",
  storageBucket: "kejabase.firebasestorage.app",
  messagingSenderId: "375634491997",
  appId: "1:375634491997:web:7e67eb1c06c7afbc83ebb4",
  measurementId: "G-JTFBB4SG03"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize Firebase services
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// Firebase collections reference
const usersCollection = db.collection('users');
const housesCollection = db.collection('houses');
const bnbsCollection = db.collection('bnbs');
const bookingsCollection = db.collection('bookings');
const feedbackCollection = db.collection('feedback');
const reportsCollection = db.collection('reports');

// Export Firebase services to global scope
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
    reports: reportsCollection
  }
};