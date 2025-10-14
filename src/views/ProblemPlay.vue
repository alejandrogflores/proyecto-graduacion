<template>
  <div class="p-4 max-w-3xl mx-auto">
    <h1 class="text-2xl font-bold mb-4">Resolver problema</h1>

    <div v-if="loading">Cargando…</div>
    <div v-else-if="!problem">No se encontró el problema.</div>
    <div v-else class="space-y-4">
      <div class="bg-white rounded-xl p-4 shadow">
        <h2 class="text-xl font-semibold mb-2">{{ problem.title }}</h2>
        <p class="text-gray-700 whitespace-pre-line">{{ problem.statement }}</p>
      </div>

      <!-- Opción múltiple (incluye verdadero/falso si hay 2 opciones) -->
      <div v-if="Array.isArray(problem.options) && problem.options.length" class="bg-white rounded-xl p-4 shadow">
        <h3 class="font-medium mb-2">Selecciona una opción:</h3>
        <div class="space-y-2">
          <label
            v-for="(opt, idx) in problem.options"
            :key="idx"
            class="flex items-center gap-2 cursor-pointer"
          >
            <input
              type="radio"
              name="answer"
              :value="idx"
              v-model="selectedIndex"
            />
            <span>{{ idx + 1 }}. {{ opt }}</span>
          </label>
        </div>
      </div>

      <!-- Numérico (si NO hay options) -->
      <div v-else class="bg-white rounded-xl p-4 shadow">
        <h3 class="font-medium mb-2">Respuesta numérica:</h3>
        <input
          type="number"
          class="border rounded px-3 py-2 w-48"
          v-model="numericAnswer"
          placeholder="Tu respuesta"
        />
      </div>

      <div class="flex gap-2">
        <button class="px-4 py-2 rounded bg-blue-600 text-white" @click="onBack">Volver</button>
        <button class="px-4 py-2 rounded bg-emerald-600 text-white" @click="onDummySubmit">
          (Demo) Marcar como respondido localmente
        </button>
      </div>
      <p v-if="msg" class="text-sm text-gray-600">{{ msg }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/services/firebase";
import type { Problem } from "@/models/problem";

const route = useRoute();
const router = useRouter();

const problemId = (route.params.id as string) || "";
const loading = ref(true);
const problem = ref<Problem | null>(null);

// Estados de respuesta local (solo para que compile/funcione la UI)
const selectedIndex = ref<number | null>(null);
const numericAnswer = ref<string>("");
const msg = ref("");

onMounted(async () => {
  try {
    if (problemId) {
      const refDoc = doc(db, "problems", problemId);
      const snap = await getDoc(refDoc);
      problem.value = (snap.exists() ? ({ id: snap.id, ...snap.data() } as Problem) : null);
    }
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
});

function onBack() {
  router.back();
}

function onDummySubmit() {
  // Solo para dejar funcional la pantalla y evitar errores de tipos
  if (Array.isArray(problem.value?.options) && problem.value?.options?.length) {
    if (selectedIndex.value == null) {
      msg.value = "Selecciona una opción.";
      return;
    }
    msg.value = `Respuesta marcada: opción #${Number(selectedIndex.value) + 1}`;
  } else {
    if (!numericAnswer.value) {
      msg.value = "Ingresa una respuesta numérica.";
      return;
    }
    msg.value = `Respuesta numérica: ${numericAnswer.value}`;
  }
}
</script>

<style scoped>
</style>
