<!-- src/views/solve/SolveProblem.vue -->
<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useRoute } from "vue-router";
import { getDoc, doc } from "firebase/firestore";
import { db } from "@/services/firebase";

import { evaluate } from "@/utils/eval";
import type { Problem } from "@/models/problem";
import type { UserAnswer } from "@/models/answer";

import TrueFalsePlay from "@/views/solve/types/TrueFalsePlay.vue";
import ShortTextPlay from "@/views/solve/types/ShortTextPlay.vue";
import NumericPlay   from "@/views/solve/types/NumericPlay.vue";

/* ============ Carga ============ */
const route = useRoute();
const id = route.params.id as string;

const loading = ref(true);
const rawProblem = ref<any | null>(null);

/** Normaliza un doc legacy a esquema nuevo mínimo para render */
function normalizeProblem(p: any): Problem | null {
  if (!p) return null;

  const type = (() => {
    if (p.type === "multiple-choice") return "multiple_choice";
    if (p.type === "true-false")     return "true_false";
    if (p.type === "open-ended")     return "open_rubric";
    if (p.type === "short-text")     return "short_text";
    return p.type ?? "multiple_choice";
  })();

  // multiple_choice
  if (type === "multiple_choice") {
    if (Array.isArray(p.options) && typeof p.options[0] === "object") {
      return {
        id: p.id,
        ownerUid: p.ownerUid ?? null,
        title: p.title ?? "",
        statement: p.statement ?? "",
        type: "multiple_choice",
        points: p.points ?? 1,
        options: p.options,
        allowMultiple: p.allowMultiple ?? false,
        tags: p.tags ?? [],
      } as Problem;
    }
    const opts = Array.isArray(p.options) ? p.options : ["", "", "", ""];
    const cidx = Number.isInteger(p.correctIndex) ? Math.max(0, Math.min(opts.length - 1, p.correctIndex)) : 0;
    const options = opts.map((t: string, i: number) => ({ text: t ?? "", correct: i === cidx }));
    return {
      id: p.id,
      ownerUid: p.ownerUid ?? null,
      title: p.title ?? "",
      statement: p.statement ?? "",
      type: "multiple_choice",
      points: p.points ?? 1,
      options,
      allowMultiple: false,
      tags: p.tags ?? [],
    } as Problem;
  }

  if (type === "true_false") {
    return {
      id: p.id,
      ownerUid: p.ownerUid ?? null,
      title: p.title ?? "",
      statement: p.statement ?? "",
      type: "true_false",
      points: p.points ?? 1,
      answer: p.answer ?? { correct: true },
      tags: p.tags ?? [],
    } as Problem;
  }

  if (type === "short_text") {
    return {
      id: p.id,
      ownerUid: p.ownerUid ?? null,
      title: p.title ?? "",
      statement: p.statement ?? "",
      type: "short_text",
      points: p.points ?? 1,
      spec: p.spec ?? { mode: "exact", answers: [""], threshold: 1, caseSensitive: false, trim: true },
      tags: p.tags ?? [],
    } as Problem;
  }

  if (type === "numeric") {
    const spec = p.spec ?? (() => {
      const v = parseFloat(p.correctAnswer ?? "");
      const tol = typeof p.tolerance === "number" ? p.tolerance : (p.tolerance ? parseFloat(p.tolerance) : 0);
      return {
        mode: "value",
        value: Number.isFinite(v) ? v : 0,
        tolerance: Number.isFinite(tol) ? tol : 0,
        precision: 2,
      };
    })();
    return {
      id: p.id,
      ownerUid: p.ownerUid ?? null,
      title: p.title ?? "",
      statement: p.statement ?? "",
      type: "numeric",
      points: p.points ?? 1,
      spec,
      tags: p.tags ?? [],
    } as Problem;
  }

  if (type === "open_rubric") {
    return {
      id: p.id,
      ownerUid: p.ownerUid ?? null,
      title: p.title ?? "",
      statement: p.statement ?? "",
      type: "open_rubric",
      points: p.points ?? 1,
      spec: p.spec ?? { maxPoints: p.points ?? 1, criteria: [{ label: "Calidad general", points: p.points ?? 1 }] },
      tags: p.tags ?? [],
    } as Problem;
  }

  return null;
}

const problem = computed<Problem | null>(() => normalizeProblem(rawProblem.value));

onMounted(async () => {
  loading.value = true;
  try {
    const snap = await getDoc(doc(db, "problems", id));
    rawProblem.value = snap.exists() ? { id, ...snap.data() } : null;
  } finally {
    loading.value = false;
  }
});

/* ============ Respuesta y evaluación local ============ */
const currentAnswer = ref<UserAnswer | null>(null);
const submitted = ref(false);
const result = ref<{ correct: boolean | null; score: number | null } | null>(null);
const errorMsg = ref<string | null>(null);

function onSubmit() {
  errorMsg.value = null;
  submitted.value = false;
  result.value = null;

  if (!problem.value) {
    errorMsg.value = "No hay problema cargado.";
    return;
  }

  let ans: UserAnswer | null = currentAnswer.value;
  if (!ans) {
    switch (problem.value.type) {
      case "multiple_choice": ans = { type: "multiple_choice", selected: [] }; break;
      case "true_false":      ans = { type: "true_false", value: true }; break;
      case "short_text":      ans = { type: "short_text", value: "" }; break;
      case "numeric":         ans = { type: "numeric", value: 0 }; break;
      case "open_rubric":     ans = { type: "open_rubric", text: "" }; break;
      default:                ans = null;
    }
  }
  if (!ans) {
    errorMsg.value = "Tipo de problema no soportado todavía.";
    return;
  }

  result.value = evaluate(problem.value, ans);
  submitted.value = true;
}

/* ============ Helpers UI ============ */
const mcLabels = computed(() => {
  const p = problem.value;
  if (!p || p.type !== "multiple_choice") return [];
  return p.options.map((o: any) => (typeof o === "string" ? o : (o?.text ?? "")));
});
const mcMultiple = computed(() => {
  const p = problem.value;
  return !!(p && p.type === "multiple_choice" && p.allowMultiple);
});
function toggleMC(i: number) {
  if (!problem.value || problem.value.type !== "multiple_choice") return;
  const current = (currentAnswer.value?.type === "multiple_choice") ? (currentAnswer.value as any).selected as number[] : [];
  if (mcMultiple.value) {
    const set = new Set(current);
    if (set.has(i)) set.delete(i); else set.add(i);
    currentAnswer.value = { type: "multiple_choice", selected: Array.from(set).sort((a,b)=>a-b) };
  } else {
    currentAnswer.value = { type: "multiple_choice", selected: [i] };
  }
}
function isMCChecked(i: number): boolean {
  if (currentAnswer.value?.type !== "multiple_choice") return false;
  return (currentAnswer.value as any).selected?.includes(i);
}
</script>

<template>
  <section class="max-w-4xl mx-auto p-4 space-y-4">
    <h1 class="text-2xl font-bold">Resolver problema</h1>

    <p v-if="loading">Cargando…</p>
    <div v-else-if="!problem">No encontrado.</div>

    <div v-else class="space-y-4">
      <div>
        <p class="text-xl font-semibold">{{ problem.title || id }}</p>
        <p v-if="problem.statement" class="mt-1">{{ problem.statement }}</p>
        <p class="text-xs text-gray-500 mt-1">
          Tipo: <span class="font-mono">{{ problem.type }}</span>
          · Puntos: {{ problem.points ?? 1 }}
          · Tags: {{ (rawProblem?.tags ?? problem.tags ?? []).join(", ") || "—" }}
        </p>
        <hr class="my-3" />
      </div>

      <!-- Render por tipo -->
      <div v-if="problem.type==='multiple_choice'" class="space-y-2">
        <p class="text-sm text-gray-700">
          Selecciona {{ mcMultiple ? 'las respuestas correctas' : 'la respuesta correcta' }}:
        </p>
        <div class="space-y-2">
          <label
            v-for="(label, i) in mcLabels"
            :key="i"
            class="flex items-center gap-2 border rounded p-2 cursor-pointer"
          >
            <input
              :type="mcMultiple ? 'checkbox' : 'radio'"
              name="mc"
              :checked="isMCChecked(i)"
              @change="toggleMC(i)"
            />
            <span>{{ label }}</span>
          </label>
        </div>
      </div>

      <TrueFalsePlay v-else-if="problem.type==='true_false'" :problem="problem" v-model="currentAnswer" />
      <ShortTextPlay v-else-if="problem.type==='short_text'" :problem="problem" v-model="currentAnswer" />
      <NumericPlay   v-else-if="problem.type==='numeric'"    :problem="problem" v-model="currentAnswer" />

      <div v-else class="text-sm text-gray-600">
        Este tipo aún no está soportado aquí. ({{ problem.type }})
      </div>

      <!-- Feedback -->
      <div class="flex items-center gap-3">
        <button class="px-4 py-2 rounded bg-blue-600 text-white" @click="onSubmit">
          Evaluar
        </button>
        <span v-if="submitted && result" :class="result.correct ? 'text-green-600' : (result.correct===false ? 'text-red-600' : 'text-gray-700')">
          <template v-if="result.correct === true">✅ Correcto · Puntaje: {{ result.score }}</template>
          <template v-else-if="result.correct === false">❌ Incorrecto · Puntaje: {{ result.score }}</template>
          <template v-else>📝 En revisión · Puntaje: —</template>
        </span>
        <span v-if="errorMsg" class="text-red-600 text-sm">{{ errorMsg }}</span>
      </div>
    </div>
  </section>
</template>