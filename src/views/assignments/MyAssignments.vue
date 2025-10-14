<!-- src/views/assignments/MyAssignments.vue -->
<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { getDocs, query, where /*, orderBy */ } from "firebase/firestore";
import { colAssignments } from "@/services/firebase";
import { useProfileStore } from "@/stores/profile";

type AssignmentRow = {
  id: string;
  title?: string;
  classId?: string | null;
  isPublished: boolean;
  assigneeUids: string[];
  timeLimitSec?: number | null;
  createdAt?: any;
  publishedAt?: any;
};

const profile = useProfileStore();
if (!profile.ready) profile.init?.();

const router = useRouter();
const loading = ref(false);
const errorMsg = ref("");
const rows = ref<AssignmentRow[]>([]);

function fmtTs(ts: any): string {
  try {
    if (!ts) return "—";
    if (typeof ts.toDate === "function") return ts.toDate().toLocaleString();
    if (typeof ts.seconds === "number") return new Date(ts.seconds * 1000).toLocaleString();
    return new Date(ts).toLocaleString();
  } catch {
    return "—";
  }
}

async function load() {
  if (!profile.uid) return;
  loading.value = true;
  errorMsg.value = "";
  rows.value = [];

  try {
    // 👇 Query alineada con reglas para STUDENT:
    // - isPublished == true
    // - assigneeUids array-contains uid
    const qy = query(
      colAssignments,
      where("isPublished", "==", true),
      where("assigneeUids", "array-contains", profile.uid!)
      // Si quieres ordenar, descomenta y crea el índice que pida Firestore:
      // ,orderBy("createdAt", "desc")
    );

    const qs = await getDocs(qy);
    rows.value = qs.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as AssignmentRow[];
  } catch (e: any) {
    console.error("[MyAssignments] load error:", e);
    errorMsg.value = e?.message ?? "No se pudieron cargar tus asignaciones.";
  } finally {
    loading.value = false;
  }
}

function goSolve(a: AssignmentRow) {
  router.push({ name: "SolveAssignment", params: { id: a.id } });
}

onMounted(() => {
  if (profile.ready) load();
});
watch(() => profile.ready, (r) => r && load());
</script>

<template>
  <section class="max-w-5xl mx-auto p-4">
    <div class="flex items-center gap-3 mb-4">
      <h1 class="text-2xl font-bold">Mis asignaciones</h1>
      <button class="px-3 py-1.5 rounded border" @click="load">Actualizar</button>
    </div>

    <p v-if="!profile.ready" class="text-gray-600">Cargando perfil…</p>
    <p v-else-if="loading">Cargando…</p>
    <p v-else-if="errorMsg" class="text-red-600">{{ errorMsg }}</p>
    <p v-else-if="rows.length === 0">No tienes asignaciones disponibles.</p>

    <ul v-else class="space-y-3">
      <li v-for="a in rows" :key="a.id" class="border rounded p-3">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="font-semibold">
              {{ a.title || a.id }}
            </h3>
            <p class="text-xs text-gray-500">
              Publicada: {{ fmtTs(a.publishedAt) }}
              <span v-if="a.timeLimitSec"> • Límite: {{ a.timeLimitSec }}s</span>
            </p>
          </div>

          <button class="px-3 py-1.5 rounded bg-black text-white" @click="goSolve(a)">
            Resolver
          </button>
        </div>
      </li>
    </ul>
  </section>
</template>
