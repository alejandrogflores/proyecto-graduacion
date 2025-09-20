// src/services/firebase.ts
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_API_KEY,
  authDomain: import.meta.env.VITE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_APP_ID,
};



export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Refs y helpers
export const colProblems = collection(db, "problems");
export const problemDoc = (id: string) => doc(db, "problems", id);
export const colAttempts = collection(db, "attempts");
export const userDoc = (uid: string) => doc(db, "users", uid);

export async function getUser(uid: string) {
  const snap = await getDoc(userDoc(uid));
  return snap.exists() ? snap.data() : null;
}

export async function upsertUser(uid: string, data: Record<string, any>) {
  await setDoc(userDoc(uid), { ...data, updatedAt: serverTimestamp() }, { merge: true });
}










