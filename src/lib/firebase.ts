import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, type Auth } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyB2xm4a9JxkXGGKQxuwGkeoLzsCvMUZkCw",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "lead71-16275.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "lead71-16275",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "lead71-16275.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "82890219823",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:82890219823:web:15777b55a214110fc341da",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-BW7WQGK6VK",
};

// Initialize Firebase only once
const app: FirebaseApp = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
export const auth: Auth = getAuth(app);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: "select_account",
  // Prompt Aventure domain where possible
  hd: "aventureaviation.com",
});

export default app;
