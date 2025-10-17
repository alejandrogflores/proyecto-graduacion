<!-- src/views/problems/ProblemForm.vue -->
<script setup lang="ts">
import { reactive, ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { addDoc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { auth, colProblems, problemDoc } from "@/services/firebase";

// Editores (ya los tienes)
import TrueFalseEditor from "@/views/problems/editors/TrueFalseEditor.vue";
import ShortTextEditor from "@/views/problems/editors/ShortTextEditor.vue";
import NumericEditor from "@/views/problems/editors/NumericEditor.vue";

/* =========================================================
   Tipos
========================================================= */
type Difficulty = "easy" | "medium" | "hard";
type Visibility = "public" | "private" | "archived";

type ProblemType =
  | "multiple_choice"
  | "true_false"
  | "short_text"
  | "numeric"
  | "open_rubric";

type MCOption = { text: string; correct?: boolean };

type ShortTextSpec = {
  mode: "exact" | "regex" | "levenshtein";
  answers: string[];
  threshold?: number;
  caseSensitive?: boolean;
  trim?: boolean;
};

type NumericSpec = {
  mode: "value" | "range" | "tolerance";
  value?: number;
  min?: number;
  max?: number;
  tolerance?: number;
  precision?: number;
};

/* =========================================================
   Router / modo edición
========================================================= */
const route = useRoute();
const router = useRouter();
const isEdit = computed(() => Boolean(route.params.id));
const problemId = computed(() => String(route.params.id ?? ""));

/* =========================================================
   Estado UI
========================================================= */
const loading = ref(false);
const error = ref<string | null>(null);
const loadedVersion = ref<number>(1);

/* =========================================================
   Modelo del formulario (extendido con retro)
========================================================= */
const form = reactive<{
  type: ProblemType;

  title: string;
  statement: string;

  // multiple_choice (legacy UI)
  options: string[];
  correctIndex: number;

  // true_false
  answer?: { correct: boolean };

  // short_text / numeric
  spec?: ShortTextSpec | NumericSpec;

  // open_rubric
  openNote?: string;

  // retroalimentación
  explanations: string[];              // MC: por opción; TF: [para True, para False]
  explanationCorrect: string;          // genérica si es correcta (NUM/SHORT)
  explanationWrong: string;            // genérica si es incorrecta (NUM/SHORT/MC fallback)
  explanation: string;                 // explicación general (fallback)
  explanationTemplateWrong: string;    // NUM/SHORT: admite {{x}}, {{x2}}, {{...}}

  // extras
  tagsCsv: string;
  difficulty: Difficulty;
  visibility: Visibility;
}>({
  type: "multiple_choice",
  title: "",
  statement: "",

  options: ["", "", "", ""],
  correctIndex: 0,

  answer: { correct: true },
  spec: { mode: "exact", answers: [""], threshold: 1, caseSensitive: false, trim: true },

  openNote: "",

  // retro (inicial vacío; se ajusta según tipo)
  explanations: ["", "", "", ""],
  explanationCorrect: "",
  explanationWrong: "",
  explanation: "",
  explanationTemplateWrong: "",

  tagsCsv: "",
  difficulty: "medium",
  visibility: "public",
});

/* =========================================================
   Helpers
========================================================= */
function normalizeTagsCsv(txt: string): string[] {
  return txt
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i);
}

function mapLegacyType(t: any): ProblemType {
  if (t === "multiple-choice") return "multiple_choice";
  if (t === "true-false") return "true_false";
  if (t === "open-ended") return "open_rubric";
  if (t === "short-text") return "short_text";
  return (t as ProblemType) ?? "multiple_choice";
}

function ensureArraySize(arr: string[], size: number): string[] {
  const out = arr.slice(0, size);
  while (out.length < size) out.push("");
  return out;
}

/* =========================================================
   Cargar si es edición (lee legacy y nuevo)
========================================================= */
onMounted(async () => {
  if (!isEdit.value) return;
  loading.value = true;
  try {
    const snap = await getDoc(problemDoc(problemId.value));
    if (!snap.exists()) throw new Error("No existe el problema.");
    const d = snap.data() as any;

    // Tipo (legacy o nuevo)
    form.type = mapLegacyType(d.type);

    form.title = d.title ?? "";
    form.statement = d.statement ?? "";

    // Múltiple opción (legacy o nuevo)
    const legacyOptions: string[] = Array.isArray(d.options_strings) ? d.options_strings
      : (Array.isArray(d.options) && typeof d.options[0] === "string" ? d.options : ["", "", "", ""]);

    const legacyCorrectIndex: number =
      Number.isInteger(d.correctIndex) && d.correctIndex >= 0 ? d.correctIndex : 0;

    if (form.type === "multiple_choice" && Array.isArray(d.options) && d.options.length > 0 && typeof d.options[0] === "object") {
      const opts = d.options as MCOption[];
      form.options = opts.map((o) => o?.text ?? "");
      const idx = Math.max(0, opts.findIndex((o) => o?.correct));
      form.correctIndex = idx >= 0 ? idx : 0;
    } else {
      form.options = legacyOptions;
      form.correctIndex = legacyCorrectIndex;
    }

    // true_false (nuevo)
    if (form.type === "true_false") {
      form.answer = d.answer ?? { correct: true };
    }

    // short_text / numeric (nuevo)
    if (form.type === "short_text" || form.type === "numeric") {
      if (d.spec) {
        form.spec = d.spec;
      } else if (form.type === "numeric") {
        const v = parseFloat(d.correctAnswer ?? "");
        const tol = typeof d.tolerance === "number" ? d.tolerance : (d.tolerance ? parseFloat(d.tolerance) : 0);
        form.spec = {
          mode: "value",
          value: Number.isFinite(v) ? v : 0,
          tolerance: Number.isFinite(tol) ? tol : 0,
          precision: 2,
        };
      } else {
        form.spec = { mode: "exact", answers: [""], threshold: 1, caseSensitive: false, trim: true };
      }
    }

    // open_rubric
    if (form.type === "open_rubric") {
      form.openNote = d.openNote ?? "";
    }

    // === Retroalimentación (si ya existía) ===
    // MC/TF
    const existingExpls: string[] = Array.isArray(d.explanations) ? d.explanations : [];
    if (form.type === "multiple_choice") {
      form.explanations = ensureArraySize(existingExpls, form.options.length);
    } else if (form.type === "true_false") {
      form.explanations = ensureArraySize(existingExpls, 2); // [True, False]
    } else {
      form.explanations = existingExpls; // no se usa, pero no estorba
    }

    form.explanationCorrect = d.explanationCorrect ?? "";
    form.explanationWrong = d.explanationWrong ?? "";
    form.explanation = d.explanation ?? "";
    form.explanationTemplateWrong = d.explanationTemplateWrong ?? "";

    // extras
    form.tagsCsv = Array.isArray(d.tags) ? d.tags.join(", ") : "";
    form.difficulty = (d.difficulty as Difficulty) ?? "medium";
    form.visibility = (d.visibility as Visibility) ?? "public";
    loadedVersion.value = Number(d.version ?? 1);
  } catch (e: any) {
    error.value = e?.message ?? String(e);
  } finally {
    loading.value = false;
  }
});

/* =========================================================
   Validaciones por tipo
========================================================= */
function validate(): string | null {
  if (!form.title.trim()) return "Falta el título.";
  if (!form.statement.trim()) return "Falta el enunciado.";

  if (form.type === "multiple_choice") {
    const filled = form.options.filter((o) => o.trim() !== "");
    if (filled.length < 2) return "Múltiple opción requiere al menos 2 opciones.";
    if (form.correctIndex < 0 || form.correctIndex >= form.options.length) {
      return "El índice de respuesta correcta no es válido.";
    }
  }

  if (form.type === "true_false") {
    if (!form.answer) return "Falta seleccionar Verdadero o Falso.";
  }

  if (form.type === "short_text") {
    const s = form.spec as ShortTextSpec | undefined;
    if (!s || !Array.isArray(s.answers) || s.answers.length === 0 || !s.answers[0].trim()) {
      return "Respuesta corta requiere al menos una respuesta válida.";
    }
  }

  if (form.type === "numeric") {
    const s = form.spec as NumericSpec | undefined;
    if (!s) return "Numérica requiere un especificador.";
    if (s.mode === "value" || s.mode === "tolerance") {
      if (typeof s.value !== "number" || !Number.isFinite(s.value)) return "Numérica requiere un valor correcto.";
    } else if (s.mode === "range") {
      if (!Number.isFinite(s.min as number) || !Number.isFinite(s.max as number)) return "Rango numérico requiere mín y máx.";
      if ((s.min as number) > (s.max as number)) return "El mínimo no puede ser mayor que el máximo.";
    }
  }

  return null;
}

/* =========================================================
   Guardar (nuevo esquema + compat legacy)
========================================================= */
async function onSubmit() {
  const v = validate();
  if (v) {
    error.value = v;
    return;
  }

  // Alinea explicaciones al tamaño esperado por tipo
  let explanationsOut: string[] = [];
  if (form.type === "multiple_choice") {
    explanationsOut = ensureArraySize(form.explanations, form.options.length);
  } else if (form.type === "true_false") {
    explanationsOut = ensureArraySize(form.explanations, 2);
  } else {
    explanationsOut = form.explanations; // no es relevante, pero lo guardamos si hay
  }

  const base: Record<string, any> = {
    type: form.type,
    title: form.title.trim(),
    statement: form.statement.trim(),
    tags: normalizeTagsCsv(form.tagsCsv),
    difficulty: form.difficulty,
    visibility: form.visibility,
    version: isEdit.value ? (loadedVersion.value ?? 1) + 1 : 1,
    updatedAt: serverTimestamp(),

    // Retro genérica
    explanations: explanationsOut,                 // MC/TF
    explanationCorrect: form.explanationCorrect || null,
    explanationWrong: form.explanationWrong || null,
    explanation: form.explanation || null,
    explanationTemplateWrong: form.explanationTemplateWrong || null,
  };

  // Campos por tipo
  if (form.type === "multiple_choice") {
    const optionsNew: MCOption[] = form.options.map((t, i) => ({
      text: t ?? "",
      correct: i === form.correctIndex,
    }));
    base.options = optionsNew;
    base.allowMultiple = false;

    // compat legacy
    base.correctIndex = form.correctIndex;
    base.options_strings = form.options;
  }

  if (form.type === "true_false") {
    base.answer = form.answer ?? { correct: true };
    // explanations[0] => True, [1] => False
  }

  if (form.type === "short_text" || form.type === "numeric") {
    base.spec = form.spec;
  }

  if (form.type === "open_rubric") {
    base.openNote = form.openNote ?? "";
  }

  try {
    loading.value = true;

    if (isEdit.value) {
      await setDoc(problemDoc(problemId.value), base, { merge: true });
    } else {
      const ownerUid = auth.currentUser?.uid;
      if (!ownerUid) throw new Error("No hay sesión. Inicia sesión para continuar.");
      await addDoc(colProblems, {
        ...base,
        ownerUid,
        createdAt: serverTimestamp(),
      });
    }

    router.push({ name: "ProblemsList" });
  } catch (e: any) {
    error.value = e?.message ?? String(e);
  } finally {
    loading.value = false;
  }
}

/* =========================================================
   UI helpers (M.C.)
========================================================= */
function addOption() {
  if (form.type !== "multiple_choice") return;
  form.options.push("");
  form.explanations = ensureArraySize(form.explanations, form.options.length);
}
function removeOption(i: number) {
  if (form.options.length <= 2) return;
  form.options.splice(i, 1);
  // ajusta explicaciones
  form.explanations.splice(i, 1);
  if (form.correctIndex >= form.options.length) form.correctIndex = 0;
}
</script>

<template>
  <div class="max-w-3xl mx-auto p-4 space-y-4">
    <h1 class="text-2xl font-semibold">
      {{ isEdit ? "Editar problema" : "Nuevo problema" }}
    </h1>

    <div class="grid gap-3">
      <!-- Tipo -->
      <label class="grid gap-1">
        <span class="text-sm font-medium">Tipo</span>
        <select v-model="form.type" class="border rounded p-2">
          <option value="multiple_choice">Opción múltiple</option>
          <option value="true_false">Verdadero/Falso</option>
          <option value="short_text">Respuesta corta</option>
          <option value="numeric">Numérica</option>
          <option value="open_rubric">Respuesta abierta</option>
        </select>
      </label>

      <!-- Título -->
      <label class="grid gap-1">
        <span class="text-sm font-medium">Título</span>
        <input v-model="form.title" class="border rounded p-2" />
      </label>

      <!-- Enunciado -->
      <label class="grid gap-1">
        <span class="text-sm font-medium">Enunciado</span>
        <textarea v-model="form.statement" class="border rounded p-2 min-h-[120px]"></textarea>
      </label>

      <!-- Según tipo -->
      <div v-if="form.type==='multiple_choice'" class="space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium">Opciones</span>
          <button class="text-sm underline" @click="addOption">+ opción</button>
        </div>

        <div class="space-y-3">
          <div v-for="(opt, i) in form.options" :key="i" class="border rounded p-2">
            <div class="flex gap-2 items-center">
              <input
                v-model="form.options[i]"
                class="border rounded p-2 flex-1"
                :placeholder="`Opción ${i+1}`"
              />
              <label class="flex items-center gap-2 text-sm">
                <input type="radio" name="correct" :value="i" v-model="form.correctIndex" />
                Correcta
              </label>
              <button
                class="text-sm text-red-600"
                @click="removeOption(i)"
                :disabled="form.options.length<=2"
              >
                Eliminar
              </button>
            </div>

            <!-- Retro por opción -->
            <label class="grid gap-1 mt-2">
              <span class="text-xs text-gray-600">Explicación para esta opción (opcional)</span>
              <textarea
                v-model="form.explanations[i]"
                class="border rounded p-2"
                placeholder="Ej.: 12² = 144, no 169."
              ></textarea>
            </label>
          </div>
        </div>

        <!-- Fallbacks opcionales -->
        <div class="grid gap-2 mt-2">
          <label class="grid gap-1">
            <span class="text-sm font-medium">Explicación si es correcta (opcional)</span>
            <textarea v-model="form.explanationCorrect" class="border rounded p-2" placeholder="Ej.: ¡Excelente! 13×13 = 169."></textarea>
          </label>
          <label class="grid gap-1">
            <span class="text-sm font-medium">Explicación si es incorrecta (opcional)</span>
            <textarea v-model="form.explanationWrong" class="border rounded p-2" placeholder="Mensaje genérico si la opción no tiene explicación propia."></textarea>
          </label>
          <label class="grid gap-1">
            <span class="text-sm font-medium">Explicación general (fallback, opcional)</span>
            <textarea v-model="form.explanation" class="border rounded p-2" placeholder="Se usa si no hay explicación por opción ni correct/incorrect."></textarea>
          </label>
        </div>
      </div>

      <div v-else-if="form.type==='true_false'" class="space-y-3">
        <TrueFalseEditor v-model="form" />

        <!-- Retro TF -->
        <div class="grid gap-2">
          <label class="grid gap-1">
            <span class="text-sm font-medium">Explicación si el alumno marca Verdadero</span>
            <textarea
              v-model="form.explanations[0]"
              class="border rounded p-2"
              placeholder="Explicación para Verdadero"
            ></textarea>
          </label>
          <label class="grid gap-1">
            <span class="text-sm font-medium">Explicación si el alumno marca Falso</span>
            <textarea
              v-model="form.explanations[1]"
              class="border rounded p-2"
              placeholder="Explicación para Falso"
            ></textarea>
          </label>

          <label class="grid gap-1">
            <span class="text-sm font-medium">Explicación correcta (opcional)</span>
            <textarea v-model="form.explanationCorrect" class="border rounded p-2"></textarea>
          </label>
          <label class="grid gap-1">
            <span class="text-sm font-medium">Explicación incorrecta (opcional)</span>
            <textarea v-model="form.explanationWrong" class="border rounded p-2"></textarea>
          </label>
          <label class="grid gap-1">
            <span class="text-sm font-medium">Explicación general (opcional)</span>
            <textarea v-model="form.explanation" class="border rounded p-2"></textarea>
          </label>
        </div>
      </div>

      <div v-else-if="form.type==='short_text'" class="space-y-3">
        <ShortTextEditor v-model="form" />
        <!-- Retro SHORT -->
        <div class="grid gap-2">
          <label class="grid gap-1">
            <span class="text-sm font-medium">Explicación si es correcta (opcional)</span>
            <textarea v-model="form.explanationCorrect" class="border rounded p-2"></textarea>
          </label>
          <label class="grid gap-1">
            <span class="text-sm font-medium">Explicación si es incorrecta (opcional)</span>
            <textarea v-model="form.explanationWrong" class="border rounded p-2"></textarea>
          </label>
          <label class="grid gap-1">
            <span class="text-sm font-medium">Plantilla si es incorrecta (opcional)</span>
            <textarea
              v-model="form.explanationTemplateWrong"
              class="border rounded p-2"
              placeholder="Puedes usar variables como {{x}}"
            ></textarea>
          </label>
          <label class="grid gap-1">
            <span class="text-sm font-medium">Explicación general (opcional)</span>
            <textarea v-model="form.explanation" class="border rounded p-2"></textarea>
          </label>
        </div>
      </div>

      <div v-else-if="form.type==='numeric'" class="space-y-3">
        <NumericEditor v-model="form" />
        <!-- Retro NUM -->
        <div class="grid gap-2">
          <label class="grid gap-1">
            <span class="text-sm font-medium">Explicación si es correcta (opcional)</span>
            <textarea v-model="form.explanationCorrect" class="border rounded p-2"></textarea>
          </label>
          <label class="grid gap-1">
            <span class="text-sm font-medium">Explicación si es incorrecta (opcional)</span>
            <textarea v-model="form.explanationWrong" class="border rounded p-2"></textarea>
          </label>
          <label class="grid gap-1">
            <span class="text-sm font-medium">Plantilla si es incorrecta (opcional)</span>
            <textarea
              v-model="form.explanationTemplateWrong"
              class="border rounded p-2"
              placeholder="Ej.: Tu x={{x}} ⇒ x²={{x2}}. 169 = 13²."
            ></textarea>
          </label>
          <label class="grid gap-1">
            <span class="text-sm font-medium">Explicación general (opcional)</span>
            <textarea v-model="form.explanation" class="border rounded p-2"></textarea>
          </label>
        </div>
      </div>

      <div v-else class="grid gap-2">
        <!-- open_rubric mínimo -->
        <label class="grid gap-1">
          <span class="text-sm font-medium">Nota para corrección (opcional)</span>
          <textarea
            v-model="form.openNote"
            class="border rounded p-2"
            placeholder="Guía para el docente / criterios de evaluación"
          ></textarea>
        </label>
      </div>

      <!-- Extras -->
      <div class="mb-4">
        <label class="block text-sm font-medium mb-1">Tags (separados por comas)</label>
        <input
          v-model="form.tagsCsv"
          type="text"
          class="border rounded w-full p-2"
          placeholder="algebra, porcentajes, razonamiento"
        />
        <p class="text-xs text-gray-500 mt-1">Se guardan en minúsculas y sin duplicados.</p>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <label class="grid gap-1">
          <span class="text-sm font-medium">Dificultad</span>
          <select v-model="form.difficulty" class="border rounded p-2">
            <option value="easy">Fácil</option>
            <option value="medium">Media</option>
            <option value="hard">Difícil</option>
          </select>
        </label>

        <label class="grid gap-1">
          <span class="text-sm font-medium">Visibilidad</span>
          <select v-model="form.visibility" class="border rounded p-2">
            <option value="public">Pública</option>
            <option value="private">Privada</option>
            <option value="archived">Archivada</option>
          </select>
        </label>
      </div>

      <p v-if="error" class="text-red-600 text-sm">{{ error }}</p>

      <div class="flex gap-3">
        <button
          @click="onSubmit"
          :disabled="loading"
          class="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-60"
        >
          {{ loading ? "Guardando..." : "Guardar" }}
        </button>
        <button class="px-4 py-2 rounded border" @click="router.back()">Cancelar</button>
      </div>
    </div>
  </div>
</template>
git push





