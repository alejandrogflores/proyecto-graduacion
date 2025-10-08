// scripts/seed-demo.mjs
import { initializeApp } from "firebase/app";
import {
  getFirestore, connectFirestoreEmulator,
  doc, setDoc, serverTimestamp
} from "firebase/firestore";

// ====== CONFIG EMULADORES ======
const HOST = "127.0.0.1";
const AUTH_URL = `http://${HOST}:9099/identitytoolkit.googleapis.com/v1`;

// Util: crear usuario en Auth Emulator (o devolver su UID si ya existe)
async function ensureUser(email, password, displayName) {
  // 1) intenta crear
  let res = await fetch(`${AUTH_URL}/accounts:signUp?key=fake`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  let json = await res.json();

  // si ya existe, haz signIn y toma el UID
  if (!res.ok) {
    res = await fetch(`${AUTH_URL}/accounts:signInWithPassword?key=fake`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    json = await res.json();
    if (!res.ok) throw new Error(`Auth error for ${email}: ${JSON.stringify(json)}`);
  }
  return json.localId; // UID
}

async function main() {
  // Firestore (solo emulador)
  const app = initializeApp({ projectId: "demo-seed" });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, HOST, 8085);

  // ====== 1) Usuarios (Auth + /users) ======
  const studentUid = await ensureUser("student@demo.test", "123456", "Alumno Demo");
  const teacherUid = await ensureUser("teacher@demo.test", "123456", "Profesor Demo");

  await setDoc(doc(db, "users", studentUid), {
    email: "student@demo.test",
    role: "student",
    displayName: "Alumno Demo",
    createdAt: serverTimestamp(),
    lastSeen: serverTimestamp(),
  }, { merge: true });

  await setDoc(doc(db, "users", teacherUid), {
    email: "teacher@demo.test",
    role: "teacher",
    displayName: "Profesor Demo",
    createdAt: serverTimestamp(),
    lastSeen: serverTimestamp(),
  }, { merge: true });

  // ====== 2) Problems ======
  await setDoc(doc(db, "problems", "p1"), {
    title: "Multiplicación",
    statement: "¿Cuánto es 3 × 4?",
    options: ["7", "9", "10", "12"],
    correctIndex: 3,
    ownerUid: teacherUid,
    createdAt: serverTimestamp(),
  });

  await setDoc(doc(db, "problems", "p2"), {
    title: "Suma",
    statement: "¿Cuánto es 5 + 6?",
    options: ["9", "10", "11", "12"],
    correctIndex: 2,
    ownerUid: teacherUid,
    createdAt: serverTimestamp(),
  });

  // ====== 3) Assignment (cumple tu query de MyAssignments.vue) ======
  await setDoc(doc(db, "assignments", "a1"), {
    title: "Quiz 1",
    classId: "c1",
    ownerUid: teacherUid,
    published: true,                    // <- tu query lo usa
    assigneeUids: [studentUid],         // <- tu query lo usa
    startsAt: serverTimestamp(),        // <- tu query lo ordena
    endsAt: serverTimestamp(),
    problemIds: ["p1", "p2"],
    createdAt: serverTimestamp(),
  });

  console.log("✅ Seed listo: users (student/teacher), problems p1/p2 y assignment a1");
  console.log(`   Student UID: ${studentUid}`);
  console.log(`   Teacher UID: ${teacherUid}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
