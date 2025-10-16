<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter, RouterLink } from "vue-router";
import Chart from "chart.js/auto";
import StateBlock from "@/components/StateBlock.vue";

// --- Helpers de formato ---
const fmtPct = (v: number | null | undefined) =>
  v == null ? "—" : `${(v * 100).toFixed(1)}%`;
const fmtDateTime = (x: number | Date) => {
  const d = typeof x === "number" ? new Date(x) : x;
  return d.toLocaleString();
};
const fmtDate = (x: number | Date) => {
  const d = typeof x === "number" ? new Date(x) : x;
  return d.toLocaleDateString();
};

// --- Router / navegación ---
const router = useRouter();
function verDetalle(aid?: string, status?: "in-progress" | "completed") {
  router.push({
    name: "TeacherAttempts",
    query: { assignmentId: aid ?? "__all__", ...(status ? { status } : {}) },
  });
}

// ======= DATA (mock: reemplaza por tu fetch real si aplica) =======
const assignmentsCreated = ref(15);
const assignmentsPublished = ref(11);
const attemptsCount = ref(16);

// Promedio por alumno (0..1)
type AvgRow = { label: string; value: number };
const avgPerStudent = ref<AvgRow[]>([
  { label: "student1@demo.test", value: 0.35 },
  { label: "student@demo.test", value: 1.0 },
  { label: "student3@demo.test", value: 0.0 },
]);

// Intentos por día (x = timestamp ms, y = conteo)
type DailyRow = { x: number; y: number };
const attemptsPerDay = ref<DailyRow[]>([{ x: Date.now(), y: 15 }]);

// Top 5 — promedio por asignación (avg 0..1)
type Top5Row = { id: string; title: string; avg: number };
const top5 = ref<Top5Row[]>([
  { id: "a1", title: "Asignacion nueva 16:38", avg: 1.0 },
  { id: "a2", title: "Nueva asignacion 16:32", avg: 0.84 },
  { id: "a3", title: "nueva 16:34", avg: 0.5 },
  { id: "a4", title: "asdf", avg: 0.5 },
  { id: "a5", title: "Asignacion de prueba 15:56", avg: 0.42 },
]);

// ======= ESTADOS / REFRESH =======
const loadingReports = ref(false);
const errorReports = ref<string>("");

async function cargarDatosReports() {
  try {
    loadingReports.value = true;
    errorReports.value = "";
    // TODO: aquí tu fetch real (Firestore, etc.)
    // - Rellenar assignmentsCreated/Published/attemptsCount
    // - Rellenar avgPerStudent, attemptsPerDay, top5
  } catch (e: any) {
    errorReports.value = e?.message ?? "No se pudieron cargar los reportes.";
  } finally {
    loadingReports.value = false;
  }
}

function refrescar() {
  cargarDatosReports();
  // Si tus datasets vienen de red, actualiza charts:
  // - destruye y crea de nuevo, o muta data y llama chart.update()
}

// ======= CHARTS =======
const avgCanvas = ref<HTMLCanvasElement | null>(null);
const dailyCanvas = ref<HTMLCanvasElement | null>(null);
const top5Canvas = ref<HTMLCanvasElement | null>(null);

let avgChart: Chart | null = null;
let dailyChart: Chart | null = null;
let top5Chart: Chart | null = null;

const commonOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: "bottom" as const },
    tooltip: {
      callbacks: {
        title: (items: any[]) => {
          const x = items?.[0]?.parsed?.x;
          return typeof x === "number" ? fmtDateTime(x) : String(x ?? "");
        },
        label: (ctx: any) => {
          const v = ctx.parsed.y;
          const label = (ctx.dataset?.label ?? "").toLowerCase();
          const isRate =
            ctx.dataset?.yAxisID === "rate" ||
            label.includes("tasa") ||
            label.includes("promedio") ||
            label.includes("%");
          return isRate ? fmtPct(v) : String(v ?? "—");
        },
      },
    },
  },
  scales: {
    x: {
      ticks: {
        callback: function (_: any, i: number, ticks: any[]) {
          // @ts-ignore
          const val = ticks[i]?.value;
          return typeof val === "number" ? fmtDate(val) : String(val ?? "");
        },
      },
    },
    y: { beginAtZero: true },
    rate: {
      type: "linear" as const,
      position: "right" as const,
      min: 0,
      max: 1,
      grid: { drawOnChartArea: false },
      ticks: { callback: (v: number) => `${Math.round(v * 100)}%` },
    },
  },
};

onMounted(() => {
  cargarDatosReports();

  // Promedio por alumno
  if (avgCanvas.value) {
    const labels = avgPerStudent.value.map((r) => r.label);
    const values = avgPerStudent.value.map((r) => r.value);
    avgChart = new Chart(avgCanvas.value, {
      type: "bar",
      data: {
        labels,
        datasets: [{ label: "Promedio por alumno", data: values, yAxisID: "rate" }],
      },
      options: commonOptions as any,
    });
  }

  // Intentos por día
  if (dailyCanvas.value) {
    dailyChart = new Chart(dailyCanvas.value, {
      type: "bar",
      data: { datasets: [{ label: "Intentos por día", data: attemptsPerDay.value }] },
      options: { ...commonOptions, parsing: { xAxisKey: "x", yAxisKey: "y" } } as any,
    });
  }

  // Top 5 — (sin handler de click, lo pausamos)
  if (top5Canvas.value) {
    const labels = top5.value.map((r) => r.title);
    const values = top5.value.map((r) => r.avg); // 0..1

    top5Chart = new Chart(top5Canvas.value, {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: "Top 5 — Promedio por asignación", data: values, yAxisID: "rate" },
        ],
      },
      options: {
        ...commonOptions,
        plugins: { ...commonOptions.plugins, legend: { display: false } },
      } as any,
    });
  }
});
</script>

<template>
  <section class="max-w-7xl mx-auto p-4 space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="text-3xl font-bold">Reportes</h1>
      <div class="flex items-center gap-2">
        <button class="px-3 py-1.5 rounded border" @click="refrescar" :disabled="loadingReports" :aria-busy="loadingReports">
          Refrescar
        </button>
        <RouterLink
          class="px-3 py-1.5 rounded border inline-block"
          :to="{ name: 'TeacherAttempts', query: { assignmentId: '__all__' } }"
        >
          Ver detalle
        </RouterLink>
      </div>
    </div>

    <!-- Estados generales de la página -->
    <StateBlock v-if="loadingReports" state="loading" />
    <StateBlock v-else-if="errorReports" state="error" :message="errorReports">
      <template #actions>
        <div class="mt-3">
          <button class="px-3 py-1.5 rounded border" @click="refrescar">Reintentar</button>
        </div>
      </template>
    </StateBlock>

    <!-- Métricas -->
    <div v-else class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div class="rounded border p-4">
        <p class="text-sm opacity-70">Asignaciones creadas</p>
        <p class="text-4xl font-bold mt-1">{{ assignmentsCreated }}</p>
      </div>
      <div class="rounded border p-4">
        <p class="text-sm opacity-70">Asignaciones publicadas</p>
        <p class="text-4xl font-bold mt-1">{{ assignmentsPublished }}</p>
      </div>
      <div class="rounded border p-4">
        <p class="text-sm opacity-70">Intentos de alumnos</p>
        <p class="text-4xl font-bold mt-1">{{ attemptsCount }}</p>
      </div>
    </div>

    <!-- Gráficas principales -->
    <div v-if="!loadingReports && !errorReports" class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div class="rounded border p-4">
        <h3 class="font-medium mb-2">Promedio por alumno</h3>
        <div class="w-full h-64">
          <canvas ref="avgCanvas"></canvas>
        </div>
      </div>

      <div class="rounded border p-4">
        <h3 class="font-medium mb-2">Intentos por día</h3>
        <div class="w-full h-64">
          <canvas ref="dailyCanvas"></canvas>
        </div>
      </div>
    </div>

    <!-- Top 5 (chart + tabla) -->
    <div v-if="!loadingReports && !errorReports" class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div class="rounded border p-4">
        <h3 class="font-medium mb-2">Top 5 — promedio por asignación</h3>
        <div class="w-full h-64">
          <canvas ref="top5Canvas"></canvas>
        </div>
      </div>

      <div class="rounded border p-4">
        <h3 class="font-medium mb-2">Top 5 — Promedio por asignación</h3>
        <template v-if="top5.length > 0">
          <table class="min-w-full text-sm">
            <thead>
              <tr class="text-left border-b">
                <th class="py-1 pr-4">Asignación</th>
                <th class="py-1 pr-4">Intentos</th>
                <th class="py-1 pr-4">Promedio</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in top5" :key="row.id" class="border-b">
                <td class="py-1 pr-4">
                  <RouterLink
                    class="underline decoration-dotted"
                    :to="{ name: 'TeacherAttempts', query: { assignmentId: row.id, status: 'in-progress' } }"
                  >
                    {{ row.title }}
                  </RouterLink>
                </td>
                <td class="py-1 pr-4">—</td>
                <td class="py-1 pr-4">{{ fmtPct(row.avg) }}</td>
              </tr>
            </tbody>
          </table>
        </template>
        <StateBlock v-else state="empty" title="Aún no hay asignaciones con intentos." />
      </div>
    </div>
  </section>
</template>




