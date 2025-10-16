<!-- src/views/reports/AttemptsList.vue -->
<script setup lang="ts">
import { onMounted, ref, watchEffect, computed } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { storeToRefs } from "pinia";
import {
  getDocs, query, where, orderBy, limit, startAfter,
  doc, getDoc
} from "firebase/firestore";
import { colAttempts, colAssignments } from "@/services/firebase";
import { useProfileStore } from "@/stores/profile";
import StateBlock from "@/components/StateBlock.vue";

type Row = {
  id: string;
  assignmentId: string;
  assignmentTitle?: string;
  studentEmail?: string;
  correctCount?: number | null;
  total?: number | null;
  score?: number | null;
  startedAt?: any | null;
  finishedAt?: any | null;
  durationSec?: number | null;
};

const PAGE_SIZE = 50;

const profile = useProfileStore();
const { uid } = storeToRefs(profile);
const route = useRoute();

const loading = ref(false);
const error = ref("");
const rows = ref<Row[]>([]);
const titleByAssignment = ref<Record<string, string>>({});

// filtros y paginación
const assignments = ref<{ id: string; title: string }[]>([]);
const teacherAssignmentIds = ref<string[]>([]);
const filterAssignmentId = ref<string>("__all__");
let lastDoc: any = null;
const hasMore = ref(false);

// ===== Filtros rápidos =====
const range = ref<"all" | "today" | "7" | "30">("all");
const studentQuery = ref<string>("");
const status = ref<"all" | "completed" | "in-progress">("all");

// ===== Helpers =====
function fmtTs(ts: any): string {
  try {
    if (!ts) return "—";
    if (typeof ts.toDate === "function") return ts.toDate().toLocaleString();
    if (typeof ts.seconds === "number") return new Date(ts.seconds * 1000).toLocaleString();
    return new Date(ts).toLocaleString();
  } catch { return "—"; }
}
function secondsBetween(a: any, b: any): number | null {
  try {
    const ta = typeof a?.toDate === "function" ? a.toDate() : (a?.seconds ? new Date(a.seconds * 1000) : new Date(a));
    const tb = typeof b?.toDate === "function" ? b.toDate() : (b?.seconds ? new Date(b.seconds * 1000) : new Date(b));
    return Math.max(0, Math.round((tb.getTime() - ta.getTime()) / 1000));
  } catch { return null; }
}
function startDateForRange(): Date | null {
  const now = new Date();
  if (range.value === "today") return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (range.value === "7") { const d = new Date(now); d.setDate(now.getDate() - 7); return d; }
  if (range.value === "30") { const d = new Date(now); d.setDate(now.getDate() - 30); return d; }
  return null;
}
function asDate(ts: any): Date | null {
  try {
    if (!ts) return null;
    if (typeof ts.toDate === "function") return ts.toDate();
    if (typeof ts.seconds === "number") return new Date(ts.seconds * 1000);
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch { return null; }
}

// ===== Filtrado en memoria =====
const filteredRows = computed(() => {
  const sd = startDateForRange();
  const q = studentQuery.value.trim().toLowerCase();

  return rows.value.filter(r => {
    // estado
    const isCompleted = !!(r.finishedAt || (typeof r.score === "number"));
    if (status.value === "completed" && !isCompleted) return false;
    if (status.value === "in-progress" && isCompleted) return false;

    // rango sobre finishedAt (si no hay finishedAt, pasa para "in-progress" o "all")
    if (sd && r.finishedAt) {
      const d = asDate(r.finishedAt);
      if (d && d < sd) return false;
    }

    // alumno
    if (q && !(r.studentEmail || "").toLowerCase().includes(q)) return false;

    return true;
  });
});

// ===== Carga de combos =====
async function loadAssignmentsOptions() {
  const qs = await getDocs(query(colAssignments, where("ownerUid", "==", uid.value)));
  const list = qs.docs
    .map(d => ({ id: d.id, title: (d.data() as any).title || d.id }))
    .sort((a, b) => a.title.localeCompare(b.title));
  assignments.value = list;
  teacherAssignmentIds.value = list.map(x => x.id);
}

// ===== Utilidad: consulta attempts por assignmentId en lotes de 10 =====
async function getAttemptsByAssignmentIds(aids: string[]): Promise<Row[]> {
  const chunks: string[][] = [];
  for (let i = 0; i < aids.length; i += 10) chunks.push(aids.slice(i, i + 10));

  const allDocs: any[] = [];
  for (const chunk of chunks) {
    try {
      // Si añades orderBy aquí, es probable que Firestore pida índice compuesto; lo evitamos y ordenamos en memoria
      const qs = await getDocs(query(colAttempts, where("assignmentId", "in", chunk)));
      allDocs.push(...qs.docs);
    } catch (e) {
      // Si fallara IN por algún motivo, seguimos con el resto
      console.warn("[AttemptsList] IN query failed for chunk", chunk, e);
    }
  }

  const mapped: Row[] = allDocs.map((d) => {
    const data = d.data() as any;
    const duration =
      data.startedAt && data.finishedAt ? secondsBetween(data.startedAt, data.finishedAt) : null;
    return {
      id: d.id,
      assignmentId: data.assignmentId,
      assignmentTitle: data.assignmentTitle,
      studentEmail: data.studentEmail,
      correctCount: data.correctCount ?? null,
      total: data.total ?? null,
      score: typeof data.score === "number" ? data.score : null,
      startedAt: data.startedAt ?? null,
      finishedAt: data.finishedAt ?? null,
      durationSec: duration,
    };
  });

  // Unificamos y ordenamos por finishedAt desc (nulls al final)
  mapped.sort((a, b) => {
    const ta = asDate(a.finishedAt)?.getTime() ?? -Infinity;
    const tb = asDate(b.finishedAt)?.getTime() ?? -Infinity;
    return tb - ta;
  });

  return mapped;
}

// ===== Carga principal =====
async function load(reset = true) {
  if (!uid.value) return;

  if (reset) {
    rows.value = [];
    titleByAssignment.value = {};
    lastDoc = null;
    hasMore.value = false;
  }

  loading.value = true;
  error.value = "";
  try {
    if (filterAssignmentId.value === "__all__") {
      // ⬅️ NUEVO: “Todas” → traemos por assignmentIds del docente (incluye attempts sin ownerUid)
      const aids = teacherAssignmentIds.value;
      if (aids.length === 0) {
        rows.value = [];
      } else {
        rows.value = await getAttemptsByAssignmentIds(aids);
      }
      hasMore.value = false; // sin paginar para “Todas” (podemos añadirlo después)
    } else {
      // Asignación específica → antes estaba OK
      const clauses: any[] = [where("assignmentId", "==", filterAssignmentId.value)];

      let qy: any = query(colAttempts, ...clauses, orderBy("finishedAt", "desc"), limit(PAGE_SIZE));
      if (lastDoc) qy = query(colAttempts, ...clauses, orderBy("finishedAt", "desc"), startAfter(lastDoc), limit(PAGE_SIZE));

      let qs;
      try {
        qs = await getDocs(qy);
      } catch (e: any) {
        // Fallback si falta índice
        let base = query(colAttempts, ...clauses, limit(PAGE_SIZE));
        if (lastDoc) base = query(colAttempts, ...clauses, startAfter(lastDoc), limit(PAGE_SIZE));
        qs = await getDocs(base);
      }

      if (qs.docs.length > 0) lastDoc = qs.docs[qs.docs.length - 1];
      hasMore.value = qs.docs.length === PAGE_SIZE;

      const batch: Row[] = qs.docs.map((d) => {
        const data = d.data() as any;
        const duration =
          data.startedAt && data.finishedAt ? secondsBetween(data.startedAt, data.finishedAt) : null;
        return {
          id: d.id,
          assignmentId: data.assignmentId,
          assignmentTitle: data.assignmentTitle,
          studentEmail: data.studentEmail,
          correctCount: data.correctCount ?? null,
          total: data.total ?? null,
          score: typeof data.score === "number" ? data.score : null,
          startedAt: data.startedAt ?? null,
          finishedAt: data.finishedAt ?? null,
          durationSec: duration,
        };
      });

      rows.value = reset ? batch : [...rows.value, ...batch];
    }

    // completar títulos faltantes
    const missing = Array.from(new Set(rows.value.filter(x => !x.assignmentTitle).map(x => x.assignmentId)));
    await Promise.all(missing.map(async (aid) => {
      const snap = await getDoc(doc(colAssignments, aid));
      titleByAssignment.value[aid] = snap.exists() ? ((snap.data() as any).title || aid) : aid;
    }));
  } catch (e: any) {
    console.error("[AttemptsList] error:", e);
    error.value = e?.message ?? "No se pudo cargar el listado.";
  } finally {
    loading.value = false;
  }
}

// ===== Utilidades UI =====
function exportCSV() {
  const HEADER = ["Asignación","Alumno","Puntaje","Aciertos","Duración","Finalizado"];
  const DELIM = ";"; const EOL = "\r\n"; const BOM = "\uFEFF";
  const quote = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

  const lines = filteredRows.value.map(r => {
    const title = r.assignmentTitle || titleByAssignment.value[r.assignmentId] || r.assignmentId;
    const email = r.studentEmail || "";
    const score = r.score != null ? `${r.score}%` : "—";
    const hits  = (r.correctCount != null && r.total != null) ? `${r.correctCount}/${r.total}` : "—";
    const dur   = r.durationSec != null ? `${r.durationSec}s` : "—";
    const fin   = fmtTs(r.finishedAt);
    return [quote(title), quote(email), score, hits, dur, quote(fin)].join(DELIM);
  });

  const csv = BOM + [HEADER.join(DELIM), ...lines].join(EOL);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "attempts.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function onFilterChange() {
  load(true);
}

// ===== Arranque =====
onMounted(() => {
  if (!profile.ready) profile.init?.();

  // Prellenar desde query ?assignmentId=...
  const qAid = (route.query.assignmentId as string | undefined) ?? "__all__";
  if (qAid && qAid !== filterAssignmentId.value) {
    filterAssignmentId.value = qAid;
  }

  let started = false;
  watchEffect(() => {
    if (!started && profile.ready && uid.value) {
      started = true;
      loadAssignmentsOptions().then(() => load(true));
    }
  });
});
</script>

<template>
  <section class="max-w-7xl mx-auto p-4">
    <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
      <h1 class="text-2xl font-bold">Intentos de mis alumnos</h1>
      <div class="flex flex-wrap items-center gap-2">
        <label class="text-sm">Asignación:</label>
        <select class="border rounded px-2 py-1" v-model="filterAssignmentId" @change="onFilterChange">
          <option value="__all__">Todas</option>
          <option v-for="a in assignments" :key="a.id" :value="a.id">{{ a.title }}</option>
        </select>

        <!-- Filtros rápidos -->
        <div class="flex items-center gap-1 ml-2">
          <button class="px-2 py-1 border rounded" :class="range==='all' ? 'font-semibold' : ''" @click="range='all'">Todo</button>
          <button class="px-2 py-1 border rounded" :class="range==='today' ? 'font-semibold' : ''" @click="range='today'">Hoy</button>
          <button class="px-2 py-1 border rounded" :class="range==='7' ? 'font-semibold' : ''" @click="range='7'">7 días</button>
          <button class="px-2 py-1 border rounded" :class="range==='30' ? 'font-semibold' : ''" @click="range='30'">30 días</button>
        </div>

        <!-- Filtro por estado -->
        <div class="flex items-center gap-1 ml-2">
          <label class="text-sm">Estado:</label>
          <select class="border rounded px-2 py-1" v-model="status">
            <option value="all">Todos</option>
            <option value="completed">Completados</option>
            <option value="in-progress">En progreso</option>
          </select>
        </div>

        <!-- Filtro por alumno -->
        <input
          class="border rounded px-2 py-1 ml-2"
          type="text"
          v-model="studentQuery"
          placeholder="Buscar alumno (email)"
        />

        <button class="px-3 py-1.5 rounded border" @click="load(true)" :disabled="loading" :aria-busy="loading">
          Actualizar
        </button>
        <button class="px-3 py-1.5 rounded border" @click="exportCSV" :disabled="filteredRows.length===0">
          Exportar CSV
        </button>
      </div>
    </div>

    <StateBlock v-if="loading && rows.length===0" state="loading" />
    <StateBlock v-else-if="error" state="error" :message="error">
      <template #actions>
        <div class="mt-3">
          <button class="px-3 py-1.5 rounded border" @click="load(true)">Reintentar</button>
        </div>
      </template>
    </StateBlock>
    <StateBlock
      v-else-if="filteredRows.length === 0"
      state="empty"
      :title="filterAssignmentId==='__all__' ? 'Aún no hay intentos.' : 'No hay intentos para esta asignación.'"
      :subtitle="filterAssignmentId==='__all__' ? 'Cuando tus alumnos empiecen a resolver, verás los registros aquí.' : 'Prueba con otra asignación o quita filtros.'"
    />

    <div v-else class="overflow-auto">
      <table class="min-w-full text-sm">
        <thead>
          <tr class="text-left border-b">
            <th class="py-2 pr-4">Asignación</th>
            <th class="py-2 pr-4">Alumno</th>
            <th class="py-2 pr-4">Puntaje</th>
            <th class="py-2 pr-4">Aciertos</th>
            <th class="py-2 pr-4">Duración</th>
            <th class="py-2 pr-4">Finalizado</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in filteredRows" :key="r.id" class="border-b">
            <td class="py-2">
              <RouterLink
                :to="{ name: 'AttemptDetail', params: { id: r.id } }"
                class="underline decoration-dotted"
              >
                {{ r.assignmentTitle || titleByAssignment[r.assignmentId] || r.assignmentId }}
              </RouterLink>
            </td>
            <td class="py-1 pr-4">
              <RouterLink
                :to="{ name: 'AttemptDetail', params: { id: r.id } }"
                class="underline decoration-dotted">
                {{ r.studentEmail || "—" }}
              </RouterLink>
            </td>
            <td class="py-1 pr-4">{{ r.score != null ? r.score + "%" : "—" }}</td>
            <td class="py-1 pr-4">
              <span v-if="r.correctCount != null && r.total != null">{{ r.correctCount }}/{{ r.total }}</span>
              <span v-else>—</span>
            </td>
            <td class="py-1 pr-4">
              <span v-if="r.durationSec != null">{{ r.durationSec }}s</span>
              <span v-else>—</span>
            </td>
            <td class="py-1 pr-4">{{ fmtTs(r.finishedAt) }}</td>
          </tr>
        </tbody>
      </table>

      <div class="mt-3">
        <button v-if="hasMore" class="px-3 py-1.5 rounded border" @click="load(false)" :disabled="loading" :aria-busy="loading">
          Cargar más
        </button>
      </div>
    </div>
  </section>
</template>





