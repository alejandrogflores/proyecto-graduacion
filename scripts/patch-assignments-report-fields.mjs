// Node 18+ | firebase-admin 11+
// Duplica campos para compatibilidad con widgets /reports.
// Actualiza assignments del teacher entre 1–17 oct 2025.

import { initializeApp, applicationDefault, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import fs from "node:fs";

const TEACHER_UID = "7v0dr75TqdMrz2BqdeGz2ruUMbB2";

initializeApp(
  process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? { credential: cert(JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"))) }
    : { credential: applicationDefault() }
);
const db = getFirestore();

const from = Timestamp.fromDate(new Date(2025, 9, 1, 0, 0, 0));   // 2025-10-01
const to   = Timestamp.fromDate(new Date(2025, 9, 17, 23, 59, 59)); // 2025-10-17

(async () => {
  let q = db.collection("assignments")
    .where("ownerUid", "==", TEACHER_UID)
    .where("createdAt", ">=", from)
    .where("createdAt", "<=", to);

  const snap = await q.get();
  console.log("Assignments a parchar:", snap.size);

  let batch = db.batch(), ops = 0;
  for (const d of snap.docs) {
    const a = d.data();
    const createdAt   = a.createdAt ?? Timestamp.now();
    const publishedAt = a.publishedAt ?? createdAt;

    batch.update(d.ref, {
      // duplicados por compatibilidad:
      createdOn: createdAt,
      publishedOn: publishedAt,
      // campos que algunos dashboards usan:
      updatedAt: publishedAt,
      published: true,
    });
    ops++;
    if (ops % 400 === 0) { await batch.commit(); batch = db.batch(); }
  }
  if (ops % 400 !== 0) await batch.commit();
  console.log("Listo.");
})();

