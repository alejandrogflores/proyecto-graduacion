<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRoute } from "vue-router";
import { query, where, orderBy, getDocs } from "firebase/firestore";
import { colAssignments } from "@/services/firebase";

const route = useRoute();
const classId = route.params.id as string;

const loading = ref(false);
const error = ref<string | null>(null);
const items = ref<any[]>([]);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    // si no tienes dueAt aún, quita el orderBy
    const qRef = query(colAssignments, where("classId","==", classId), orderBy("dueAt","asc"));
    const snap = await getDocs(qRef);
    items.value = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e: any) {
    console.error(e);
    error.value = e?.message ?? "No se pudieron cargar los assignments.";
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section class="max-w-4xl mx-auto p-4">
    <h1 class="text-2xl font-semibold mb-4">Assignments de la clase</h1>
    <p v-if="loading">Cargando…</p>
    <p v-else-if="error" class="text-red-600">{{ error }}</p>
    <div v-else>
      <div v-if="!items.length" class="text-gray-600">No hay assignments.</div>
      <ul v-else class="space-y-2">
        <li v-for="a in items" :key="a.id" class="border rounded p-3">
          <div class="font-medium">{{ a.title }}</div>
          <div class="text-sm text-gray-500">
            Estado: {{ a.status }} · Entrega: {{ a.dueAt?.toDate?.() ?? a.dueAt }}
          </div>
          <div class="text-sm">Problemas: {{ a.problemIds?.length || 0 }}</div>
        </li>
      </ul>
    </div>
  </section>
</template>
