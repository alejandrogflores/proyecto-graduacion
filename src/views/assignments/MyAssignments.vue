<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { getDocs, query, where, doc, getDoc } from "firebase/firestore";

import { colAssignments, colAttempts } from "@/services/firebase";
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

// estado por asignación: none | open | done
const statusByAssg = ref<Record<string, "open"|"done"|"none">>({});

async function hydrateStatuses(assignments: AssignmentRow[]) {
  const { uid } = storeToRefs(useProfileStore());
  const me = uid.value!;
  const map: Record<string, "open"|"done"|"none"> = {};
  for (const a of assignments) {
    const key = `${a.id}_${me}`;
    const snap = await getDoc(doc(colAttempts, key));
    if (!snap.exists()) { map[a.id] = "none"; continue; }
    map[a.id] = snap.data().finishedAt ? "done" : "open";
  }
  statusByAssg.value = map;
}

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
    // Asignaciones publicadas donde el alumno está asignado
    const qy = query(
      colAssignments,
      where("isPublished", "==", true),
      where("assigneeUids", "array-contains", profile.uid!)
      // ,orderBy("publishedAt", "desc") // si lo usas, crea el índice sugerido
    );

    const qs = await getDocs(qy);
    rows.value = qs.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as AssignmentRow[];

    // carga estados por asignación
    await hydrateStatuses(rows.value);
  } catch (e: any) {
    console.error("[MyAssignments] load error:", e);
    errorMsg.value = e?.message ?? "No se pudieron cargar tus asignaciones.";
  } finally {
    loading.value = false;
  }
}
onMounted(() => { if (profile.ready) load(); });
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
            <h3 class="font-semibold">{{ a.title || a.id }}</h3>
            <p class="text-xs text-gray-500">
              Publicada: {{ fmtTs(a.publishedAt) }}
              <span v-if="a.timeLimitSec"> • Límite: {{ a.timeLimitSec }}s</span>
            </p>
          </div>

          <template v-if="statusByAssg[a.id] === 'done'">
            <span class="px-3 py-2 rounded border">Entregado</span>
          </template>
          <template v-else>
            <RouterLink
              class="px-3 py-2 bg-black text-white rounded"
              :to="`/assignments/${a.id}/play`"
            >Resolver</RouterLink>
          </template>
        </div>
      </li>
    </ul>
  </section>
</template>

