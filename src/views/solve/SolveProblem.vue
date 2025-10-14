<!-- src/views/problems/ProblemSolve.vue -->
<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRoute } from "vue-router";
import { getDoc, doc } from "firebase/firestore";
import { db } from "@/services/firebase";

const route = useRoute();
const id = route.params.id as string;

const loading = ref(true);
const problem = ref<any | null>(null);

onMounted(async () => {
  loading.value = true;
  try {
    const snap = await getDoc(doc(db, "problems", id));
    problem.value = snap.exists() ? snap.data() : null;
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <section class="max-w-4xl mx-auto p-4">
    <h1 class="text-2xl font-bold mb-4">Detalle del problema</h1>
    <p v-if="loading">Cargando…</p>
    <div v-else-if="!problem">No encontrado.</div>
    <div v-else class="space-y-2">
      <p><strong>Título:</strong> {{ problem.title || id }}</p>
      <p v-if="problem.statement"><strong>Enunciado:</strong> {{ problem.statement }}</p>
      <p class="text-xs text-gray-500">
        Dificultad: {{ problem.difficulty ?? 'medium' }} — Tags: {{ (problem.tags ?? []).join(', ') || '—' }}
      </p>
    </div>
  </section>
</template>


