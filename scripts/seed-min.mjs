// scripts/seed-min.mjs
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

// ⚠️ Usa el mismo projectId de tu emulador
const PROJECT_ID = "proyecto-de-graduacion-f1265";

initializeApp({ projectId: PROJECT_ID });

const auth = getAuth();
const db = getFirestore();

async function ensureUser(email, password, role, displayName) {
  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch {
    user = await auth.createUser({ email, password, displayName, emailVerified: true });
  }
  // users/{uid}
  await db.collection("users").doc(user.uid).set(
    {
      email,
      displayName: displayName ?? null,
      role,
      lastSeen: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return user.uid;
}

async function ensureProblem(id, data) {
  await db.collection("problems").doc(id).set(
    {
      ...data,
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function ensureClass(id, data) {
  await db.collection("classes").doc(id).set(
    {
      ...data,
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function ensureAssignment(id, data) {
  await db.collection("assignments").doc(id).set(
    {
      ...data,
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function main() {
  // 1) Cuentas
  const teacherUid = await ensureUser("teacher@demo.test", "123456", "teacher", "Profesor Demo");
  const studentUid = await ensureUser("student@demo.test", "123456", "student", "Alumno Demo");

  // 2) Clase
  await ensureClass("c6A", {
    title: "6° A",
    ownerUid: teacherUid,
    studentUids: [studentUid],
  });

  // 3) Problemas
  await ensureProblem("p1", {
    title: "Multiplicación",
    statement: "¿Cuánto es 3 × 4?",
    options: ["10", "11", "12", "13"],
    correctIndex: 2,
    ownerUid: teacherUid,
    difficulty: "easy",
  });

  await ensureProblem("p2", {
    title: "Suma",
    statement: "¿Cuánto es 5 + 6?",
    options: ["9", "10", "11", "12"],
    correctIndex: 2,
    ownerUid: teacherUid,
    difficulty: "easy",
  });

  // 4) Asignación
  await ensureAssignment("a1", {
    title: "Quiz 1",
    ownerUid: teacherUid,
    classId: "c6A",
    problemIds: ["p1", "p2"],
    assigneeUids: [studentUid],          // foto del roster
    publishedAt: FieldValue.serverTimestamp(), // publicada
    timeLimitSec: 600,                   // 10 minutos
  });

  console.log("✅ Seed listo:");
  console.log(`   Teacher UID: ${teacherUid}`);
  console.log(`   Student UID: ${studentUid}`);
  console.log("   Clase: c6A, Problemas: p1, p2, Asignación: a1");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
