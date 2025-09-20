<script setup lang="ts">
import { ref, computed, onMounted, reactive } from "vue";
import { useRoute, useRouter } from "vue-router";
import { addDoc, updateDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { auth, colProblems, problemDoc, type Problem } from "@/services/firebase";

const route = useRoute();
const router = useRouter();

const isEdit = computed(() => !!route.params.id);
const problemId = computed(() => String(route.params.id ?? ""));

const loading = ref(false);
const error = ref<string | null>(null);

// ===== Modelo reactivo =====
type Difficulty = Problem["difficulty"];
type PType = Problem["type"];

const form = reactive<{
  type: PType;
  title: string;
  statement: string;
  options: string[];
  correctIndex: number;
  correctAnswer: string;
  tolerance: number | null;
  tags: string;
  difficulty: Difficulty;
}>({
  type: "multiple-choice",
  title: "",
  statement: "",
  options: ["", "", "", ""],
  correctIndex: 0,
  correctAnswer: "",
  tolerance: null,
  tags: "",
  difficulty: "easy",
});

onMounted(loadIfEdit);

async function loadIfEdit() {
  if (!isEdit.value) return;
  loading.value = true;
  try {
    const snap = await getDoc(problemDoc(problemId.value));
    if (!snap.exists()) throw new Error("No existe el problema");
    const p = snap.data() as Problem;

    form.type = p.type ?? "multiple-choice";
    form.title = p.title ?? "";
    form.statement = p.statement ?? "";
    form.options = p.options ?? ["", "", "", ""];
    form.correctIndex = p.correctIndex ?? 0;
    form.correctAnswer = p.correctAnswer ?? "";
    form.tolerance = (p as any).tolerance ?? null;
    form.tags = (p.topicTags ?? []).join(", ");
    form.difficulty = p.difficulty ?? "easy";
  } catch (e: any) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

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

async function onSubmit() {
  const v = validate();
  if (v) {
    error.value = v;
    return;
  }

  const base = {
    type: form.type,
    title: form.title.trim(),
    statement: form.statement.trim(),
    options: form.options,
    correctIndex: form.correctIndex,
    tags: form.tags,
    difficulty: form.difficulty,
    updatedAt: serverTimestamp(),
  };

  try {
    if (isEdit.value) {
      await updateDoc(problemDoc(problemId.value), base);
    } else {
      // logs para verificar el uid
      console.log("[create] payload", {
        ...base,
        createdBy: auth.currentUser?.uid,
      });
      console.log("[create] uid", auth.currentUser?.uid);

      await addDoc(colProblems, {
        ...base,
        createdBy: auth.currentUser?.uid ?? null, // 👈 requerido por reglas
        createdAt: serverTimestamp(),
      });
    }

    router.push({ name: "ProblemsList" });
  } catch (e: any) {
    error.value = e.message;
  }
}

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
      <label class="grid gap-1">
        <span class="text-sm font-medium">Tipo</span>
        <select v-model="form.type" class="border rounded p-2">
          <option value="multiple-choice">Opción múltiple</option>
          <option value="true-false">Verdadero/Falso</option>
          <option value="numeric">Numérica</option>
          <option value="open-ended">Respuesta abierta</option>
        </select>
      </label>

      <label class="grid gap-1">
        <span class="text-sm font-medium">Título</span>
        <input v-model="form.title" class="border rounded p-2" />
      </label>

      <label class="grid gap-1">
        <span class="text-sm font-medium">Enunciado</span>
        <textarea v-model="form.statement" class="border rounded p-2 min-h-[120px]"></textarea>
      </label>

      <!-- Campos dinámicos -->
      <div v-if="form.type==='multiple-choice' || form.type==='true-false'" class="space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium">Opciones</span>
          <button
            class="text-sm underline"
            v-if="form.type==='multiple-choice'"
            @click="addOption"
          >
            + opción
          </button>
        </div>
        <div class="space-y-2">
          <div
            v-for="(opt, i) in form.options"
            :key="i"
            class="flex gap-2 items-center"
          >
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

      <div class="grid grid-cols-2 gap-3">
        <label class="grid gap-1">
          <span class="text-sm font-medium">Etiquetas (coma)</span>
          <input
            v-model="form.tags"
            class="border rounded p-2"
            placeholder="porcentajes, descuentos..."
          />
        </label>
        <label class="grid gap-1">
          <span class="text-sm font-medium">Dificultad</span>
          <select v-model="form.difficulty" class="border rounded p-2">
            <option value="easy">Fácil</option>
            <option value="medium">Media</option>
            <option value="hard">Difícil</option>
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

