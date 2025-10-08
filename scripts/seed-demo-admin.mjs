// scripts/seed-demo-admin.mjs
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

// Con emuladores, basta con tener los env vars:
// FIRESTORE_EMULATOR_HOST=127.0.0.1:8085
// FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099

initializeApp({ projectId: "proyecto-de-graduacion-f1265" });

const db = getFirestore();
const auth = getAuth();

async function ensureUser(email, password, displayName) {
  try {
    const u = await auth.getUserByEmail(email);
    return u.uid;
  } catch (e) {
    if (e?.code === "auth/user-not-found") {
      const u = await auth.createUser({ email, password, displayName });
      return u.uid;
    }
    throw e;
  }
}

async function main() {
  const studentUid = await ensureUser("student@demo.test", "123456", "Alumno Demo");
  const teacherUid = await ensureUser("teacher@demo.test", "123456", "Profesor Demo");

  await db.doc(`users/${studentUid}`).set({
    email: "student@demo.test",
    role: "student",
    displayName: "Alumno Demo",
    createdAt: FieldValue.serverTimestamp(),
    lastSeen: FieldValue.serverTimestamp(),
  }, { merge: true });

  await db.doc(`users/${teacherUid}`).set({
    email: "teacher@demo.test",
    role: "teacher",
    displayName: "Profesor Demo",
    createdAt: FieldValue.serverTimestamp(),
    lastSeen: FieldValue.serverTimestamp(),
  }, { merge: true });

  await db.doc("problems/p1").set({
    title: "Multiplicación",
    statement: "¿Cuánto es 3 × 4?",
    options: ["7","9","10","12"],
    correctIndex: 3,
    ownerUid: teacherUid,
    createdAt: FieldValue.serverTimestamp(),
  });

  await db.doc("problems/p2").set({
    title: "Suma",
    statement: "¿Cuánto es 5 + 6?",
    options: ["9","10","11","12"],
    correctIndex: 2,
    ownerUid: teacherUid,
    createdAt: FieldValue.serverTimestamp(),
  });

  await db.doc("assignments/a1").set({
    title: "Quiz 1",
    classId: "c1",
    ownerUid: teacherUid,
    published: true,
    assigneeUids: [studentUid],
    startsAt: FieldValue.serverTimestamp(),
    endsAt: FieldValue.serverTimestamp(),
    problemIds: ["p1","p2"],
    createdAt: FieldValue.serverTimestamp(),
  });

  console.log("✅ Seed OK: users, problems p1/p2 y assignment a1");
  console.log("   Student:", studentUid, "Teacher:", teacherUid);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
