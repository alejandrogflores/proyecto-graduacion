<!-- src/views/reports/Reports.vue -->
<script setup lang="ts">
import { onMounted, ref, watchEffect, computed, nextTick, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import {
  getDocs,
  query,
  where,
  getCountFromServer,
} from "firebase/firestore";
import { colAssignments, colAttempts } from "@/services/firebase";
import { useProfileStore } from "@/stores/profile";


// Chart.js
import {
  Chart,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Title,
} from "chart.js";
Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend, Title);
Chart.defaults.color = '#111827';            // texto ejes (gris-900)
Chart.defaults.borderColor = 'rgba(0,0,0,.06)'; // líneas de la rejilla

/* =========================
   Estado y referencias
========================= */
const router = useRouter();
const profile = useProfileStore();
const { uid } = storeToRefs(profile);

const loading = ref(false);
const error = ref<string>("");

const totalAssignments = ref(0);
const totalPublished   = ref(0);
const totalAttempts    = ref(0);

// Intentos para gráficos
type AttemptRow = {
  assignmentId: string;
  assignmentTitle?: string;
  studentEmail?: string;
  score?: number | null; // 0..100
  finishedAt?: any;      // Timestamp
};
const attempts = ref<AttemptRow[]>([]);

// Chart refs
const canvasScores  = ref<HTMLCanvasElement | null>(null);
const canvasPerDay  = ref<HTMLCanvasElement | null>(null);
const canvasTopAssg = ref<HTMLCanvasElement | null>(null);

// Instancias Chart para destruir al re-render
let chartScores: Chart | null = null;
let chartPerDay: Chart | null = null;
let chartTopAssg: Chart | null = null;

/* =========================
   Helpers
========================= */
function toLocaleDate(d: Date) {
  // YYYY-MM-DD amigable al locale
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toLocaleDateString();
}

function asDate(ts: any): Date | null {
  try {
    if (!ts) return null;
    if (typeof ts.toDate === "function") return ts.toDate();
    if (typeof ts.seconds === "number") return new Date(ts.seconds * 1000);
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

/* =========================
   Carga de datos
========================= */
async function loadCounts() {
  if (!uid.value) return;
  // Asignaciones creadas por el teacher
  const qAll = query(colAssignments, where("ownerUid", "==", uid.value));
  const cAll = await getCountFromServer(qAll);
  totalAssignments.value = cAll.data().count;

  // Publicadas
  const qPub = query(
    colAssignments,
    where("ownerUid", "==", uid.value),
    where("isPublished", "==", true)
  );
  const cPub = await getCountFromServer(qPub);
  totalPublished.value = cPub.data().count;

  // Intentos que pertenecen a assignments del teacher
  const qAtt = query(colAttempts, where("ownerUid", "==", uid.value));
  const cAtt = await getCountFromServer(qAtt);
  totalAttempts.value = cAtt.data().count;
}

async function loadAttemptsForCharts() {
  if (!uid.value) return;
  attempts.value = [];
  const qAtt = query(colAttempts, where("ownerUid", "==", uid.value));
  const qs = await getDocs(qAtt);
  attempts.value = qs.docs.map((d) => {
    const data = d.data() as any;
    return {
      assignmentId: data.assignmentId,
      assignmentTitle: data.assignmentTitle ?? "(Sin título)",
      studentEmail: data.studentEmail ?? "—",
      score: typeof data.score === "number" ? data.score : null,
      finishedAt: data.finishedAt ?? null,
    };
  });
}

/* =========================
   Agregaciones para charts
========================= */

// Promedio por alumno (email)
const avgByStudent = computed(() => {
  const acc = new Map<string, { sum: number; n: number }>();
  for (const a of attempts.value) {
    if (a.score == null) continue;
    const key = a.studentEmail || "—";
    const e = acc.get(key) || { sum: 0, n: 0 };
    e.sum += a.score;
    e.n += 1;
    acc.set(key, e);
  }
  const labels: string[] = [];
  const values: number[] = [];
  for (const [k, v] of acc.entries()) {
    labels.push(k);
    values.push(Math.round(v.sum / Math.max(1, v.n)));
  }
  return { labels, values };
});

// Intentos por día (count)
const attemptsPerDay = computed(() => {
  const acc = new Map<string, number>();
  for (const a of attempts.value) {
    const d = asDate(a.finishedAt);
    if (!d) continue;
    const key = toLocaleDate(d);
    acc.set(key, (acc.get(key) || 0) + 1);
  }
  // orden por fecha (parseando otra vez por simplicidad)
  const entries = Array.from(acc.entries()).sort(
    (A, B) => new Date(A[0]).getTime() - new Date(B[0]).getTime()
  );
  return {
    labels: entries.map((e) => e[0]),
    values: entries.map((e) => e[1]),
  };
});

// Top 5 por asignación (promedio de score)
const topAssg = computed(() => {
  const acc = new Map<string, { sum: number; n: number }>();
  for (const a of attempts.value) {
    if (a.score == null) continue;
    const key = a.assignmentTitle || "(Sin título)";
    const e = acc.get(key) || { sum: 0, n: 0 };
    e.sum += a.score;
    e.n += 1;
    acc.set(key, e);
  }
  const rows = Array.from(acc.entries()).map(([title, v]) => ({
    title,
    count: v.n,
    avg: Math.round(v.sum / Math.max(1, v.n)),
  }));
  rows.sort((A, B) => B.avg - A.avg || B.count - A.count);
  return rows.slice(0, 5);
});

// Para la tabla al lado
const topAssgForView = computed(() =>
  topAssg.value.map((r, i) => ({ id: i + "_" + r.title, ...r }))
);

/* =========================
   Render de charts
========================= */
function makeBarChart(
  el: HTMLCanvasElement | null,
  cfg: {
    title: string;
    labels: string[];
    data: number[];
    ySuffix?: string;
    color?: string; // <-- NUEVO
  }
) {
  if (!el) return null;
  const ctx = el.getContext("2d");
  if (!ctx) return null;

  // color por defecto (Tailwind blue-500)
  const base = cfg.color ?? "rgb(59, 130, 246)";

  return new Chart(ctx, {
    type: "bar",
    data: {
      labels: cfg.labels,
      datasets: [
        {
          label: cfg.title,
          data: cfg.data,
          borderWidth: 1,
          borderColor: base,
          backgroundColor: base.replace("rgb(", "rgba(").replace(")", ", 0.25)"),
          // si prefieres sin transparencia:
          // backgroundColor: base,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: { display: true, text: cfg.title },
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (tt) => {
              const v = tt.parsed.y ?? tt.raw;
              return cfg.ySuffix ? `${v}${cfg.ySuffix}` : `${v}`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: { maxRotation: 45, minRotation: 0, autoSkip: true, autoSkipPadding: 8 },
        },
        y: {
          beginAtZero: true,
          ticks: {
            precision: 0,
            callback: (v) => (cfg.ySuffix ? `${v}${cfg.ySuffix}` : `${v}`),
          },
        },
      },
    },
  });
}

function renderAllCharts() {
  // destruye instancias previas
  chartScores?.destroy();  chartScores = null;
  chartPerDay?.destroy();  chartPerDay = null;
  chartTopAssg?.destroy(); chartTopAssg = null;

  // Asegurar que el DOM ya montó los canvas
  nextTick(() => {
    chartScores = makeBarChart(canvasScores.value, {
      title: "Promedio por alumno",
      labels: avgByStudent.value.labels,
      data: avgByStudent.value.values,
      ySuffix: "%",
      color: "rgb(59, 130, 246)",
    });

    chartPerDay = makeBarChart(canvasPerDay.value, {
      title: "Intentos por día",
      labels: attemptsPerDay.value.labels,
      data: attemptsPerDay.value.values,
      color: "rgb(16, 185, 129)",
    });

    chartTopAssg = makeBarChart(canvasTopAssg.value, {
      title: "Top 5 — promedio por asignación",
      labels: topAssg.value.map((r) => r.title),
      data: topAssg.value.map((r) => r.avg),
      ySuffix: "%",
      color: "rgb(245, 158, 11)",
    });
  });
}

/* =========================
   Orquestación
========================= */
async function loadAll() {
  const role = profile.role;
  if (role !== "teacher" && role !== "admin") {
    error.value = "Esta sección es solo para docentes.";
    loading.value = false;
    return; // no hagas queries
  }
  if (!uid.value) return;
  loading.value = true;
  error.value = "";
  try {
    await Promise.all([loadCounts(), loadAttemptsForCharts()]);

    // 1) muestra los canvas
    loading.value = false;

    // 2) espera a que el DOM se actualice y los <canvas> existan
    await nextTick();

    // 3) dibuja los charts
    renderAllCharts();
  } catch (e: any) {
    console.error("[Reports] error:", e);
    error.value = e?.message ?? "No se pudieron cargar los reportes.";
    loading.value = false; // asegúrate de ocultar el spinner si falla
  }
}

function goAttempts() {
  router.push({ name: "TeacherAttempts" });
}

onMounted(() => {
  if (!profile.ready) profile.init?.();
  // Cargar cuando ya haya `uid`
  let started = false;
  watchEffect(() => {
    if (!started && profile.ready && uid.value) {
      started = true;
      loadAll();
    }
  });
});

onUnmounted(() => {
  chartScores?.destroy();
  chartPerDay?.destroy();
  chartTopAssg?.destroy();
});
</script>

<template>
  <section class="max-w-6xl mx-auto p-4">
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-2xl font-bold">Reportes</h1>
      <button class="px-3 py-1.5 rounded border" @click="router.push({ name: 'TeacherAttempts' })">
        Ver detalle
      </button>
    </div>

    <p v-if="loading">Cargando…</p>
    <p v-else-if="error" class="text-red-600">{{ error }}</p>

    <div v-else>
      <!-- Tarjetas -->
      <div class="grid md:grid-cols-3 gap-4 mb-6">
        <div class="border rounded p-4">
          <h3 class="font-semibold">Asignaciones creadas</h3>
          <div class="text-4xl mt-2">{{ totalAssignments }}</div>
        </div>
        <div class="border rounded p-4">
          <h3 class="font-semibold">Asignaciones publicadas</h3>
          <div class="text-4xl mt-2">{{ totalPublished }}</div>
        </div>
        <div class="border rounded p-4">
          <h3 class="font-semibold">Intentos de alumnos</h3>
          <div class="text-4xl mt-2">{{ totalAttempts }}</div>
        </div>
      </div>

      <!-- Gráficos -->
      <div class="grid md:grid-cols-2 gap-6">
        <div class="border rounded p-4">
          <div class="h-64">
            <canvas ref="canvasScores" class="w-full h-full"></canvas>
          </div>
        </div>

        <div class="border rounded p-4">
          <div class="h-64">
            <canvas ref="canvasPerDay" class="w-full h-full"></canvas>
          </div>
        </div>
      </div>

      <div class="grid md:grid-cols-2 gap-6 mt-6">
        <div class="border rounded p-4">
          <div class="h-64">
            <canvas ref="canvasTopAssg" class="w-full h-full"></canvas>
          </div>
        </div>

        <!-- Promedios al lado -->
        <div class="border rounded p-4">
          <h3 class="font-semibold mb-3">Top 5 — Promedio por asignación</h3>
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left border-b">
                <th class="py-2">Asignación</th>
                <th class="py-2">Intentos</th>
                <th class="py-2">Promedio</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in topAssgForView" :key="row.id" class="border-b">
                <td class="py-2">{{ row.title }}</td>
                <td class="py-2">{{ row.count }}</td>
                <td class="py-2">{{ row.avg }}%</td>
              </tr>
              <tr v-if="topAssgForView.length === 0">
                <td class="py-3 text-gray-500" colspan="3">Sin datos todavía.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="mt-6">
        <button class="px-3 py-1.5 rounded border" @click="goAttempts">
          Ir a tabla de intentos
        </button>
      </div>
    </div>
  </section>
</template>


