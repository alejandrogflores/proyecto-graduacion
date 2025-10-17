<!-- src/views/assignments/AssignmentReview.vue -->
<script setup lang="ts">
import { onMounted, ref, computed } from "vue";
import { useRoute } from "vue-router";
import {
  getDoc, doc, getDocs, query, where, orderBy, limit
} from "firebase/firestore";

import {
  assignmentDoc, colProblems, colAttempts
} from "@/services/firebase";
import { useProfileStore } from "@/stores/profile";

/* ===== Tipos compatibles con lo que guardamos en el intento ===== */
type ProblemType =
  | "multiple-choice"
  | "true-false" | "true_false"
  | "numeric"
  | "short-text" | "short_text";

type Problem = {
  id: string;
  type: ProblemType;
  title?: string;
  statement?: string;
  // MC/TF
  options?: string[];      // <- normalizado a string[]
  correctIndex?: number;
  correctBoolean?: boolean;
  // NUM / TEXT
  numericSpec?: any;
  textSpec?: any;
  // feedback configurado en el problema (opcional)
  explanations?: string[];
  explanationCorrect?: string;
  explanationWrong?: string;
  explanation?: string;
  explanationTemplateWrong?: string;
};

type SavedAnswer = {
  problemId: string;
  selectedIndex?: number;    // MC/TF
  valueNum?: number | null;  // NUM
  valueText?: string | null; // SHORT
  correct: boolean;
  feedback?: string;
};

type ReviewRow = {
  p: Problem;
  a: SavedAnswer | null;
};

const route = useRoute();
const profile = useProfileStore();
if (!profile.ready) profile.init?.();

const id = computed(() => String(route.params.id)); // assignmentId

const loading = ref(true);
const errorMsg = ref("");
const assgTitle = ref<string>("");
const finishedAtStr = ref<string>("-");
const score = ref<number>(0);
const total = ref<number>(0);

const rows = ref<ReviewRow[]>([]);

/* ===== helpers ===== */
const normType = (t: any) => String(t || "").toLowerCase().replace(/_/g, "-");

function getNumericSpec(p: Problem): any | null {
  return p.numericSpec ?? null;
}
function getTextSpec(p: Problem): { acceptable: string[]; caseSensitive: boolean; trim: boolean } {
  const raw = p.textSpec ?? null;
  let acceptable: string[] = [];
  if (Array.isArray(raw?.answers)) acceptable = raw.answers.map(String);
  else if (Array.isArray(raw)) acceptable = raw.map(String);
  else if (typeof raw === "string") acceptable = [raw];
  const caseSensitive = Boolean((p.textSpec as any)?.caseSensitive);
  const trim = (p.textSpec as any)?.trim === false ? false : true;
  return { acceptable, caseSensitive, trim };
}
function optLabel(opt: any): string {
  if (opt == null) return "—";
  if (typeof opt === "object") return String(opt?.text ?? "");
  return String(opt);
}
function tfLabelFromIndex(idx: number | undefined): string {
  if (idx === 0) return "Verdadero";
  if (idx === 1) return "Falso";
  return "—";
}
function tfLabelFromBool(b: boolean | undefined): string {
  if (b === true) return "Verdadero";
  if (b === false) return "Falso";
  return "—";
}
function tpl(t: string, data: Record<string, any>) {
  return String(t || "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k) => String(data[k] ?? ""));
}
function fallbackFeedback(p: Problem, a: SavedAnswer | null): string | undefined {
  if (!a) return undefined;
  const t = p.type;
  if (t === "multiple-choice" || t === "true-false") {
    const idx = a.selectedIndex ?? -1;
    if (Array.isArray(p.explanations) && p.explanations[idx]) return p.explanations[idx];
    if (a.correct) return p.explanationCorrect || p.explanation || "¡Correcto!";
    return p.explanationWrong || p.explanation || "Revisa la propiedad/definición relacionada.";
  }
  if (t === "numeric") {
    if (a.correct) return p.explanationCorrect || "¡Correcto!";
    const x = a.valueNum;
    const x2 = typeof x === "number" ? x * x : "—";
    if (p.explanationTemplateWrong) return tpl(p.explanationTemplateWrong, { x, x2 });
    return p.explanationWrong || p.explanation || "Resultado numérico fuera del esperado.";
  }
  if (t === "short-text") {
    if (a.correct) return p.explanationCorrect || "¡Correcto!";
    const x = a.valueText ?? "";
    if (p.explanationTemplateWrong) return tpl(p.explanationTemplateWrong, { x });
    return p.explanationWrong || p.explanation || "La respuesta no coincide con lo esperado.";
  }
  return undefined;
}

/* ===== render helpers (texto que ve el alumno) ===== */
function renderUserAnswer(p: Problem, a: SavedAnswer | null): string {
  if (!a) return "—";
  const t = p.type;
  if (t === "multiple-choice") {
    const idx = a.selectedIndex ?? -1;
    const opt = (p.options ?? [])[idx];
    return optLabel(opt);
  }
  if (t === "true-false") {
    return tfLabelFromIndex(a.selectedIndex);
  }
  if (t === "numeric") {
    return a.valueNum == null ? "—" : String(a.valueNum);
  }
  if (t === "short-text") {
    return a.valueText && a.valueText !== "" ? String(a.valueText) : "—";
  }
  return "—";
}

function renderCorrectAnswer(p: Problem): string {
  const t = p.type;
  if (t === "multiple-choice") {
    const idx = p.correctIndex ?? -1;
    const opt = (p.options ?? [])[idx];
    return optLabel(opt);
  }
  if (t === "true-false") {
    if (typeof p.correctBoolean === "boolean") return tfLabelFromBool(p.correctBoolean);
    return tfLabelFromIndex(p.correctIndex);
  }
  if (t === "numeric") {
    const s = getNumericSpec(p);
    if (!s) return "—";
    const mode = String(s.mode ?? "").toLowerCase();
    if (mode === "value" || mode === "tolerance") {
      const tol = Number.isFinite(s.tolerance) ? ` ±${s.tolerance}` : "";
      return `${s.value}${tol}`;
    }
    if (mode === "range") return `[${s.min}, ${s.max}]`;
    if (Array.isArray(s.values)) return s.values.join(", ");
    if (Number.isFinite(s.value)) return String(s.value);
    return "—";
  }
  if (t === "short-text") {
    const s = getTextSpec(p);
    return s.acceptable.length ? s.acceptable.join(" / ") : "—";
  }
  return "—";
}

/* ===== Carga ===== */
async function load() {
  if (!profile.uid) return;
  loading.value = true;
  errorMsg.value = "";

  try {
    // 1) Asignación
    const as = await getDoc(assignmentDoc(id.value));
    if (!as.exists()) throw new Error("Asignación no encontrada.");
    const aData = as.data() as any;
    assgTitle.value = aData?.title ?? id.value;

    // 2) Problemas (normaliza opciones)
    const probs: Problem[] = [];
    const ids: string[] = Array.isArray(aData?.problemIds) ? aData.problemIds : [];
    for (const pid of ids) {
      const ps = await getDoc(doc(colProblems, pid));
      if (!ps.exists()) continue;
      const d = ps.data() as any;

      const tNorm = normType(d.type) as ProblemType;
      let optionsText: string[] | undefined = undefined;
      let cIdx: number | undefined = undefined;

      if (tNorm === "multiple-choice") {
        if (Array.isArray(d.options) && d.options.length > 0) {
          if (typeof d.options[0] === "object") {
            optionsText = d.options.map((o: any) => o?.text ?? "");
            const found = d.options.findIndex((o: any) => o?.correct);
            cIdx = Number.isInteger(d.correctIndex) ? d.correctIndex : (found >= 0 ? found : 0);
          } else {
            optionsText = d.options as string[];
            cIdx = Number.isInteger(d.correctIndex) ? d.correctIndex : 0;
          }
        } else {
          optionsText = [];
          cIdx = 0;
        }
      }

      const correctBool =
        typeof d.correctBoolean === "boolean"
          ? d.correctBoolean
          : (typeof d.answer?.correct === "boolean" ? d.answer.correct : undefined);

      probs.push({
        id: pid,
        type: tNorm,
        title: d.title,
        statement: d.statement,
        options: optionsText,
        correctIndex: cIdx,
        correctBoolean: correctBool,
        numericSpec: d.numericSpec ?? d.answerSpec ?? d.numeric ?? null,
        textSpec: d.textSpec ?? d.answerText ?? d.correctText ?? d.acceptable ?? null,
        explanations: d.explanations ?? null,
        explanationCorrect: d.explanationCorrect ?? null,
        explanationWrong: d.explanationWrong ?? null,
        explanation: d.explanation ?? null,
        explanationTemplateWrong: d.explanationTemplateWrong ?? null,
      });
    }

    // 3) Último intento entregado del alumno
    const qy = query(
      colAttempts,
      where("assignmentId", "==", id.value),
      where("studentUid", "==", profile.uid),
      where("finishedAt", "!=", null),
      orderBy("finishedAt", "desc"),
      limit(1)
    );
    const qs = await getDocs(qy);
    if (qs.empty) throw new Error("No tienes intentos entregados para esta asignación.");

    const at = qs.docs[0].data() as any;
    score.value = Number(at?.score ?? 0);
    total.value = Number(at?.total ?? probs.length ?? 0);
    try {
      const ts = at?.finishedAt?.toDate?.() ?? null;
      finishedAtStr.value = ts ? new Date(ts).toLocaleString() : "—";
    } catch {
      finishedAtStr.value = "—";
    }

    // 4) Mapear filas problema-respuesta
    const byId: Record<string, SavedAnswer> = {};
    (Array.isArray(at?.answers) ? at.answers : []).forEach((a: any) => {
      if (a?.problemId) byId[a.problemId] = a as SavedAnswer;
    });

    rows.value = probs.map((p) => ({ p, a: byId[p.id] ?? null }));
  } catch (e: any) {
    console.error("[AssignmentReview] load error:", e);
    errorMsg.value = e?.message ?? "No se pudieron cargar los resultados.";
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section class="max-w-5xl mx-auto p-4">
    <header class="mb-4">
      <h1 class="text-2xl font-bold">Resultados</h1>
      <p class="text-sm text-gray-600">
        Asignación: <span class="font-medium">{{ assgTitle }}</span>
      </p>
      <div class="flex flex-wrap gap-2 mt-2">
        <span class="text-xs px-2 py-1 rounded bg-gray-100">Entregado: {{ finishedAtStr }}</span>
        <span class="text-xs px-2 py-1 rounded bg-gray-100">Puntaje: {{ score }}</span>
        <span class="text-xs px-2 py-1 rounded bg-gray-100">Preguntas: {{ total }}</span>
      </div>
    </header>

    <p v-if="loading">Cargando…</p>
    <p v-else-if="errorMsg" class="text-red-600">{{ errorMsg }}</p>

    <div v-else class="space-y-4">
      <div
        v-for="(row, i) in rows"
        :key="row.p.id"
        class="border rounded p-4"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-sm text-gray-500 mb-1">Pregunta {{ i + 1 }}</p>
            <h3 class="font-semibold">{{ row.p.title || row.p.id }}</h3>
            <p class="text-gray-600">{{ row.p.statement }}</p>
          </div>

          <span
            class="text-xs px-2 py-1 rounded"
            :class="row.a?.correct ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'"
          >
            {{ row.a?.correct ? 'Correcta' : 'Incorrecta' }}
          </span>
        </div>

        <div class="mt-3 text-sm">
          <p><span class="text-gray-500">Tu respuesta:</span> {{ renderUserAnswer(row.p, row.a) }}</p>
          <p><span class="text-gray-500">Respuesta correcta:</span> {{ renderCorrectAnswer(row.p) }}</p>
        </div>

        <div class="mt-2">
          <span class="text-gray-500 text-sm">Explicación:</span>
          <p
            class="text-sm"
            :class="row.a?.correct ? 'text-green-700' : 'text-red-700'"
          >
            {{ row.a?.feedback || fallbackFeedback(row.p, row.a) || '—' }}
          </p>
        </div>
      </div>
    </div>
  </section>
</template>


