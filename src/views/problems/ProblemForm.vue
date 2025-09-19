<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  addDoc, setDoc, getDoc, serverTimestamp,
} from "firebase/firestore";
import { colProblems, problemDoc, type Problem, auth } from "@/services/firebase";

// Store de perfil (rol desde /users/{uid})
import { useProfileStore } from "@/stores/profile";
const profile = useProfileStore();

const route = useRoute();
const router = useRouter();

const id = computed(() => route.params.id as string | undefined);
const isEdit = computed(() => !!id.value);

const loading = ref(false);
const error = ref<string | null>(null);

// modelo
const title = ref("");
const statement = ref("");
const options = ref<string[]>(["", "", "", ""]);
const correctIndex = ref<number>(0);

function addOption() { options.value.push(""); }
function removeOption(i: number) {
  if (options.value.length <= 2) return;
  options.value.splice(i, 1);
  if (correctIndex.value >= options.value.length) correctIndex.value = 0;
}

function normalizeOptions(arr: string[]) {
  return arr.map(s => s.trim()).filter(s => s.length > 0);
}

async function load() {
  if (!isEdit.value) return;
  loading.value = true; error.value = null;
  try {
    const snap = await getDoc(problemDoc(id.value!));
    if (!snap.exists()) { error.value = "El problema no existe."; return; }

    // Opción A: basta con ser teacher/admin para editar
    if (!profile.isTeacherOrAdmin) {
      error.value = "No tienes permisos para editar este problema.";
      // toque opcional: redirección suave al listado
      setTimeout(() => router.push({ name: "ProblemsList" }), 1200);
      return;
    }

    const p = snap.data() as Problem;
    title.value = p.title ?? "";
    statement.value = p.statement ?? "";
    options.value = Array.isArray(p.options) && p.options.length ? p.options.map(String) : ["",""];
    correctIndex.value = Number.isInteger(p.correctIndex) ? (p.correctIndex as number) : 0;
    if (correctIndex.value < 0 || correctIndex.value >= options.value.length) correctIndex.value = 0;
  } catch (e: any) {
    error.value = e?.message ?? "No se pudo cargar el problema.";
  } finally {
    loading.value = false;
  }
}

async function save() {
  error.value = null;

  // 1) Asegura sesión
  const user = auth.currentUser;
  if (!user?.uid) {
    error.value = "Sesión expirada. Vuelve a iniciar sesión.";
    return;
  }

  // 2) Valida rol desde el STORE (no claims)
  console.log("[DEBUG] role(store):", profile.role);
  if (!profile.isTeacherOrAdmin) {
    error.value = "Tu cuenta no tiene permisos (rol teacher/admin requerido).";
    return;
  }

  // 3) Validaciones del formulario
  const cleanOptions = normalizeOptions(options.value);
  if (!title.value.trim()) { error.value = "Título requerido."; return; }
  if (!statement.value.trim()) { error.value = "Enunciado requerido."; return; }
  if (cleanOptions.length < 2) { error.value = "Mínimo 2 opciones válidas."; return; }
  if (correctIndex.value < 0 || correctIndex.value >= cleanOptions.length) {
    error.value = "Índice de respuesta correcta inválido."; return;
  }

  // 4) Construir payload
  const payload: any = {
    title: title.value.trim(),
    statement: statement.value.trim(),
    options: cleanOptions,
    correctIndex: Number(correctIndex.value),
  };
  if (isEdit.value) {
    payload.updatedAt = serverTimestamp();
    // ❌ NO tocar createdBy/createdAt en edición
  } else {
    payload.createdAt = serverTimestamp();
    payload.createdBy = user.uid; // ✅ requerido por reglas
  }

  // 5) Logs útiles
  const printablePayload = JSON.parse(JSON.stringify(payload));
  console.log("[DEBUG] isEdit:", isEdit.value);
  console.log("[DEBUG] uid:", user.uid);
  console.log("[DEBUG] payload (printable):", printablePayload);
  console.log("[DEBUG] options.length / correctIndex:", cleanOptions.length, Number(correctIndex.value));

  // 6) Escribir
  loading.value = true;
  try {
    if (isEdit.value) {
      await setDoc(problemDoc(id.value!), payload as any, { merge: true });
    } else {
      await addDoc(colProblems, payload as any);
    }
    router.push({ name: "ProblemsList" });
  } catch (e: any) {
    console.error("[DEBUG] Firestore write error:", e);
    error.value = e?.message ?? "No se pudo guardar.";
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section class="max-w-3xl mx-auto p-4 space-y-4">
    <h1 class="text-2xl font-semibold">
      {{ isEdit ? "Editar problema" : "Nuevo problema" }}
    </h1>

    <div v-if="loading">Cargando…</div>
    <p v-else-if="error" class="text-red-600">{{ error }}</p>

    <form v-else class="space-y-4" @submit.prevent="save">
      <div>
        <label class="block text-sm font-medium mb-1">Título</label>
        <input v-model="title" class="w-full border rounded px-3 py-2" placeholder="Ej: Suma básica" />
      </div>

      <div>
        <label class="block text-sm font-medium mb-1">Enunciado</label>
        <textarea v-model="statement" class="w-full border rounded px-3 py-2" rows="3"
          placeholder="Describe el problema…"></textarea>
      </div>

      <div>
        <label class="block text-sm font-medium mb-2">Opciones</label>
        <div class="space-y-2">
          <div v-for="(opt, i) in options" :key="i" class="flex items-center gap-2">
            <input type="radio" :value="i" v-model.number="correctIndex" :title="'Correcta: ' + i" />
            <input v-model="options[i]" class="flex-1 border rounded px-3 py-2" :placeholder="`Opción ${i+1}`" />
            <button type="button" class="px-2 py-1 border rounded" @click="removeOption(i)">Quitar</button>
          </div>
        </div>
        <button type="button" class="mt-2 px-3 py-1 border rounded" @click="addOption">+ Agregar opción</button>
        <p class="text-xs text-gray-500 mt-1">Marca con el radio la alternativa correcta.</p>
      </div>

      <div class="flex gap-2">
        <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-60">
          {{ isEdit ? "Guardar cambios" : "Crear problema" }}
        </button>
        <button type="button" class="px-4 py-2 border rounded" @click="router.back()">Cancelar</button>
      </div>
    </form>
  </section>
</template>



