<template>
  <div class="p-4 max-w-6xl mx-auto">
    <h1 class="text-2xl font-bold mb-4">Reporte por asignación</h1>

    <div class="text-sm text-gray-600 mb-4">
      Asignación: <span class="font-mono">{{ assignmentId }}</span>
    </div>

    <div v-if="loading">Cargando…</div>
    <div v-else>
      <div class="grid gap-4 md:grid-cols-3 mb-6">
        <div class="bg-white rounded-xl p-4 shadow">
          <div class="text-sm text-gray-500">Intentos entregados</div>
          <div class="text-3xl font-bold">{{ attempts.length }}</div>
        </div>
        <div class="bg-white rounded-xl p-4 shadow">
          <div class="text-sm text-gray-500">Respuestas totales</div>
          <div class="text-3xl font-bold">{{ totalAnswers }}</div>
        </div>
        <div class="bg-white rounded-xl p-4 shadow">
          <div class="text-sm text-gray-500">Precisión global</div>
          <div class="text-3xl font-bold">
            {{ totalAnswers ? ((totalCorrect / totalAnswers) * 100).toFixed(1) : '0.0' }}%
          </div>
        </div>
      </div>

      <div class="bg-white rounded-xl p-4 shadow overflow-auto">
        <table class="min-w-full text-sm">
          <thead>
            <tr class="text-left border-b">
              <th class="p-2">Estudiante</th>
              <th class="p-2">Entregado</th>
              <th class="p-2"># Resp.</th>
              <th class="p-2"># Correctas</th>
              <th class="p-2">% Acierto</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in attempts" :key="a.id" class="border-b">
              <td class="p-2">
                {{ a.studentEmail || a.studentUid }}
              </td>
              <td class="p-2">{{ fmt(a.finishedAt) }}</td>
              <td class="p-2">{{ (a.answers?.length ?? 0) }}</td>
              <td class="p-2">{{ (a.answers?.filter(x => x.correct).length ?? 0) }}</td>
              <td class="p-2">
                {{
                  (a.answers?.length ?? 0)
                    ? (((a.answers?.filter(x => x.correct).length ?? 0) / (a.answers?.length ?? 1)) * 100).toFixed(1)
                    : '0.0'
                }}%
              </td>
            </tr>
          </tbody>
        </table>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRoute } from "vue-router";
import { getDocs, query, where } from "firebase/firestore";
import { colAttempts, type Attempt } from "@/services/firebase";

// ruta
const route = useRoute();
const assignmentId = route.params.id as string;

// estado
const loading = ref(true);
const attempts = ref<Attempt[]>([]);

onMounted(async () => {
  try {
    if (!assignmentId) {
      attempts.value = [];
      return;
    }
    const q = query(colAttempts, where("assignmentId", "==", assignmentId));
    const snap = await getDocs(q);
    const items = snap.docs
      .map(d => ({ id: d.id, ...(d.data() as Attempt) }))
      // considera solo entregados
      .filter(a => (a as Attempt)?.finishedAt);
    attempts.value = items;
  } finally {
    loading.value = false;
  }
});

const totalAnswers = computed(() =>
  attempts.value.reduce((acc, a) => acc + (a.answers?.length ?? 0), 0)
);

const totalCorrect = computed(() =>
  attempts.value.reduce((acc, a) => acc + (a.answers?.filter(x => x.correct).length ?? 0), 0)
);

// formato
function fmt(x: any) {
  if (!x) return "—";
  // Timestamp de Firestore
  // @ts-ignore
  if (typeof x?.toDate === "function") return x.toDate().toLocaleString();
  if (typeof x === "number") return new Date(x).toLocaleString();
  return String(x);
}
</script>

<style scoped>
</style>
