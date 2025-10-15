// scripts/seed-demo.mjs
import admin from "firebase-admin";

// Con emuladores NO uses credenciales; basta el projectId.
// Los emuladores se detectan vía variables de entorno.
admin.initializeApp({ projectId: "proyecto-de-graduacion-f1265" });

const auth = admin.auth();
const db = admin.firestore();

async function ensureUser(email, displayName, role) {
  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch {
    user = await auth.createUser({ email, password: "demo1234", displayName });
  }
  await db.doc(`users/${user.uid}`).set({ role, email, displayName }, { merge: true });
  return user.uid;
}

async function main() {
  // Usuarios base
  const teacherUid = await ensureUser("teacher@demo.test", "Demo Teacher", "teacher");
  const s1 = await ensureUser("student1@demo.test", "Student One", "student");
  const s2 = await ensureUser("student2@demo.test", "Student Two", "student");

  // Clase
  await db.doc("classes/c6A").set({
    title: "6° A",
    ownerUid: teacherUid,
    studentUids: [s1, s2],
  }, { merge: true });

  // Problemas
  await db.doc("problems/p1").set({
    title: "Suma simple",
    statement: "¿Cuánto es 2 + 3?",
    options: ["4","5","6","7"],
    correctIndex: 1,
    ownerUid: teacherUid,
  }, { merge: true });

  await db.doc("problems/p2").set({
    title: "Descuento",
    statement: "Un artículo cuesta $100 y tiene 10% de descuento. ¿Cuánto pagas?",
    options: ["$90","$95","$100","$110"],
    correctIndex: 0,
    ownerUid: teacherUid,
  }, { merge: true });

  console.log("✅ Seed listo: users, classes, problems");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
