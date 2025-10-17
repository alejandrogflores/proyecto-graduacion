<!-- src/views/Dashboard.vue -->
<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { useRouter } from "vue-router";
import { useProfileStore } from "@/stores/profile";
import { storeToRefs } from "pinia";
import { signOut } from "firebase/auth";
import { auth } from "@/services/firebase";

import {
  getDocs, query, where, orderBy, limit as qlimit, collection,
} from "firebase/firestore";
import {
  db,
  colAssignments,
  colAttempts,
  colProblems,   // si no existe en tu services/firebase, elimínalo o comenta el uso de métricas
  colClasses,    // idem
} from "@/services/firebase";

/* ───────────────── state / stores ───────────────── */
const router   = useRouter();
const profile  = useProfileStore();
if (!profile.ready) profile.init?.();

const { ready, role, email, uid } = storeToRefs(profile);
const isTeacher = computed(() => role.value === "teacher" || role.value === "admin");
const isStudent = computed(() => role.value === "student");

/* ───────────────── navegación / sesión ───────────────── */
function goProblems()      { router.push({ name: "ProblemsList" }); }
function goNewAssignment() { router.push({ name: "AssignmentNew" }); }
function goReports()       { router.push({ name: "Reports" }); }
function goMyAssignments() { router.push({ name: "MyAssignments" }); }

const loggingOut = ref(false);
async function logout() {
  try {
    loggingOut.value = true;
    await signOut(auth);
    router.replace("/");
  } finally {
    loggingOut.value = false;
  }
}

/* ───────────────── helpers ───────────────── */
const greeting = computed(() => {
  const h = new Date().getHours();
  if (h < 12) return "¡Buenos días!";
  if (h < 19) return "¡Buenas tardes!";
  return "¡Buenas noches!";
});
function fmtTs(ts: any): string {
  try {
    if (!ts) return "—";
    if (typeof ts.toDate === "function") return ts.toDate().toLocaleString();
    if (typeof ts.seconds === "number") return new Date(ts.seconds * 1000).toLocaleString();
    return new Date(ts).toLocaleString();
  } catch { return "—"; }
}

/* ───────────────── datos para TEACHER ───────────────── */
const loadingTeacher = ref(false);

// métricas
const metrics = ref({
  problems: 0,
  classes: 0,
  activeAssignments: 0,
  attemptsToday: 0,
});

// listados
type ActiveAssg = { id: string; title: string; publishedAt?: any; timeLimitSec?: number | null; };
const activeAssignments = ref<ActiveAssg[]>([]);
type RecentAttempt = { id: string; studentEmail?: string|null; assignmentTitle?: string; score?: number; finishedAt?: any; startedAt?: any; };
const recentAttempts = ref<RecentAttempt[]>([]);

// carga teacher
async function loadTeacherData() {
  if (!uid.value) return;
  loadingTeacher.value = true;
  try {
    // 1) Asignaciones activas del owner
    const qAssg = query(
      colAssignments,
      where("ownerUid", "==", uid.value),
      where("isPublished", "==", true),
      orderBy("publishedAt", "desc"),
      qlimit(5)
    );
    const assgSnap = await getDocs(qAssg);
    activeAssignments.value = assgSnap.docs.map(d => {
      const data = d.data() as any;
      return { id: d.id, title: data.title ?? d.id, publishedAt: data.publishedAt, timeLimitSec: data.timeLimitSec ?? null };
    });
    // contador activo (todas)
    metrics.value.activeAssignments = assgSnap.size;

    // 2) Últimos intentos de mis asignaciones
    const qAtt = query(
      colAttempts,
      where("ownerUid", "==", uid.value),
      orderBy("startedAt", "desc"),
      qlimit(5)
    );
    const attSnap = await getDocs(qAtt);
    recentAttempts.value = attSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

    // 3) Métricas extra (opcionales: comenta si no tienes estas col*)
    // problemas del owner
    try {
      const qPro = query(colProblems, where("ownerUid", "==", uid.value));
      const proSnap = await getDocs(qPro);
      metrics.value.problems = proSnap.size;
    } catch { /* si no tienes ownerUid en problemas, ignora */ }

    // clases del owner
    try {
      const qCls = query(colClasses, where("ownerUid", "==", uid.value));
      const clsSnap = await getDocs(qCls);
      metrics.value.classes = clsSnap.size;
    } catch { /* ignora si no aplica */ }

    // intentos "de hoy"
    try {
      // sin índices por rango, aproximamos contando los 5 recientes si startedAt es de hoy
      const today = new Date(); today.setHours(0,0,0,0);
      metrics.value.attemptsToday = recentAttempts.value
        .filter(a => {
          const dt = (a.startedAt?.toDate?.() ?? (a.startedAt?.seconds ? new Date(a.startedAt.seconds*1000) : null)) as Date|null;
          return dt ? dt >= today : false;
        }).length;
    } catch { /* noop */ }

  } finally {
    loadingTeacher.value = false;
  }
}

/* ───────────────── datos para STUDENT (ligero) ───────────────── */
const loadingStudent = ref(false);
type NextAssg = { id: string; title: string; publishedAt?: any; timeLimitSec?: number|null; };
const nextAssignments = ref<NextAssg[]>([]);

async function loadStudentData() {
  if (!uid.value) return;
  loadingStudent.value = true;
  try {
    const qy = query(
      colAssignments,
      where("isPublished", "==", true),
      where("assigneeUids", "array-contains", uid.value),
      orderBy("publishedAt", "desc"),
      qlimit(5)
    );
    const qs = await getDocs(qy);
    nextAssignments.value = qs.docs.map(d => {
      const data = d.data() as any;
      return { id: d.id, title: data.title ?? d.id, publishedAt: data.publishedAt, timeLimitSec: data.timeLimitSec ?? null };
    });
  } finally {
    loadingStudent.value = false;
  }
}

/* ───────────────── lifecycle ───────────────── */
onMounted(() => {
  if (ready.value) {
    if (isTeacher.value) loadTeacherData();
    if (isStudent.value) loadStudentData();
  }
});
watch(ready, (r) => {
  if (!r) return;
  if (isTeacher.value) loadTeacherData();
  if (isStudent.value) loadStudentData();
});
</script>

<template>
  <section class="mx-auto max-w-7xl px-4 py-6">
    <!-- ===== HERO minimizado: sin acciones duplicadas ===== -->
    <div class="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 p-[1px] shadow-lg">
      <div class="rounded-2xl bg-white/90 dark:bg-white/95 p-6 md:p-8 backdrop-blur">
        <div class="flex items-start justify-between gap-4">
          <div class="max-w-2xl">
            <p class="text-sm text-gray-600">{{ greeting }}</p>
            <h1 class="mt-1 text-2xl font-bold tracking-tight text-gray-900 md:text-3xl">
              Bienvenido a <span class="text-indigo-600">EduApp</span>
            </h1>
            <p class="mt-2 text-gray-600">
              <template v-if="isTeacher">
                Desde aquí puedes gestionar tus asignaciones y ver actividad reciente de tus alumnos.
              </template>
              <template v-else>
                Desde aquí puedes practicar con problemas y ver tus tareas publicadas.
              </template>
            </p>
            <p class="mt-1 text-xs text-gray-500" v-if="ready && email">Sesión: {{ email }}</p>
          </div>

          <!-- CTA único por rol -->
          <div class="flex items-center gap-2">
            <button
              v-if="isTeacher"
              class="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-white shadow hover:bg-indigo-700 transition"
              @click="goNewAssignment"
            >
              🧩 Nueva asignación
            </button>

            <button
              class="rounded-xl border px-4 py-2 hover:bg-gray-50 transition"
              :disabled="loggingOut"
              @click="logout"
            >
              {{ loggingOut ? "Cerrando…" : "Cerrar sesión" }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== CONTENIDO para TEACHER ===== -->
    <template v-if="isTeacher">
      <!-- Métricas -->
      <div class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div class="rounded-xl border p-4">
          <p class="text-sm text-gray-500">Problemas</p>
          <p class="mt-1 text-2xl font-semibold">{{ metrics.problems }}</p>
          <button class="mt-2 text-sm text-indigo-600 hover:underline" @click="goProblems">Abrir problemas</button>
        </div>
        <div class="rounded-xl border p-4">
          <p class="text-sm text-gray-500">Clases</p>
          <p class="mt-1 text-2xl font-semibold">{{ metrics.classes }}</p>
        </div>
        <div class="rounded-xl border p-4">
          <p class="text-sm text-gray-500">Asignaciones activas</p>
          <p class="mt-1 text-2xl font-semibold">{{ metrics.activeAssignments }}</p>
        </div>
        <div class="rounded-xl border p-4">
          <p class="text-sm text-gray-500">Intentos hoy</p>
          <p class="mt-1 text-2xl font-semibold">{{ metrics.attemptsToday }}</p>
          <button class="mt-2 text-sm text-indigo-600 hover:underline" @click="goReports">Ver reportes</button>
        </div>
      </div>

      <!-- Listas -->
      <div class="mt-8 grid gap-6 lg:grid-cols-2">
        <!-- Asignaciones activas -->
        <div class="rounded-2xl border p-6 shadow-sm">
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold">Asignaciones activas</h3>
            <button class="text-sm text-gray-600 hover:underline" @click="goNewAssignment">Nueva</button>
          </div>
          <p class="text-sm text-gray-500 mb-3">Publicadas recientemente</p>

          <div v-if="loadingTeacher" class="text-gray-500 text-sm">Cargando…</div>
          <ul v-else-if="activeAssignments.length" class="divide-y">
            <li v-for="a in activeAssignments" :key="a.id" class="py-3">
              <div class="flex items-center justify-between">
                <div>
                  <p class="font-medium">{{ a.title }}</p>
                  <p class="text-xs text-gray-500">
                    Publicada: {{ fmtTs(a.publishedAt) }}
                    <span v-if="a.timeLimitSec"> • Límite: {{ a.timeLimitSec }}s</span>
                  </p>
                </div>
                <router-link
                  class="text-sm px-3 py-1 rounded border hover:bg-gray-50"
                  :to="{ name: 'Reports', query: { a: a.id } }"
                >
                  Ver reporte
                </router-link>
              </div>
            </li>
          </ul>
          <p v-else class="text-sm text-gray-500">No tienes asignaciones activas.</p>
        </div>

        <!-- Últimos intentos -->
        <div class="rounded-2xl border p-6 shadow-sm">
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold">Últimos intentos</h3>
            <button class="text-sm text-gray-600 hover:underline" @click="goReports">Ir a reportes</button>
          </div>
          <p class="text-sm text-gray-500 mb-3">Actividad reciente de tus alumnos</p>

          <div v-if="loadingTeacher" class="text-gray-500 text-sm">Cargando…</div>

          <div v-else>
            <table v-if="recentAttempts.length" class="w-full text-sm">
              <thead class="text-left text-gray-500">
                <tr>
                  <th class="py-2">Alumno</th>
                  <th class="py-2">Asignación</th>
                  <th class="py-2">Score</th>
                  <th class="py-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in recentAttempts" :key="r.id" class="border-t">
                  <td class="py-2">{{ r.studentEmail || "—" }}</td>
                  <td class="py-2">{{ r.assignmentTitle || "—" }}</td>
                  <td class="py-2">{{ (r.score ?? 0) }}%</td>
                  <td class="py-2">
                    <span v-if="r.finishedAt" class="text-gray-600">Entregado • {{ fmtTs(r.finishedAt) }}</span>
                    <span v-else class="text-amber-700">En curso</span>
                  </td>
                </tr>
              </tbody>
            </table>
            <p v-else class="text-sm text-gray-500">Aún no hay intentos recientes.</p>
          </div>
        </div>
      </div>
    </template>

    <!-- ===== CONTENIDO para STUDENT ===== -->
    <template v-else-if="isStudent">
      <div class="mt-8 grid gap-6 md:grid-cols-2">
        <div class="group rounded-2xl border p-6 shadow-sm transition hover:shadow-md">
          <div class="flex items-start gap-4">
            <div class="rounded-xl bg-blue-50 p-3 text-2xl leading-none ring-1 ring-blue-100">📚</div>
            <div class="flex-1">
              <h3 class="text-lg font-semibold text-gray-900">Problemas</h3>
              <p class="mt-1 text-sm text-gray-600">
                Practica en el banco de problemas.
              </p>
              <div class="mt-4">
                <button class="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition" @click="goProblems">
                  Abrir problemas
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="group rounded-2xl border p-6 shadow-sm transition hover:shadow-md">
          <div class="flex items-start gap-4">
            <div class="rounded-xl bg-amber-50 p-3 text-2xl leading-none ring-1 ring-amber-100">🗂️</div>
            <div class="flex-1">
              <h3 class="text-lg font-semibold text-gray-900">Mis asignaciones</h3>
              <p class="mt-1 text-sm text-gray-600">Accede y entrega tus tareas.</p>
              <div class="mt-4">
                <button class="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 transition" @click="goMyAssignments">
                  Ver mis asignaciones
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Próximas asignaciones -->
      <div class="mt-8 rounded-2xl border p-6 shadow-sm">
        <h3 class="text-lg font-semibold">Tus últimas asignaciones</h3>
        <p class="text-sm text-gray-500 mb-3">Publicadas más recientemente</p>
        <div v-if="loadingStudent" class="text-gray-500 text-sm">Cargando…</div>
        <ul v-else-if="nextAssignments.length" class="divide-y">
          <li v-for="a in nextAssignments" :key="a.id" class="py-3 flex items-center justify-between">
            <div>
              <p class="font-medium">{{ a.title }}</p>
              <p class="text-xs text-gray-500">
                Publicada: {{ fmtTs(a.publishedAt) }}
                <span v-if="a.timeLimitSec"> • Límite: {{ a.timeLimitSec }}s</span>
              </p>
            </div>
            <router-link class="text-sm px-3 py-1 rounded border hover:bg-gray-50" :to="{ name: 'AssignmentPlay', params: { id: a.id } }">
              Resolver
            </router-link>
          </li>
        </ul>
        <p v-else class="text-sm text-gray-500">No tienes asignaciones por ahora.</p>
      </div>

      <div class="mt-8 rounded-xl border bg-gray-50 p-4 text-sm text-gray-700">
        💡 <span class="font-medium">Consejo:</span> Practica desde el banco de problemas para
        llegar preparado a tus asignaciones. Si te equivocas, vuelve a intentar con calma.
      </div>
    </template>

    <!-- Cargando perfil -->
    <template v-else>
      <div class="mt-8 text-gray-500">Cargando…</div>
    </template>
  </section>
</template>


