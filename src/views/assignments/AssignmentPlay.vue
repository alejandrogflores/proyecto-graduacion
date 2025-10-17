<!-- src/views/assignments/AssignmentPlay.vue -->
<script setup lang="ts">
import { onMounted, ref, computed, onBeforeUnmount } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  getDoc, doc, addDoc, updateDoc,
  serverTimestamp
} from "firebase/firestore";

import Countdown from "@/components/Countdown.vue";
import {
  colAttempts, colProblems, assignmentDoc, attemptDoc, getOpenAttempt
} from "@/services/firebase";
import { useProfileStore } from "@/stores/profile";

/* =========================
   Tipos de datos (locales)
   ========================= */
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
  options?: string[];         // MC/TF
  correctIndex?: number;      // MC/TF
  correctBoolean?: boolean;   // TF alternativo
  numericSpec?: any;          // NUM
  answerSpec?: any;           // NUM (alias)
  numeric?: any;              // NUM (alias)
  textSpec?: any;             // SHORT TEXT
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
  selectedIndex?: number; // MC/TF (0..N | -1)
  valueNum?: number | null;
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

// navegación problema a problema
const idx = ref(0);
const total = computed(() => problems.value.length);
const current = computed(() => problems.value[idx.value] || null);
const progressPct = computed(() =>
  total.value ? Math.round(((idx.value + 1) / total.value) * 100) : 0
);

/* =========================
   Utilidades de evaluación
   ========================= */
// Normaliza tipo: "true_false" -> "true-false"
const normType = (t: any) => String(t || "").toLowerCase().replace(/_/g, "-");

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
  out = out.normalize("NFD").replace(/\p{Diacritic}/gu, ""); // quita acentos
  return out;
}

/* =========================
   Formateo tiempo límite (mm:ss)
   ========================= */
function fmtDurationSec(s?: number | null) {
  if (!Number.isFinite(Number(s))) return "—";
  const n = Number(s);
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const sec = Math.floor(n % 60);
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
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

    // 2) Cargar problemas
    const list: Problem[] = [];
    for (const pid of a.problemIds) {
      const ps = await getDoc(doc(colProblems, pid));
      if (!ps.exists()) continue;
      const d = ps.data() as any;
      list.push({
        id: pid,
        type: normType(d.type) as ProblemType,
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
      const t = p.type;
      if (t === "multiple-choice") init[p.id] = { selectedIndex: null } as MCState;
      else if (t === "true-false")  init[p.id] = { value: null } as TFState;
      else if (t === "short-text")  init[p.id] = { value: "" } as SHORTState;
      else if (t === "numeric")     init[p.id] = { value: "" } as NUMState;
      else                          init[p.id] = { value: "" } as any;
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
    // Si guardas borradores previos, aquí puedes hidratar answ.value leyendo open.answersDraft
    return;
  }

  // Crear uno nuevo (finishedAt = null)
  const docRef = await addDoc(colAttempts, {
    assignmentId: assg.value.id,
    assignmentTitle: assg.value.title ?? assg.value.id,
    ownerUid: assg.value.ownerUid,
    studentUid: profile.uid,
    studentEmail: profile.email ?? null,
    answersDraft: [],       // se llena mientras navega
    answers: [],            // final al enviar
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
   Borrador y envío
   ========================= */
function buildAnswerFor(p: Problem): SavedAnswer {
  // Multiple choice
  if (p.type === "multiple-choice") {
    const s = answ.value[p.id] as MCState;
    const idx = (s?.selectedIndex ?? null) as number | null;
    const correct = Number.isInteger(idx) && idx === (p.correctIndex ?? -999);
    return { problemId: p.id, selectedIndex: idx ?? -1, correct };
  }

  // True / False
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
      ok = input.trim().length > 0;
    } else {
      const nInput = normText(input, spec.caseSensitive, spec.trim);
      ok = spec.acceptable.some(a => normText(String(a), spec.caseSensitive, spec.trim) === nInput);
    }
    return { problemId: p.id, selectedIndex: -1, valueText: input, correct: ok };
  }

  // Numeric
  if (p.type === "numeric") {
    const s = answ.value[p.id] as NUMState;
    const raw = s?.value ?? "";
    let num: number | null;

    if (typeof raw === "number") num = Number.isFinite(raw) ? raw : null;
    else {
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

async function saveDraft() {
  // Guarda “answersDraft” con lo respondido hasta el momento (sin finishedAt)
  if (!attemptId.value) return;
  const draft = problems.value.map(buildAnswerFor);
  try {
    await updateDoc(attemptDoc(attemptId.value), { answersDraft: draft, savedAt: serverTimestamp() });
  } catch (e) {
    console.warn("[AssignmentPlay] saveDraft warn:", e);
  }
}

const canSubmit = computed(() => !!attemptId.value && !saving.value);

async function submit() {
  if (!assg.value || !attemptId.value || saving.value) return;
  saving.value = true;
  errorMsg.value = "";

  try {
    const answers: SavedAnswer[] = problems.value.map(buildAnswerFor);
    const correctCount = answers.filter(a => a.correct).length;
    const totalN = problems.value.length;
    const score = Math.round((correctCount / Math.max(1, totalN)) * 100);
    const finishedAt = serverTimestamp();

    await updateDoc(attemptDoc(attemptId.value), {
      answersDraft: answers,   // conservamos también el borrador final
      answers,
      correctCount,
      total: totalN,
      score,
      finishedAt
    });

    alert(`¡Enviado! Aciertos: ${correctCount}/${totalN} (${score}%)`);
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

/* =========================
   Navegación problema a problema
   ========================= */
function goNext() {
  if (idx.value < total.value - 1) {
    saveDraft();
    idx.value += 1;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}
function goPrev() {
  if (idx.value > 0) {
    saveDraft();
    idx.value -= 1;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}
function goTo(i: number) {
  if (i >= 0 && i < total.value) {
    saveDraft();
    idx.value = i;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

onBeforeUnmount(() => { saveDraft(); });
onMounted(loadAssignmentAndProblems);
</script>

<template>
  <section class="max-w-5xl mx-auto p-4">
    <header class="flex items-center justify-between gap-3 mb-4">
      <div>
        <h1 class="text-2xl font-bold">Resolver: {{ assg?.title ?? id }}</h1>
        <div class="mt-1 text-sm text-gray-600" v-if="total">
          Pregunta {{ idx + 1 }} de {{ total }} — Progreso: {{ progressPct }}%
        </div>
      </div>

      <div v-if="assg?.timeLimitSec" class="flex items-center gap-2">
        <span class="px-2 py-1 rounded border">Tiempo límite: {{ fmtDurationSec(assg.timeLimitSec) }}</span>
        <span class="px-2 py-1 rounded bg-black text-white">
          Restante:
          <Countdown :seconds="assg.timeLimitSec" @finished="onTimeUp" />
        </span>
      </div>
    </header>

    <p v-if="loading">Cargando…</p>
    <p v-else-if="errorMsg" class="text-red-600">{{ errorMsg }}</p>

    <div v-else>
      <!-- Mini navegador de preguntas -->
      <div class="flex flex-wrap gap-2 mb-4">
        <button
          v-for="(p, i) in problems"
          :key="p.id"
          class="px-2 py-1 rounded border text-sm"
          :class="i === idx ? 'bg-black text-white' : 'bg-white hover:bg-gray-50'"
          @click="goTo(i)"
        >
          {{ i + 1 }}
        </button>
      </div>

      <!-- Problema actual -->
      <div v-if="current" class="bg-white border rounded p-4 mb-4">
        <h3 class="font-semibold mb-1">
          Pregunta {{ idx + 1 }} — {{ current.title || current.id }}
        </h3>
        <p class="text-gray-600 mb-3">{{ current.statement }}</p>

        <!-- Multiple choice -->
        <div v-if="current.type === 'multiple-choice'">
          <div v-for="(opt, i) in current.options || []" :key="i" class="mb-2">
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                :name="`mc_${current.id}`"
                :value="i"
                v-model="(answ[current.id] as any).selectedIndex"
                @change="saveDraft"
              />
              <span>{{ opt }}</span>
            </label>
          </div>
        </div>

        <!-- True / False -->
        <div v-else-if="current.type === 'true-false'">
          <div class="space-y-2">
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                :name="`tf_${current.id}`"
                :value="true"
                v-model="(answ[current.id] as any).value"
                @change="saveDraft"
              />
              <span>Verdadero</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                :name="`tf_${current.id}`"
                :value="false"
                v-model="(answ[current.id] as any).value"
                @change="saveDraft"
              />
              <span>Falso</span>
            </label>
          </div>
        </div>

        <!-- Short text -->
        <div v-else-if="current.type === 'short-text'">
          <input
            type="text"
            class="border rounded px-3 py-2 w-64"
            placeholder="Tu respuesta"
            v-model="(answ[current.id] as any).value"
            @input="saveDraft"
          />
          <p class="text-xs text-gray-500 mt-2">Escribe tu respuesta corta.</p>
        </div>

        <!-- Numeric -->
        <div v-else-if="current.type === 'numeric'">
          <input
            type="number"
            inputmode="decimal"
            step="any"
            class="border rounded px-3 py-2 w-40"
            placeholder="Tu respuesta"
            v-model="(answ[current.id] as any).value"
            @input="saveDraft"
          />
          <p class="text-xs text-gray-500 mt-2">
            Ingresa un número. Se valida contra el rango/tolerancia definidos.
          </p>
        </div>

        <!-- fallback -->
        <div v-else class="text-red-600">
          Tipo no soportado: {{ current.type }}
        </div>
      </div>

      <!-- Controles de navegación -->
      <div class="flex items-center justify-between gap-3">
        <button
          class="px-4 py-2 rounded border disabled:opacity-50"
          :disabled="idx === 0"
          @click="goPrev"
        >
          ← Anterior
        </button>

        <div class="text-sm text-gray-600">Pregunta {{ idx + 1 }} / {{ total }}</div>

        <div class="flex items-center gap-2">
          <button
            v-if="idx < total - 1"
            class="px-4 py-2 rounded bg-black text-white"
            @click="goNext"
          >
            Siguiente →
          </button>

          <button
            v-else
            class="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
            :disabled="!canSubmit"
            @click="submit"
          >
            Enviar respuestas
          </button>
        </div>
      </div>

      <div class="mt-2 text-sm" v-if="saving">Guardando…</div>
    </div>
  </section>
</template>
