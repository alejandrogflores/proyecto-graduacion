<!-- src/views/assignments/SolveAssignment.vue -->
<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { getDoc } from "firebase/firestore";
import { assignmentDoc } from "@/services/firebase";

const route = useRoute();
const id = route.params.id as string;

const loading = ref(true);
const a = ref<any | null>(null);

onMounted(async () => {
  loading.value = true;
  try {
    const snap = await getDoc(assignmentDoc(id));
    a.value = snap.exists() ? snap.data() : null;
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <section class="max-w-4xl mx-auto p-4">
    <h1 class="text-2xl font-bold mb-4">Resolver asignación</h1>
    <p v-if="loading">Cargando…</p>
    <div v-else-if="!a">No encontrada.</div>
    <div v-else>
      <p class="mb-2"><strong>Título:</strong> {{ a.title }}</p>
      <p class="mb-2"><strong>Publicado:</strong> {{ a.isPublished ? 'Sí' : 'No' }}</p>
      <p class="mb-2" v-if="a.timeLimitSec"><strong>Límite:</strong> {{ a.timeLimitSec }}s</p>

      <!-- aquí integras tu flujo de intentos/resolución -->
      <div class="mt-6 p-3 border rounded bg-gray-50">[UI de resolución aquí]</div>
    </div>
  </section>
</template>




