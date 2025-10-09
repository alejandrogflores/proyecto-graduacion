// src/services/firebase.ts
import { initializeApp } from "firebase/app";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  connectAuthEmulator,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  connectFirestoreEmulator,
  query, where, limit, getDocs,
} from "firebase/firestore";



// .env (o hardcode en emulador)
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


// Persistencia: sesión sobrevivirá reloads
setPersistence(auth, browserLocalPersistence);

// Emuladores en DEV
if (import.meta.env.DEV) {
  connectFirestoreEmulator(db, "127.0.0.1", 8085);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
}

// ---- colecciones/refs ----
export const colProblems = collection(db, "problems");
export const colClasses = collection(db, "classes");
export const colAssignments = collection(db, "assignments");
export const colSubmissions = collection(db, "submissions");
export const colTags = collection(db, "tags");
export const colAchievements = collection(db, "achievements");
export const colUsers = collection(db, "users");

// ✅ Attempts (para resolver/guardar resultados)
export const colAttempts = collection(db, "attempts");

// ---- doc helpers ----
export const attemptDoc = (id: string) => doc(db, "attempts", id);
export const problemDoc = (id: string) => doc(db, "problems", id);
export const classDoc = (id: string) => doc(db, "classes", id);
export const assignmentDoc = (id: string) => doc(db, "assignments", id);
export const submissionDoc = (id: string) => doc(db, "submissions", id);
export const tagDoc = (id: string) => doc(db, "tags", id);
export const achievementDoc = (id: string) => doc(db, "achievements", id);

// 👇 ESTE es el que te faltaba para otros usos del perfil:
export const userDoc = (uid: string) => doc(db, "users", uid);

// ---- helpers de usuario (opcionales) ----
export async function getUser(uid: string) {
  const snap = await getDoc(userDoc(uid));
  return snap.exists() ? snap.data() : null;
}
export async function upsertUser(uid: string, data: Record<string, any>) {
  await setDoc(
    userDoc(uid),
    { ...data, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

// =============================
// ✅ TIPOS para attempts (nuevo)
// =============================
export type Answer = {
  problemId: string;
  selectedIndex: number;  // -1 si no respondió
  correct: boolean;
};

export type Attempt = {
  id?: string;
  assignmentId: string;
  assignmentTitle?: string;
  ownerUid: string;       // dueño del assignment (para reglas/reportes)
  studentUid: string;
  studentEmail?: string;
  answers: Answer[];
  correctCount: number;
  total: number;
  score: number;          // 0–100
  startedAt: any;         // serverTimestamp
  finishedAt: any | null; // serverTimestamp | null
  durationSec?: number;
  version?: number;
};

// (Opcional) pequeño helper para buscar intento abierto del alumno
export async function getOpenAttempt(assignmentId: string, studentUid: string) {
  const qOpen = query(
    colAttempts,
    where("assignmentId", "==", assignmentId),
    where("studentUid", "==", studentUid),
    where("finishedAt", "==", null),
    limit(1),
  );
  const qs = await getDocs(qOpen);
  return qs.empty ? null : { id: qs.docs[0].id, ...(qs.docs[0].data() as any) };
}
