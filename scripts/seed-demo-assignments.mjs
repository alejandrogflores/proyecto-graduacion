// scripts/seed-demo-assignments.mjs
import { initializeApp } from "firebase/app";
import {
  getFirestore, connectFirestoreEmulator,
  doc, setDoc, serverTimestamp
} from "firebase/firestore";

const app = initializeApp({ projectId: "demo" });
const db = getFirestore(app);
connectFirestoreEmulator(db, "127.0.0.1", 8085);

// ⚠️ pon aquí el UID reales:
const TEACHER_UID = "u_teacher_demo";
const STUDENT_UID = "u_student_demo";

async function main() {
  // problems
  await setDoc(doc(db, "problems", "p1"), {
    title: "Multiplicación",
    statement: "¿Cuánto es 3 × 4?",
    options: ["7","9","10","12"],
    correctIndex: 3,
    ownerUid: TEACHER_UID,
    createdAt: serverTimestamp(),
  });

  await setDoc(doc(db, "problems", "p2"), {
    title: "Suma",
    statement: "¿Cuánto es 5 + 6?",
    options: ["9","10","11","12"],
    correctIndex: 2,
    ownerUid: TEACHER_UID,
    createdAt: serverTimestamp(),
  });

  // assignment
  await setDoc(doc(db, "assignments", "a1"), {
    title: "Quiz 1",
    ownerUid: TEACHER_UID,
    problemIds: ["p1", "p2"],
    assignees: [STUDENT_UID],
    status: "published",
    openAt: serverTimestamp(),
    dueAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  });

  console.log("✅ Seed listo: problems p1/p2 y assignment a1");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

