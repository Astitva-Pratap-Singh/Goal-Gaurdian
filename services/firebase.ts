import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { initializeFirestore, memoryLocalCache } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const rawProjectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || '';
// Sanitize projectId: remove protocol, www, and take the first part of the domain if it looks like a URL
// This handles cases where the user accidentally pastes the full URL or domain as the Project ID
const projectId = rawProjectId.replace(/^(https?:\/\/)?(www\.)?/, '').split('.')[0];

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || (projectId ? `${projectId}.firebaseapp.com` : undefined),
  projectId: projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

console.log("Firebase Config (Sanitized):", {
  rawProjectId: rawProjectId ? "Set (Hidden)" : "Missing",
  projectId,
  authDomain: firebaseConfig.authDomain
});

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Initialize Firestore with memory cache and long polling to avoid WebSocket/IndexedDB issues in restricted environments
export const db = initializeFirestore(app, {
  localCache: memoryLocalCache(),
  experimentalForceLongPolling: true,
});

export const storage = getStorage(app);
