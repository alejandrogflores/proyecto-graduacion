<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useRoute } from "vue-router";
import { getDoc, doc } from "firebase/firestore";
import { attemptDoc, colProblems } from "@/services/firebase";

/* ---------------------------- tipos ligeros ---------------------------- */
type ProblemNorm = {
  id: string;
  title?: string;
  statement?: string;
  options: string[];
  correctIndex: number;
  explanations: (string | null)[];
};

/* ---------------------------- ruta / estado ---------------------------- */
const route = useRoute();
const assignmentId = route.params.id as string;
const attemptId = (route.query.attempt as string) || "";

const loading = ref(true);
const attempt = ref<any>(null);
const problemMap = ref<Record<string, ProblemNorm>>({});
const notice = ref("");

onMounted(() => {
  const msg = sessionStorage.getItem("assignmentNotice");
  if (msg) {
    notice.value = msg;
    sessionStorage.removeItem("assignmentNotice");
    setTimeout(() => (notice.value = ""), 4000); // desaparece en 4s
  }
});

onMounted(load);

/* ------------------------- normalización problema ----------------------- */
function normalizeProblem(raw: any, id: string): ProblemNorm {
  let options: string[] = [];
  let explanations: (string | null)[] = [];
  let correctIndex = -1;

  const readOpt = (o: any) => {
    const text = o?.text ?? o?.label ?? String(o ?? "");
    const expl = o?.explanation ?? o?.why ?? o?.feedback ?? o?.rationale ?? null;
    const correct = o?.correct === true;
    return { text, expl, correct };
  };

  if (Array.isArray(raw.options_strings) && raw.options_strings.every((x: any) => typeof x === "string")) {
    options = raw.options_strings.slice();
    explanations = Array.isArray(raw.options_explanations)
      ? raw.options_explanations.map((x: any) => (x == null ? null : String(x)))
      : options.map(() => null);
    if (typeof raw.correctIndex === "number") correctIndex = raw.correctIndex;

  } else if (Array.isArray(raw.options)) {
    const first = raw.options[0];
    if (typeof first === "string") {
      options = raw.options.map((x: any) => String(x));
      explanations = Array.isArray(raw.options_explanations)
        ? raw.options_explanations.map((x: any) => (x == null ? null : String(x)))
        : options.map(() => null);
      if (typeof raw.correctIndex === "number") correctIndex = raw.correctIndex;
    } else {
      const parsed = raw.options.map((o: any) => readOpt(o));
      options = parsed.map((p) => p.text);
      explanations = parsed.map((p) => (p.expl == null ? null : String(p.expl)));
      if (typeof raw.correctIndex === "number") {
        correctIndex = raw.correctIndex;
      } else {
        const idx = parsed.findIndex((p) => p.correct);
        correctIndex = idx >= 0 ? idx : -1;
      }
    }

  } else if (Array.isArray(raw.choices)) {
    const parsed = raw.choices.map((o: any) => readOpt(o));
    options = parsed.map((p) => p.text);
    explanations = parsed.map((p) => (p.expl == null ? null : String(p.expl)));
    const idx = parsed.findIndex((p) => p.correct);
    correctIndex = idx >= 0 ? idx : -1;

  } else if (raw.type === "true_false" || (raw.answer && typeof raw.answer.correct === "boolean")) {
    options = ["Verdadero", "Falso"];
    correctIndex = raw.answer?.correct ? 0 : 1;

    if (Array.isArray(raw.explanations) && raw.explanations.length >= 2) {
      explanations = [raw.explanations[0] ?? null, raw.explanations[1] ?? null].map((x: any) =>
        x == null ? null : String(x)
      );
    } else {
      const corr =
        raw.explanationCorrect ??
        raw.answer?.explanationCorrect ??
        raw.answer?.trueExplanation ??
        raw.trueExplanation ??
        null;
      const wron =
        raw.explanationWrong ??
        raw.answer?.explanationWrong ??
        raw.answer?.falseExplanation ??
        raw.falseExplanation ??
        null;

      explanations = correctIndex === 0 ? [corr ?? null, wron ?? null] : [wron ?? null, corr ?? null];
    }
  }

  if (correctIndex < 0 && typeof raw.correctIndex === "number") correctIndex = raw.correctIndex;
  if (!explanations.length) explanations = options.map(() => null);

  // ⬇️ Fallback GENERAL para opción múltiple:
  // Si NO hay explicaciones por opción, pero existe explanationCorrect/Wrong,
  // las distribuimos a la correcta y a todas las incorrectas.
  const hasAnyExplanation = explanations.some((e) => e && String(e).trim().length > 0);
  const explanationCorrect =
    raw.explanationCorrect ?? raw.answer?.explanationCorrect ?? null;
  const explanationWrong =
    raw.explanationWrong ?? raw.answer?.explanationWrong ?? null;

  if (!hasAnyExplanation && (explanationCorrect || explanationWrong) && options.length > 0 && correctIndex >= 0) {
    explanations = options.map((_, idx) =>
      idx === correctIndex ? (explanationCorrect ?? null) : (explanationWrong ?? null)
    );
  }

  return { id, title: raw.title, statement: raw.statement, options, correctIndex, explanations };
}

/* ------------------------------- carga datos ----------------------------- */
async function load() {
  try {
    if (!attemptId) throw new Error("Falta attempt id.");
    const aSnap = await getDoc(attemptDoc(attemptId));
    if (!aSnap.exists()) throw new Error("Intento no encontrado.");
    attempt.value = { id: aSnap.id, ...(aSnap.data() as any) };

    // Trae y normaliza textos de los problemas para el desglose
    for (const ans of attempt.value.answers ?? []) {
      const pSnap = await getDoc(doc(colProblems, ans.problemId));
      if (pSnap.exists()) {
        problemMap.value[ans.problemId] = normalizeProblem(pSnap.data(), pSnap.id);
      }
    }
  } finally {
    loading.value = false;
  }
}

const score = computed(() => attempt.value?.score ?? 0);
</script>

<template>
  <transition name="fade">
    <div
      v-if="notice"
      class="fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow bg-emerald-100 text-emerald-800"
      role="status"
      aria-live="polite"
    >
      {{ notice }}
    </div>
  </transition>

  <div class="p-6">
    <h1 class="text-2xl font-semibold mb-2">Resultados</h1>

    <div v-if="loading">Cargando…</div>

    <div v-else>
      <p class="mb-4">
        <strong>Puntaje:</strong> {{ score }} / 100 •
        <strong>Correctas:</strong> {{ attempt.correctCount }}/{{ attempt.total }}
      </p>

      <div class="space-y-4">
        <div
          v-for="a in attempt.answers"
          :key="a.problemId"
          class="border rounded-lg p-4"
        >
          <div class="font-medium mb-1">
            {{ problemMap[a.problemId]?.title ?? "Problema" }}
          </div>

          <div class="text-sm mb-2 whitespace-pre-line">
            {{ problemMap[a.problemId]?.statement }}
          </div>

          <!-- Tu respuesta + estado -->
          <div class="text-sm">
            Tu respuesta:
            <strong>
              {{ problemMap[a.problemId]?.options?.[a.selectedIndex] ?? "—" }}
            </strong>
            <span :class="a.correct ? 'text-green-700' : 'text-red-700'">
              • {{ a.correct ? 'Correcto' : 'Incorrecto' }}
            </span>
          </div>

          <!-- Mostrar la correcta -->
          <div v-if="!a.correct" class="text-xs mt-1">
            Correcta:
            <strong>
              {{
                problemMap[a.problemId]?.options?.[
                  problemMap[a.problemId]?.correctIndex
                ]
              }}
            </strong>
          </div>

          <!-- Explicación de la opción elegida (solo si falló y hay feedback) -->
          <div
            v-if="!a.correct
                  && problemMap[a.problemId]?.explanations
                  && problemMap[a.problemId]?.explanations[a.selectedIndex]"
            class="mt-3 text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-3"
          >
            <div class="font-medium mb-1">Explicación</div>
            <div>{{ problemMap[a.problemId].explanations[a.selectedIndex] }}</div>
          </div>

          <!-- (Opcional) Razón de la correcta -->
          <div
            v-if="!a.correct
                  && problemMap[a.problemId]?.explanations
                  && problemMap[a.problemId]?.explanations[problemMap[a.problemId].correctIndex]"
            class="mt-3 text-sm bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg p-3"
          >
            <div class="font-medium mb-1">¿Por qué esta es la correcta?</div>
            <div>{{ problemMap[a.problemId].explanations[problemMap[a.problemId].correctIndex] }}</div>
          </div>
        </div>
      </div>

      <div class="mt-6">
        <router-link class="px-3 py-2 rounded bg-gray-200" to="/assignments/my">
          Volver a mis asignaciones
        </router-link>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active { transition: opacity 0.4s; }
.fade-enter-from,
.fade-leave-to { opacity: 0; }
</style>
