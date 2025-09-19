// src/services/firebase.ts
import { initializeApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider, signOut } from "firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  type CollectionReference,
  type DocumentReference,
  type Timestamp,
} from "firebase/firestore";
import { getStorage } from "firebase/storage";

// =======================
// Configuración Firebase
// =======================
const firebaseConfig = {
  apiKey: import.meta.env.VITE_API_KEY,
  authDomain: import.meta.env.VITE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_APP_ID,
  measurementId: import.meta.env.VITE_MEASUREMENT_ID,
};

// Evita inicializar más de una vez (HMR de Vite)
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

// =======================
// Servicios principales
// =======================
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();
export const db = getFirestore(app);
export const storage = getStorage(app);

// =======================
// Tipos usados en la app
// =======================
export type Problem = {
  title: string;
  statement: string;
  options: string[];
  correctIndex: number;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
  createdBy?: string | null;
};

export type Attempt = {
  // IDs de usuario / problema
  userUid: string;
  userEmail?: string;
  problemId?: string;

  // Respuesta
  answerIndex?: number;   // índice de la opción elegida
  isCorrect?: boolean;    // si acertó o no

  // Tiempos
  answeredAt?: Timestamp; // Timestamp de Firestore

  // Otros campos
  [k: string]: any;
};

// =======================
// Helpers de colecciones
// (como CONSTANTES ✅)
// =======================
export const colProblems: CollectionReference = collection(db, "problems");
export const colAttempts: CollectionReference = collection(db, "attempts");
export const colUsers: CollectionReference = collection(db, "users");

// =======================
// Helpers de documentos
// =======================
export const problemDoc = (problemId: string): DocumentReference =>
  doc(db, "problems", problemId);

export const userDoc = (uid: string): DocumentReference =>
  doc(db, "users", uid);

// =======================
// (Opcional) Helpers para DevTools
// =======================
if (typeof window !== "undefined") {
  (window as any).auth = auth;
  (window as any).signOutFirebase = () => signOut(auth);
}






