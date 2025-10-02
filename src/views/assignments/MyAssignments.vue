<!-- src/views/assignments/MyAssignments.vue -->
<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue";
import {
  query, onSnapshot, orderBy, where,
  type DocumentData, type QuerySnapshot
} from "firebase/firestore";
import { colAssignments } from "@/services/firebase";
import type { Assignment } from "@/models/assignment";

const loading = ref(true);
const rows = ref<Assignment[]>([]);
let off: null | (() => void) = null;

// Para probar: filtra por clase SI quieres
const FILTER_BY_CLASS = true;      // ← pon false para listar todo lo "open"
const myClassId = "clase1";

onMounted(() => {
  const parts: any[] = [colAssignments, where("status", "==", "open")];
  if (FILTER_BY_CLASS) parts.push(where("classId", "==", myClassId));
  parts.push(orderBy("dueAt", "asc"));

  const q = query(...(parts as Parameters<typeof query>));

  off = onSnapshot(
    q,
    (snap: QuerySnapshot<DocumentData>) => {
      rows.value = snap.docs.map(d => ({ id: d.id, ...(d.data() as Assignment) }));
      loading.value = false;
    },
    (err) => {
      console.error("[MyAssignments] onSnapshot", err);
      loading.value = false;
    }
  );
});

onBeforeUnmount(() => off && off());
</script>

<template>
  <div class="p-4 space-y-4">
    <h1 class="text-2xl font-semibold">Mis Asignaciones</h1>

    <div v-if="loading">Cargando…</div>

    <div v-else>
      <div v-if="rows.length === 0" class="text-gray-500">
        No hay asignaciones abiertas.
      </div>

      <ul v-else class="space-y-3">
        <li v-for="a in rows" :key="a.id" class="border rounded-xl p-3">
          <div class="font-medium">{{ a.title }}</div>
          <div class="text-sm">
            Clase: {{ a.classId }} · Problemas: {{ a.problemIds?.length ?? 0 }}
          </div>
          <div class="text-sm">
            Fecha límite:
            <span v-if="a.dueAt">{{ new Date(a.dueAt.toMillis()).toLocaleString() }}</span>
            <span v-else>No definida</span>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>



