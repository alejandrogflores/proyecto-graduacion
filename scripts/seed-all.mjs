// scripts/seed-all.mjs
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8085";
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:9099";
const PROJECT_ID = "proyecto-de-graduacion-f1265";

initializeApp({ projectId: PROJECT_ID });
const db = getFirestore();
const auth = getAuth();
const serverTS = FieldValue.serverTimestamp;

async function ensureUser(email, password, role, displayName) {
  let u;
  try { u = await auth.getUserByEmail(email); }
  catch { u = await auth.createUser({ email, password, displayName }); }
  await db.collection("users").doc(u.uid).set({
    uid: u.uid, email, displayName, role,
    createdAt: serverTS(), lastSeen: serverTS(),
  }, { merge: true });
  return u.uid;
}

async function putDoc(col, id, data) {
  await db.collection(col).doc(id).set(data, { merge: true });
}

function mc({ title, statement, options, correctIndex }) {
  return { type: "multiple-choice", title, statement, options, correctIndex };
}

async function seed() {
  console.log("🌱  Seed iniciado…");

  // === Users (1 teacher + 3 students, todos con 123456) ===
  const teacherUid  = await ensureUser("teacher@demo.test",  "123456", "teacher", "Profesor Demo");
  const student1Uid = await ensureUser("student1@demo.test", "123456", "student", "Alumno Demo 1");
  const student2Uid = await ensureUser("student2@demo.test", "123456", "student", "Alumno Demo 2");
  const student3Uid = await ensureUser("student3@demo.test", "123456", "student", "Alumno Demo 3");
  console.log("👩‍🏫  Users listos:", { teacherUid, student1Uid, student2Uid, student3Uid });

  // === Tags ===
  const tags = [
    { slug: "aritmetica", name: "Aritmética" },
    { slug: "algebra", name: "Álgebra" },
    { slug: "geometria", name: "Geometría" },
    { slug: "fracciones", name: "Fracciones" },
    { slug: "porcentajes", name: "Porcentajes" },
    { slug: "razonamiento", name: "Razonamiento" },
  ];
  await Promise.all(tags.map((t) => putDoc("tags", t.slug, t)));
  console.log("🏷️  Tags listos");

  // === Problems (15) ===
  const baseProblem = {
    ownerUid: teacherUid,
    visibility: "public",
    difficulty: "medium",
    version: 1,
    createdAt: serverTS(),
    updatedAt: serverTS(),
    tags: ["aritmetica"],
  };
  const problems = [
    ["p1",  { ...baseProblem, ...mc({ title: "Suma básica", statement: "¿Cuánto es 2 + 4 + 4?", options: ["7","8","9","10"], correctIndex: 1 }), difficulty: "easy", visibility: "public" }],
    ["p2",  { ...baseProblem, ...mc({ title: "Suma de dos dígitos", statement: "¿Cuánto es 36 + 45?", options: ["71","80","81","82"], correctIndex: 2 }), difficulty: "easy", visibility: "private" }],
    ["p3",  { ...baseProblem, ...mc({ title: "Resta con llevadas", statement: "¿Cuánto es 503 − 278?", options: ["215","225","235","245"], correctIndex: 1 }) }],
    ["p4",  { ...baseProblem, ...mc({ title: "Multiplicación", statement: "¿Cuánto es 12 × 8?", options: ["88","90","94","96"], correctIndex: 3 }), difficulty: "easy" }],
    ["p5",  { ...baseProblem, ...mc({ title: "División exacta", statement: "¿Cuánto es 144 ÷ 12?", options: ["10","11","12","13"], correctIndex: 2 }), difficulty: "easy" }],
    ["p6",  { ...baseProblem, ...mc({ title: "Fracción equivalente", statement: "¿Cuál es equivalente a 3/4?", options: ["6/8","9/16","12/15","15/24"], correctIndex: 0 }), tags: ["fracciones"] }],
    ["p7",  { ...baseProblem, ...mc({ title: "Comparación de fracciones", statement: "¿Cuál es mayor?", options: ["2/5","3/8","1/3","5/12"], correctIndex: 0 }), tags: ["fracciones","razonamiento"] }],
    ["p8",  { ...baseProblem, ...mc({ title: "Porcentajes", statement: "El 25% de 360 es…", options: ["70","80","85","90"], correctIndex: 3 }), tags: ["porcentajes"] }],
    ["p9",  { ...baseProblem, ...mc({ title: "Descuento", statement: "Un cuaderno cuesta $200 y tiene 15% de descuento. ¿Precio final?", options: ["$160","$170","$180","$190"], correctIndex: 1 }), tags: ["porcentajes","razonamiento"] }],
    ["p10", { ...baseProblem, ...mc({ title: "Ecuación lineal", statement: "Resuelve: 3x + 5 = 20", options: ["4","5","6","7"], correctIndex: 1 }), tags: ["algebra"], difficulty: "medium" }],
    ["p11", { ...baseProblem, ...mc({ title: "Sistema 2×2", statement: "x + y = 10 y x − y = 4. ¿x?", options: ["7","6","8","5"], correctIndex: 0 }), tags: ["algebra","razonamiento"], difficulty: "hard", visibility: "private" }],
    ["p12", { ...baseProblem, ...mc({ title: "Área del rectángulo", statement: "Base 12 cm y altura 7 cm. ¿Área?", options: ["72 cm²","78 cm²","84 cm²","90 cm²"], correctIndex: 2 }), tags: ["geometria"], difficulty: "easy" }],
    ["p13", { ...baseProblem, ...mc({ title: "Teorema de Pitágoras", statement: "Triángulo rectángulo con catetos 5 y 12. ¿Hipotenusa?", options: ["12","13","14","15"], correctIndex: 1 }), tags: ["geometria","razonamiento"] }],
    ["p14", { ...baseProblem, ...mc({ title: "Promedio", statement: "Las notas son 6, 7, 8 y 9. ¿Promedio?", options: ["7.25","7.5","7.75","8"], correctIndex: 1 }), tags: ["aritmetica","razonamiento"], visibility: "public" }],
    ["p15", { ...baseProblem, ...mc({ title: "Regla de tres", statement: "Si 4 cuadernos cuestan $120, ¿cuánto costarán 7 cuadernos?", options: ["$180","$195","$200","$210"], correctIndex: 3 }), tags: ["razonamiento","porcentajes"], visibility: "public" }],
  ];
  await Promise.all(problems.map(([id, data]) => putDoc("problems", id, data)));
  console.log("🧩  Problems listos (15)");

  // === Clase c6A con los 3 alumnos ===
  const allStudents = [student1Uid, student2Uid, student3Uid];
  await putDoc("classes", "c6A", {
    title: "6° A",
    ownerUid: teacherUid,
    rosterUids: allStudents,
    studentUids: allStudents,
    createdAt: serverTS(),
  });
  console.log("🏫  Clase c6A lista");

  // === Assignments: publicado + borrador ===
  await putDoc("assignments", "a_pub", {
    title: "pruebita1publicada",
    ownerUid: teacherUid,
    classId: "c6A",
    problemIds: ["p1"],
    assigneeUids: allStudents,
    isPublished: true,
    publishedAt: serverTS(),
    timeLimitSec: 300,
    createdAt: serverTS(),
    updatedAt: serverTS(),
  });

  await putDoc("assignments", "a_draft", {
    title: "pruebita2Nopublicada",
    ownerUid: teacherUid,
    classId: "c6A",
    problemIds: ["p2"],
    assigneeUids: [],
    isPublished: false,
    createdAt: serverTS(),
    updatedAt: serverTS(),
  });
  console.log("📝  Assignments listos (publicado + borrador)");

  // === Attempt de ejemplo (student1) ===
  await putDoc("attempts", "t_example", {
    assignmentId: "a_pub",
    studentUid: student1Uid,
    answers: [{ problemId: "p1", selectedIndex: 1, correct: true }],
    startedAt: serverTS(),
    finishedAt: serverTS(),
    status: "finished",
    correctCount: 1,
    total: 1,
    score: 100,
  });

  console.log("✅  Attempt de ejemplo listo");
  console.log("🎉  Seed finalizado.");
}

seed().catch((e) => { console.error(e); process.exit(1); });

