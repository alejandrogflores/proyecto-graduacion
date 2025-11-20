// scripts/seed-ccb.mjs
// Seed de producción / emulador para CCB (modificado para pruebas con contraseñas conocidas)

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

const PROJECT_ID =
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GCLOUD_PROJECT ||
  "proyecto-de-graduacion-f1265";

const USE_EMULATOR =
  !!process.env.FIRESTORE_EMULATOR_HOST || !!process.env.FIREBASE_AUTH_EMULATOR_HOST;

console.log(USE_EMULATOR ? "🌱 Seed en EMULADOR…" : "🌱 Seed en PRODUCCIÓN…");
console.log("🔧 PROJECT_ID:", PROJECT_ID);

if (USE_EMULATOR) {
  initializeApp({ projectId: PROJECT_ID });
} else {
  initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
}

const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });
const auth = getAuth();

// ----- Contraseñas de prueba / QA -----
const DEFAULT_STUDENT_PASS = "Alumno#2025";
const DEFAULT_TEACHER_PASS = "Teacher#2025";

const QA_TEACHER = { email: "qa.teacher@ccb.edu.gt", password: "QATeacher.2025", displayName: "QA Teacher" };
const QA_STUDENT = { email: "qa.student@ccb.edu.gt", password: "QAStudent.2025", displayName: "QA Student" };

// ----- Helpers -----
function stripUndefined(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}
const rmAccents = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const slug = (s) =>
  rmAccents(s).toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "");

// crea o actualiza usuario y fuerza la contraseña para pruebas
async function ensureUser({ email, password, displayName, role }) {
  let u;
  try {
    u = await auth.getUserByEmail(email);
    // Si ya existe, actualizamos la contraseña y displayName (útil para pruebas)
    await auth.updateUser(u.uid, { password, displayName });
  } catch (e) {
    if (e?.code === "auth/user-not-found") {
      u = await auth.createUser({
        email,
        password,
        displayName,
        emailVerified: !USE_EMULATOR,
      });
    } else {
      throw e;
    }
  }
  // custom claims
  await auth.setCustomUserClaims(u.uid, { role });

  // /users doc (incluye uid para consistencia)
  await db.collection("users").doc(u.uid).set(
    {
      uid: u.uid,
      email,
      displayName,
      role,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return u.uid;
}

// ----- Datos base -----
const DOMAIN = "ccb.edu.gt";
const teacher = { first: "David", last: "Us", email: `david.us@${DOMAIN}`, role: "teacher" };

const grado9no1 = [
  ["ANDRINO LÓPEZ","JOSÉ MANUEL DE JESÚS"],
  ["BLANCO CASTELLANOS","RICARDO"],
  ["DÍAZ CASTAÑEDA","DAVID ALEJANDRO"],
  ["ESCOBAR CHOUR","ALBERTO SEBASTIAN"],
  ["GIRÓN SANDOVAL","MANUEL ANDRES"],
  ["GONZALEZ RUIZ","JUAN PABLO"],
  ["GUERRA HERRERA","ANDREA FABIOLA"],
  ["HERNÁNDEZ ANDRÉS","OTTO EDUARDO"],
  ["HERNÁNDEZ TRIQUEZ","ELWIN JUAN ALBERTO"],
  ["LÓPEZ PELAEZ","MARGARITA VALENTINA"],
  ["MARROQUÍN CASTILLO","VALENTINA"],
  ["MÉNDEZ GARCÍA","MARIANA"],
  ["MORALES SEQUEC","ALLISON JIMENA"],
  ["OLIVEROS LÓPEZ","CARLOS SEBASTIAN"],
  ["PACHECO HERNÁNDEZ","JENNIFER PAOLA"],
  ["PANIAGUA PALENCIA","PAULA JIMENA"],
  ["PEREIRA VICENTE","LESLIE FERNANDA"],
  ["SICAN MENDEZ","JOSUE DANIEL"],
];
const grado9no2 = [
  ["ALVAREZ HURTARTE","MARCELLO"],
  ["BOLAÑOS MEJICANOS","ANGEL EMILIANO"],
  ["CACHUPE VEGA","NAOMI SARAI"],
  ["ESCOBAR CHOUR","SOFIA VALENTINA"],
  ["ESPINO ALVARADO","CORINA ISABEL"],
  ["GONZALEZ MONTALVAN","ADRIANA"],
  ["GONZALEZ RAMÍREZ","SOPHIE XIMENA"],
  ["HARRIS ARAGÓN","NICOLA BIJOU"],
  ["HERNÁNDEZ MANSILLA","ANA ISABELLA"],
  ["KING BURBANO","JOSÉ MIGUEL"],
  ["MONROY SILVA","MAITE RENATA"],
  ["MOREIRA SOTO","LUIS DIEGO"],
  ["ORTIZ QUIÑONEZ","PEDRO ELISEO"],
  ["OVIEDO ISCAMEY","JOSÉ ANGEL"],
  ["PARADA ORDOÑEZ","RODRIGO ISAAC"],
  ["REYES HERNÁNDEZ","FERNANDA ELIZABETH"],
  ["STRATTON POSADAS","ANDRÉ SEBASTIÁN"],
  ["VILLALTA VASQUEZ","EMILY GABRIELA"],
];

function emailFrom(firsts, lasts, idx, domain = DOMAIN) {
  const firstName = slug(firsts.split(" ")[0]);
  const firstLast = slug(lasts.split(" ")[0]);
  const suffix = String(idx).padStart(2, "0");
  return `${firstName}.${firstLast}${suffix}@${domain}`;
}

function dateUTC(y,m,d,h=8,min=0){ return new Date(Date.UTC(y,m-1,d,h,min,0)); }

async function ensureClass({ id, name, section, ownerUid }) {
  await db.collection("classes").doc(id).set({
    name, section, ownerUid,
    visibility: "published",
    updatedAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp()
  }, { merge: true });
}

async function main() {
  // teacher real con password conocida
  const teacherUid = await ensureUser({
    email: teacher.email,
    password: DEFAULT_TEACHER_PASS,
    displayName: `${teacher.first} ${teacher.last}`,
    role: "teacher",
  });
  console.log("👨‍🏫 Teacher asegurado:", teacher.email);

  // cuentas QA
  const qaTeacherUid = await ensureUser({
    email: QA_TEACHER.email,
    password: QA_TEACHER.password,
    displayName: QA_TEACHER.displayName,
    role: "teacher"
  });
  const qaStudentUid = await ensureUser({
    email: QA_STUDENT.email,
    password: QA_STUDENT.password,
    displayName: QA_STUDENT.displayName,
    role: "student"
  });
  console.log("🔬 QA accounts creadas:", QA_TEACHER.email, QA_STUDENT.email);

  // clases
  await ensureClass({ id: "9no-1", name: "9no-1", section: "A", ownerUid: teacherUid });
  await ensureClass({ id: "9no-2", name: "9no-2", section: "B", ownerUid: teacherUid });
  console.log("🏫 Clases creadas/aseguradas: 9no-1, 9no-2");

  // estudiantes
  const classMap = { "9no-1": grado9no1, "9no-2": grado9no2 };
  for (const [classId, lista] of Object.entries(classMap)) {
    const studentUids = [];
    for (let i=0;i<lista.length;i++){
      const [apellidos, nombres] = lista[i];
      const cleanAp = rmAccents(apellidos).trim();
      const cleanNo = rmAccents(nombres).trim();
      const displayName = `${cleanNo} ${cleanAp}`;
      const email = emailFrom(cleanNo, cleanAp, i+1);
      const uid = await ensureUser({
        email,
        password: DEFAULT_STUDENT_PASS,
        displayName,
        role: "student"
      });
      await db.collection("users").doc(uid).set({ classId }, { merge: true });
      studentUids.push(uid);
      console.log(`👤 ${displayName} → ${email} → ${classId}`);
    }
    await db.collection("classes").doc(classId).set({ studentUids }, { merge: true });
    console.log(`✅ Clase ${classId}: ${studentUids.length} estudiantes asignados`);
  }

  // Problems mínimos
  const colProblems = db.collection("problems");
  const probs = [
    { title: "Raíz cuadrada de 169", statement: "¿Cuál es la raíz cuadrada de 169?", options: ["11","12","13","14"], correctIndex:2, tags:["radicación","aritmética"], difficulty:"easy", visibility:"published", createdBy: teacherUid },
    { title: "Porcentaje de descuento", statement: "Camisa Q200 con 15% descuento. ¿Precio final?", options:["Q170","Q180","Q185","Q190"], correctIndex:1, tags:["porcentajes"], difficulty:"medium", visibility:"published", createdBy: teacherUid },
    { title: "Jerarquía de operaciones", statement: "Evalúa: 6 + 2 × 3", options:["24","12","18","15"], correctIndex:1, tags:["operaciones"], difficulty:"easy", visibility:"published", createdBy: teacherUid },
  ];
  const problemIds = [];
  for(const p of probs){
    const ref = colProblems.doc();
    await ref.set(stripUndefined({...p, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), version:1}), { merge: true });
    problemIds.push(ref.id);
  }
  console.log("🧩 Problemas cargados:", problemIds.length);

  // Assignments 13-17 oct 2025
  const colAssignments = db.collection("assignments");
  const ASSIGNMENT_DATES = [{y:2025,m:10,d:13},{y:2025,m:10,d:14},{y:2025,m:10,d:15},{y:2025,m:10,d:16},{y:2025,m:10,d:17}];
  const classIds = ["9no-1","9no-2"];
  const assignmentIds = [];
  for(const {y,m,d} of ASSIGNMENT_DATES){
    for(const classId of classIds){
      const id = `${classId}-${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
      await colAssignments.doc(id).set(stripUndefined({
        title:`Asignación ${classId} ${y}-${m}-${d}`,
        classId, ownerUid: teacherUid, isPublished: true,
        problems: problemIds.map((pid,i)=>({ problemId: pid, order: i+1})),
        startsAt: dateUTC(y,m,d,8,0), dueAt: dateUTC(y,m,d,23,59),
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
      }), { merge: true });
      assignmentIds.push(id);
    }
  }
  console.log("🗓️ Asignaciones publicadas:", assignmentIds.length);

  // Attempts de ejemplo (usa doc.id como uid)
  const colAttempts = db.collection("attempts");
  const usersSnap = await db.collection("users").where("role","==","student").limit(6).get();
  const sampleStudents = usersSnap.docs.map(d=>d.id);
  for(const asgId of assignmentIds.slice(0,4)){
    for(const uid of sampleStudents){
      await colAttempts.doc().set(stripUndefined({
        assignmentId: asgId,
        userId: uid,
        status: "completed",
        startedAt: FieldValue.serverTimestamp(),
        submittedAt: FieldValue.serverTimestamp(),
        score: Math.floor(Math.random() * 4) + 7,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      }));
    }
  }
  console.log("📊 Intentos de ejemplo creados:", sampleStudents.length * 4);

  console.log("✅ Seed COMPLETO.");
}

main().catch(e=>{ console.error("❌ Error en seed:", e); process.exit(1); });

