<script setup lang="ts">
import { ref, computed, onMounted, reactive } from "vue";
import { useRoute, useRouter } from "vue-router";
import { addDoc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { auth, colProblems, problemDoc } from "@/services/firebase";

import { withProblemDefaults, normalizeTags, type Problem } from "@/models/problem";


// ---- Router / modo edición ----
const route = useRoute();
const router = useRouter();
const isEdit = computed(() => !!route.params.id);
const problemId = computed(() => String(route.params.id ?? ""));

// ---- Estado general ----
const loading = ref(false);
const error = ref<string | null>(null);

// ---- Control de versión (solo edición) ----
const loadedVersion = ref<number>(1);

// ---- Modelo principal (mantengo tu "form" reactivo) ----
type PType = ProblemModel["type"]; // si tu modelo lo tiene
const form = reactive<{
  type: PType;
  title: string;
  statement: string;
  options: string[];
  correctIndex: number;
  correctAnswer: string;
  tolerance: number | null;
}>({
  type: "multiple-choice",
  title: "",
  statement: "",
  options: ["", "", "", ""],
  correctIndex: 0,
  correctAnswer: "",
  tolerance: null,
});

// ---- Campos NUEVOS de Fase 1 ----
const tagsCsv = ref<string>(""); // entrada como "a, b, c"
const selectedDifficulty = ref<Difficulty>("medium");
const selectedVisibility = ref<Visibility>("public");

// ---- Cargar en modo edición ----
onMounted(async () => {
  if (!isEdit.value) return;
  loading.value = true;
  try {
    const snap = await getDoc(problemDoc(problemId.value));
    if (!snap.exists()) throw new Error("No existe el problema");
    const data = withProblemDefaults(snap.data());

    // core
    form.type = (data as any).type ?? "multiple-choice";
    form.title = data.title ?? "";
    form.statement = data.statement ?? "";
    form.options = Array.isArray(data.options) ? data.options : ["", "", "", ""];
    form.correctIndex = Number.isFinite(data.correctIndex) ? data.correctIndex : 0;
    form.correctAnswer = (data as any).correctAnswer ?? "";
    form.tolerance = (data as any).tolerance ?? null;

    // nuevos
    tagsCsv.value = (data.tags ?? []).join(", ");
    selectedDifficulty.value = data.difficulty ?? "medium";
    selectedVisibility.value = data.visibility ?? "public";
    loadedVersion.value = data.version ?? 1;
  } catch (e: any) {
    error.value = e?.message ?? String(e);
  } finally {
    loading.value = false;
  }
});

// ---- Validación mínima ----
function validate(): string | null {
  if (!form.title.trim()) return "Falta el título.";
  if (!form.statement.trim()) return "Falta el enunciado.";

  if (form.type === "multiple-choice") {
    const filled = form.options.filter((o) => o.trim() !== "");
    if (filled.length < 2) return "Múltiple opción requiere al menos 2 opciones.";
    if (form.correctIndex < 0 || form.correctIndex >= form.options.length) {
      return "El índice de respuesta correcta no es válido.";
    }
  }

  if (form.type === "true-false" && form.options.length !== 2) {
    return "Verdadero/Falso debe tener exactamente 2 opciones.";
  }

  if (form.type === "numeric" && !form.correctAnswer.trim()) {
    return "Numérica requiere la respuesta correcta.";
  }
  return null;
}

// ---- Guardar (crear/editar) ----
async function onSubmit() {
  const v = validate();
  if (v) {
    error.value = v;
    return;
  }

  // base común para Firestore
  const base: Partial<ProblemModel> & Record<string, any> = {
    // core
    type: form.type,
    title: form.title.trim(),
    statement: form.statement.trim(),
    options: form.options,
    correctIndex: form.correctIndex,
    correctAnswer: form.correctAnswer,
    tolerance: form.tolerance,

    // Fase 1: nuevos
    tags: normalizeTags(tagsCsv.value),
    difficulty: selectedDifficulty.value,
    visibility: selectedVisibility.value,
    version: isEdit.value ? (loadedVersion.value ?? 1) + 1 : 1,

    // timestamps
    updatedAt: serverTimestamp(),
  };

  try {
    if (isEdit.value) {
      // setDoc(..., {merge:true}) permite añadir/actualizar campos nuevos sin perder otros
      await setDoc(problemDoc(problemId.value), base, { merge: true });
    } else {
      await addDoc(colProblems, {
        ...base,
        createdBy: auth.currentUser?.uid ?? null, // si tus reglas lo requieren
        createdAt: serverTimestamp(),
      });
    }

    // Ajusta el nombre de la ruta a tu lista real
    router.push({ name: "ProblemsList" });
  } catch (e: any) {
    error.value = e.message ?? String(e);
  }
}

// ---- utilidades UI ----
function addOption() {
  if (form.type !== "multiple-choice") return;
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
    <h1 class="text-2xl font-semibold">{{ isEdit ? "Editar" : "Nuevo" }} problema</h1>

    <div class="grid gap-3">
      <!-- Tipo -->
      <label class="grid gap-1">
        <span class="text-sm font-medium">Tipo</span>
        <select v-model="form.type" class="border rounded p-2">
          <option value="multiple-choice">Opción múltiple</option>
          <option value="true-false">Verdadero/Falso</option>
          <option value="numeric">Numérica</option>
          <option value="open-ended">Respuesta abierta</option>
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

      <!-- Campos dinámicos -->
      <div v-if="form.type==='multiple-choice' || form.type==='true-false'" class="space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium">Opciones</span>
          <button class="text-sm underline" v-if="form.type==='multiple-choice'" @click="addOption">
            + opción
          </button>
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
              v-if="form.type==='multiple-choice'"
              class="text-sm text-red-600"
              @click="removeOption(i)"
            >
              Eliminar
            </button>
          </div>
        </div>
      </div>

      <div v-else-if="form.type==='numeric'" class="grid gap-2">
        <label class="grid gap-1">
          <span class="text-sm font-medium">Respuesta correcta</span>
          <input v-model="form.correctAnswer" class="border rounded p-2" placeholder="Ej. 3.14" />
        </label>
        <label class="grid gap-1">
          <span class="text-sm font-medium">Tolerancia (opcional)</span>
          <input
            v-model.number="form.tolerance"
            type="number"
            step="any"
            class="border rounded p-2"
            placeholder="Ej. 0.01"
          />
        </label>
      </div>

      <div v-else class="grid gap-2">
        <label class="grid gap-1">
          <span class="text-sm font-medium">Respuesta de referencia (opcional)</span>
          <textarea
            v-model="form.correctAnswer"
            class="border rounded p-2"
            placeholder="Guía para el docente"
          ></textarea>
        </label>
      </div>

      <!-- NUEVOS: Fase 1 -->
      <div class="mb-4">
        <label class="block text-sm font-medium mb-1">Tags (separados por comas)</label>
        <input
          v-model="tagsCsv"
          type="text"
          class="border rounded w-full p-2"
          placeholder="algebra, porcentajes, razonamiento"
        />
        <p class="text-xs text-gray-500 mt-1">Se guardan en minúsculas y sin duplicados.</p>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <label class="grid gap-1">
          <span class="text-sm font-medium">Dificultad</span>
          <select v-model="selectedDifficulty" class="border rounded p-2">
            <option value="easy">Fácil</option>
            <option value="medium">Media</option>
            <option value="hard">Difícil</option>
          </select>
        </label>
        <label class="grid gap-1">
          <span class="text-sm font-medium">Visibilidad</span>
          <select v-model="selectedVisibility" class="border rounded p-2">
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
          class="px-4 py-2 rounded bg-blue-600 text-white"
        >
          {{ loading ? "Guardando..." : "Guardar" }}
        </button>
        <button class="px-4 py-2 rounded border" @click="router.back()">Cancelar</button>
      </div>
    </div>
  </div>
</template>

