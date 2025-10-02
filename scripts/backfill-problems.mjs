// scripts/backfill-problems.mjs
import { initializeApp, applicationDefault, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

// === CONFIG ===
// Opción A (emulador):
//   set FIRESTORE_EMULATOR_HOST=localhost:8080 (Windows CMD)
//   $env:FIRESTORE_EMULATOR_HOST="localhost:8080" (PowerShell)
// Opción B (PROD con service account):
//   set GOOGLE_APPLICATION_CREDENTIALS=C:\ruta\service-account.json

// Inicializa credencial (usa service account si está definida)
const app = process.env.GOOGLE_APPLICATION_CREDENTIALS
  ? initializeApp() // usa la credencial del env
  : initializeApp({ credential: applicationDefault() });

const db = getFirestore();

const DRY_RUN = process.env.DRY_RUN === "true"; // no escribe, solo reporta

function needsFix(p) {
  const upd = {};
  if (!Array.isArray(p.tags)) upd.tags = [];
  if (!["easy", "medium", "hard"].includes(p.difficulty)) upd.difficulty = "medium";
  if (!Number.isFinite(p.version)) upd.version = 1;
  if (!["public", "private", "archived"].includes(p.visibility)) upd.visibility = "public";
  return upd;
}

async function run() {
  const snap = await db.collection("problems").get();
  let toUpdate = 0;
  for (const doc of snap.docs) {
    const p = doc.data();
    const upd = needsFix(p);
    if (Object.keys(upd).length) {
      toUpdate++;
      console.log(`Actualizar: ${doc.id} ->`, upd);
      if (!DRY_RUN) {
        await doc.ref.update({ ...upd, updatedAt: FieldValue.serverTimestamp() });
      }
    }
  }
  console.log(`Listo. Documentos por actualizar: ${toUpdate} (DRY_RUN=${DRY_RUN})`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
