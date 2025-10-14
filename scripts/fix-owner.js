// scripts/fix-owner.js (usa node y el Admin SDK apuntando al emulador)
import admin from "firebase-admin";

process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8085";

admin.initializeApp({ projectId: "proyecto-de-graduacion-f1265" });
const db = admin.firestore();

const teacherEmail = "teacher@demo.test"; // ajusta si hace falta

const auth = admin.auth();

const user = await auth.getUserByEmail(teacherEmail);
const teacherUid = user.uid;

const qs = await db.collection("assignments").get();

const batch = db.batch();
let n = 0;
qs.forEach(doc => {
  const d = doc.data();
  if (!("ownerUid" in d) || !d.ownerUid) {
    batch.update(doc.ref, { ownerUid: teacherUid });
    n++;
  }
});

if (n) await batch.commit();
console.log(`Actualizados ${n} assignments sin ownerUid`);
process.exit(0);
