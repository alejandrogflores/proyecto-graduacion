import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import fs from "node:fs";

initializeApp({ credential: applicationDefault() });
const auth = getAuth();
const db = getFirestore();

// Ajusta este array o lee de CSV
// Formato: { email, password, displayName }
const students = JSON.parse(fs.readFileSync("scripts/students.json","utf8"));
// Ejemplo de students.json:
// [
//   {"email":"alumno1@colegio.edu","password":"Cambiar.123","displayName":"Alumno Uno"},
//   {"email":"alumno2@colegio.edu","password":"Cambiar.123","displayName":"Alumno Dos"}
// ]

async function upsertUser(uid, data) {
  await db.collection("users").doc(uid).set(
    { ...data, role: "student", updatedAt: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
}

async function ensureStudent({ email, password, displayName }) {
  try {
    const { uid } = await auth.getUserByEmail(email);
    await auth.setCustomUserClaims(uid, { role: "student" });
    await upsertUser(uid, { email, displayName });
    return { email, uid, created: false };
  } catch (e) {
    if (e?.code === "auth/user-not-found") {
      const u = await auth.createUser({ email, password, displayName, emailVerified: true });
      await auth.setCustomUserClaims(u.uid, { role: "student" });
      await upsertUser(u.uid, { email, displayName });
      return { email, uid: u.uid, created: true };
    }
    throw e;
  }
}

async function run() {
  const results = [];
  for (const s of students) {
    try {
      results.push(await ensureStudent(s));
    } catch (e) {
      results.push({ email: s.email, error: e.message || String(e) });
    }
  }
  console.table(results);
  console.log("Bulk students completo ✅");
}
run().catch(e => { console.error(e); process.exit(1); });
