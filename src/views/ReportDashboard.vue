<template>
  <div class="p-4 max-w-6xl mx-auto">
    <h1 class="text-2xl font-bold mb-4">Reportes (Dashboard)</h1>

    <div class="grid gap-4 md:grid-cols-3">
      <div class="bg-white rounded-xl p-4 shadow">
        <div class="text-sm text-gray-500">Intentos (entregados)</div>
        <div class="text-3xl font-bold">{{ deliveredCount }}</div>
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

    <div class="mt-6 bg-white rounded-xl p-4 shadow">
      <h2 class="text-xl font-semibold mb-3">Rendimiento por problema</h2>
      <div v-if="!uniqueProblemIds.length" class="text-gray-600">No hay datos aún.</div>
      <div v-else class="overflow-auto">
        <table class="min-w-full text-sm">
          <thead>
            <tr class="text-left border-b">
              <th class="p-2">Problema</th>
              <th class="p-2"># Resp.</th>
              <th class="p-2"># Correctas</th>
              <th class="p-2">% Acierto</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="pid in uniqueProblemIds" :key="pid" class="border-b">
              <td class="p-2">
                {{ problems[pid]?.title || pid }}
              </td>
              <td class="p-2">{{ stats[pid]?.total ?? 0 }}</td>
              <td class="p-2">{{ stats[pid]?.correct ?? 0 }}</td>
              <td class="p-2">
                {{ (stats[pid]?.total ?? 0) ? (((stats[pid]?.correct ?? 0) / (stats[pid]?.total ?? 1)) * 100).toFixed(1) : '0.0' }}%
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, watchEffect } from "vue";
import { getDocs, query, where } from "firebase/firestore";
import { colAttempts, colProblems, type Attempt } from "@/services/firebase";
import { useProfileStore } from "@/stores/profile";
import type { Problem } from "@/models/problem";

// estado
const profile = useProfileStore();
const attempts = ref<Attempt[]>([]);
const problems = ref<Record<string, Problem>>({});

// carga de intentos: si eres student -> por studentUid, si eres teacher -> por ownerUid
async function loadAttempts() {
  const uid = profile.uid;
  if (!uid) {
    attempts.value = [];
    return;
  }
  const isTeacher = profile.role === "teacher" || profile.role === "admin";
  const q = isTeacher
    ? query(colAttempts, where("ownerUid", "==", uid))
    : query(colAttempts, where("studentUid", "==", uid));

  const snap = await getDocs(q);
  attempts.value = snap.docs.map(d => ({ id: d.id, ...(d.data() as Attempt) }));
}

await loadAttempts();

// utilidades
const answersOf = (a: Attempt) => a?.answers ?? [];

const delivered = computed(() =>
  attempts.value.filter(a => a.finishedAt)
);

const deliveredCount = computed(() => delivered.value.length);

const allAnswers = computed(() => delivered.value.flatMap(a => answersOf(a)));

const totalAnswers = computed(() => allAnswers.value.length);

const totalCorrect = computed(() =>
  allAnswers.value.filter(x => !!x?.correct).length
);

// IDs únicos de problemas presentes en las respuestas
const uniqueProblemIds = computed(() => {
  const ids = allAnswers.value.map(a => a.problemId).filter(Boolean);
  return [...new Set(ids)];
});

// cargar problemas cada vez que cambian los ids únicos
watchEffect(async () => {
  const ids = uniqueProblemIds.value;
  if (!ids.length) {
    problems.value = {};
    return;
  }
  // Firestore no permite IN con más de 10; en casos reales, trocear en lotes de 10
  const parts: string[][] = [];
  for (let i = 0; i < ids.length; i += 10) parts.push(ids.slice(i, i + 10));

  const acc: Record<string, Problem> = {};
  for (const batch of parts) {
    const q = query(colProblems, where("__name__", "in", batch));
    const snap = await getDocs(q);
    snap.forEach(d => {
      acc[d.id] = { id: d.id, ...(d.data() as Problem) };
    });
  }
  problems.value = acc;
});

// estadísticas por problema
const stats = computed<Record<string, { total: number; correct: number }>>(() => {
  const map: Record<string, { total: number; correct: number }> = {};
  for (const a of allAnswers.value) {
    const pid = a.problemId;
    if (!pid) continue;
    if (!map[pid]) map[pid] = { total: 0, correct: 0 };
    map[pid].total += 1;
    if (a.correct) map[pid].correct += 1;
  }
  return map;
});
</script>

<style scoped>
</style>
