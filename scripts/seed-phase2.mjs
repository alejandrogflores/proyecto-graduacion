// scripts/seed-phase2.mjs
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import crypto from "node:crypto";

// Config: usa el emulador si estás con FIRESTORE_EMULATOR_HOST
const projectId =
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GCLOUD_PROJECT ||
  "proyecto-de-graduacion-f1265";

initializeApp({ projectId });
const db = getFirestore();

// Helpers
const now = FieldValue.serverTimestamp();
const slug = (s) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

async function pickProblemIds(limit = 2) {
  const snap = await db.collection("problems").limit(limit).get();
  if (snap.empty) {
    console.warn("[seed] No hay problems. Crea al menos 1 en el emulador antes de semillar.");
    return [];
  }
  return snap.docs.map((d) => d.id);
}

async function upsert(docRef, data) {
  await docRef.set(data, { merge: true });
}

async function run() {
  // ====== TAGS catálogo ======
  const tags = [
    { name: "Álgebra", slug: "algebra", description: "Ecuaciones, expresiones y polinomios." },
    { name: "Porcentajes", slug: "porcentajes", description: "Aumentos, descuentos, proporciones." },
    { name: "Razonamiento", slug: "razonamiento", description: "Lógico y numérico." },
  ];
  for (const t of tags) await upsert(db.doc(`tags/${t.slug}`), t);

  // ====== CLASE ======
  const teacherUid = "teacher_demo_uid"; // usa cualquier string (emulador)
  const studentUids = ["student_a_uid", "student_b_uid"]; // idem
  const classId = "demo-math-101";
  await upsert(db.doc(`classes/${classId}`), {
    name: "Matemática 101",
    code: "MATH101", // código para unirse
    ownerUid: teacherUid,
    students: studentUids,
    createdAt: now,
  });

  // ====== ASSIGNMENT ======
  const problemIds = await pickProblemIds(2); // toma 2 problems existentes
  const assignmentId = "assign-algebra-1";
  await upsert(db.doc(`assignments/${assignmentId}`), {
    classId,
    problemIds,
    dueAt: now, // pon una fecha real si quieres
    createdBy: teacherUid,
    status: "published",
    createdAt: now,
  });

  // ====== SUBMISSIONS ======
  // Creamos 1 submission por alumno para el primer problem (si existe)
  if (problemIds.length > 0) {
    const problemId = problemIds[0];

    const subs = [
      {
        id: `sub-${studentUids[0]}-${problemId}`,
        assignmentId,
        problemId,
        studentUid: studentUids[0],
        answer: 0,  // ej: índice de respuesta
        correct: true,
        score: 1,
        submittedAt: now,
        classId,
        assignmentStatus: "published",
      },
      {
        id: `sub-${studentUids[1]}-${problemId}`,
        assignmentId,
        problemId,
        studentUid: studentUids[1],
        answer: 1,
        correct: false,
        score: 0,
        submittedAt: now,
        classId,
        assignmentStatus: "published",
      },
    ];
    for (const s of subs) await upsert(db.doc(`submissions/${s.id}`), s);
  }

  // ====== ATTEMPTS (para que Reports vea datos) ======
const attemptsCol = db.collection("attempts");

// Por cada submission de ejemplo, creamos un attempt equivalente
for (const s of subs) {
  const attId = `att-${s.studentUid}-${s.problemId}`;
  await attemptsCol.doc(attId).set({
    assignmentId: s.assignmentId,
    problemId: s.problemId,
    studentUid: s.studentUid,
    classId,                 // 👈 importante si tu Reports filtra por clase
    startedAt: now,
    finishedAt: now,
    createdAt: now,
    score: s.score,
    maxScore: 1
  }, { merge: true });
}

  // ====== ACHIEVEMENTS ======
  const achs = [
    { name: "Primer Intento", criteria: "attempts >= 1", icon: "🏁", createdAt: now },
    { name: "Diez Correctas", criteria: "correct >= 10", icon: "🔟", createdAt: now },
  ];
  for (const a of achs) await db.collection("achievements").add(a);

  console.log("[seed] Listo. Revisa en Emulator UI:");
  console.log(" - classes/demo-math-101");
  console.log(" - assignments/assign-algebra-1");
  console.log(" - submissions/*");
  console.log(" - tags/* (algebra, porcentajes, razonamiento)");
  console.log(" - achievements/*");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
