<!-- src/views/problems/ProblemForm.vue -->
<script setup lang="ts">
import { reactive, ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { addDoc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { auth, colProblems, problemDoc } from "@/services/firebase";

// Editores (ya los tienes creados)
import TrueFalseEditor from "@/views/problems/editors/TrueFalseEditor.vue";
import ShortTextEditor from "@/views/problems/editors/ShortTextEditor.vue";
import NumericEditor from "@/views/problems/editors/NumericEditor.vue";

/* =========================================================
   Tipos (alineados al nuevo modelo, con compat legacy)
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
   Modelo del formulario (nuevo + compat múltiple opción)
========================================================= */
const form = reactive<{
  type: ProblemType;

  title: string;
  statement: string;

  // multiple_choice (UI legacy)
  options: string[];
  correctIndex: number;

  // true_false
  answer?: { correct: boolean };

  // short_text / numeric
  spec?: ShortTextSpec | NumericSpec;

  // open_rubric (mínimo)
  openNote?: string;

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
  // Mapea los valores viejos a los nuevos
  if (t === "multiple-choice") return "multiple_choice";
  if (t === "true-false") return "true_false";
  if (t === "open-ended") return "open_rubric";
  if (t === "short-text") return "short_text";
  return (t as ProblemType) ?? "multiple_choice";
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

    // Múltiple opción (legacy)
    const legacyOptions: string[] = Array.isArray(d.options) ? d.options : ["", "", "", ""];
    const legacyCorrectIndex: number =
      Number.isInteger(d.correctIndex) && d.correctIndex >= 0 ? d.correctIndex : 0;

    // Si el doc ya es nuevo (multiple_choice con options {text, correct})
    if (form.type === "multiple_choice" && Array.isArray(d.options) && d.options.length > 0 && typeof d.options[0] === "object") {
      const opts = d.options as MCOption[];
      form.options = opts.map((o) => o?.text ?? "");
      const idx = Math.max(0, opts.findIndex((o) => o?.correct));
      form.correctIndex = idx >= 0 ? idx : 0;
    } else {
      // Legacy strings + correctIndex
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
        // Migración desde tus campos legacy numéricos (correctAnswer / tolerance)
        const v = parseFloat(d.correctAnswer ?? "");
        const tol = typeof d.tolerance === "number" ? d.tolerance : (d.tolerance ? parseFloat(d.tolerance) : 0);
        form.spec = {
          mode: "value",
          value: Number.isFinite(v) ? v : 0,
          tolerance: Number.isFinite(tol) ? tol : 0,
          precision: 2,
        };
      } else {
        // short_text defaults
        form.spec = { mode: "exact", answers: [""], threshold: 1, caseSensitive: false, trim: true };
      }
    }

    // open_rubric (mínimo)
    if (form.type === "open_rubric") {
      form.openNote = d.openNote ?? "";
    }

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
   Guardar (nuevo esquema + compat legacy M.C.)
========================================================= */
async function onSubmit() {
  const v = validate();
  if (v) {
    error.value = v;
    return;
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
  };

  // Campos por tipo
  if (form.type === "multiple_choice") {
    // nuevo
    const optionsNew: MCOption[] = form.options.map((t, i) => ({
      text: t ?? "",
      correct: i === form.correctIndex,
    }));
    base.options = optionsNew;
    base.allowMultiple = false;

    // legacy (compatibilidad con vistas viejas)
    base.correctIndex = form.correctIndex;
    base.optionsLegacy = form.options; // si NO quieres duplicar key, usa base.options_strings
    // Si prefieres mantener exactamente tu nombre de campo legacy:
    base.options = optionsNew;           // NUEVO
    base.options_strings = form.options; // LEGACY (evita colision)
  }

  if (form.type === "true_false") {
    base.answer = form.answer ?? { correct: true };
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
}
function removeOption(i: number) {
  if (form.options.length <= 2) return;
  form.options.splice(i, 1);
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

      <!-- Sub-form según tipo -->
      <div v-if="form.type==='multiple_choice'" class="space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium">Opciones</span>
          <button class="text-sm underline" @click="addOption">+ opción</button>
        </div>

        <div class="space-y-2">
          <div v-for="(opt, i) in form.options" :key="i" class="flex gap-2 items-center">
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
        </div>
      </div>

      <TrueFalseEditor v-else-if="form.type==='true_false'" v-model="form" />
      <ShortTextEditor  v-else-if="form.type==='short_text'"  v-model="form" />
      <NumericEditor    v-else-if="form.type==='numeric'"     v-model="form" />

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

      <!-- Extra -->
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




