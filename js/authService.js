// Authentication Service
const authService = {
  // Sign in with email and password
  signInWithEmailAndPassword: function (email, password, role, rememberMe) {
    let persistence = rememberMe
      ? firebase.auth.Auth.Persistence.LOCAL
      : firebase.auth.Auth.Persistence.SESSION;

    return firebaseServices.auth.setPersistence(persistence)
      .then(() => {
        return firebaseServices.auth.signInWithEmailAndPassword(email, password);
      })
      .then(userCredential => {
        // Check user role in Firestore
        return firebaseServices.collections.users.doc(userCredential.user.uid).get()
          .then(doc => {
            if (!doc.exists || doc.data().role !== role) {
              firebaseServices.auth.signOut();
              throw new Error(`You don't have ${role} privileges.`);
            }

            // ✅ Log login event in Analytics
            if (firebaseServices.analytics) {
              firebaseServices.analytics.logEvent('login', {
                method: 'email',
                role: doc.data().role
              });
            }

            return { user: userCredential.user, role: doc.data().role };
          });
      })
      .catch(error => {
        console.error("Login failed:", error.message);
        throw new Error("Invalid credentials or network issue.");
      });
  },

  // Register new user
  registerWithEmailAndPassword: function (email, password, userData) {
    return firebaseServices.auth.createUserWithEmailAndPassword(email, password)
      .then(userCredential => {
        const userId = userCredential.user.uid;
        const finalUserData = {
          ...userData,
          uid: userId,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        return firebaseServices.collections.users.doc(userId).set(finalUserData)
          .then(() => {
            // ✅ Log sign-up event in Analytics
            if (firebaseServices.analytics) {
              firebaseServices.analytics.logEvent('sign_up', {
                method: 'email',
                role: userData.role || "unknown"
              });
            }

            return { user: userCredential.user, data: finalUserData };
          });
      })
      .catch(error => {
        console.error("Registration failed:", error.message);
        throw new Error("Could not register. Please try again.");
      });
  },

  // Sign out
  signOut: function () {
    return firebaseServices.auth.signOut();
  },

  // Password reset
  sendPasswordResetEmail: function (email) {
    return firebaseServices.auth.sendPasswordResetEmail(email);
  },

  // Developer testing mode (simulate users without login)
  developerTestMode: function (role) {
    const testUsers = {
      hunter: {
        uid: 'test-hunter-123',
        email: 'hunter@kejabase.test',
        role: 'hunter'
      },
      provider: {
        uid: 'test-provider-123',
        email: 'provider@kejabase.test',
        role: 'provider'
      },
      bnb: {
        uid: 'test-bnb-123',
        email: 'bnb@kejabase.test',
        role: 'bnb'
      },
      admin: {
        uid: 'test-admin-123',
        email: 'admin@kejabase.test',
        role: 'admin'
      }
    };

    if (testUsers[role]) {
      if (typeof state !== "undefined" && state.updateState) {
        state.updateState({
          currentUser: { uid: testUsers[role].uid, email: testUsers[role].email },
          userRole: role
        });
      }

      // ✅ Log simulated login in Analytics
      if (firebaseServices.analytics) {
        firebaseServices.analytics.logEvent('developer_login', { role });
      }

      return Promise.resolve();
    } else {
      return Promise.reject(new Error('Invalid test role'));
    }
  }
};

// Expose to global scope
window.authService = authService;
