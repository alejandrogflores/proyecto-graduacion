<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { addDoc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { colProblems, problemDoc, type Problem, auth } from "@/services/firebase";
import { useProfileStore } from "@/stores/profile";

const route = useRoute();
const router = useRouter();
const profile = useProfileStore();

const id = computed(() => route.params.id as string | undefined);
const isEdit = computed(() => !!id.value);

const loading = ref(false);
const saving  = ref(false);                 // 👈 nuevo
const error   = ref<string | null>(null);

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

async function load() {
  if (!isEdit.value) return;
  loading.value = true; error.value = null;
  try {
    const snap = await getDoc(problemDoc(id.value!));
    if (!snap.exists()) { error.value = "El problema no existe."; return; }

    // (opcional) si quieres bloquear edición para no-teachers aquí
    if (!profile.isTeacherOrAdmin) {
      error.value = "No tienes permisos para editar este problema.";
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
  console.log("[SAVE] isEdit:", isEdit.value, "id:", id.value);
  error.value = null;
  saving.value = true;

  try {
    // Normalización: sin vacíos, índice dentro de rango
    const opts = options.value.map(o => o.trim()).filter(Boolean);
    let ci = Number(correctIndex.value);
    if (opts.length < 2) throw new Error("Debe haber al menos 2 opciones.");
    if (ci < 0 || ci >= opts.length) ci = 0;

    const base = {
      title: title.value.trim(),
      statement: statement.value.trim(),
      options: opts,
      correctIndex: ci,
    };

    if (!isEdit.value) {
      const payload = {
        ...base,
        createdBy: auth.currentUser!.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      console.log("[SAVE][create] payload", payload);
      await addDoc(colProblems, payload);
    } else {
      const payload = { ...base, updatedAt: serverTimestamp() };
      const ref = problemDoc(id.value!);
      console.log("[SAVE][update] ref", ref.path, "payload", payload);
      await setDoc(ref, payload, { merge: true });
    }

    console.log("[SAVE] OK");
    router.push({ name: "ProblemsList" });
  } catch (e: any) {
    console.error("[SAVE] error", e);
    error.value = e?.message ?? String(e);
  } finally {
    saving.value = false;
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
        <button
          type="submit"
          class="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-60"
          :disabled="saving"
          @click.prevent="save"          
        >
          {{ isEdit ? "Guardar cambios" : "Crear problema" }}
        </button>
        <button type="button" class="px-4 py-2 border rounded" @click="router.back()">Cancelar</button>
      </div>

      <p v-if="error" class="text-red-600 text-sm">{{ error }}</p>
    </form>
  </section>
</template>




