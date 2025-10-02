// src/services/firebase.ts
import { initializeApp } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence /*, connectAuthEmulator*/ } from "firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  connectFirestoreEmulator,
} from "firebase/firestore";

// .env
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

// Persistencia: que la sesión sobreviva reloads
setPersistence(auth, browserLocalPersistence);

// Emuladores en dev
if (import.meta.env.DEV) {
  connectFirestoreEmulator(db, "127.0.0.1", 8085);
  // connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
}

// ---- colecciones/refs como ya las tenías ----
export const colProblems     = collection(db, "problems");
export const colClasses      = collection(db, "classes");
export const colAssignments  = collection(db, "assignments");
export const colSubmissions  = collection(db, "submissions");
export const colTags         = collection(db, "tags");
export const colAchievements = collection(db, "achievements");
export const colUsers        = collection(db, "users");

export const colAttempts = collection(db, "attempts");
export const attemptDoc  = (id: string) => doc(db, "attempts", id);

export const problemDoc     = (id: string) => doc(db, "problems", id);
export const classDoc       = (id: string) => doc(db, "classes", id);
export const assignmentDoc  = (id: string) => doc(db, "assignments", id);
export const submissionDoc  = (id: string) => doc(db, "submissions", id);
export const tagDoc         = (id: string) => doc(db, "tags", id);
export const achievementDoc = (id: string) => doc(db, "achievements", id);
export const userDoc        = (uid: string) => doc(db, "users", uid);

export async function getUser(uid: string) {
  const snap = await getDoc(userDoc(uid));
  return snap.exists() ? snap.data() : null;
}

export async function upsertUser(uid: string, data: Record<string, any>) {
  await setDoc(userDoc(uid), { ...data, updatedAt: serverTimestamp() }, { merge: true });
}

