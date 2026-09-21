// Filtr. Firebase Initialization & Authentication Handler
const firebaseConfig = {
  apiKey: "AIzaSyCQnyrjg6BO0K9troCag3KgfaFAccLLJOE",
  authDomain: "filtr-336c0.firebaseapp.com",
  projectId: "filtr-336c0",
  storageBucket: "filtr-336c0.firebasestorage.app",
  messagingSenderId: "691140615070",
  appId: "1:691140615070:web:a534b9eeead4b690d6948f",
  measurementId: "G-0MF9LW2C8B"
};

// Initialize Firebase if loaded
if (typeof firebase !== "undefined" && !firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = typeof firebase !== "undefined" ? firebase.auth() : null;
const db = typeof firebase !== "undefined" ? firebase.firestore() : null;

// Global FiltrAuth API
window.FiltrAuth = {
  auth,
  db,
  signUp: async (email, password) => {
    if (!auth) throw new Error("Firebase Auth is not initialized.");
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    // Create initial user profile in Firestore
    if (db && cred.user) {
      try {
        await db.collection("users").doc(cred.user.uid).set({
          email: cred.user.email,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      } catch (err) {
        console.warn("Could not save initial user doc:", err);
      }
    }
    return cred;
  },
  signIn: async (email, password) => {
    if (!auth) throw new Error("Firebase Auth is not initialized.");
    return await auth.signInWithEmailAndPassword(email, password);
  },
  signOut: async () => {
    if (!auth) throw new Error("Firebase Auth is not initialized.");
    return await auth.signOut();
  },
  getUser: () => auth ? auth.currentUser : null
};

// Format Firebase auth error messages nicely
function formatAuthError(error) {
  switch (error.code) {
    case "auth/email-already-in-use":
      return "An account with this email already exists. Try logging in instead.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/weak-password":
      return "Password should be at least 6 characters.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Invalid email or password. Please check your details.";
    case "auth/too-many-requests":
      return "Too many failed attempts. Please try again in a few minutes.";
    default:
      return error.message || "An error occurred during authentication.";
  }
}

// Global UI Navigation Sync across all pages
if (auth) {
  auth.onAuthStateChanged((user) => {
    // 1. Home page topbar (.nav-actions in index.html)
    const navActions = document.querySelector(".nav-actions");
    if (navActions) {
      if (user) {
        const username = user.email.split("@")[0];
        navActions.innerHTML = `
          <span class="user-greeting" style="font-size: 11px; font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase; color: var(--tomato); margin-right: 4px;">${username}</span>
          <button class="quiet-button" id="mainLogoutBtn" type="button">Log out</button>
          <button class="quiet-button leave-quiet" id="leaveButton">Leave quietly</button>
        `;
        const logoutBtn = document.getElementById("mainLogoutBtn");
        if (logoutBtn) {
          logoutBtn.onclick = () => auth.signOut();
        }
      } else {
        navActions.innerHTML = `
          <a class="nav-login" href="login.html">Log in</a>
          <a class="quiet-button" href="signup.html">Sign up</a>
          <button class="quiet-button leave-quiet" id="leaveButton">Leave quietly</button>
        `;
      }
      const leaveBtn = document.getElementById("leaveButton");
      if (leaveBtn) {
        leaveBtn.onclick = () => location.assign("https://www.google.com");
      }
    }

    // 2. Subpage topbars (.app-topbar .app-link in review.html, timeline.html, etc.)
    const appTopbar = document.querySelector(".app-topbar");
    if (appTopbar) {
      let authSlot = appTopbar.querySelector(".app-auth-slot");
      if (!authSlot) {
        const existingLink = appTopbar.querySelector(".app-link");
        authSlot = document.createElement("div");
        authSlot.className = "app-auth-slot";
        authSlot.style.cssText = "justify-self: end; display: flex; align-items: center; gap: 14px;";
        if (existingLink) {
          existingLink.replaceWith(authSlot);
        } else {
          appTopbar.appendChild(authSlot);
        }
      }

      if (user) {
        const username = user.email.split("@")[0];
        authSlot.innerHTML = `
          <span style="font-size: 10px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; color: var(--tomato);">${username}</span>
          <button class="app-link" id="subLogoutBtn" type="button" style="background:none;border:none;border-bottom:1px solid var(--ink);cursor:pointer;padding:0 0 2px;font-family:inherit;">Log out</button>
        `;
        const subLogoutBtn = document.getElementById("subLogoutBtn");
        if (subLogoutBtn) {
          subLogoutBtn.onclick = () => auth.signOut();
        }
      } else {
        authSlot.innerHTML = `<a class="app-link" href="login.html">Log in</a>`;
      }
    }
  });
}

// Attach Form Handlers on page load
document.addEventListener("DOMContentLoaded", () => {
  const isLoginPage = window.location.pathname.includes("login");
  const isSignupPage = window.location.pathname.includes("signup");
  const noticeEl = document.getElementById("pageNotice");

  function showNotice(text, isError = false) {
    if (!noticeEl) return;
    noticeEl.textContent = text;
    noticeEl.style.background = isError ? "var(--tomato)" : "var(--onyx)";
    noticeEl.hidden = false;
    clearTimeout(window.filtrNoticeTimer);
    window.filtrNoticeTimer = setTimeout(() => {
      noticeEl.hidden = true;
    }, 6000);
  }

  // Handle signup.html & login.html form
  const accountForm = document.getElementById("accountForm");
  if (accountForm && (isLoginPage || isSignupPage)) {
    const emailInput = document.getElementById("accountEmail");
    const passwordInput = document.getElementById("accountPassword");
    const submitBtn = accountForm.querySelector("button[type='submit']");
    const originalBtnText = submitBtn ? submitBtn.querySelector("span")?.textContent || "Submit" : "Submit";

    accountForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = emailInput.value.trim();
      const password = passwordInput.value;

      if (!email || !password) {
        showNotice("Please fill in both email and password.", true);
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.querySelector("span").textContent = isSignupPage ? "Creating account..." : "Logging in...";
      }

      try {
        if (isSignupPage) {
          await window.FiltrAuth.signUp(email, password);
          showNotice("Account created successfully! Redirecting...");
          setTimeout(() => {
            window.location.href = "review.html";
          }, 1000);
        } else {
          await window.FiltrAuth.signIn(email, password);
          showNotice("Logged in successfully! Redirecting...");
          setTimeout(() => {
            window.location.href = "review.html";
          }, 1000);
        }
      } catch (err) {
        showNotice(formatAuthError(err), true);
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.querySelector("span").textContent = originalBtnText;
        }
      }
    });
  }

  // Handle Home page auth dialog (index.html modal)
  const homeAuthForm = document.getElementById("authForm");
  if (homeAuthForm) {
    const emailInput = document.getElementById("authEmail");
    const passwordInput = document.getElementById("authPassword");
    const feedback = document.getElementById("authFeedback");
    const submitBtn = homeAuthForm.querySelector("button[type='submit']");

    homeAuthForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = emailInput.value.trim();
      const password = passwordInput.value;

      if (!email || !password) return;

      if (submitBtn) submitBtn.disabled = true;
      if (feedback) feedback.textContent = "Connecting securely...";

      try {
        await window.FiltrAuth.signUp(email, password);
        if (feedback) feedback.textContent = "Account created! You are now logged in.";
        setTimeout(() => {
          const authDialog = document.getElementById("authDialog");
          if (authDialog && authDialog.open) authDialog.close();
        }, 1200);
      } catch (err) {
        // If account already exists, try signing in
        if (err.code === "auth/email-already-in-use") {
          try {
            await window.FiltrAuth.signIn(email, password);
            if (feedback) feedback.textContent = "Welcome back! Logged in.";
            setTimeout(() => {
              const authDialog = document.getElementById("authDialog");
              if (authDialog && authDialog.open) authDialog.close();
            }, 1200);
            return;
          } catch (signInErr) {
            if (feedback) feedback.textContent = formatAuthError(signInErr);
          }
        } else {
          if (feedback) feedback.textContent = formatAuthError(err);
        }
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }
});
