<!-- src/views/reports/ClassReport.vue -->
<script setup lang="ts">
import { onMounted, ref, watchEffect, computed, nextTick, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { getDocs, query, where } from "firebase/firestore";
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
Chart.defaults.color = "#111827";
Chart.defaults.borderColor = "rgba(0,0,0,.06)";

/* =========================
   Estado y refs
========================= */
const route = useRoute();
const router = useRouter();
const classId = route.params.id as string;

const profile = useProfileStore();
const { uid } = storeToRefs(profile);

const loading = ref(false);
const error = ref<string>("");

// datos base
type AssignmentRow = { id: string; title: string; classId?: string; classIds?: string[] };
type AttemptRow = {
  assignmentId: string;
  assignmentTitle?: string;
  studentEmail?: string;
  score?: number | null;
  startedAt?: any | null;
  finishedAt?: any | null;
};

const assignments = ref<AssignmentRow[]>([]);
const attempts = ref<AttemptRow[]>([]);

// charts
const canvasScores  = ref<HTMLCanvasElement | null>(null);
const canvasPerDay  = ref<HTMLCanvasElement | null>(null);
const canvasTopAssg = ref<HTMLCanvasElement | null>(null);
let chartScores: Chart | null = null;
let chartPerDay: Chart | null = null;
let chartTopAssg: Chart | null = null;

/* =========================
   Helpers
========================= */
function asDate(ts: any): Date | null {
  try {
    if (!ts) return null;
    if (typeof ts.toDate === "function") return ts.toDate();
    if (typeof ts.seconds === "number") return new Date(ts.seconds * 1000);
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch { return null; }
}
function toLocaleDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toLocaleDateString();
}
function secondsBetween(a: any, b: any): number | null {
  try {
    const ta = typeof a?.toDate === "function" ? a.toDate() : (a?.seconds ? new Date(a.seconds * 1000) : new Date(a));
    const tb = typeof b?.toDate === "function" ? b.toDate() : (b?.seconds ? new Date(b.seconds * 1000) : new Date(b));
    return Math.max(0, Math.round((tb.getTime() - ta.getTime()) / 1000));
  } catch { return null; }
}
function fmtMMSS(sec: number | null): string {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/* =========================
   Carga
========================= */
async function loadAssignmentsOfClass() {
  // 1) Traemos todas las asignaciones del docente.
  // 2) Filtramos por pertenencia a la clase (classId o array classIds).
  if (!uid.value) return;
  const qs = await getDocs(query(colAssignments, where("ownerUid", "==", uid.value)));
  const all = qs.docs.map((d) => {
    const data = d.data() as any;
    return {
      id: d.id,
      title: data.title || d.id,
      classId: data.classId,
      classIds: Array.isArray(data.classIds) ? data.classIds : undefined,
    } as AssignmentRow;
  });
  assignments.value = all.filter(a =>
    (a.classId && a.classId === classId) ||
    (a.classIds && a.classIds.includes(classId))
  );
}

async function loadAttempts() {
  if (!uid.value) return;
  // Evitamos where-in > 10: traemos todos del owner y filtramos por assignmentId.
  const qs = await getDocs(query(colAttempts, where("ownerUid", "==", uid.value)));
  const aSet = new Set(assignments.value.map(a => a.id));
  attempts.value = qs.docs
    .map((d) => {
      const data = d.data() as any;
      return {
        assignmentId: data.assignmentId,
        assignmentTitle: data.assignmentTitle ?? "(Sin título)",
        studentEmail: data.studentEmail ?? "—",
        score: typeof data.score === "number" ? data.score : null,
        startedAt: data.startedAt ?? null,
        finishedAt: data.finishedAt ?? null,
      } as AttemptRow;
    })
    .filter((r) => aSet.has(r.assignmentId));
}

/* =========================
   Agregaciones (solo clase)
========================= */
// Promedio por alumno (solo intentos con score)
const avgByStudent = computed(() => {
  const acc = new Map<string, { sum: number; n: number }>();
  for (const a of attempts.value) {
    if (a.score == null) continue;
    const key = a.studentEmail || "—";
    const e = acc.get(key) || { sum: 0, n: 0 };
    e.sum += a.score; e.n += 1; acc.set(key, e);
  }
  const labels: string[] = [];
  const values: number[] = [];
  for (const [k, v] of acc.entries()) {
    labels.push(k);
    values.push(Math.round(v.sum / Math.max(1, v.n)));
  }
  return { labels, values };
});

// Intentos por día (finishedAt)
const attemptsPerDay = computed(() => {
  const acc = new Map<string, number>();
  for (const a of attempts.value) {
    const d = asDate(a.finishedAt);
    if (!d) continue;
    const key = toLocaleDay(d);
    acc.set(key, (acc.get(key) || 0) + 1);
  }
  const entries = Array.from(acc.entries()).sort(
    (A, B) => new Date(A[0]).getTime() - new Date(B[0]).getTime()
  );
  return { labels: entries.map(e => e[0]), values: entries.map(e => e[1]) };
});

// Top asignaciones de la clase (promedio score + tiempo promedio)
type TopRow = { assignmentId: string; title: string; count: number; avg: number; avgSec: number | null };
const topAssg = computed<TopRow[]>(() => {
  const titleById = new Map(assignments.value.map(a => [a.id, a.title]));
  const acc = new Map<string, { sumScore: number; n: number; sumSec: number; nSec: number }>();

  for (const a of attempts.value) {
    if (a.score == null) continue;
    const e = acc.get(a.assignmentId) || { sumScore: 0, n: 0, sumSec: 0, nSec: 0 };
    e.sumScore += a.score; e.n += 1;
    const sec = (a.startedAt && a.finishedAt) ? secondsBetween(a.startedAt, a.finishedAt) : null;
    if (sec != null) { e.sumSec += sec; e.nSec += 1; }
    acc.set(a.assignmentId, e);
  }

  const rows: TopRow[] = Array.from(acc.entries()).map(([assignmentId, v]) => ({
    assignmentId,
    title: titleById.get(assignmentId) || assignmentId,
    count: v.n,
    avg: Math.round(v.sumScore / Math.max(1, v.n)),
    avgSec: v.nSec > 0 ? Math.round(v.sumSec / v.nSec) : null,
  }));

  rows.sort((A, B) => B.avg - A.avg || B.count - A.count);
  return rows;
});

/* === FIX TIPADO: alumnos únicos con score === */
const uniqueStudentsCount = computed<number>(() => {
  const s = new Set<string>();
  for (const a of attempts.value) {
    if (a.score == null) continue;
    s.add(a.studentEmail || "—");
  }
  return s.size;
});

/* =========================
   Charts
========================= */
function makeBarChart(
  el: HTMLCanvasElement | null,
  cfg: {
    title: string;
    labels: string[];
    data: number[];
    ySuffix?: string;
    color?: string;
    onClickBar?: (index: number) => void;
  }
) {
  if (!el) return null;
  const ctx = el.getContext("2d");
  if (!ctx) return null;

  const base = cfg.color ?? "rgb(59, 130, 246)";
  const chart = new Chart(ctx, {
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
        x: { ticks: { maxRotation: 45, minRotation: 0, autoSkip: true, autoSkipPadding: 8 } },
        y: {
          beginAtZero: true,
          ticks: {
            precision: 0,
            callback: (v) => (cfg.ySuffix ? `${v}${cfg.ySuffix}` : `${v}`),
          },
        },
      },
      onClick: (evt, elements) => {
        if (!cfg.onClickBar) return;
        const el = elements?.[0];
        if (el && typeof el.index === "number") cfg.onClickBar!(el.index);
      },
    },
  });

  // puntero de mano al pasar por barras
  el.addEventListener("mousemove", (e) => {
    const points = chart.getElementsAtEventForMode(e as any, "nearest", { intersect: true }, true);
    (e.target as HTMLCanvasElement).style.cursor = points.length ? "pointer" : "default";
  });

  return chart;
}

function renderAllCharts() {
  chartScores?.destroy();  chartScores = null;
  chartPerDay?.destroy();  chartPerDay = null;
  chartTopAssg?.destroy(); chartTopAssg = null;

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
      title: "Top — asignaciones de la clase",
      labels: topAssg.value.map(r => r.title),
      data: topAssg.value.map(r => r.avg),
      ySuffix: "%",
      color: "rgb(245, 158, 11)",
      onClickBar: (index) => {
        const row = topAssg.value[index];
        if (!row) return;
        router.push({ name: "TeacherAttempts", query: { assignmentId: row.assignmentId } });
      },
    });
  });
}

/* =========================
   CSV por clase
========================= */
async function exportClassCSV() {
  const HEADER = ["Asignación","Alumno","Puntaje","Finalizado","Duración"];
  const DELIM = ";";
  const EOL = "\r\n";
  const BOM = "\uFEFF";
  const quote = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

  const titleById = new Map(assignments.value.map(a => [a.id, a.title]));

  const lines = attempts.value.map(r => {
    const title = titleById.get(r.assignmentId) || r.assignmentTitle || r.assignmentId;
    const email = r.studentEmail || "";
    const score = r.score != null ? `${r.score}%` : "—";
    const fin   = asDate(r.finishedAt)?.toLocaleString() ?? "—";
    const sec   = (r.startedAt && r.finishedAt) ? secondsBetween(r.startedAt, r.finishedAt) : null;
    const dur   = sec != null ? `${sec}s` : "—";
    return [quote(title), quote(email), score, quote(fin), dur].join(DELIM);
  });

  const csv = BOM + [HEADER.join(DELIM), ...lines].join(EOL);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `class_${classId}_attempts.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* =========================
   Orquestación
========================= */
async function loadAll() {
  const role = profile.role;
  if (role !== "teacher" && role !== "admin") {
    error.value = "Esta sección es solo para docentes.";
    loading.value = false;
    return;
  }
  if (!uid.value) return;

  loading.value = true;
  error.value = "";
  try {
    await loadAssignmentsOfClass();
    await loadAttempts();
    loading.value = false;
    await nextTick();
    renderAllCharts();
  } catch (e: any) {
    console.error("[ClassReport] error:", e);
    error.value = e?.message ?? "No se pudo cargar el reporte de la clase.";
    loading.value = false;
  }
}

onMounted(() => {
  if (!profile.ready) profile.init?.();
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
      <h1 class="text-2xl font-bold">Reporte de la clase</h1>
      <div class="flex gap-2">
        <button class="px-3 py-1.5 rounded border" @click="$router.back()">Volver</button>
        <button class="px-3 py-1.5 rounded border" @click="exportClassCSV">Exportar CSV</button>
      </div>
    </div>

    <p class="text-sm text-gray-600 mb-2">Clase: <span class="font-mono">{{ classId }}</span></p>

    <p v-if="loading">Cargando…</p>
    <p v-else-if="error" class="text-red-600">{{ error }}</p>

    <div v-else>
      <!-- Resumen (conteos) -->
      <div class="grid md:grid-cols-3 gap-4 mb-6">
        <div class="border rounded p-4">
          <h3 class="font-semibold">Asignaciones en la clase</h3>
          <div class="text-4xl mt-2">{{ assignments.length }}</div>
        </div>
        <div class="border rounded p-4">
          <h3 class="font-semibold">Intentos (totales)</h3>
          <div class="text-4xl mt-2">{{ attempts.length }}</div>
        </div>
        <div class="border rounded p-4">
          <h3 class="font-semibold">Alumnos (únicos, con puntaje)</h3>
          <div class="text-4xl mt-2">{{ uniqueStudentsCount }}</div>
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

      <div class="grid md:grid-cols-1 gap-6 mt-6">
        <!-- Top asignaciones -->
        <div class="border rounded p-4">
          <h3 class="font-semibold mb-3">Top — asignaciones de la clase</h3>
          <div class="h-64 mb-4">
            <canvas ref="canvasTopAssg" class="w-full h-full"></canvas>
          </div>

          <div class="overflow-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left border-b">
                  <th class="py-2">Asignación</th>
                  <th class="py-2">Intentos</th>
                  <th class="py-2">Promedio</th>
                  <th class="py-2">Tiempo prom.</th>
                  <th class="py-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in topAssg" :key="row.assignmentId" class="border-b">
                  <td class="py-2">
                    <a
                      class="underline decoration-dotted cursor-pointer"
                      :href="$router.resolve({ name: 'TeacherAttempts', query: { assignmentId: row.assignmentId } }).href"
                      @click.prevent="$router.push({ name: 'TeacherAttempts', query: { assignmentId: row.assignmentId } })"
                    >
                      {{ row.title }}
                    </a>
                  </td>
                  <td class="py-2">{{ row.count }}</td>
                  <td class="py-2">{{ row.avg }}%</td>
                  <td class="py-2">{{ fmtMMSS(row.avgSec) }}</td>
                  <td class="py-2">
                    <button class="px-2 py-1 rounded border" @click="$router.push({ name: 'TeacherAttempts', query: { assignmentId: row.assignmentId } })">
                      Ver intentos
                    </button>
                  </td>
                </tr>
                <tr v-if="topAssg.length === 0">
                  <td class="py-3 text-gray-500" colspan="5">Sin datos todavía.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  </section>
</template>
