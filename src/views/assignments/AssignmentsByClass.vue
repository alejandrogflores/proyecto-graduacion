<!-- src/views/classes/AssignmentsByClass.vue -->
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

function asDate(x: any): Date | null {
  if (!x) return null;
  if (typeof x?.toDate === "function") return x.toDate(); // Firestore Timestamp
  const d = new Date(x); // ISO/string/epoch
  return isNaN(d.getTime()) ? null : d;
}

async function load() {
  loading.value = true;
  error.value = null;
  try {
    // Índice compuesto requerido:
    // assignments: classId ASC, isPublished ASC, createdAt DESC
    const qRef = query(
      colAssignments,
      where("classId", "==", classId),
      orderBy("isPublished", "asc"),
      orderBy("createdAt", "desc")
    );
    const snap = await getDocs(qRef);
    items.value = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  } catch (e: any) {
    console.error(e);
    error.value =
      (typeof e?.message === "string" && e.message.includes("index"))
        ? "Esta consulta requiere un índice en Firestore. Ábrelo desde la consola para crearlo (revisa la consola del navegador para ver el link)."
        : (e?.message ?? "No se pudieron cargar las asignaciones.");
  } finally {
    loading.value = false;
  }
}
onMounted(load);
</script>

<template>
  <section class="max-w-4xl mx-auto p-4">
    <h1 class="text-2xl font-semibold mb-4">Asignaciones de la clase</h1>

    <p v-if="loading">Cargando…</p>
    <p v-else-if="error" class="text-red-600 whitespace-pre-wrap">{{ error }}</p>

    <div v-else>
      <div v-if="!items.length" class="text-gray-600">No hay asignaciones aún.</div>

      <ul v-else class="space-y-2">
        <li v-for="a in items" :key="a.id" class="border rounded p-3">
          <div class="font-medium flex items-center gap-2">
            {{ a.title || "(sin título)" }}

            <span
              v-if="a.isPublished === false"
              class="text-xs rounded px-2 py-0.5 border bg-yellow-50 text-yellow-800"
              title="Borrador (no publicado)"
            >draft</span>

            <span
              v-else
              class="text-xs rounded px-2 py-0.5 border bg-green-50 text-green-700"
            >published</span>
          </div>

          <div class="text-sm text-gray-500">
            Estado: {{ a.status || (a.isPublished ? "published" : "draft") }} ·
            Creada: <span>{{ asDate(a.createdAt)?.toLocaleString?.() || "—" }}</span> ·
            Entrega: <span>{{ asDate(a.dueAt)?.toLocaleString?.() || "—" }}</span>
          </div>

          <div class="text-sm">Problemas: {{ a.problemIds?.length || 0 }}</div>
        </li>
      </ul>
    </div>
  </section>
</template>


