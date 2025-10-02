<script setup lang="ts">
import { ref, onMounted } from "vue";
import { query, where, getDocs } from "firebase/firestore";
import { colClasses, colAssignments } from "@/services/firebase";
import { useProfileStore } from "@/stores/profile";

const profile = useProfileStore();
const loading = ref(false);
const error = ref<string | null>(null);
const assignments = ref<any[]>([]);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    // 1) clases donde soy estudiante
    const qClasses = query(colClasses, where("students","array-contains", profile.uid));
    const snapC = await getDocs(qClasses);
    const classIds = snapC.docs.map(d => d.id);
    if (!classIds.length) { assignments.value = []; return; }

    // 2) assignments de esas clases (en lotes de 10 para el "in")
    const results: any[] = [];
    for (let i = 0; i < classIds.length; i += 10) {
      const chunk = classIds.slice(i, i + 10);
      const qA = query(colAssignments, where("classId","in", chunk));
      const snapA = await getDocs(qA);
      results.push(...snapA.docs.map(d => ({ id: d.id, ...d.data() })));
    }
    assignments.value = results;
  } catch (e: any) {
    console.error(e);
    error.value = e?.message ?? "No se pudieron cargar tus tareas.";
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section class="max-w-4xl mx-auto p-4">
    <h1 class="text-2xl font-semibold mb-4">Mis tareas</h1>
    <p v-if="loading">Cargando…</p>
    <p v-else-if="error" class="text-red-600">{{ error }}</p>
    <div v-else>
      <div v-if="!assignments.length" class="text-gray-600">No tienes tareas asignadas.</div>
      <ul v-else class="space-y-2">
        <li v-for="a in assignments" :key="a.id" class="border rounded p-3">
          <div class="font-medium">{{ a.title }}</div>
          <div class="text-sm text-gray-500">Clase: {{ a.classId }} · Estado: {{ a.status }}</div>
        </li>
      </ul>
    </div>
  </section>
</template>
