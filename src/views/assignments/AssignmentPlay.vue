<!-- src/views/assignments/AssignmentPlay.vue -->
<script setup lang="ts">
import { onMounted, ref, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  getDoc, doc, getDocs, addDoc, updateDoc,
  serverTimestamp, where, query, limit
} from "firebase/firestore";

import Countdown from "@/components/Countdown.vue";
import {
  colAttempts, colProblems, assignmentDoc, attemptDoc, getOpenAttempt
} from "@/services/firebase";
import { useProfileStore } from "@/stores/profile";

/* =========================
   Tipos de datos (locales)
   ========================= */
// Acepta variantes con guion y con guion bajo
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

  // MC / TF
  options?: string[];
  correctIndex?: number;     // MC o TF (0/1)
  correctBoolean?: boolean;  // TF alternativo

  // NUMERIC (acepta varios nombres de campo)
  numericSpec?: any;
  answerSpec?: any;
  numeric?: any;

  // SHORT TEXT (varias formas posibles)
  textSpec?: any;            // { acceptable: string[], caseSensitive?, trim? }
  answerText?: string | string[];
  correctText?: string | string[];
  acceptable?: string[];
};

type Assignment = {
  id: string;
  title?: string;
  timeLimitSec?: number | null;
  ownerUid: string;
  problemIds: string[];
};

type MCState    = { selectedIndex: number | null };
type TFState    = { value: boolean | null };
type NUMState   = { value: string };
type SHORTState = { value: string };

type AnswState = Record<string, MCState | TFState | NUMState | SHORTState>;

type SavedAnswer = {
  problemId: string;
  // MC/TF:
  selectedIndex?: number;        // 0..N | -1
  // Numeric:
  valueNum?: number | null;
  // Short text:
  valueText?: string | null;
  correct: boolean;
};

/* =========================
   Estado / stores
   ========================= */
const route = useRoute();
const router = useRouter();
const profile = useProfileStore();
if (!profile.ready) profile.init?.();

const id = computed(() => String(route.params.id));
const loading  = ref(true);
const saving   = ref(false);
const errorMsg = ref("");

const assg      = ref<Assignment | null>(null);
const problems  = ref<Problem[]>([]);
const answ      = ref<AnswState>({});
const attemptId = ref<string | null>(null);

/* =========================
   Utilidades
   ========================= */
// Normaliza tipo: "true_false" -> "true-false", "short_text" -> "short-text"
const normType = (t: any) =>
  String(t || "").toLowerCase().replace(/_/g, "-");

// Obtén el "spec" numérico sin importar el nombre del campo usado
function getNumericSpec(p: Problem): any | null {
  return p.numericSpec ?? p.answerSpec ?? p.numeric ?? null;
}

// Evalúa un número contra un spec: {mode, value, tolerance, min, max, precision, values[]}
function evalNumeric(spec: any, value: number | null): boolean {
  if (value == null || Number.isNaN(value)) return false;
  if (!spec || typeof spec !== "object") return false;

  const mode = String(spec.mode ?? "").toLowerCase();

  const withPrecision = (n: number, prec?: number) =>
    (Number.isFinite(prec) ? Number(n.toFixed(Number(prec))) : n);

  if (mode === "value" || mode === "tolerance") {
    const target = Number(spec.value);
    const tol    = Number.isFinite(spec.tolerance) ? Number(spec.tolerance) : 0;
    const prec   = Number.isFinite(spec.precision) ? Number(spec.precision) : undefined;
    const v = withPrecision(value, prec);
    return Math.abs(v - target) <= tol;
  }

  if (mode === "range") {
    const min = Number(spec.min);
    const max = Number(spec.max);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return false;
    return value >= min && value <= max;
  }

  if (Array.isArray(spec.values)) {
    return spec.values.some((x: any) => Number(x) === value);
  }

  // fallback: si solo hay 'value'
  if (Number.isFinite(spec?.value)) {
    return Math.abs(value - Number(spec.value)) <= (Number(spec.tolerance) || 0);
  }

  return false;
}

// ----- SHORT TEXT helpers -----
function getTextSpec(p: Problem): { acceptable: string[]; caseSensitive: boolean; trim: boolean } {
  const raw = p.textSpec ?? p.answerText ?? p.correctText ?? p.acceptable ?? null;
  let acceptable: string[] = [];
  if (Array.isArray(raw)) acceptable = raw.map(String);
  else if (typeof raw === "string") acceptable = [raw];

  const caseSensitive = Boolean(p.textSpec?.caseSensitive);
  const trim = p.textSpec?.trim === false ? false : true;
  return { acceptable, caseSensitive, trim };
}
function normText(s: string, caseSensitive: boolean, trim: boolean) {
  let out = s ?? "";
  if (trim) out = out.trim();
  if (!caseSensitive) out = out.toLowerCase();
  // quitar acentos
  out = out.normalize("NFD").replace(/\p{Diacritic}/gu, "");
  return out;
}

/* =========================
   Carga
   ========================= */
async function loadAssignmentAndProblems() {
  loading.value = true;
  errorMsg.value = "";

  try {
    // 1) Assignment
    const aSnap = await getDoc(assignmentDoc(id.value));
    if (!aSnap.exists()) throw new Error("Asignación no encontrada.");
    const aData = aSnap.data() as any;

    const a: Assignment = {
      id: id.value,
      title: aData.title ?? id.value,
      timeLimitSec: aData.timeLimitSec ?? null,
      ownerUid: aData.ownerUid,
      problemIds: Array.isArray(aData.problemIds) ? aData.problemIds : [],
    };
    assg.value = a;

    // 2) Cargar problemas (uno por uno para simplicidad)
    const list: Problem[] = [];
    for (const pid of a.problemIds) {
      const ps = await getDoc(doc(colProblems, pid));
      if (!ps.exists()) continue;
      const d = ps.data() as any;
      list.push({
        id: pid,
        type: normType(d.type) as ProblemType, // normaliza
        title: d.title,
        statement: d.statement,
        options: d.options,
        correctIndex: d.correctIndex,
        correctBoolean: d.correctBoolean,
        numericSpec: d.numericSpec ?? d.answerSpec ?? d.numeric ?? null,
        textSpec: d.textSpec ?? d.answerText ?? d.correctText ?? d.acceptable ?? null,
      });
    }
    problems.value = list;

    // 3) Inicializar respuestas en blanco
    const init: AnswState = {};
    for (const p of list) {
      if (p.type === "multiple-choice") init[p.id] = { selectedIndex: null } as MCState;
      else if (p.type === "true-false")  init[p.id] = { value: null } as TFState;
      else if (p.type === "short-text")  init[p.id] = { value: "" } as SHORTState;
      else if (p.type === "numeric")     init[p.id] = { value: "" } as NUMState;
      else                               init[p.id] = { value: "" } as any; // fallback
    }
    answ.value = init;

    // 4) Crear/continuar intento abierto
    await ensureOpenAttempt();
  } catch (e: any) {
    console.error("[AssignmentPlay] load error", e);
    errorMsg.value = e?.message || "No se pudo cargar la asignación.";
  } finally {
    loading.value = false;
  }
}

async function ensureOpenAttempt() {
  if (!assg.value || !profile.uid) return;

  // ¿Hay intento abierto?
  const open = await getOpenAttempt(assg.value.id, profile.uid);
  if (open) {
    attemptId.value = open.id;
    return;
  }

  // Crear uno nuevo (finishedAt = null por reglas)
  const docRef = await addDoc(colAttempts, {
    assignmentId: assg.value.id,
    assignmentTitle: assg.value.title ?? assg.value.id,
    ownerUid: assg.value.ownerUid,
    studentUid: profile.uid,
    studentEmail: profile.email ?? null,
    answers: [],
    correctCount: 0,
    total: problems.value.length,
    score: 0,
    startedAt: serverTimestamp(),
    finishedAt: null,
    version: 1,
  });
  attemptId.value = docRef.id;
}

/* =========================
   Envío / evaluación
   ========================= */
const canSubmit = computed(() => !!attemptId.value && !saving.value);

function buildAnswerFor(p: Problem): SavedAnswer {
  // Multiple choice
  if (p.type === "multiple-choice") {
    const s = answ.value[p.id] as MCState;
    const idx = (s?.selectedIndex ?? null) as number | null;
    const correct = Number.isInteger(idx) && idx === (p.correctIndex ?? -999);
    return { problemId: p.id, selectedIndex: idx ?? -1, correct };
  }

  // True / False (acepta correctIndex o correctBoolean)
  if (p.type === "true-false") {
    const s = answ.value[p.id] as TFState;
    const val = s?.value; // boolean | null

    let correct: boolean;
    if (typeof p.correctBoolean === "boolean") {
      correct = val === p.correctBoolean;
    } else if (Number.isInteger(p.correctIndex)) {
      const sel = val === null ? -1 : (val ? 0 : 1); // true->0, false->1
      correct = (sel === p.correctIndex);
      return { problemId: p.id, selectedIndex: sel, correct };
    } else {
      // si no hay solución configurada, considera válido si respondió
      correct = val !== null;
    }
    const sel = val === null ? -1 : (val ? 0 : 1);
    return { problemId: p.id, selectedIndex: sel, correct };
  }

  // Short text
  if (p.type === "short-text") {
    const s = answ.value[p.id] as SHORTState;
    const input = (s?.value ?? "").toString();
    const spec = getTextSpec(p);
    let ok = false;
    if (spec.acceptable.length === 0) {
      ok = input.trim().length > 0; // sin respuestas configuradas, solo validar que no esté vacío
    } else {
      const nInput = normText(input, spec.caseSensitive, spec.trim);
      ok = spec.acceptable.some(a => normText(String(a), spec.caseSensitive, spec.trim) === nInput);
    }
    return { problemId: p.id, selectedIndex: -1, valueText: input, correct: ok };
  }

  // Numeric
  if (p.type === "numeric") {
    const s = answ.value[p.id] as NUMState;
    const raw = s?.value ?? "";                    // puede venir como number o string
    let num: number | null;

    if (typeof raw === "number") {
      num = Number.isFinite(raw) ? raw : null;
    } else {
      const v = String(raw).trim();
      num = v === "" ? null : Number(v.replace(",", "."));
    }

    const spec = getNumericSpec(p);
    const ok = evalNumeric(spec, num);
    return {
      problemId: p.id,
      selectedIndex: -1,
      valueNum: Number.isFinite(num as number) ? (num as number) : null,
      correct: ok
    };
  }

  // Fallback
  return { problemId: p.id, selectedIndex: -1, correct: false };
}

async function submit() {
  if (!assg.value || !attemptId.value || saving.value) return;
  saving.value = true;
  errorMsg.value = "";

  try {
    const answers: SavedAnswer[] = problems.value.map(buildAnswerFor);
    const correctCount = answers.filter(a => a.correct).length;
    const total = problems.value.length;
    const score = Math.round((correctCount / Math.max(1, total)) * 100);
    const finishedAt = serverTimestamp();

    await updateDoc(attemptDoc(attemptId.value), {
      answers, correctCount, total, score, finishedAt
    });

    alert(`¡Enviado! Aciertos: ${correctCount}/${total} (${score}%)`);
    router.push({ name: "MyAssignments" });
  } catch (e: any) {
    console.error("[AssignmentPlay] submit error", e);
    errorMsg.value = e?.message || "No se pudo enviar tu intento.";
  } finally {
    saving.value = false;
  }
}

function onTimeUp() {
  if (!saving.value) submit();
}

onMounted(loadAssignmentAndProblems);
</script>

<template>
  <section class="max-w-5xl mx-auto p-4">
    <header class="flex items-center justify-between gap-3 mb-4">
      <h1 class="text-2xl font-bold">Resolver: {{ assg?.title ?? id }}</h1>

      <div v-if="assg?.timeLimitSec" class="flex items-center gap-2">
        <span class="px-2 py-1 rounded border">Tiempo límite: {{ assg.timeLimitSec }}s</span>
        <span class="px-2 py-1 rounded bg-black text-white">
          Restante:
          <Countdown :seconds="assg.timeLimitSec" @finished="onTimeUp" />
        </span>
      </div>
    </header>

    <p v-if="loading">Cargando…</p>
    <p v-else-if="errorMsg" class="text-red-600">{{ errorMsg }}</p>

    <div v-else class="space-y-4">
      <div
        v-for="(p, i) in problems"
        :key="p.id"
        class="bg-white border rounded p-4"
      >
        <h3 class="font-semibold mb-1">
          Pregunta {{ i + 1 }} — {{ p.title || p.id }}
        </h3>
        <p class="text-gray-600 mb-3">{{ p.statement }}</p>

        <!-- Multiple choice -->
        <div v-if="p.type === 'multiple-choice'">
          <div v-for="(opt, idx) in p.options || []" :key="idx" class="mb-2">
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                :name="`mc_${p.id}`"
                :value="idx"
                v-model="(answ[p.id] as any).selectedIndex"
              />
              <span>{{ opt }}</span>
            </label>
          </div>
        </div>

        <!-- True / False -->
        <div v-else-if="p.type === 'true-false'">
          <div class="space-y-2">
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                :name="`tf_${p.id}`"
                :value="true"
                v-model="(answ[p.id] as any).value"
              />
              <span>Verdadero</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                :name="`tf_${p.id}`"
                :value="false"
                v-model="(answ[p.id] as any).value"
              />
              <span>Falso</span>
            </label>
          </div>
        </div>

        <!-- Short text -->
        <div v-else-if="p.type === 'short-text'">
          <input
            type="text"
            class="border rounded px-3 py-2 w-64"
            placeholder="Tu respuesta"
            v-model="(answ[p.id] as any).value"
          />
          <p class="text-xs text-gray-500 mt-2">Escribe tu respuesta corta.</p>
        </div>

        <!-- Numeric -->
        <div v-else-if="p.type === 'numeric'">
          <input
            type="number"
            inputmode="decimal"
            step="any"
            class="border rounded px-3 py-2 w-40"
            placeholder="Tu respuesta"
            v-model="(answ[p.id] as any).value"
          />
          <p class="text-xs text-gray-500 mt-2">
            Ingresa un número. Se valida contra el rango/tolerancia definidos.
          </p>
        </div>

        <!-- fallback -->
        <div v-else class="text-red-600">
          Tipo no soportado: {{ p.type }}
        </div>
      </div>

      <div class="flex items-center gap-3 pt-2">
        <button
          class="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
          :disabled="!canSubmit"
          @click="submit"
        >
          Enviar respuestas
        </button>
        <span v-if="saving">Guardando…</span>
      </div>
    </div>
  </section>
</template>


