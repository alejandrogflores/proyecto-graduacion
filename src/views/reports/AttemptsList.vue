<script setup lang="ts">
import { onMounted, ref, watchEffect } from "vue";
import { RouterLink } from "vue-router";
import { storeToRefs } from "pinia";
import {
  getDocs, query, where, orderBy, limit, startAfter,
  doc, getDoc
} from "firebase/firestore";
import { colAttempts, colAssignments } from "@/services/firebase";
import { useProfileStore } from "@/stores/profile";

type Row = {
  id: string;
  assignmentId: string;
  assignmentTitle?: string;
  studentEmail?: string;
  correctCount?: number;
  total?: number;
  score?: number;
  startedAt?: any;
  finishedAt?: any;
  durationSec?: number | null;
};

const PAGE_SIZE = 50;

const profile = useProfileStore();
const { uid } = storeToRefs(profile);

const loading = ref(false);
const error = ref("");
const rows = ref<Row[]>([]);
const titleByAssignment = ref<Record<string, string>>({});

// filtros y paginación
const assignments = ref<{ id: string; title: string }[]>([]);
const filterAssignmentId = ref<string>("__all__");
let lastDoc: any = null;
const hasMore = ref(false);

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

async function loadAssignmentsOptions() {
  const qs = await getDocs(query(colAssignments, where("ownerUid", "==", uid.value)));
  assignments.value = qs.docs
    .map(d => ({ id: d.id, title: (d.data() as any).title || d.id }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

async function load(reset = true) {
  if (!uid.value) return;

  if (reset) {
    rows.value = [];
    titleByAssignment.value = {};
    lastDoc = null;
  }

  loading.value = true;
  error.value = "";
  try {
    const clauses: any[] = [where("ownerUid", "==", uid.value)];
    if (filterAssignmentId.value !== "__all__") {
      clauses.push(where("assignmentId", "==", filterAssignmentId.value));
    }

    let qy: any = query(colAttempts, ...clauses, orderBy("finishedAt", "desc"), limit(PAGE_SIZE));
    if (lastDoc) qy = query(colAttempts, ...clauses, orderBy("finishedAt", "desc"), startAfter(lastDoc), limit(PAGE_SIZE));

    let qs;
    try {
      qs = await getDocs(qy);
    } catch (e: any) {
      // fallback si falta índice
      if (String(e?.message || "").includes("index")) {
        let base = query(colAttempts, ...clauses, limit(PAGE_SIZE));
        if (lastDoc) base = query(colAttempts, ...clauses, startAfter(lastDoc), limit(PAGE_SIZE));
        qs = await getDocs(base);
      } else {
        throw e;
      }
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
        correctCount: data.correctCount,
        total: data.total,
        score: data.score,
        startedAt: data.startedAt,
        finishedAt: data.finishedAt,
        durationSec: duration,
      };
    });

    rows.value = reset ? batch : [...rows.value, ...batch];

    // completar títulos faltantes
    const missing = Array.from(new Set(batch.filter(x => !x.assignmentTitle).map(x => x.assignmentId)));
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

function exportCSV() {
  const HEADER = ["Asignación","Alumno","Puntaje","Aciertos","Duración","Finalizado"];
  const DELIM = ";";                 // Excel ES suele preferir ';'
  const EOL = "\r\n";
  const BOM = "\uFEFF";              // <- para que Excel reconozca UTF-8

  const quote = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

  const lines = rows.value.map(r => {
    const title = r.assignmentTitle || titleByAssignment.value[r.assignmentId] || r.assignmentId;
    const email = r.studentEmail || "";
    const score = r.score != null ? `${r.score}%` : "";
    const hits  = `${r.correctCount ?? ""}/${r.total ?? ""}`;
    const dur   = r.durationSec != null ? `${r.durationSec}s` : "";
    const fin   = fmtTs(r.finishedAt);

    return [quote(title), quote(email), score, hits, dur, quote(fin)].join(DELIM);
  });

  const csv = BOM + [HEADER.join(DELIM), ...lines].join(EOL);

  // Puedes dejar text/csv o usar vnd.ms-excel si lo prefieres:
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  // const blob = new Blob([csv], { type: "application/vnd.ms-excel" });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "attempts.csv";   // extensión .csv para que no lo abra Word
  a.click();
  URL.revokeObjectURL(url);
}

function onFilterChange() {
  load(true);
}

onMounted(() => {
  if (!profile.ready) profile.init?.();
  let started = false;
  watchEffect(() => {
    if (!started && profile.ready && uid.value) {
      started = true;
      loadAssignmentsOptions();
      load(true);
    }
  });
});
</script>

<template>
  <section class="max-w-7xl mx-auto p-4">
    <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
      <h1 class="text-2xl font-bold">Intentos de mis alumnos</h1>
      <div class="flex items-center gap-2">
        <label class="text-sm">Asignación:</label>
        <select class="border rounded px-2 py-1" v-model="filterAssignmentId" @change="onFilterChange">
          <option value="__all__">Todas</option>
          <option v-for="a in assignments" :key="a.id" :value="a.id">{{ a.title }}</option>
        </select>

        <button class="px-3 py-1.5 rounded border" @click="load(true)" :disabled="loading">
          Actualizar
        </button>
        <button class="px-3 py-1.5 rounded border" @click="exportCSV" :disabled="rows.length===0">
          Exportar CSV
        </button>
      </div>
    </div>

    <p v-if="loading && rows.length===0">Cargando…</p>
    <p v-else-if="error" class="text-red-600">{{ error }}</p>

    <div v-else-if="rows.length === 0" class="text-gray-600">No hay intentos.</div>

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
          <tr v-for="r in rows" :key="r.id" class="border-b">
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
            <td class="py-1 pr-4">{{ r.correctCount ?? "—" }}/{{ r.total ?? "—" }}</td>
            <td class="py-1 pr-4">
              <span v-if="r.durationSec != null">{{ r.durationSec }}s</span>
              <span v-else>—</span>
            </td>
            <td class="py-1 pr-4">{{ fmtTs(r.finishedAt) }}</td>
          </tr>
        </tbody>
      </table>

      <div class="mt-3">
        <button v-if="hasMore" class="px-3 py-1.5 rounded border" @click="load(false)" :disabled="loading">
          Cargar más
        </button>
      </div>
    </div>
  </section>
</template>



