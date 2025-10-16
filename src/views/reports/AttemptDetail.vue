<!-- src/views/reports/AttemptDetail.vue -->
<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute, RouterLink } from "vue-router";
import { doc, getDoc } from "firebase/firestore";
import { colAttempts, colAssignments, colProblems } from "@/services/firebase";
import StateBlock from "@/components/StateBlock.vue";

type AnswerRow = {
  problemId?: string;
  problemTitle?: string;
  correct?: boolean | null;
  selected?: number | string | null;
  correctIndex?: number | string | null;
  score?: number | null; // por si guardas parcial por pregunta
};

type Attempt = {
  id: string;
  assignmentId?: string;
  assignmentTitle?: string;
  studentEmail?: string;
  correctCount?: number | null;
  total?: number | null;
  score?: number | null;
  startedAt?: any | null;
  finishedAt?: any | null;
  durationSec?: number | null;
  answers?: AnswerRow[] | null; // opcional
};

const route = useRoute();
const id = route.params.id as string;

const loading = ref(true);
const error = ref("");
const attempt = ref<Attempt | null>(null);

// Helpers
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

// Carga
async function load() {
  loading.value = true;
  error.value = "";
  try {
    const snap = await getDoc(doc(colAttempts, id));
    if (!snap.exists()) {
      error.value = "No se encontró el intento.";
      attempt.value = null;
      return;
    }
    const data = snap.data() as any;

    // duración defensiva
    const duration =
      data.startedAt && data.finishedAt ? secondsBetween(data.startedAt, data.finishedAt) : null;

    // normalizar respuestas si existen
    let answers: AnswerRow[] | null = null;
    if (Array.isArray(data.answers)) {
      answers = data.answers.map((a: any) => ({
        problemId: a?.problemId ?? null,
        problemTitle: a?.problemTitle ?? null,
        correct: typeof a?.correct === "boolean" ? a.correct : null,
        selected: a?.selected ?? null,
        correctIndex: a?.correctIndex ?? null,
        score: typeof a?.score === "number" ? a.score : null,
      }));
    }

    attempt.value = {
      id: snap.id,
      assignmentId: data.assignmentId,
      assignmentTitle: data.assignmentTitle,
      studentEmail: data.studentEmail,
      correctCount: data.correctCount ?? null,
      total: data.total ?? null,
      score: typeof data.score === "number" ? data.score : null,
      startedAt: data.startedAt ?? null,
      finishedAt: data.finishedAt ?? null,
      durationSec: duration,
      answers,
    };

    // (Opcional) Completar título de asignación si faltara
    if (!attempt.value.assignmentTitle && attempt.value.assignmentId) {
      const asnap = await getDoc(doc(colAssignments, attempt.value.assignmentId));
      if (asnap.exists()) {
        attempt.value.assignmentTitle = ((asnap.data() as any).title || attempt.value.assignmentId);
      }
    }

    // (Opcional) Completar títulos de problemas si hay answers sin título
    if (attempt.value.answers?.length) {
      const missing = attempt.value.answers.filter(a => a.problemId && !a.problemTitle);
      await Promise.all(missing.map(async (r) => {
        try {
          const psnap = await getDoc(doc(colProblems, r.problemId!));
          if (psnap.exists()) r.problemTitle = (psnap.data() as any).title || r.problemId!;
        } catch {/* noop */}
      }));
    }
  } catch (e: any) {
    console.error("[AttemptDetail] load error:", e);
    error.value = e?.message ?? "No se pudo cargar el intento.";
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section class="max-w-5xl mx-auto p-4">
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-2xl font-bold">Detalle del intento</h1>
      <RouterLink
        :to="{ name: 'TeacherAttempts', query: { assignmentId: attempt?.assignmentId || undefined } }"
        class="px-3 py-1.5 rounded border"
      >
        Volver a intentos
      </RouterLink>
    </div>

    <StateBlock v-if="loading" state="loading" />
    <StateBlock v-else-if="error" state="error" :message="error">
      <template #actions>
        <div class="mt-3">
          <button class="px-3 py-1.5 rounded border" @click="load">Reintentar</button>
        </div>
      </template>
    </StateBlock>

    <div v-else-if="attempt" class="space-y-6">
      <!-- Resumen -->
      <div class="grid md:grid-cols-2 gap-4">
        <div class="border rounded p-4">
          <h3 class="font-semibold mb-2">Asignación</h3>
          <p class="text-sm"><span class="font-medium">Título:</span> {{ attempt.assignmentTitle || attempt.assignmentId || "—" }}</p>
          <p class="text-sm"><span class="font-medium">Alumno:</span> {{ attempt.studentEmail || "—" }}</p>
        </div>
        <div class="border rounded p-4">
          <h3 class="font-semibold mb-2">Resultados</h3>
          <p class="text-sm"><span class="font-medium">Puntaje:</span> {{ attempt.score != null ? attempt.score + "%" : "—" }}</p>
          <p class="text-sm">
            <span class="font-medium">Aciertos:</span>
            <span v-if="attempt.correctCount != null && attempt.total != null">
              {{ attempt.correctCount }}/{{ attempt.total }}
            </span>
            <span v-else>—</span>
          </p>
          <p class="text-sm"><span class="font-medium">Inició:</span> {{ fmtTs(attempt.startedAt) }}</p>
          <p class="text-sm"><span class="font-medium">Finalizó:</span> {{ fmtTs(attempt.finishedAt) }}</p>
          <p class="text-sm">
            <span class="font-medium">Duración:</span>
            <span v-if="attempt.durationSec != null">{{ attempt.durationSec }}s</span>
            <span v-else>—</span>
          </p>
        </div>
      </div>

      <!-- Detalle por pregunta (si existe) -->
      <div class="border rounded p-4" v-if="attempt.answers?.length">
        <h3 class="font-semibold mb-3">Respuestas</h3>
        <div class="overflow-auto">
          <table class="min-w-full text-sm">
            <thead>
              <tr class="text-left border-b">
                <th class="py-2 pr-4">Problema</th>
                <th class="py-2 pr-4">Correcta</th>
                <th class="py-2 pr-4">Seleccionada</th>
                <th class="py-2 pr-4">¿Acierto?</th>
                <th class="py-2 pr-4">Puntaje</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(a, i) in attempt.answers" :key="i" class="border-b">
                <td class="py-2 pr-4">{{ a.problemTitle || a.problemId || "—" }}</td>
                <td class="py-2 pr-4">{{ a.correctIndex ?? "—" }}</td>
                <td class="py-2 pr-4">{{ a.selected ?? "—" }}</td>
                <td class="py-2 pr-4">
                  <span v-if="a.correct === true">✔️</span>
                  <span v-else-if="a.correct === false">❌</span>
                  <span v-else>—</span>
                </td>
                <td class="py-2 pr-4">{{ a.score != null ? a.score : "—" }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-else class="text-sm text-gray-600">
        No hay detalle por pregunta para este intento.
      </div>
    </div>
  </section>
</template>


