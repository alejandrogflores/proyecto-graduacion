<!-- src/views/assignments/MyAssignments.vue -->
<script setup lang="ts">
import { onMounted, ref, watch, computed } from "vue";
import { useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { getDocs, query, where, doc, getDoc, orderBy } from "firebase/firestore";

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
const statusByAssg = ref<Record<string, "open" | "done" | "none">>({});

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

async function hydrateStatuses(assignments: AssignmentRow[]) {
  const { uid } = storeToRefs(useProfileStore());
  const me = uid.value!;
  const map: Record<string, "open" | "done" | "none"> = {};

  // Traer intentos del alumno (abiertos + entregados)
  const qMine = query(colAttempts, where("studentUid", "==", me));
  const qs = await getDocs(qMine);
  const byAssg: Record<string, { open: boolean; done: boolean }> = {};
  for (const d of qs.docs) {
    const a = d.data() as any;
    const k = a.assignmentId as string;
    if (!byAssg[k]) byAssg[k] = { open: false, done: false };
    if (a.finishedAt) byAssg[k].done = true;
    else byAssg[k].open = true;
  }

  for (const a of assignments) {
    const st = byAssg[a.id] || { open: false, done: false };
    if (st.done) map[a.id] = "done";
    else if (st.open) map[a.id] = "open";
    else map[a.id] = "none";
  }
  statusByAssg.value = map;
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
      where("assigneeUids", "array-contains", profile.uid!),
      orderBy("publishedAt", "desc")
    );

    const qs = await getDocs(qy);
    rows.value = qs.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as AssignmentRow[];

    // estados
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

const pendingList = computed(() =>
  rows.value.filter((a) => statusByAssg.value[a.id] !== "done")
);
const deliveredList = computed(() =>
  rows.value.filter((a) => statusByAssg.value[a.id] === "done")
);

function goPlay(id: string) {
  router.push({ name: "AssignmentPlay", params: { id } });
}
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

    <template v-else>
      <!-- Pendientes -->
      <div class="mb-6">
        <div class="flex items-center gap-2 mb-2">
          <h2 class="text-lg font-semibold">Pendientes</h2>
          <span class="text-xs px-2 py-0.5 rounded-full bg-amber-600 text-white">
            {{ pendingList.length }}
          </span>
        </div>

        <p v-if="pendingList.length === 0" class="text-sm text-gray-500">No tienes asignaciones pendientes 🎉</p>

        <ul v-else class="space-y-3">
          <li v-for="a in pendingList" :key="a.id" class="border rounded p-3">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="font-semibold">{{ a.title || a.id }}</h3>
                <p class="text-xs text-gray-500">
                  Publicada: {{ fmtTs(a.publishedAt) }}
                  <span v-if="a.timeLimitSec"> • Límite: {{ a.timeLimitSec }}s</span>
                </p>
              </div>

              <button
                class="px-3 py-2 bg-black text-white rounded"
                @click="goPlay(a.id)"
              >
                Resolver
              </button>
            </div>
          </li>
        </ul>
      </div>

      <!-- Entregadas -->
      <div>
        <div class="flex items-center gap-2 mb-2">
          <h2 class="text-lg font-semibold">Entregadas</h2>
          <span class="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-700">
            {{ deliveredList.length }}
          </span>
        </div>

        <p v-if="deliveredList.length === 0" class="text-sm text-gray-500">Todavía no has entregado asignaciones.</p>

        <ul v-else class="space-y-3">
          <li v-for="a in deliveredList" :key="a.id" class="border rounded p-3">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="font-semibold">{{ a.title || a.id }}</h3>
                <p class="text-xs text-gray-500">
                  Publicada: {{ fmtTs(a.publishedAt) }}
                  <span v-if="a.timeLimitSec"> • Límite: {{ a.timeLimitSec }}s</span>
                </p>
              </div>

              <span class="px-3 py-2 rounded border">Entregado</span>
            </div>
          </li>
        </ul>
      </div>
    </template>
  </section>
</template>

