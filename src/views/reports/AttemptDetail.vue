<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute, RouterLink } from "vue-router";
import { doc, getDoc } from "firebase/firestore";
import { colAttempts, problemDoc } from "@/services/firebase";

type Answer = { problemId: string; selectedIndex: number; correct: boolean };
type Attempt = {
  id: string;
  assignmentId: string;
  assignmentTitle?: string;
  studentEmail?: string;
  answers: Answer[];
  correctCount: number;
  total: number;
  score: number;
  durationSec?: number;
  startedAt?: any;
  finishedAt?: any;
};

const route = useRoute();
const id = route.params.id as string;

const loading = ref(true);
const error = ref("");
const attempt = ref<Attempt | null>(null);
const problems = ref<Record<string, { title: string; options: string[]; correctIndex: number }>>({});

function fmtTs(ts: any) {
  try {
    if (!ts) return "—";
    if (typeof ts.toDate === "function") return ts.toDate().toLocaleString();
    if (typeof ts.seconds === "number") return new Date(ts.seconds * 1000).toLocaleString();
    return new Date(ts).toLocaleString();
  } catch { return "—"; }
}

async function load() {
  loading.value = true; error.value = "";
  try {
    const snap = await getDoc(doc(colAttempts, id));
    if (!snap.exists()) throw new Error("Intento no encontrado.");
    const data = { id: snap.id, ...(snap.data() as any) } as Attempt;
    attempt.value = data;

    // Trae títulos/opciones de los problemas involucrados
    const map: Record<string, any> = {};
    for (const a of data.answers || []) {
      if (!a?.problemId || map[a.problemId]) continue;
      const ps = await getDoc(problemDoc(a.problemId));
      if (ps.exists()) {
        const p = ps.data() as any;
        map[a.problemId] = {
          title: p.title ?? "(Sin título)",
          options: p.options ?? [],
          correctIndex: p.correctIndex ?? -1,
        };
      }
    }
    problems.value = map;
  } catch (e: any) {
    console.error(e);
    error.value = e?.message ?? "No se pudo cargar el intento.";
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section class="max-w-4xl mx-auto p-4">
    <div class="flex items-center justify-between mb-3">
      <h1 class="text-2xl font-bold">Detalle de intento</h1>
      <RouterLink class="px-3 py-1.5 rounded border" :to="{ name: 'TeacherAttempts' }">← Volver</RouterLink>
    </div>

    <p v-if="loading">Cargando…</p>
    <p v-else-if="error" class="text-red-600">{{ error }}</p>

    <div v-else-if="attempt" class="space-y-4">
      <div class="border rounded p-3">
        <p><b>Asignación:</b> {{ attempt.assignmentTitle || attempt.assignmentId }}</p>
        <p><b>Alumno:</b> {{ attempt.studentEmail || "—" }}</p>
        <p><b>Puntaje:</b> {{ attempt.score }}% ({{ attempt.correctCount }}/{{ attempt.total }})</p>
        <p><b>Duración:</b> {{ attempt.durationSec != null ? attempt.durationSec + 's' : '—' }}</p>
        <p><b>Inició:</b> {{ fmtTs(attempt.startedAt) }}</p>
        <p><b>Finalizó:</b> {{ fmtTs(attempt.finishedAt) }}</p>
      </div>

      <div class="space-y-4">
        <div v-for="(a, idx) in attempt.answers" :key="a.problemId" class="border rounded p-3">
          <h3 class="font-semibold mb-1">
            Pregunta {{ idx + 1 }} — {{ problems[a.problemId]?.title || a.problemId }}
          </h3>
          <ul class="list-disc ml-5 space-y-1">
            <li
              v-for="(opt, j) in (problems[a.problemId]?.options || [])"
              :key="j"
              :class="[
                j === problems[a.problemId]?.correctIndex ? 'text-green-700 font-semibold' : '',
                j === a.selectedIndex && j !== problems[a.problemId]?.correctIndex ? 'text-red-700' : ''
              ]"
            >
              <span v-if="j === a.selectedIndex">✔︎ </span>{{ opt }}
              <span v-if="j === problems[a.problemId]?.correctIndex" class="ml-1">(correcta)</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </section>
</template>

