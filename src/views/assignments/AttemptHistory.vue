<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { getDocs, query, where } from "firebase/firestore";
import { storeToRefs } from "pinia";
import { useProfileStore } from "@/stores/profile";
import { colAttempts } from "@/services/firebase";
import StatusChip from "@/components/StatusChip.vue";

type Attempt = {
  id: string;
  assignmentId: string;
  assignmentTitle?: string;
  status?: "in_progress" | "finished";
  correctCount?: number;
  total?: number;
  score?: number;
  durationSec?: number | null;
  startedAt?: any;
  finishedAt?: any;
};

const router = useRouter();
const profile = useProfileStore();
const { uid } = storeToRefs(profile);

const loading = ref(true);
const attempts = ref<Attempt[]>([]);

// UI: filtro
const filter = ref<"all" | "in_progress" | "finished">("all");

onMounted(load);
async function load() {
  try {
    const qs = await getDocs(
      query(colAttempts, where("studentUid", "==", uid.value))
    );
    attempts.value = qs.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  } finally {
    loading.value = false;
  }
}

const attemptsSorted = computed(() => {
  return [...attempts.value].sort((a, b) => {
    const aT = a.finishedAt?.toMillis?.() ?? a.startedAt?.toMillis?.() ?? 0;
    const bT = b.finishedAt?.toMillis?.() ?? b.startedAt?.toMillis?.() ?? 0;
    return bT - aT;
  });
});

const attemptsFiltered = computed(() => {
  if (filter.value === "all") return attemptsSorted.value;
  return attemptsSorted.value.filter((a) => {
    const st = (a.status ?? (a.finishedAt ? "finished" : "in_progress")) as
      | "finished"
      | "in_progress";
    return st === filter.value;
  });
});

function fmtDate(ts: any) {
  const ms = ts?.toMillis?.();
  return ms ? new Date(ms).toLocaleString() : "—";
}
function fmtDur(sec?: number | null) {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

function onAction(at: Attempt) {
  const st = at.status ?? (at.finishedAt ? "finished" : "in_progress");
  if (st === "finished") {
    router.push({
      name: "AssignmentResult",
      params: { id: at.assignmentId },
      query: { attempt: at.id },
    });
  } else {
    router.push({ path: `/assignments/${at.assignmentId}/solve` });
  }
}

function exportCsv() {
  const rows: string[][] = [
    ["Asignación", "Estado", "Puntaje", "Correctas", "Duración (s)", "Finalizado", "AttemptId"],
  ];
  attemptsFiltered.value.forEach((a) => {
    const st = a.status ?? (a.finishedAt ? "finished" : "in_progress");
    const dur = a.durationSec ?? "";
    const finISO = a.finishedAt?.toDate ? a.finishedAt.toDate().toISOString() : "";
    rows.push([
      a.assignmentTitle || a.assignmentId,
      st,
      (a.score ?? "").toString(),
      a.correctCount != null && a.total != null ? `${a.correctCount}/${a.total}` : "",
      dur.toString(),
      finISO,
      a.id,
    ]);
  });
  const csv = rows
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "attempts_history.csv";
  a.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <div class="p-4 max-w-5xl mx-auto">
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-2xl font-semibold">Historial de intentos</h1>

      <div class="flex items-center gap-2">
        <!-- Filtros -->
        <div class="inline-flex rounded-lg border overflow-hidden">
          <button
            class="px-3 py-1.5 text-sm"
            :class="filter==='all' ? 'bg-gray-900 text-white' : 'bg-white'"
            @click="filter = 'all'"
          >
            Todos
          </button>
          <button
            class="px-3 py-1.5 text-sm border-l"
            :class="filter==='in_progress' ? 'bg-gray-900 text-white' : 'bg-white'"
            @click="filter = 'in_progress'"
          >
            En curso
          </button>
          <button
            class="px-3 py-1.5 text-sm border-l"
            :class="filter==='finished' ? 'bg-gray-900 text-white' : 'bg-white'"
            @click="filter = 'finished'"
          >
            Finalizados
          </button>
        </div>

        <!-- Export -->
        <button
          class="px-3 py-1.5 text-sm rounded-lg border hover:bg-gray-50"
          @click="exportCsv"
        >
          Exportar CSV
        </button>

        <!-- Volver -->
        <router-link
          to="/assignments/my"
          class="px-3 py-1.5 text-sm rounded-lg border hover:bg-gray-50"
        >
          ← Volver
        </router-link>
      </div>
    </div>

    <div v-if="loading">Cargando…</div>

    <div v-else>
      <div v-if="attemptsFiltered.length === 0" class="text-gray-600">
        No hay intentos en este filtro.
      </div>

      <div v-else class="overflow-x-auto rounded-xl border">
        <table class="min-w-full text-sm">
          <thead class="bg-gray-50 text-gray-600">
            <tr>
              <th class="text-left p-3">Asignación</th>
              <th class="text-left p-3">Estado</th>
              <th class="text-left p-3">Puntaje</th>
              <th class="text-left p-3">Correctas</th>
              <th class="text-left p-3">Duración</th>
              <th class="text-left p-3">Finalizado</th>
              <th class="text-right p-3">Acción</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="at in attemptsFiltered" :key="at.id" class="border-t">
              <td class="p-3">{{ at.assignmentTitle || at.assignmentId }}</td>
              <td class="p-3">
                <StatusChip :status="(at.status ?? (at.finishedAt ? 'finished' : 'in_progress')) as any" />
              </td>
              <td class="p-3">{{ at.score ?? '—' }}</td>
              <td class="p-3">
                {{ at.correctCount != null && at.total != null ? `${at.correctCount}/${at.total}` : '—' }}
              </td>
              <td class="p-3">{{ fmtDur(at.durationSec) }}</td>
              <td class="p-3">{{ fmtDate(at.finishedAt) }}</td>
              <td class="p-3 text-right">
                <button
                  class="px-3 py-1.5 rounded-lg bg-black text-white text-xs"
                  @click="onAction(at)"
                >
                  {{ (at.status === 'finished' || at.finishedAt) ? 'Ver resultados' : 'Continuar' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

    </div>
  </div>
</template>

