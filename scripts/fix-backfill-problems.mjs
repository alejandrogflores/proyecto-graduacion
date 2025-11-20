// scripts/fix-backfill-problems.mjs
import admin from "firebase-admin";

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  throw new Error("Falta GOOGLE_APPLICATION_CREDENTIALS");
}
if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();

async function run() {
  const snap = await db.collection("problems").get();
  let updates = 0;

  const batchSize = 400;
  let batch = db.batch();
  let count = 0;

  for (const doc of snap.docs) {
    const d = doc.data();

    const update = {};
    // 1) Arregla el dueño para que pase el filtro de la UI
    if (!d.ownerUid && d.createdBy) update.ownerUid = d.createdBy;

    // 2) Defaults “inofensivos” para que la tarjeta renderice bien
    if (!d.visibility) update.visibility = "public";
    if (!d.difficulty) update.difficulty = "medium";
    if (!d.version) update.version = 1;
    if (!d.createdAt) update.createdAt = admin.firestore.FieldValue.serverTimestamp();
    if (!d.updatedAt) update.updatedAt = admin.firestore.FieldValue.serverTimestamp();

    if (Object.keys(update).length) {
      batch.update(doc.ref, update);
      updates++;
      count++;
      if (count === batchSize) {
        await batch.commit();
        batch = db.batch();
        count = 0;
      }
    }
  }
  if (count) await batch.commit();

  console.log(`✅ Backfill listo. Documentos actualizados: ${updates}`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
