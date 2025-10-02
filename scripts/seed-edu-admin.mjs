// scripts/seed-edu-admin.mjs
// Semilla para Firestore Emulator (sincroniza colecciones y calcula isCorrect)

import { initializeApp } from "firebase/app";
import {
  getFirestore,
  connectFirestoreEmulator,
  doc, setDoc, getDoc, collection, getDocs, serverTimestamp
} from "firebase/firestore";

// ⚠️ Ajusta este UID al del teacher real del emulador (Authentication UI)
const TEACHER_UID = "Gn0wFYVuRjc6grsK1oquWvKIvuc2";

// Config mínima (puede ser la misma que usas en tu app; aquí basta con projectId)
const firebaseConfig = {
  apiKey: "fake-api-key",
  authDomain: "fake.firebaseapp.com",
  projectId: "proyecto-de-graduacion-f1265",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Conectar al emulador (IP y puerto que ya usas)
connectFirestoreEmulator(db, "127.0.0.1", 8085);

// Helpers de refs
const userDoc = (uid) => doc(db, "users", uid);
const classDoc = (id) => doc(db, "classes", id);
const problemDoc = (id) => doc(db, "problems", id);
const assignmentDoc = (id) => doc(db, "assignments", id);
const attemptDoc = (id) => doc(db, "attempts", id);

function isCorrect(score, maxScore) {
  // Si prefieres otro criterio, cámbialo aquí
  return Number(score) === Number(maxScore);
}

async function upsertUser(uid, data) {
  await setDoc(userDoc(uid), { ...data, updatedAt: serverTimestamp() }, { merge: true });
}

async function upsertProblem(id, data) {
  await setDoc(problemDoc(id), { ...data, updatedAt: serverTimestamp() }, { merge: true });
}

async function upsertAssignment(id, data) {
  await setDoc(assignmentDoc(id), { ...data, updatedAt: serverTimestamp() }, { merge: true });
}

async function upsertAttempt(id, data) {
  const payload = {
    ...data,
    createdAt: data.createdAt ?? serverTimestamp(),
    // Calcula isCorrect si no viene definido
    isCorrect: typeof data.isCorrect === "boolean"
      ? data.isCorrect
      : isCorrect(data.score, data.maxScore),
  };
  await setDoc(attemptDoc(id), payload, { merge: true });
}

async function seed() {
  console.log("⏳ Sembrando datos en Firestore Emulator…");

  // 1) Users (teacher + student demo)
  await upsertUser(TEACHER_UID, {
    email: "jgarciaf8@miumg.edu.gt",
    role: "teacher",
    displayName: "Profesor Demo",
  });

  await upsertUser("student_demo", {
    email: "student@demo.test",
    role: "student",
    displayName: "Alumno Demo",
  });

  // 2) Una clase y problemas de ejemplo
  await setDoc(classDoc("class1"), {
    name: "Matemática 1B",
    ownerUid: TEACHER_UID,
    updatedAt: serverTimestamp(),
  }, { merge: true });

  await upsertProblem("prob1", {
    title: "Suma simple",
    statement: "¿Cuánto es 2 + 3?",
    options: ["4", "5", "6", "7"],
    correctIndex: 1,
    ownerUid: TEACHER_UID,
  });

  await upsertProblem("prob2", {
    title: "Multiplicación",
    statement: "¿Cuánto es 3 × 4?",
    options: ["7", "9", "10", "12"],
    correctIndex: 3,
    ownerUid: TEACHER_UID,
  });

  // 3) Un assignment que “pertenece” al teacher
  await upsertAssignment("a1", {
    title: "Quiz 1",
    ownerUid: TEACHER_UID,
    classId: "class1",
    problemIds: ["prob1", "prob2"],
    published: true,
  });

  // 4) Attempts: aquí se ponen TODOS los campos y se calcula isCorrect automáticamente
  const attempts = [
    {
      id: "att1",
      assignmentId: "a1",
      problemId: "prob1",
      score: 1,
      maxScore: 1,
      startedAt: serverTimestamp(),
      finishedAt: serverTimestamp(),
      ownerUid: TEACHER_UID,
      userUid: "student_demo",
      // studentUid opcional; si quieres mantenerlo por compatibilidad:
      studentUid: "student_demo",
    },
    {
      id: "att2",
      assignmentId: "a1",
      problemId: "prob2",
      score: 0,
      maxScore: 1,
      startedAt: serverTimestamp(),
      finishedAt: serverTimestamp(),
      ownerUid: TEACHER_UID,
      userUid: "student_demo",
      studentUid: "student_demo",
    },
    // agrega más si quieres
  ];

  for (const a of attempts) {
    await upsertAttempt(a.id, a);
  }

  console.log("✅ Listo. Revisa en Emulator UI (Firestore → Data).");
}

// (Opcional) migración: si ya tienes attempts sin ownerUid/userUid/isCorrect,
// este bloque los recorre y los completa automáticamente.
async function migrateAttemptsIfNeeded() {
  const snap = await getDocs(collection(db, "attempts"));
  const updates = [];
  snap.forEach((d) => {
    const data = d.data() || {};
    const needsOwner = !data.ownerUid;
    const needsUser = !data.userUid && data.studentUid;
    const needsCorrect = typeof data.isCorrect !== "boolean" && data.score != null && data.maxScore != null;

    if (needsOwner || needsUser || needsCorrect) {
      updates.push(upsertAttempt(d.id, {
        ...data,
        ownerUid: data.ownerUid ?? TEACHER_UID,
        userUid: data.userUid ?? data.studentUid ?? "student_demo",
      }));
    }
  });
  await Promise.all(updates);
  if (updates.length) {
    console.log(`♻️  Migrados ${updates.length} attempt(s) existentes.`);
  }
}

await seed();
await migrateAttemptsIfNeeded();
