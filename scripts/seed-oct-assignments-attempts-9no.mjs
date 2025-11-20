// scripts/seed-oct-assignments-attempts-9no.mjs
// Node 18+ | firebase-admin 11+
// DRY-RUN por defecto. Usa --apply para escribir.
// Puedes cambiar el año con --year 2025 (default 2025).

import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import fs from "node:fs";

/* =======================
   CONFIG EMBEBIDA
======================= */

// Teacher (de tu imagen)
const TEACHER = {
  email: "david.us@ccb.edu.gt",
  uid:   "7v0dr75TqdMrz2BqdeGz2ruUMbB2",
};

// Clases + alumnos (email/uid)
const CLASSES = [
  {
    classId: "9no-1",
    students: [
      { email: "josue.sican18@ccb.edu.gt",        uid: "7xXSIVFSbWVSahPoW9mPTPY1mw83" },
      { email: "leslie.pereira17@ccb.edu.gt",     uid: "YJsUll4Ha0d82IL7on8kGI9VP3h2" },
      { email: "paula.paniagua16@ccb.edu.gt",     uid: "ad6f8TjiWLOPgsfpBKPOslaceiv2" },
      { email: "jennifer.pacheco15@ccb.edu.gt",   uid: "Nka0DI0AbIcvqtSz641W9wIAu423" },
      { email: "carlos.oliveros14@ccb.edu.gt",    uid: "xQRzZynTMNdOPtA2aZkk0LaGvcl1" },
      { email: "allison.morales13@ccb.edu.gt",    uid: "Vun1o4bQQihbyX0Q3O1YtXCNL083" },
      { email: "mariana.mendez12@ccb.edu.gt",     uid: "aXuyKdmRgmSjjWEk9lrZojC9rlT2" },
      { email: "valentina.marroquin11@ccb.edu.gt",uid: "sfVFvBkaP9UU3o6t6WWWUokfYnu1" },
      { email: "margarita.lopez10@ccb.edu.gt",    uid: "gybgwE7fyXRmseVl6kMJ3Am6j533" },
      { email: "otto.hernandez08@ccb.edu.gt",     uid: "L7pFW7oQAdN68rnXWglZNfXQ0Rp1" },
      { email: "andrea.guerra07@ccb.edu.gt",      uid: "xeFmzwJ2GMN4F8UFQqev51vlJop1" },
      { email: "juan.gonzalez06@ccb.edu.gt",      uid: "5qhBJRKvASMST1RW8add3iep35o2" },
      { email: "manuel.giron05@ccb.edu.gt",       uid: "WCm8vv38PnSzwfOHbD0QnGHhaLc2" },
      { email: "alberto.escobar04@ccb.edu.gt",    uid: "v2mehFtxKJM5QQWIeoeBEI9NMVi2" },
      { email: "david.diaz03@ccb.edu.gt",         uid: "ahWnP7ZQOPUjaqXVCbgFXKzSRn43" },
      { email: "ricardo.blanco02@ccb.edu.gt",     uid: "oWOS6YZ5LKZUJKsqfOE4sIExanD3" },
      { email: "jose.andrino01@ccb.edu.gt",       uid: "MczccENZQtcnT9qbt6n274QbXtG2" },
      { email: "elwin.hernandez09@ccb.edu.gt",    uid: "gqKVeAFVHTPKY42GrVIiR6mPl0e2" },
    ],
  },
  {
    classId: "9no-2",
    students: [
      { email: "emily.villalta18@ccb.edu.gt",     uid: "Z3KGrAVYazfcUfIjDqrVPkGe2563" },
      { email: "andre.stratton17@ccb.edu.gt",     uid: "vgfqdKCK5MOEUOTGwFx3JtWePtG2" },
      { email: "fernanda.reyes16@ccb.edu.gt",     uid: "LExiSX9BxNhxfPas5hclUG2OWWl2" },
      { email: "rodrigo.parada15@ccb.edu.gt",     uid: "IERTAFv5aqPEhwptxiGaN6YjdTc2" },
      { email: "jose.oviedo14@ccb.edu.gt",        uid: "UGpMmogrfJUYN95plCgXrElWvGk1" },
      { email: "pedro.ortiz13@ccb.edu.gt",        uid: "XtvGBfclVcgosvB8lr2POtuUgYm1" },
      { email: "luis.moreira12@ccb.edu.gt",       uid: "cEELML0eHkcd4iU2kwEu1eYjGcT2" },
      { email: "maite.monroy11@ccb.edu.gt",       uid: "DPC5y21poxX6XLr9w9RDbWJeUVu2" },
      { email: "jose.king10@ccb.edu.gt",          uid: "j6YPCTVUD8XFyMn6V7yemVYZfdW2" },
      { email: "ana.hernandez09@ccb.edu.gt",      uid: "Ggaevq9DytOtFuuNWyxSe6S5j2r2" },
      { email: "nicola.harris08@ccb.edu.gt",      uid: "M8mC9bAuOycXu3XUD1QHD7uiSSH2" },
      { email: "sophie.gonzalez07@ccb.edu.gt",    uid: "bH2Us5lyApVV0thNtN53ilnUnRj1" },
      { email: "adriana.gonzalez06@ccb.edu.gt",   uid: "f5j1MyS0algu5L8NBBghBQkZeCG3" },
      { email: "corina.espino05@ccb.edu.gt",      uid: "MNMTMfW7ZbO6Rdn8ymiN7xNTDCS2" },
      { email: "sofia.escobar04@ccb.edu.gt",      uid: "7CT6EyoZr3ZamKO7OOiqPjzHZdk2" },
      { email: "naomi.cachupe03@ccb.edu.gt",      uid: "nUMJsbdviPMnHEkVl01AqegryRs1" },
      { email: "angel.bolanos02@ccb.edu.gt",      uid: "GmV87FLT2NP9QR3BPWjntMFbxWK2" },
      { email: "marcello.alvarez01@ccb.edu.gt",   uid: "dYWelIhxMoeMLLSmUXIfkPwWds83" },
    ],
  },
];

/* =======================
   PARÁMETROS
======================= */

const args = process.argv.slice(2);
const DRY_RUN = !args.includes("--apply");
const YEAR = (() => {
  const i = args.indexOf("--year");
  if (i !== -1 && args[i + 1]) return Number(args[i + 1]);
  return 2025; // octubre 2025 por defecto
})();
const MONTH = 10;      // octubre
const DAY_FROM = 1;
const DAY_TO   = 17;

const BASE_HOUR = 10;      // hora base de createdAt/publishedAt
const TIME_LIMIT_SEC = 1800;
const MIN_Q = 6;
const MAX_Q = 12;
const ATTEMPTS_PER_STUDENT = 1;

/* =======================
   UTILS
======================= */

function isWeekday(date){ const d=date.getDay(); return d>=1 && d<=5; }
function* iterateDates(y, m1to12, dFrom, dTo){ const m=m1to12-1; for(let d=dFrom; d<=dTo; d++){ const dt=new Date(y,m,d); if(isWeekday(dt)) yield dt; } }
function atLocalTime(date, hour){
  const d = new Date(date);
  d.setHours(hour, Math.floor(Math.random()*50), Math.floor(Math.random()*50), 0);
  return d;
}
function randInt(a,b){ return a + Math.floor(Math.random()*(b-a+1)); }
function pickQuestionStats(){
  const total = randInt(MIN_Q, MAX_Q);
  const correct = randInt(0, total);
  const accuracy = Math.round((correct/total)*100);
  return { total, correct, accuracy };
}
function randomTimeWithinDay(date){
  const d = new Date(date);
  const h = randInt(8, 18), m = randInt(0,59), s = randInt(0,59);
  d.setHours(h,m,s,0);
  return d;
}

/* =======================
   FIREBASE
======================= */

initializeApp(
  process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? { credential: cert(JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"))) }
    : { credential: applicationDefault() }
);
const db = getFirestore();

/* =======================
   MAIN
======================= */

(async ()=>{
  console.log(`\n🌱 Seed Oct 1–17 (L–V) • ${DRY_RUN ? "DRY-RUN" : "APPLY"} • Año=${YEAR}`);
  console.log(`Teacher: ${TEACHER.email} (${TEACHER.uid})`);
  console.log(`Clases: ${CLASSES.map(c=>c.classId).join(", ")}\n`);

  let totalAssignments=0, totalAttempts=0, ops=0;
  let batch = db.batch();

  for (const cls of CLASSES) {
    const classId = cls.classId;
    const students = cls.students;
    console.log(`→ Clase ${classId}: ${students.length} alumnos`);

    for (const date of iterateDates(YEAR, MONTH, DAY_FROM, DAY_TO)) {
      // Assignment
      const createdAt = Timestamp.fromDate(atLocalTime(date, BASE_HOUR));
      const publishedAt = createdAt;
      const title = `Práctica ${classId} ${date.toISOString().slice(0,10)}`;

      const assignmentRef = db.collection("assignments").doc();
      const assignmentDoc = {
        title,
        classId,
        ownerUid: TEACHER.uid,
        isPublished: true,
        createdAt,
        publishedAt,
        timeLimitSec: TIME_LIMIT_SEC,
        // opcional: dueAt al mismo día 23:59
        // dueAt: Timestamp.fromDate(new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 0, 0)),
      };

      if (DRY_RUN) {
        console.log(`  (dry) assignment ${assignmentRef.id} | ${title}`);
      } else {
        batch.set(assignmentRef, assignmentDoc); ops++;
      }
      totalAssignments++;

      // Attempts
      for (const s of students) {
        for (let k=0;k<ATTEMPTS_PER_STUDENT;k++){
          const { total, correct, accuracy } = pickQuestionStats();
          const startedAt  = Timestamp.fromDate(randomTimeWithinDay(date));
          const answeredAt = Timestamp.fromDate(randomTimeWithinDay(date));
          const finishedAt = Timestamp.fromDate(randomTimeWithinDay(date));

          const attemptRef = db.collection("attempts").doc();
          const attemptDoc = {
            assignmentId: assignmentRef.id,
            assignmentTitle: title,
            ownerUid: TEACHER.uid,
            classId,
            studentUid: s.uid,
            studentEmail: s.email,
            status: "finished",
            total, correct,
            accuracy,            // %
            score: accuracy,     // si tu UI usa 'score'
            startedAt, answeredAt, finishedAt,
          };

          if (DRY_RUN) {
            console.log(`    (dry) attempt ${attemptRef.id} | ${s.email} | ${accuracy}%`);
          } else {
            batch.set(attemptRef, attemptDoc); ops++;
          }
          totalAttempts++;

          if (!DRY_RUN && ops>=400){ await batch.commit(); batch=db.batch(); ops=0; }
        }
      }
    }
  }

  if (!DRY_RUN && ops>0) await batch.commit();
  console.log(`\n✅ Listo. ${DRY_RUN ? "(simulado) " : ""}Assignments: ${totalAssignments} • Attempts: ${totalAttempts}\n`);
})().catch(e=>{ console.error("✖ Error:", e); process.exit(1); });
