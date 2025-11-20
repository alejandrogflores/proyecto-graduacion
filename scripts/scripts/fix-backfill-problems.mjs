// node scripts/fix-backfill-problems.mjs
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

(async () => {
  const snap = await db.collection("problems").get();
  let updates = 0;

  for (const d of snap.docs) {
    const data = d.data();

    // Normaliza visibilidad y fecha
    const patch = {};
    if (!data.visibility) patch.visibility = "public";
    if (!data.createdAt)  patch.createdAt  = FieldValue.serverTimestamp();

    // (Opcional) migra opciones si solo existe options_strings
    if (!Array.isArray(data.options) && Array.isArray(data.options_strings)) {
      patch.options = data.options_strings.map((t) => ({ text: t }));
    }

    if (Object.keys(patch).length) {
      await d.ref.update(patch);
      updates++;
    }
  }
  console.log(`✅ Backfill listo. Documentos actualizados: ${updates}`);
})();
