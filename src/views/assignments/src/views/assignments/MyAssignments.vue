<script setup lang="ts">
import { ref, onMounted } from "vue";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/services/firebase";
import { useProfileStore } from "@/stores/profile";

const profile = useProfileStore();

const loading = ref(false);
const error = ref<string | null>(null);
const assignments = ref<any[]>([]);

async function load() {
  if (!profile.uid) await profile.init?.();

  loading.value = true;
  error.value = null;

  try {
    // 👉 Coincide con lo que exigen las rules para alumnos:
    // publishedAt definido (ya publicado) y el uid en assigneeUids
    const qy = query(
      collection(db, "assignments"),
      where("assigneeUids", "array-contains", profile.uid),
      // publishedAt entre [0 .. ahora] para evitar futuros
      where("publishedAt", ">=", new Timestamp(0, 0)),
      where("publishedAt", "<=", Timestamp.now()),
      orderBy("publishedAt", "desc")
    );

    const snap = await getDocs(qy);
    assignments.value = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  } catch (e: any) {
    console.error("[MyAssignments] load error:", e);
    error.value = e?.message ?? "No se pudieron cargar tus tareas.";
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section class="max-w-4xl mx-auto p-4">
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-2xl font-semibold">Mis asignaciones</h1>
      <button class="px-3 py-1.5 rounded-lg border" @click="load" :disabled="loading">
        {{ loading ? "Cargando..." : "Actualizar" }}
      </button>
    </div>

    <p v-if="loading">Cargando…</p>
    <p v-else-if="error" class="text-red-600">{{ error }}</p>

    <div v-else>
      <div v-if="!assignments.length" class="text-gray-600">
        No hay asignaciones disponibles por ahora.
      </div>

      <ul v-else class="space-y-2">
        <li v-for="a in assignments" :key="a.id" class="border rounded p-3 flex items-center justify-between">
          <div>
            <div class="font-medium">{{ a.title || a.id }}</div>
            <div class="text-sm text-gray-500">
              Publicada:
              {{ a.publishedAt?.toMillis?.() ? new Date(a.publishedAt.toMillis()).toLocaleString() : "-" }}
            </div>
          </div>

          <router-link
            class="px-3 py-1.5 rounded bg-black text-white"
            :to="{ name: 'SolveAssignment', params: { id: a.id } }"
          >
            Abrir
          </router-link>
        </li>
      </ul>
    </div>
  </section>
</template>


