<script setup lang="ts">
import { ref, watch, onBeforeUnmount, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { query, where, orderBy, onSnapshot, type Unsubscribe } from "firebase/firestore";
import { colAttempts, type Attempt } from "@/services/firebase";
import { getDoc } from "firebase/firestore";
import { problemDoc } from "@/services/firebase";

// ---- Tipos ----
type Student = { uid: string; email?: string; total: number; correct: number; accuracy: number };
type SortKey = "email" | "uid" | "total" | "correct" | "accuracy";
type SortDir = "asc" | "desc";

// ---- Router ----
const route = useRoute();
const router = useRouter();

// Título del problema (si estamos en /attempts/:problemId)
const problemTitle = ref<string | null>(null);

watch(
  () => route.params.problemId,
  async (pid) => {
    problemTitle.value = null;
    if (!pid) return; // modo "Todos"
    const snap = await getDoc(problemDoc(String(pid)));
    problemTitle.value = snap.exists() ? snap.data().title : null;
  },
  { immediate: true }
);

// ---- Estado base ----
const loading = ref(false);
const error = ref<string | null>(null);
const attemptsAll = ref<Attempt[]>([]);
const students = ref<Student[]>([]);
const selectedUid = ref<string | null>(null); // filtro por UID (agregación)
const unsub = ref<Unsubscribe | null>(null);

// Navegación por problema (opcional)
const problemIdModel = ref<string>((route.params.problemId as string) ?? "");
watch(() => route.params.problemId, (pid) => (problemIdModel.value = (pid as string) ?? ""));
const modeLabel = computed(() =>
  route.params.problemId
    ? `Problema ${problemTitle.value ?? String(route.params.problemId)}`
    : "Todos"
);


// ---- Ordenamiento ----
const sortKey = ref<SortKey>("accuracy");
const sortDir = ref<SortDir>("desc");
function setSort(key: SortKey) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
  } else {
    sortKey.value = key;
    sortDir.value = key === "email" || key === "uid" ? "asc" : "desc";
  }
}
function iconFor(key: SortKey) {
  if (sortKey.value !== key) return "↕";
  return sortDir.value === "asc" ? "▲" : "▼";
}

// ---- Búsqueda por email / UID (a nivel alumnos) ----
const emailQuery = ref("");

// ---- Paginación (cliente) ----
const pageSize = ref(10);
const page = ref(1);

// ---- Firestore ----
function isCorrectAttempt(a: Attempt): boolean {
  return !!a.isCorrect;
}

function buildAttemptsQuery() {
  const problemId = route.params.problemId as string | undefined;
  if (problemId) {
    // ⚠️ Requiere índice compuesto: problemId Asc + answeredAt Desc
    return query(colAttempts, where("problemId", "==", problemId), orderBy("answeredAt", "desc"));
  }
  return query(colAttempts, orderBy("answeredAt", "desc"));
}

function subscribeAttempts() {
  loading.value = true;
  error.value = null;
  if (unsub.value) unsub.value();

  const qRef = buildAttemptsQuery();
  unsub.value = onSnapshot(
    qRef,
    (snap) => {
      const arr: Attempt[] = [];
      snap.forEach((doc) => {
        const data = doc.data() as Attempt;
        (data as any).id = (data as any).id ?? doc.id;
        arr.push(data);
      });
      attemptsAll.value = arr;
      recomputeStudents();
      loading.value = false;
    },
    (err) => {
      console.error(err);
      error.value = err.message ?? "Error al escuchar intentos";
      loading.value = false;
    }
  );
}

function recomputeStudents() {
  const map = new Map<string, Student>();

  const filtered = selectedUid.value
    ? attemptsAll.value.filter((a) => a.userUid === selectedUid.value)
    : attemptsAll.value;

  for (const a of filtered) {
    const uid = a.userUid;
    if (!uid) continue;
    const email = a.userEmail;

    if (!map.has(uid)) map.set(uid, { uid, email, total: 0, correct: 0, accuracy: 0 });
    const entry = map.get(uid)!;
    entry.total += 1;
    if (isCorrectAttempt(a)) entry.correct += 1;
  }

  students.value = Array.from(map.values()).map((s) => ({
    ...s,
    accuracy: s.total ? Number(((s.correct / s.total) * 100).toFixed(1)) : 0,
  }));
}

// Arranques / watchers
subscribeAttempts();
watch(selectedUid, () => { recomputeStudents(); page.value = 1; });
watch(() => route.params.problemId, () => { subscribeAttempts(); page.value = 1; });
watch([emailQuery, pageSize], () => { page.value = 1; });
onBeforeUnmount(() => { if (unsub.value) unsub.value(); });

// ---- Pipe de datos para UI: ordenar → filtrar (email/uid) → paginar ----
const studentsSorted = computed(() => {
  const k = sortKey.value;
  const d = sortDir.value;
  const dir = d === "asc" ? 1 : -1;

  return [...students.value].sort((a, b) => {
    let va: string | number = "";
    let vb: string | number = "";
    if (k === "email") { va = a.email ?? ""; vb = b.email ?? ""; }
    else if (k === "uid") { va = a.uid; vb = b.uid; }
    else if (k === "total") { va = a.total; vb = b.total; }
    else if (k === "correct") { va = a.correct; vb = b.correct; }
    else { va = a.accuracy; vb = b.accuracy; }

    if (typeof va === "string" && typeof vb === "string") {
      const cmp = va.localeCompare(vb);
      if (cmp !== 0) return cmp * dir;
    } else {
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
    }

    if (k !== "accuracy" && a.accuracy !== b.accuracy) return (b.accuracy - a.accuracy);
    if (k !== "total" && a.total !== b.total) return (b.total - a.total);
    if (k !== "correct" && a.correct !== b.correct) return (b.correct - a.correct);
    return a.uid.localeCompare(b.uid);
  });
});

const studentsSortedFiltered = computed(() => {
  const q = emailQuery.value.trim().toLowerCase();
  if (!q) return studentsSorted.value;
  return studentsSorted.value.filter((s) =>
    (s.email ?? "").toLowerCase().includes(q) || s.uid.toLowerCase().includes(q)
  );
});

const totalRows = computed(() => studentsSortedFiltered.value.length);
const pageCount = computed(() => Math.max(1, Math.ceil(totalRows.value / pageSize.value)));
const pageStart = computed(() => (totalRows.value === 0 ? 0 : (page.value - 1) * pageSize.value + 1));
const pageEnd = computed(() => Math.min(totalRows.value, (page.value) * pageSize.value));
const pagedStudents = computed(() =>
  studentsSortedFiltered.value.slice((page.value - 1) * pageSize.value, (page.value) * pageSize.value)
);

// ---- Panel de detalle por alumno + TOGGLE ----
const detailOpen = ref(false);
const detailStudent = ref<Student | null>(null);
type DetailFilter = "all" | "correct" | "incorrect";
const detailFilter = ref<DetailFilter>("all");

function openDetail(s: Student) {
  detailStudent.value = s;
  detailFilter.value = "all";
  detailOpen.value = true;
}
function closeDetail() {
  detailOpen.value = false;
  detailStudent.value = null;
}

const detailBase = computed(() => {
  if (!detailStudent.value) return [];
  const pid = route.params.problemId as string | undefined;
  const list = attemptsAll.value.filter(
    (a) => a.userUid === detailStudent.value!.uid && (!pid || a.problemId === pid)
  );
  // fecha desc
  return list.sort((a, b) => {
    const ta = (a as any).answeredAt?.seconds ?? 0;
    const tb = (b as any).answeredAt?.seconds ?? 0;
    return tb - ta;
  });
});

const detailAttempts = computed(() => {
  if (detailFilter.value === "all") return detailBase.value;
  if (detailFilter.value === "correct") return detailBase.value.filter((a) => a.isCorrect);
  return detailBase.value.filter((a) => !a.isCorrect);
});

const detailStats = computed(() => {
  const total = detailBase.value.length;
  const correct = detailBase.value.filter((a) => a.isCorrect).length;
  const incorrect = total - correct;
  return { total, correct, incorrect };
});

// NUEVO: resumen del subconjunto visible (según toggle)
const detailStatsFiltered = computed(() => {
  const total = detailAttempts.value.length;
  const correct = detailAttempts.value.filter((a) => a.isCorrect).length;
  const incorrect = total - correct;
  const accuracy = total ? Number(((correct / total) * 100).toFixed(1)) : 0;
  return { total, correct, incorrect, accuracy };
});

function fmtDate(ts: any) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString();
}

// ---- Exportar CSV (respeta filtros y orden; exporta TODOS los filtrados) ----
function exportCSV() {
  if (!studentsSortedFiltered.value.length) return;
  const SEP = ","; // usa ";" si prefieres para Excel ES

  const headers = ["Estudiante", "UID", "Intentos", "Correctos", "% Acierto"];
  const rows = studentsSortedFiltered.value.map((s) => [
    s.email ?? "",
    s.uid,
    String(s.total),
    String(s.correct),
    String(s.accuracy),
  ]);

  const csvEscape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [
    headers.map(csvEscape).join(SEP),
    ...rows.map((r) => r.map(csvEscape).join(SEP)),
  ];

  const bom = "\ufeff";
  const csvContent = bom + lines.join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const ts = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const fname = `attempts_${route.params.problemId ? "problema_" + route.params.problemId : "todos"}_${ts.getFullYear()}${pad(ts.getMonth()+1)}${pad(ts.getDate())}_${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}.csv`;

  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", fname);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
</script>

<template>
  <section class="p-4">
    <!-- Navegación de modo -->
    <div class="mb-4 flex flex-wrap gap-2 items-center">
      <span class="text-sm px-2 py-1 rounded bg-gray-100">
        Modo: {{ modeLabel }}
      </span>

      <input
        v-model="problemIdModel"
        placeholder="ID de problema..."
        class="border rounded px-2 py-1 w-64"
      />

      <button class="border px-3 py-1 rounded" @click="router.push({ name: 'AttemptsView' })">
        Ver todos
      </button>
      <button
        class="border px-3 py-1 rounded"
        :disabled="!problemIdModel"
        @click="router.push({ name: 'AttemptsView', params: { problemId: problemIdModel } })"
      >
        Ir al problema
      </button>

      <button
        class="border px-3 py-1 rounded ml-auto"
        :disabled="loading || !!error || totalRows === 0"
        @click="exportCSV"
      >
        Exportar CSV
      </button>
    </div>

    <!-- Filtros de vista -->
    <div class="mb-3 flex flex-wrap gap-3 items-center">
      <div class="flex items-center gap-2">
        <label class="text-sm">Filtrar por UID (agregación):</label>
        <input
          v-model="selectedUid"
          placeholder="UID del estudiante (opcional)"
          class="border rounded px-2 py-1 w-64"
        />
        <button class="border px-3 py-1 rounded" @click="selectedUid = null">Limpiar filtro</button>
      </div>

      <div class="flex items-center gap-2">
        <label class="text-sm">Buscar (email o UID):</label>
        <input
          v-model="emailQuery"
          placeholder="Ej: juan@colegio.edu"
          class="border rounded px-2 py-1 w-64"
        />
      </div>

      <div class="flex items-center gap-2">
        <label class="text-sm">Filas por página:</label>
        <select v-model.number="pageSize" class="border rounded px-2 py-1">
          <option :value="5">5</option>
          <option :value="10">10</option>
          <option :value="20">20</option>
          <option :value="50">50</option>
        </select>
      </div>
    </div>

    <!-- Estados -->
    <div v-if="loading" class="text-sm">Cargando intentos...</div>
    <div v-else-if="error" class="text-red-600 text-sm">Error: {{ error }}</div>
    <div v-else-if="totalRows === 0" class="text-sm text-gray-500">Sin intentos aún.</div>

    <!-- Tabla + panel -->
    <div v-else class="relative">
      <table class="w-full text-sm border-collapse">
        <thead>
          <tr class="border-b">
            <th class="text-left py-2 cursor-pointer select-none" @click="setSort('email')">
              Estudiante <span class="text-xs">{{ iconFor('email') }}</span>
            </th>
            <th class="text-left py-2 cursor-pointer select-none" @click="setSort('uid')">
              UID <span class="text-xs">{{ iconFor('uid') }}</span>
            </th>
            <th class="text-right py-2 cursor-pointer select-none" @click="setSort('total')">
              Intentos <span class="text-xs">{{ iconFor('total') }}</span>
            </th>
            <th class="text-right py-2 cursor-pointer select-none" @click="setSort('correct')">
              Correctos <span class="text-xs">{{ iconFor('correct') }}</span>
            </th>
            <th class="text-right py-2 cursor-pointer select-none" @click="setSort('accuracy')">
              % Acierto <span class="text-xs">{{ iconFor('accuracy') }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="s in pagedStudents"
            :key="s.uid"
            class="border-b hover:bg-gray-50 cursor-pointer"
            @click="openDetail(s)"
            title="Ver intentos de este estudiante"
          >
            <td class="py-2">{{ s.email ?? "—" }}</td>
            <td class="py-2"><code class="text-xs">{{ s.uid }}</code></td>
            <td class="py-2 text-right">{{ s.total }}</td>
            <td class="py-2 text-right">{{ s.correct }}</td>
            <td class="py-2 text-right">
              <div class="flex items-center gap-2">
                <div class="w-32 h-2 rounded bg-gray-200 overflow-hidden">
                  <div
                    class="h-2 rounded"
                    :style="{ width: s.accuracy + '%', background: 'linear-gradient(90deg, rgba(34,197,94,1) 0%, rgba(59,130,246,1) 100%)' }"
                  ></div>
                </div>
                <span>{{ s.accuracy }}%</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Paginación -->
      <div class="mt-3 flex items-center gap-3">
        <span class="text-sm text-gray-600">
          Mostrando {{ pageStart }}–{{ pageEnd }} de {{ totalRows }}
        </span>

        <div class="ml-auto flex items-center gap-2">
          <button class="border px-3 py-1 rounded" :disabled="page === 1" @click="page--">Anterior</button>
          <span class="text-sm">Página {{ page }} / {{ pageCount }}</span>
          <button class="border px-3 py-1 rounded" :disabled="page === pageCount" @click="page++">Siguiente</button>
        </div>
      </div>

      <!-- Panel lateral de detalle con TOGGLE -->
      <div
        v-if="detailOpen"
        class="fixed inset-0 bg-black/30"
        @click.self="closeDetail"
        style="z-index: 50;"
      >
        <aside class="absolute right-0 top-0 h-full w-full sm:w-[420px] bg-white shadow-xl p-4 overflow-y-auto">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-lg font-semibold">
              Intentos de {{ detailStudent?.email ?? detailStudent?.uid }}
              <span v-if="route.params.problemId" class="text-sm text-gray-500">
                — Problema {{ route.params.problemId }}
              </span>
            </h2>
            <button class="border px-3 py-1 rounded" @click="closeDetail">Cerrar</button>
          </div>

          <!-- Toggle -->
          <div class="mb-2 flex flex-wrap items-center gap-2 text-sm">
            <span class="text-gray-600">Ver:</span>
            <button
              class="border px-2 py-1 rounded"
              :class="detailFilter === 'all' ? 'bg-gray-900 text-white' : ''"
              @click="detailFilter = 'all'"
              title="Todos los intentos"
            >
              Todos ({{ detailStats.total }})
            </button>
            <button
              class="border px-2 py-1 rounded"
              :class="detailFilter === 'correct' ? 'bg-green-600 text-white' : ''"
              @click="detailFilter = 'correct'"
              title="Solo correctos"
            >
              Correctos ({{ detailStats.correct }})
            </button>
            <button
              class="border px-2 py-1 rounded"
              :class="detailFilter === 'incorrect' ? 'bg-red-600 text-white' : ''"
              @click="detailFilter = 'incorrect'"
              title="Solo incorrectos"
            >
              Incorrectos ({{ detailStats.incorrect }})
            </button>
          </div>

          <!-- Resumen del subconjunto visible -->
          <div class="mb-3 text-sm text-gray-700">
            <strong>Resumen:</strong>
            Intentos: {{ detailStatsFiltered.total }} ·
            Correctos: {{ detailStatsFiltered.correct }} ·
            Incorrectos: {{ detailStatsFiltered.incorrect }} ·
            % Acierto: {{ detailStatsFiltered.accuracy }}%
          </div>

          <div v-if="detailAttempts.length === 0" class="text-sm text-gray-500">
            Sin intentos para este filtro.
          </div>

          <ul v-else class="space-y-2">
            <li
              v-for="a in detailAttempts"
              :key="(a as any).id ?? (a as any).answeredAt?.seconds"
              class="border rounded p-2"
            >
              <div class="flex items-center justify-between">
                <div class="text-sm">
                  <div><strong>Problema:</strong> {{ a.problemId }}</div>
                  <div><strong>Respuesta:</strong> índice {{ a.answerIndex }}</div>
                </div>
                <span
                  class="px-2 py-0.5 rounded text-xs"
                  :class="a.isCorrect ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'"
                >
                  {{ a.isCorrect ? 'Correcto' : 'Incorrecto' }}
                </span>
              </div>
              <div class="text-xs text-gray-500 mt-1">
                {{ fmtDate((a as any).answeredAt) }}
              </div>
            </li>
          </ul>
        </aside>
      </div>
    </div>
  </section>
</template>




