<!-- src/views/Dashboard.vue -->
<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { getAuth } from "firebase/auth";
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  limit,
  getCountFromServer,
  getDocs,
  Timestamp,
  type QueryConstraint,
} from "firebase/firestore";

import { colProblems } from "@/services/firebase";
import { useProfileStore } from "@/stores/profile";
import { storeToRefs } from "pinia";

type Role = "teacher" | "student" | "admin" | "unknown";

type AssignmentRow = {
  id: string;
  title: string;
  publishedAt?: any | null;
  dueAt?: any | null;
  timeLimitSec?: number | null;
};

type AttemptRow = {
  id: string;
  userEmail?: string;
  assignmentId?: string | null;
  assignmentTitle?: string | null;
  score?: number | null;     // 0..100 (si es intento por-asignación)
  answeredAt?: any | null;   // fallback por-pregunta
  finishedAt?: any | null;   // por-asignación
};

// -------------------- Perfil / permisos --------------------
const profile = useProfileStore();
const { ready, role, uid } = storeToRefs(profile);
const canManage = computed(() => role.value === "teacher" || role.value === "admin");

// -------------------- Estado --------------------
const loading = ref(true);
const counts = ref({
  problems: 0,
  classes: 0,
  assignments: 0,     // publicadas del teacher
  attemptsToday: 0,
});

const activeAssignments = ref<AssignmentRow[]>([]);
const recentAttempts    = ref<AttemptRow[]>([]);

// -------------------- Utils --------------------
function startOfToday(): Date { const d=new Date(); d.setHours(0,0,0,0); return d; }
function toDate(v:any): Date { return v?.toDate?.() ?? (typeof v==="number" ? new Date(v) : new Date(v)); }
function fmtDateShort(ts:any|undefined|null): string {
  if(!ts) return "—";
  const d = toDate(ts);
  return d.toLocaleDateString();
}
function fmtTimeLimit(sec?: number|null): string {
  if(!sec && sec!==0) return "—";
  const m = Math.round((sec||0)/60);
  if(m < 60) return `${m}m`;
  const h = Math.floor(m/60); const mm = m%60;
  return `${h}h ${mm}m`;
}
function fmtScore(s?: number|null): string {
  if(typeof s !== "number") return "—";
  return `${Math.round(s)}%`;
}

// ===================================================
//                   TEACHER WIDGETS
// ===================================================
async function loadTeacherWidgets() {
  if (!canManage.value) return;
  try {
    const db = getFirestore();
    const meUid = uid.value || getAuth().currentUser?.uid || "";

    // ---- PROBLEMS ----
    const qPublic = query(colProblems, where("visibility", "==", "public"));
    const qMineOwner   = meUid ? query(colProblems, where("ownerUid", "==", meUid))   : null;
    const qMineCreated = meUid ? query(colProblems, where("createdBy", "==", meUid)) : null;

    const [cPub, cOwner, cCreated] = await Promise.all([
      getCountFromServer(qPublic),
      qMineOwner   ? getCountFromServer(qMineOwner)   : Promise.resolve({ data: () => ({ count: 0 }) } as any),
      qMineCreated ? getCountFromServer(qMineCreated) : Promise.resolve({ data: () => ({ count: 0 }) } as any),
    ]);

    const totalProblems =
      cPub.data().count +
      (cOwner as any).data().count +
      (cCreated as any).data().count;

    // ---- CLASSES (ownerUid == me) ----
    const cClasses = await (async () => {
      const colClasses = collection(db, "classes");
      const qClasses = meUid ? query(colClasses, where("ownerUid", "==", meUid)) : null;
      return qClasses ? (await getCountFromServer(qClasses)).data().count : 0;
    })();

    // ---- ASSIGNMENTS publicadas del teacher ----
    const colAssignments = collection(db, "assignments");
    const qAssignmentsCount = query(
      colAssignments,
      where("ownerUid", "==", meUid),
      where("isPublished", "==", true)
    );
    const cAssignments = (await getCountFromServer(qAssignmentsCount)).data().count;

    // ---- ATTEMPTS hoy (acepta por-pregunta y por-asignación) ----
    const colAttempts = collection(db, "attempts");
    const todayTs = Timestamp.fromDate(startOfToday());
    // usamos answeredAt (por-pregunta) como base
    const cAttemptsToday = (await getCountFromServer(query(colAttempts, where("answeredAt", ">=", todayTs)))).data().count;

    counts.value = {
      problems: totalProblems,
      classes: cClasses,
      assignments: cAssignments,
      attemptsToday: cAttemptsToday,
    };

    // ---- Lista “Asignaciones activas” (recientes) ----
    const qActive = query(
      colAssignments,
      where("ownerUid","==",meUid),
      where("isPublished","==",true),
      orderBy("publishedAt","desc"),
      limit(5)
    );
    const actSnap = await getDocs(qActive);
    activeAssignments.value = actSnap.docs.map(d => {
      const x = d.data() as any;
      return {
        id: d.id,
        title: x.title ?? "(sin título)",
        publishedAt: x.publishedAt ?? null,
        dueAt: x.dueAt ?? null,
        timeLimitSec: typeof x.timeLimitSec==="number" ? x.timeLimitSec : null,
      };
    });

    // ---- “Últimos intentos” (filtrados a mis assignments) ----
    // 1) Traigo últimos (50) por finishedAt (por-asignación) y también por answeredAt (fallback)
    const qAttFin = query(collection(db,"attempts"), orderBy("finishedAt","desc"), limit(80));
    const qAttAns = query(collection(db,"attempts"), orderBy("answeredAt","desc"), limit(80));
    const [sFin, sAns] = await Promise.all([getDocs(qAttFin).catch(()=>null), getDocs(qAttAns).catch(()=>null)]);

    const mineAssignIds = new Set(activeAssignments.value.map(a=>a.id));
    // También incluyamos otras asignaciones del teacher (no solo top5) para filtrar:
    // hacemos un fetch ligero de IDs (sin límite estricto para no romper UI)
    const qAssignIds = query(
      colAssignments,
      where("ownerUid","==",meUid),
      where("isPublished","==",true)
    );
    const idsSnap = await getDocs(qAssignIds);
    idsSnap.forEach(d => mineAssignIds.add(d.id));

    const pool: AttemptRow[] = [];

    if (sFin && !sFin.empty) {
      sFin.forEach(doc => {
        const a = doc.data() as any;
        if (a.assignmentId && mineAssignIds.has(a.assignmentId)) {
          pool.push({
            id: doc.id,
            userEmail: a.studentEmail ?? a.userEmail ?? "",
            assignmentId: a.assignmentId,
            assignmentTitle: a.assignmentTitle ?? "(sin título)",
            score: typeof a.score === "number" ? a.score : null,
            finishedAt: a.finishedAt ?? null,
          });
        }
      });
    }

    if (pool.length < 10 && sAns && !sAns.empty) {
      sAns.forEach(doc => {
        const a = doc.data() as any;
        // solo si trae assignmentId (para poder filtrar por teacher)
        if (a.assignmentId && mineAssignIds.has(a.assignmentId)) {
          pool.push({
            id: doc.id,
            userEmail: a.userEmail ?? "",
            assignmentId: a.assignmentId,
            assignmentTitle: a.assignmentTitle ?? "(sin título)",
            score: a.isCorrect === true ? 100 : (a.isCorrect === false ? 0 : null),
            answeredAt: a.answeredAt ?? null,
          });
        }
      });
    }

    // ordenar por fecha (finishedAt o answeredAt) desc y limitar a 8
    pool.sort((a,b) => {
      const ta = (a.finishedAt ?? a.answeredAt)?.seconds ?? 0;
      const tb = (b.finishedAt ?? b.answeredAt)?.seconds ?? 0;
      return tb - ta;
    });

    recentAttempts.value = pool.slice(0, 8);

  } catch (e) {
    console.warn("[Dashboard] teacher widgets error:", e);
    counts.value = { problems: 0, classes: 0, assignments: 0, attemptsToday: 0 };
    activeAssignments.value = [];
    recentAttempts.value = [];
  } finally {
    loading.value = false;
  }
}

// ===================================================
//                   STUDENT WIDGETS
// ===================================================
async function loadStudentWidgets() {
  // (Puedes ampliar esta sección si quieres un dashboard específico para alumno)
  loading.value = false;
}

// -------------------- Lifecycle --------------------
onMounted(async () => {
  if (!ready.value) await profile.init();
  if (canManage.value) await loadTeacherWidgets();
  else await loadStudentWidgets();
});

watch(ready, async (ok) => {
  if (!ok) return;
  if (canManage.value) await loadTeacherWidgets();
});
</script>

<template>
  <section class="mx-auto max-w-6xl px-4 py-6 space-y-6">
    <!-- HERO -->
    <div class="rounded-2xl border bg-gradient-to-r from-indigo-100 via-indigo-50 to-white p-6 sm:p-8">
      <div class="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p class="text-sm text-gray-600 mb-1">¡Hola!</p>
          <h1 class="text-2xl sm:text-3xl font-semibold">
            Bienvenido a <span class="text-indigo-600">EduApp</span>
          </h1>
          <p class="mt-2 text-gray-600">
            Desde aquí puedes gestionar tus asignaciones y ver actividad reciente de tus alumnos.
          </p>
          <p class="text-xs text-gray-500 mt-2">
            Sesión: {{ profile.email || "…" }}
          </p>
        </div>

        <!-- Botón solo visible a teacher/admin -->
        <RouterLink
          v-if="canManage"
          :to="{ name: 'classes' }"
          class="rounded-xl px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 transition"
        >
          Nueva asignación
        </RouterLink>
      </div>
    </div>

    <!-- Tarjetas -->
    <section v-if="canManage" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <!-- Problemas -->
      <RouterLink :to="{ name: 'ProblemsList' }" class="rounded-xl border bg-white p-4 hover:shadow transition">
        <p class="text-sm text-gray-600">Problemas</p>
        <p class="text-2xl font-semibold">{{ loading ? "—" : counts.problems }}</p>
        <p class="text-xs text-blue-600 mt-1">Abrir problemas</p>
      </RouterLink>

      <!-- Clases -->
      <RouterLink :to="{ name: 'classes' }" class="rounded-xl border bg-white p-4 hover:shadow transition">
        <p class="text-sm text-gray-600">Clases</p>
        <p class="text-2xl font-semibold">{{ loading ? "—" : counts.classes }}</p>
      </RouterLink>

      <!-- Asignaciones activas -->
      <RouterLink :to="{ name: 'MyAssignments' }" class="rounded-xl border bg-white p-4 hover:shadow transition">
        <p class="text-sm text-gray-600">Asignaciones activas</p>
        <p class="text-2xl font-semibold">{{ loading ? "—" : counts.assignments }}</p>
      </RouterLink>

      <!-- Intentos hoy -->
      <RouterLink :to="{ name: 'Reports' }" class="rounded-xl border bg-white p-4 hover:shadow transition">
        <p class="text-sm text-gray-600">Intentos hoy</p>
        <p class="text-2xl font-semibold">{{ loading ? "—" : counts.attemptsToday }}</p>
        <p class="text-xs text-blue-600 mt-1">Ver reportes</p>
      </RouterLink>
    </section>

    <!-- Para estudiantes -->
    <section v-else class="mt-4">
      <div class="rounded-xl border bg-white p-6">
        <h3 class="font-medium mb-2">Tus asignaciones</h3>
        <p class="text-sm text-gray-600 mb-3">Revisa y resuelve tus asignaciones pendientes.</p>
        <RouterLink
          :to="{ name: 'MyAssignments' }"
          class="inline-block rounded-lg px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 transition"
        >
          Ir a mis asignaciones
        </RouterLink>
      </div>
    </section>

    <!-- Listas (teacher/admin) -->
    <div v-if="canManage" class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <!-- Asignaciones activas -->
      <div class="rounded-xl border bg-white p-4">
        <div class="flex items-center justify-between mb-2">
          <h3 class="font-medium">Asignaciones activas</h3>
          <span class="text-xs text-gray-500">Publicadas recientemente…</span>
        </div>

        <ul v-if="activeAssignments.length" class="divide-y">
          <li v-for="a in activeAssignments" :key="a.id" class="py-2 flex items-center justify-between gap-3">
            <div>
              <div class="font-medium">{{ a.title }}</div>
              <div class="text-xs text-gray-500">
                Publicada: {{ fmtDateShort(a.publishedAt) }}
                <span v-if="a.dueAt"> · Límite: {{ fmtDateShort(a.dueAt) }}</span>
                <span v-if="a.timeLimitSec"> · Tiempo: {{ fmtTimeLimit(a.timeLimitSec) }}</span>
              </div>
            </div>
            <RouterLink :to="{ name:'Reports' }" class="text-sm text-blue-600 hover:underline">Ver reporte</RouterLink>
          </li>
        </ul>
        <p v-else class="text-sm text-gray-500">Sin asignaciones publicadas.</p>
      </div>

      <!-- Últimos intentos -->
      <div class="rounded-xl border bg-white p-4">
        <div class="flex items-center justify-between mb-2">
          <h3 class="font-medium">Últimos intentos</h3>
          <RouterLink :to="{ name:'Reports' }" class="text-sm text-blue-600 hover:underline">Ir a reportes</RouterLink>
        </div>

        <table v-if="recentAttempts.length" class="w-full text-sm">
          <thead class="text-gray-500">
            <tr>
              <th class="text-left py-1">Alumno</th>
              <th class="text-left py-1">Asignación</th>
              <th class="text-right py-1">% Score</th>
              <th class="text-right py-1">Fecha</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in recentAttempts" :key="r.id" class="border-t">
              <td class="py-2">{{ r.userEmail || "—" }}</td>
              <td class="py-2">{{ r.assignmentTitle || "—" }}</td>
              <td class="py-2 text-right">{{ fmtScore(r.score) }}</td>
              <td class="py-2 text-right">
                {{ fmtDateShort(r.finishedAt || r.answeredAt) }}
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="text-sm text-gray-500">Aún no hay intentos recientes.</p>
      </div>
    </div>
  </section>
</template>

