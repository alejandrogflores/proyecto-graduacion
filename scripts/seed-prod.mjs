// scripts/seed-prod.mjs
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

initializeApp({ credential: applicationDefault() });
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });
const auth = getAuth();

async function upsert(col, id, data) {
  const ref = db.collection(col).doc(id);
  await ref.set({ ...data, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return ref.id;
}

async function ensureUser(email, password, displayName, claims = {}) {
  let uid;
  try {
    uid = (await auth.getUserByEmail(email)).uid;
    await auth.updateUser(uid, { password, displayName });
  } catch (e) {
    if (e?.code === "auth/user-not-found") {
      uid = (await auth.createUser({ email, password, displayName, emailVerified: true })).uid;
    } else {
      throw e;
    }
  }
  const current = (await auth.getUser(uid)).customClaims || {};
  const next = { ...current, ...claims };
  if (JSON.stringify(current) !== JSON.stringify(next)) {
    await auth.setCustomUserClaims(uid, next);
  }
  await upsert("users", uid, { uid, email, displayName, role: claims.role || "user", createdAt: FieldValue.serverTimestamp() });
  return uid;
}

async function run(){
  console.log("== Seed producción ==");
  const adminEmail = "admin@eduapp.local";
  const adminPass = "Cambiar.123";
  const adminName = "Admin EduApp";
  const adminUid = await ensureUser(adminEmail, adminPass, adminName, { role: "admin" });

  await upsert("classes", "9no-1", {
    name: "9no Grado - Sección 1",
    ownerUid: adminUid,
    createdAt: FieldValue.serverTimestamp()
  });

  await upsert("problems", "demo-mc-001", {
    title: "¿Cuál es la raíz cuadrada de 169?",
    statement: "Selecciona la opción correcta.",
    type: "multiple_choice",
    options: ["11","12","13","14"],
    correctIndex: 2,
    tags: ["aritmética","raíces"],
    createdBy: adminUid,
    ownerUid: adminUid,
    visibility: "public",
    createdAt: FieldValue.serverTimestamp(),
  });

  console.log("Seed completo ✅");
  console.log("Admin:", adminEmail, adminPass);
}

run().catch(e=>{ console.error(e); process.exit(1); });
