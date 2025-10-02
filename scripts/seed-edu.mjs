// scripts/seed-edu.mjs
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  connectFirestoreEmulator,
  doc, setDoc, getDoc, updateDoc,
  serverTimestamp, Timestamp,
  arrayUnion, writeBatch,
} from "firebase/firestore";

// =====================================================
// 👇 REEMPLAZA esto por TU UID real de Auth
const TEACHER_UID = "Gn0wFYVuRjc6grsK1oquWvKIvuc2";
// =====================================================

// Usa tu projectId (para emulador basta con esto)
const app = initializeApp({ projectId: "proyecto-de-graduacion-f1265" });
const db = getFirestore(app);
connectFirestoreEmulator(db, "127.0.0.1", 8085);

// Helpers de tiempo
const now = new Date();
const inDays = (d) => new Date(now.getTime() + d * 24 * 60 * 60 * 1000);
const twoDays = inDays(2);
const yesterday = inDays(-1);

async function ensureUserTeacher(uid) {
  const uref = doc(db, "users", uid);
  const snap = await getDoc(uref);
  if (snap.exists()) {
    await updateDoc(uref, {
      role: "teacher",
      classIds: arrayUnion("clase1"),
      lastSeen: serverTimestamp(),
    });
  } else {
    await setDoc(uref, {
      uid,
      email: "teacher@example.com",
      displayName: "Docente de Prueba",
      photoURL: "",
      role: "teacher",
      classIds: ["clase1"],       // 👈 importante para que vea /assignments/my
      createdAt: serverTimestamp(),
      lastSeen: serverTimestamp(),
    });
  }
}

async function seed() {
  // Lote para escritura rápida
  const batch = writeBatch(db);

  // 1) Clase
  batch.set(doc(db, "classes", "clase1"), {
    name: "Matemáticas 1",
    description: "Clase de ejemplo para pruebas",
    teacherUid: TEACHER_UID,
    createdAt: serverTimestamp(),
  });

  // 2) Problemas (2 para probar)
  batch.set(doc(db, "problems", "prob1"), {
    title: "Ecuaciones básicas",
    statement: "Resuelve: 1/2 + 3/4",
    difficulty: 1,
    tags: ["algebra"],
    createdBy: TEACHER_UID,
    createdAt: serverTimestamp(),
  });

  batch.set(doc(db, "problems", "prob2"), {
    title: "Porcentajes simples",
    statement: "¿Cuál es el 20% de 150?",
    difficulty: 1,
    tags: ["porcentajes"],
    createdBy: TEACHER_UID,
    createdAt: serverTimestamp(),
  });

  // 3) Asignaciones (abierta, cerrada, y otra futura)
  batch.set(doc(db, "assignments", "a1"), {
    title: "Tarea 1 - Álgebra",
    classId: "clase1",
    status: "open",
    dueAt: Timestamp.fromDate(twoDays),   // vence en 2 días
    problemIds: ["prob1"],                // 👈 array
    createdBy: TEACHER_UID,
    createdAt: serverTimestamp(),
  });

  batch.set(doc(db, "assignments", "a2"), {
    title: "Tarea 0 - Vencida",
    classId: "clase1",
    status: "closed",
    dueAt: Timestamp.fromDate(yesterday), // vencida
    problemIds: ["prob1", "prob2"],
    createdBy: TEACHER_UID,
    createdAt: serverTimestamp(),
  });

  batch.set(doc(db, "assignments", "a3"), {
    title: "Tarea 2 - Porcentajes",
    classId: "clase1",
    status: "open",
    dueAt: Timestamp.fromDate(inDays(7)), // vence en 7 días
    problemIds: ["prob2"],
    createdBy: TEACHER_UID,
    createdAt: serverTimestamp(),
  });

  await batch.commit();

  // 4) Usuario teacher con classIds
  await ensureUserTeacher(TEACHER_UID);

  console.log("\n[seed] ✅ Datos creados:");
  console.log(" - classes/clase1");
  console.log(" - problems/prob1, prob2");
  console.log(" - assignments/a1 (open, futura), a2 (closed), a3 (open, futura)");
  console.log(" - users/" + TEACHER_UID + " (role: teacher, classIds: ['clase1'])\n");
  console.log("Revisa Emulator UI: http://127.0.0.1:4001/firestore\n");
}

seed().catch((e) => {
  console.error("[seed] ❌ Error:", e);
  process.exit(1);
});
