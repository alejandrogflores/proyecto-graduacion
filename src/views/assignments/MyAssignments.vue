<script setup lang="ts"> 
import { ref, onMounted, computed } from "vue";
import { collection, getDocs, query, where, doc, getDoc } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useProfileStore } from "@/stores/profile";
import { storeToRefs } from "pinia";
import StatusChip from "@/components/StatusChip.vue";
import { useRouter } from "vue-router";

type Assignment = { 
    id: string; 
    title?: string; 
    problemIds?: string[]; 
    ownerUid?: string; 
    timeLimitSec?: number;};

type Attempt = {
  id: string;
  assignmentId: string;
  studentUid: string;
  status?: "in_progress" | "finished";
  startedAt?: any;  // Timestamp
  finishedAt?: any; // Timestamp | null
  score?: number;
};

const router = useRouter();
const profile = useProfileStore();
const { uid } = storeToRefs(profile);

const loading = ref(true);
const assignments = ref<Assignment[]>([]);
const attempts = ref<Attempt[]>([]);

onMounted(async () => {
  loading.value = true;
  // 1) Trae asignaciones
  const qsA = await getDocs(query(collection(db, "assignments")));
  assignments.value = qsA.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

  // 2) Trae intentos del alumno
  const qsT = await getDocs(query(collection(db, "attempts"), where("studentUid", "==", uid.value)));
  attempts.value = qsT.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as Attempt[];

  loading.value = false;
});

// último intento por asignación (elige el que tenga finishedAt más reciente; si no, el de startedAt)
const lastAttemptByAssignment = computed(() => {
  const map = new Map<string, Attempt>();
  for (const at of attempts.value) {
    const key = at.assignmentId;
    const current = map.get(key);
    const atTime = at.finishedAt?.toMillis?.() ?? at.startedAt?.toMillis?.() ?? 0;
    const curTime = current
      ? (current.finishedAt?.toMillis?.() ?? current.startedAt?.toMillis?.() ?? 0)
      : -1;
    if (!current || atTime > curTime) map.set(key, at);
  }
  return map;
});

const statusByAssignment = computed(() => {
  const map = new Map<string, "not_started" | "in_progress" | "finished">();
  for (const a of assignments.value) {
    const last = lastAttemptByAssignment.value.get(a.id);
    if (!last) map.set(a.id, "not_started");
    else map.set(a.id, last.status ?? (last.finishedAt ? "finished" : "in_progress"));
  }
  return map;
});

function handleAction(a: Assignment) {
  const last = lastAttemptByAssignment.value.get(a.id);
  const status = statusByAssignment.value.get(a.id) || "not_started";

  if (status === "finished" && last?.id) {
    // Ver resultados
    router.push({ path: `/assignments/${a.id}/result`, query: { attempt: last.id } });
  } else {
    // Continuar o iniciar
    router.push({ path: `/assignments/${a.id}/solve` });
  }
}
</script>

<template>
  <div class="p-4 max-w-4xl mx-auto">
    <!-- Encabezado -->
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-xl font-semibold">Mis asignaciones</h1>

      <!-- Link a historial (fuera del loop) -->
      <router-link
        :to="{ name: 'MyAttemptsHistory' }"
        class="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg border hover:bg-gray-50"
      >
        Ver historial
      </router-link>
    </div>

    <div v-if="loading">Cargando…</div>

    <div v-else>
      <div v-if="assignments.length === 0" class="text-gray-600">
        Aún no tienes asignaciones.
      </div>

      <div v-else class="grid gap-3 md:grid-cols-2">
        <div
          v-for="a in assignments"
          :key="a.id"
          class="rounded-2xl border p-4 shadow-sm flex items-center justify-between"
        >
          <div>
            <h2 class="font-medium">{{ a.title || a.id }}</h2>
            <p class="text-sm text-gray-500">
              {{ a.problemIds?.length || 0 }} problema(s)
            </p>
          </div>

          <div class="flex items-center gap-3">
            <StatusChip :status="statusByAssignment.get(a.id) || 'not_started'" />
            <button
              class="px-3 py-1.5 rounded-lg text-sm bg-black text-white"
              @click="handleAction(a)"
            >
              {{
                (statusByAssignment.get(a.id) || 'not_started') === 'finished'
                  ? 'Ver resultados'
                  : 'Continuar'
              }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>


