<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useProfileStore } from "@/stores/profile";
import { storeToRefs } from "pinia";

type Assignment = { id: string; title?: string; problemIds?: string[]; ownerUid: string };
type Attempt = {
  id: string;
  assignmentId: string;
  studentUid: string;
  studentEmail?: string;
  score?: number;
  durationSec?: number;
  startedAt?: any;
  finishedAt?: any;
  status?: "in_progress" | "finished";
  answers?: { problemId: string; selectedIndex: number; correct: boolean }[];
};

const profile = useProfileStore();
const { uid } = storeToRefs(profile);

const loading = ref(true);
const assignments = ref<Assignment[]>([]);
const selectedId = ref<string | null>(null);

const attempts = ref<Attempt[]>([]);

onMounted(async () => {
  loading.value = true;
  // Trae asignaciones del maestro
  const qs = await getDocs(
    query(collection(db, "assignments"), where("ownerUid", "==", uid.value))
  );
  assignments.value = qs.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as Assignment[];
  selectedId.value = assignments.value[0]?.id ?? null;
  loading.value = false;
});

watch(selectedId, async (id) => {
  attempts.value = [];
  if (!id) return;
  const qs = await getDocs(
    query(collection(db, "attempts"), where("assignmentId", "==", id))
  );
  attempts.value = qs.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as Attempt[];
});

// agregados simples
const rows = computed(() =>
  attempts.value
    .filter(a => a.status === "finished")
    .map(a => ({
      id: a.id,
      student: a.studentEmail || a.studentUid,
      score: a.score ?? 0,
      duration: a.durationSec ?? 0,
      finishedAt: a.finishedAt?.toDate?.() ?? null,
    }))
);

const itemStats = computed(() => {
  const stats: Record<string, { correct: number; total: number }> = {};
  for (const at of attempts.value) {
    if (!Array.isArray(at.answers)) continue;
    for (const ans of at.answers) {
      const s = (stats[ans.problemId] ||= { correct: 0, total: 0 });
      s.total += 1;
      if (ans.correct) s.correct += 1;
    }
  }
  return stats;
});
</script>

<template>
  <div class="p-4 max-w-5xl mx-auto space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-semibold">Reporte por asignación</h1>
      <div v-if="assignments.length">
        <select v-model="selectedId" class="border rounded px-3 py-2">
          <option v-for="a in assignments" :key="a.id" :value="a.id">
            {{ a.title || a.id }}
          </option>
        </select>
      </div>
    </div>

    <div v-if="loading">Cargando…</div>

    <div v-else>
      <h2 class="text-lg font-medium mb-2">Intentos</h2>
      <div class="overflow-auto">
        <table class="min-w-full border text-sm">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-3 py-2 text-left border">Alumno</th>
              <th class="px-3 py-2 text-left border">Score</th>
              <th class="px-3 py-2 text-left border">Duración (s)</th>
              <th class="px-3 py-2 text-left border">Finalizado</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.id">
              <td class="px-3 py-2 border">{{ r.student }}</td>
              <td class="px-3 py-2 border">{{ r.score }}</td>
              <td class="px-3 py-2 border">{{ r.duration }}</td>
              <td class="px-3 py-2 border">{{ r.finishedAt ? r.finishedAt.toLocaleString() : "-" }}</td>
            </tr>
            <tr v-if="rows.length === 0">
              <td class="px-3 py-6 text-center text-gray-500" colspan="4">Sin datos.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 class="text-lg font-medium mt-6 mb-2">% Correcto por problema</h2>
      <div class="grid md:grid-cols-2 gap-3">
        <div
          v-for="(s, pid) in itemStats"
          :key="pid"
          class="border rounded p-3"
        >
          <div class="font-medium">Problema {{ pid }}</div>
          <div class="text-sm text-gray-600">
            {{ s.correct }} / {{ s.total }} correctos
            ({{ s.total ? Math.round((100*s.correct)/s.total) : 0 }}%)
          </div>
        </div>
        <div v-if="Object.keys(itemStats).length === 0" class="text-gray-500">
          Sin respuestas aún.
        </div>
      </div>
    </div>
  </div>
</template>




