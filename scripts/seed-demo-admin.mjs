// scripts/seed-demo-admin.mjs
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

initializeApp({ projectId: "proyecto-de-graduacion-f1265" });
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });
const auth = getAuth();

const DEMO_PASS = "Alumno#2025";
const DEMO_TEACHER_PASS = "Teacher#2025";

async function ensureUser(email, password, displayName, role) {
  try {
    const u = await auth.getUserByEmail(email);
    await auth.updateUser(u.uid, { password, displayName });
    await auth.setCustomUserClaims(u.uid, { role });
    await db.doc(`users/${u.uid}`).set({ uid: u.uid, email, displayName, role, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return u.uid;
  } catch (e) {
    if (e?.code === "auth/user-not-found") {
      const u = await auth.createUser({ email, password, displayName });
      await auth.setCustomUserClaims(u.uid, { role });
      await db.doc(`users/${u.uid}`).set({ uid: u.uid, email, displayName, role, createdAt: FieldValue.serverTimestamp() }, { merge: true });
      return u.uid;
    }
    throw e;
  }
}

async function main(){
  const studentUid = await ensureUser("student@demo.test", DEMO_PASS, "Alumno Demo", "student");
  const teacherUid = await ensureUser("teacher@demo.test", DEMO_TEACHER_PASS, "Profesor Demo", "teacher");

  await db.doc("problems/p1").set({
    title: "Multiplicación",
    statement: "¿Cuánto es 3 × 4?",
    options: ["7","9","10","12"],
    correctIndex: 3,
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
    problemIds: ["p1"],
    createdAt: FieldValue.serverTimestamp(),
  });

  console.log("✅ Seed demo OK");
  console.log("Student:", "student@demo.test", DEMO_PASS);
  console.log("Teacher:", "teacher@demo.test", DEMO_TEACHER_PASS);
}

main().catch(e=>{ console.error(e); process.exit(1); });
