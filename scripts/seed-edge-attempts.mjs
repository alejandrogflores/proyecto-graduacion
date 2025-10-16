// @ts-check
// scripts/seed-edge-attempts.mjs
// Crea 2 escenarios: (A) asignación sin intentos, (B) asignación con intento "in-progress"

import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

initializeApp({ projectId: "proyecto-de-graduacion-f1265" });

const db = getFirestore();
const auth = getAuth();

/**
 * Crear o devolver un usuario del emulador Auth.
 * @param {string} email
 * @param {string} password
 * @param {string} displayName
 * @returns {Promise<string>} uid
 */
async function ensureUser(email, password, displayName) {
  try {
    const u = await auth.getUserByEmail(email);
    return u.uid;
  } catch (/** @type {any} */ e) {
    if (e?.code === "auth/user-not-found") {
      const u = await auth.createUser({ email, password, displayName });
      return u.uid;
    }
    throw e;
  }
}

/**
 * Crea un documento si no existe. Si id es null, crea uno nuevo.
 * @param {string} col
 * @param {string|null} id
 * @param {any} data
 * @returns {Promise<string>} id creado/existente
 */
async function ensureDoc(col, id, data) {
  const ref = id ? db.collection(col).doc(id) : db.collection(col).doc();
  if (id) {
    const snap = await ref.get();
    if (!snap.exists) await ref.set(data);
  } else {
    await ref.set(data);
  }
  return ref.id;
}

/** @returns {Promise<string>} problemId */
async function ensureProblem() {
  const q = await db.collection("problems").limit(1).get();
  if (!q.empty) return q.docs[0].id;
  // Crea un problema mínimo si no existe ninguno
  return await ensureDoc("problems", null, {
    title: "Problema demo (MC)",
    statement: "¿2 + 2 = ?",
    options: ["3", "4", "5", "6"],
    correctIndex: 1,
    createdAt: Date.now(),
    visibility: "public",
    type: "multiple-choice",
  });
}

/**
 * @param {string} ownerUid
 * @returns {Promise<string>} classId
 */
async function ensureClass(ownerUid) {
  return await ensureDoc("classes", null, {
    name: "Clase Demo 1",
    ownerUid,
    createdAt: Date.now(),
  });
}

/**
 * @typedef {Object} AssignmentInput
 * @property {string} title
 * @property {string} ownerUid
 * @property {string} classId
 * @property {string[]=} problemIds
 * @property {number=} publishedAt
 */

/**
 * @param {AssignmentInput} input
 * @returns {Promise<string>} assignmentId
 */
async function createAssignment({ title, ownerUid, classId, problemIds = [], publishedAt = Date.now() }) {
  const id = await ensureDoc("assignments", null, {
    title,
    ownerUid,
    classId,
    problemIds,
    publishedAt,
    createdAt: Date.now(),
  });
  return id;
}

/**
 * @typedef {Object} AttemptInput
 * @property {string} assignmentId
 * @property {string} problemId
 * @property {string} uid
 * @property {"in-progress"|"completed"=} status
 * @property {number|null=} score
 * @property {number=} startedAt
 * @property {number|null=} finishedAt
 */

/**
 * @param {AttemptInput} input
 * @returns {Promise<string>} attemptId
 */
async function makeAttempt({ assignmentId, problemId, uid, status = "in-progress", score = null, startedAt = Date.now(), finishedAt = null }) {
  const id = await ensureDoc("attempts", null, {
    assignmentId,
    problemId,
    uid,
    status,
    score,
    startedAt,
    finishedAt,
  });
  return id;
}

/**
 * @param {string} email
 * @returns {string}
 */
function displayNameFromEmail(email) {
  return email.split("@")[0].replace(/\W+/g, " ").trim() || "User";
}

async function main() {
  const PASSWORD = "demo1234";

  // === Teacher ===
  const teacherEmail = "teacher@demo.test";
  const teacherUid = await ensureUser(teacherEmail, PASSWORD, "Teacher Demo");

  // === Students ===
  const studentEmails = [
    "student@demo.test",
    "student1@demo.test",
    "student2@demo.test",
    "student3@demo.test",
  ];

  /** @type {{[email: string]: string}} */
  const studentUids = {};

  for (const email of studentEmails) {
    const uid = await ensureUser(email, PASSWORD, displayNameFromEmail(email));
    studentUids[email] = uid;
  }

  // === /users (roles) para que pasen las rules ===
  await ensureDoc("users", teacherUid, {
    role: "teacher",
    email: teacherEmail,
    createdAt: Date.now(),
  });

  for (const email of studentEmails) {
    await ensureDoc("users", studentUids[email], {
      role: "student",
      email,
      createdAt: Date.now(),
    });
  }

  // === Datos base ===
  const problemId = await ensureProblem();
  const classId = await ensureClass(teacherUid);

  // === Caso A: Asignación SIN intentos ===
  const aId = await createAssignment({
    title: "Edge A - Sin intentos",
    ownerUid: teacherUid,
    classId,
    problemIds: [problemId], // puede ser []
  });

  // === Caso B: Asignación con intento "in-progress" para student@demo.test ===
  const bId = await createAssignment({
    title: "Edge B - Intento parcial",
    ownerUid: teacherUid,
    classId,
    problemIds: [problemId],
  });

  const attemptId = await makeAttempt({
    assignmentId: bId,
    problemId,
    uid: studentUids["student@demo.test"],
    status: "in-progress",
    score: null,
  });

  console.log("Seed listo ✅", {
    aId,
    bId,
    attemptId,
    teacherUid,
    students: studentUids,
    classId,
    problemId,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

