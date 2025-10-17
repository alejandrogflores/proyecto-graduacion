<!-- src/views/assignments/AssignmentReview.vue -->
<script setup lang="ts">
import { onMounted, ref, computed } from "vue";
import { useRoute } from "vue-router";
import { storeToRefs } from "pinia";
import { query, where, orderBy, limit, getDocs, doc, getDoc } from "firebase/firestore";

import { colAttempts, colAssignments, colProblems } from "@/services/firebase";
import { useProfileStore } from "@/stores/profile";

type Problem = {
  id: string;
  type?: string;                // "multiple-choice" | "true-false" | "numeric" | "short-text"
  title?: string;
  statement?: string;
  options?: string[];           // MC/TF
  correctIndex?: number;        // MC/TF
  correctBoolean?: boolean;     // TF alternativo
  numericSpec?: any;            // NUM (opcional si quieres re-evaluar)
  answerSpec?: any;
  numeric?: any;
  textSpec?: any;               // SHORT TEXT
  answerText?: string | string[];
  correctText?: string | string[];
  acceptable?: string[];
};

type Answer = {
  problemId: string;
  selectedIndex?: number;       // MC/TF
  valueNum?: number | null;     // NUM
  valueText?: string | null;    // SHORT
  correct?: boolean;
};

const route = useRoute();
const assignmentId = route.params.id as string;

const profile = useProfileStore();
if (!profile.ready) profile.init?.();

const loading = ref(true);
const errorMsg = ref("");
const attempt: any = ref(null);
const assignment: any = ref(null);
const problems = ref<Problem[]>([]);

function toDate(ts: any): Date | null {
  if (!ts) return null;
  if (typeof ts.toDate === "function") return ts.toDate();
  if (typeof ts.seconds === "number") return new Date(ts.seconds * 1000);
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d;
}

const finishedAtText = computed(() => {
  const d = toDate(attempt.value?.finishedAt);
  return d ? d.toLocaleString() : "—";
});
const scoreText = computed(() => {
  const sc = attempt.value?.score;
  if (typeof sc === "number") return `${sc}`;
  if (typeof attempt.value?.summary?.score === "number") return `${attempt.value.summary.score}`;
  return "—";
});

const answersByProblem = computed<Record<string, Answer>>(() => {
  const arr: Answer[] = Array.isArray(attempt.value?.answers) ? attempt.value.answers : [];
  const map: Record<string, Answer> = {};
  for (const a of arr) map[a.problemId] = a;
  return map;
});

function tfLabelFromIndex(i: number | undefined) {
  if (i === 0) return "Verdadero";
  if (i === 1) return "Falso";
  return "—";
}
function optionLabel(p: Problem, idx: number | null | undefined): string {
  if (idx === null || idx === undefined) return "—";
  if (p.type === "true-false") return tfLabelFromIndex(idx);
  if (Array.isArray(p.options)) return p.options[idx] ?? String(idx);
  return String(idx);
}
function correctAnswerText(p: Problem): string {
  if (typeof p.correctIndex === "number") return optionLabel(p, p.correctIndex);
  if (typeof p.correctBoolean === "boolean") return p.correctBoolean ? "Verdadero" : "Falso";
  if (Array.isArray(p.acceptable)) return p.acceptable.join(" / ");
  if (typeof p.correctText === "string") return p.correctText;
  if (typeof p.answerText === "string") return p.answerText;
  return "—";
}

const rows = computed(() => {
  const map = answersByProblem.value;
  return problems.value.map((p, i) => {
    const a = map[p.id];

    let userText = "—";
    if (!a) userText = "No respondida";
    else if (p.type === "multiple-choice" || p.type === "true-false") {
      userText = optionLabel(p, a.selectedIndex ?? null);
    } else if (p.type === "numeric") {
      userText = a.valueNum === null || a.valueNum === undefined ? "—" : String(a.valueNum);
    } else if (p.type === "short-text") {
      userText = a.valueText ?? "—";
    }

    const ok = a?.correct === true; // ya guardamos 'correct' al enviar
    return {
      i: i + 1,
      statement: p.statement ?? p.title ?? `Pregunta ${i + 1}`,
      userAnswerText: userText,
      correctAnswerText: correctAnswerText(p),
      ok,
    };
  });
});

async function load() {
  if (!profile.uid) return;
  loading.value = true;
  errorMsg.value = "";
  try {
    // Asignación
    const assgDoc = await getDoc(doc(colAssignments, assignmentId));
    assignment.value = assgDoc.exists() ? assgDoc.data() : { id: assignmentId };

    // Último intento terminado del alumno
    const qy = query(
      colAttempts,
      where("assignmentId", "==", assignmentId),
      where("studentUid", "==", profile.uid!),
      where("finishedAt", "!=", null),
      orderBy("finishedAt", "desc"),
      limit(1)
    );
    const qs = await getDocs(qy);
    if (qs.empty) throw new Error("No se encontró un intento entregado para esta asignación.");
    attempt.value = { id: qs.docs[0].id, ...(qs.docs[0].data() as any) };

    // Cargar problems en el mismo orden del assignment
    const ids: string[] = Array.isArray(assignment.value?.problemIds) ? assignment.value.problemIds : [];
    const list: Problem[] = [];
    for (const pid of ids) {
      const ps = await getDoc(doc(colProblems, pid));
      if (!ps.exists()) continue;
      const d = ps.data() as any;
      list.push({
        id: pid,
        type: String(d.type || "").toLowerCase().replace(/_/g, "-"),
        title: d.title,
        statement: d.statement,
        options: d.options,
        correctIndex: d.correctIndex,
        correctBoolean: d.correctBoolean,
        numericSpec: d.numericSpec ?? d.answerSpec ?? d.numeric ?? null,
        textSpec: d.textSpec ?? d.answerText ?? d.correctText ?? d.acceptable ?? null,
        acceptable: Array.isArray(d.acceptable) ? d.acceptable : (Array.isArray(d.correctText) ? d.correctText : undefined),
        correctText: d.correctText,
        answerText: d.answerText,
      });
    }
    problems.value = list;
  } catch (e: any) {
    console.error("[AssignmentReview] load error:", e);
    errorMsg.value = e?.message ?? "No fue posible cargar la revisión.";
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section class="max-w-4xl mx-auto p-4">
    <h1 class="text-2xl font-bold mb-1">Resultados</h1>
    <p class="text-sm text-gray-600 mb-4">
      Asignación: <span class="font-medium">{{ assignment?.title || assignmentId }}</span>
    </p>

    <p v-if="loading">Cargando…</p>
    <p v-else-if="errorMsg" class="text-red-600">{{ errorMsg }}</p>

    <template v-else>
      <div class="mb-4 flex flex-wrap gap-3 text-sm">
        <span class="px-2 py-1 rounded bg-gray-100">Entregado: {{ finishedAtText }}</span>
        <span class="px-2 py-1 rounded bg-gray-100">Puntaje: {{ scoreText }}</span>
        <span class="px-2 py-1 rounded bg-gray-100">Preguntas: {{ rows.length }}</span>
      </div>

      <ul class="space-y-3" v-if="rows.length">
        <li v-for="r in rows" :key="r.i" class="border rounded p-3">
          <div class="flex items-start justify-between gap-4">
            <div>
              <div class="text-sm text-gray-500 mb-1">Pregunta {{ r.i }}</div>
              <div class="font-medium mb-2">{{ r.statement }}</div>
              <div class="text-sm">
                <div><span class="text-gray-500">Tu respuesta:</span> {{ r.userAnswerText }}</div>
                <div><span class="text-gray-500">Respuesta correcta:</span> {{ r.correctAnswerText }}</div>
              </div>
            </div>

            <span
              class="shrink-0 px-2 py-1 rounded text-sm"
              :class="r.ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'"
            >
              {{ r.ok ? 'Correcta' : 'Incorrecta' }}
            </span>
          </div>
        </li>
      </ul>

      <p v-else class="text-sm text-gray-600">No hay preguntas para mostrar.</p>
    </template>
  </section>
</template>

