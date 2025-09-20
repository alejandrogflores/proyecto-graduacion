<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { getDocs, query, where, orderBy } from "firebase/firestore";
import { colAttempts, colProblems, type Attempt, type Problem } from "@/services/firebase";
import { useProfileStore } from "@/stores/profile";

const profile = useProfileStore();
const loading = ref(true);
const error = ref<string | null>(null);

const attempts = ref<Attempt[]>([]);
const problems = ref<Record<string, Problem>>({});

// Filtros simples
const filterProblemId = ref<string>("");

onMounted(load);

async function load() {
  loading.value = true;
  try {
    // 1) Cargar attempts (todos si eres teacher)
    // Puedes agregar filtros por fecha/problema
    let q = query(colAttempts, orderBy("createdAt", "desc"));
    // Ejemplo: filtrar por problemId si usas un input
    // if (filterProblemId.value) q = query(colAttempts, where("problemId", "==", filterProblemId.value), orderBy("createdAt","desc"));

    const aSnap = await getDocs(q);
    attempts.value = aSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Attempt) }));

    // 2) Cargar problems usados en esos attempts
    const uniqueProblemIds = [...new Set(attempts.value.map(a => a.problemId))];
    const problemDocs = await Promise.all(uniqueProblemIds.map(async (pid) => {
      const qs = await getDocs(query(colProblems, where("__name__", "==", pid)));
      return qs.docs[0];
    }));
    problems.value = {};
    for (const d of problemDocs) {
      if (d?.exists()) {
        problems.value[d.id] = d.data() as Problem;
      }
    }
  } catch (e: any) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

function isCorrect(attempt: Attempt): boolean | null {
  const p = problems.value[attempt.problemId];
  if (!p) return null;
  if (p.type === "multiple-choice" || p.type === "true-false") {
    if (typeof p.correctIndex !== "number") return null;
    return String(p.correctIndex) === attempt.answer;
  }
  if (p.type === "numeric") {
    if (!p.correctAnswer) return null;
    const target = Number(p.correctAnswer);
    const given = Number(attempt.answer);
    if (Number.isNaN(target) || Number.isNaN(given)) return false;
    const tol = p.tolerance ?? 0;
    return Math.abs(given - target) <= tol;
  }
  if (p.type === "open-ended") {
    return null; // revisión manual
  }
  return null;
}

const perStudent = computed(() => {
  const map: Record<string, { uid: string; total: number; correct: number }> = {};
  for (const a of attempts.value) {
    const uid = a.uid;
    if (!map[uid]) map[uid] = { uid, total: 0, correct: 0 };
    map[uid].total++;
    const ok = isCorrect(a);
    if (ok === true) map[uid].correct++;
  }
  return Object.values(map).map(r => ({
    ...r,
    accuracy: r.total ? Math.round((r.correct / r.total) * 100) : 0,
  }));
});

const perProblem = computed(() => {
  const map: Record<string, { problemId: string; title: string; total: number; correct: number; openEnded: number }> = {};
  for (const a of attempts.value) {
    const p = problems.value[a.problemId];
    const key = a.problemId;
    if (!map[key]) map[key] = { problemId: key, title: p?.title ?? key, total: 0, correct: 0, openEnded: 0 };
    map[key].total++;
    const ok = isCorrect(a);
    if (ok === true) map[key].correct++;
    if (ok === null && p?.type === "open-ended") map[key].openEnded++;
  }
  return Object.values(map).map(r => ({
    ...r,
    accuracy: r.total ? Math.round((r.correct / r.total) * 100) : 0,
  }));
});
</script>

<template>
  <div class="max-w-6xl mx-auto p-4 space-y-6">
    <h1 class="text-2xl font-semibold">Reportes</h1>
    <p v-if="loading">Cargando...</p>
    <p v-else-if="error" class="text-red-600">{{ error }}</p>

    <div v-else class="space-y-8">
      <section>
        <h2 class="text-xl font-medium mb-2">Resumen por alumno</h2>
        <div class="overflow-auto">
          <table class="min-w-full text-sm border">
            <thead class="bg-gray-50">
              <tr>
                <th class="p-2 text-left">UID</th>
                <th class="p-2 text-right">Intentos</th>
                <th class="p-2 text-right">Correctos</th>
                <th class="p-2 text-right">% Acierto</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in perStudent" :key="r.uid" class="border-t">
                <td class="p-2">{{ r.uid }}</td>
                <td class="p-2 text-right">{{ r.total }}</td>
                <td class="p-2 text-right">{{ r.correct }}</td>
                <td class="p-2 text-right">{{ r.accuracy }}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 class="text-xl font-medium mb-2">Resumen por problema</h2>
        <div class="overflow-auto">
          <table class="min-w-full text-sm border">
            <thead class="bg-gray-50">
              <tr>
                <th class="p-2 text-left">Problema</th>
                <th class="p-2 text-right">Intentos</th>
                <th class="p-2 text-right">Correctos</th>
                <th class="p-2 text-right">% Acierto</th>
                <th class="p-2 text-right">Abierta (pend.)</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in perProblem" :key="r.problemId" class="border-t">
                <td class="p-2">{{ r.title }}</td>
                <td class="p-2 text-right">{{ r.total }}</td>
                <td class="p-2 text-right">{{ r.correct }}</td>
                <td class="p-2 text-right">{{ r.accuracy }}%</td>
                <td class="p-2 text-right">{{ r.openEnded }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </div>
</template>