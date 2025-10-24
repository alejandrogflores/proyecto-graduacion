<!-- src/views/assignments/MyAssignments.vue -->
<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useRouter } from "vue-router";
import {
  collection, getDocs, query, where, FieldPath,
  DocumentData
} from "firebase/firestore";
import { db } from "@/services/firebase";
import { useProfileStore } from "@/stores/profile";
import { storeToRefs } from "pinia";

type Assignment = {
  id: string;
  title?: string;
  problemIds?: string[];
  isPublished?: boolean;
  publishedAt?: any; // Timestamp
  createdAt?: any;   // Timestamp
};

type Attempt = {
  id: string;
  assignmentId: string;
  userUid?: string;
  studentUid?: string;    // compat antiguo
  status?: "in_progress" | "finished";
  startedAt?: any;
  finishedAt?: any;
  isFinished?: boolean;   // compat
  answeredAt?: any;
};

const router = useRouter();
const profile = useProfileStore();
if (!profile.ready) profile.init();

const { uid } = storeToRefs(profile);

const loading = ref(true);
const errorMsg = ref<string | null>(null);

const assignments = ref<Assignment[]>([]);
const attempts    = ref<Attempt[]>([]);

// --- helpers ---
function tsToMillis(x: any): number {
  if (!x) return 0;
  try { if (typeof x.toMillis === "function") return x.toMillis(); } catch {}
  try { if (typeof x.toDate === "function") return x.toDate().getTime(); } catch {}
  const d = new Date(x);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}
function fmtDate(x: any): string {
  const n = tsToMillis(x);
  return n ? new Date(n).toLocaleString() : "—";
}

// Carga assignments publicadas y dirigidas al alumno (dos esquemas posibles)
async function loadAssignmentsForStudent(studentUid: string) {
  const col = collection(db, "assignments");
  const found = new Map<string, Assignment>();

  // A) arreglo de UIDs
  try {
    const qA = query(col, where("isPublished", "==", true), where("assigneeUids", "array-contains", studentUid));
    const snapA = await getDocs(qA);
    for (const d of snapA.docs) found.set(d.id, { id: d.id, ...(d.data() as DocumentData) });
  } catch (e) {
    // silencioso: puede no existir el campo
    console.warn("[MyAssignments] assigneeUids query:", e);
  }

  // B) mapa {uid:true}
  try {
    const qB = query(col, where("isPublished", "==", true), where(new FieldPath("assignees", studentUid), "==", true));
    const snapB = await getDocs(qB);
    for (const d of snapB.docs) found.set(d.id, { id: d.id, ...(d.data() as DocumentData) });
  } catch (e) {
    console.warn("[MyAssignments] assignees map query:", e);
  }

  // a veces hay asignaciones publicadas sin destinatarios: no incluirlas

  // Ordenar en cliente por publishedAt/createdAt desc
  const arr = Array.from(found.values()).sort((a, b) => {
    const ta = tsToMillis(a.publishedAt || a.createdAt);
    const tb = tsToMillis(b.publishedAt || b.createdAt);
    return tb - ta;
  });

  assignments.value = arr;
}

// Carga intentos del alumno para esas assignments (en lotes de 10 usando where 'in')
async function loadAttemptsForAssignments(studentUid: string) {
  attempts.value = [];
  const ids = assignments.value.map((a) => a.id);
  if (ids.length === 0) return;

  // criterio por usuario: soporta userUid (nuevo) o studentUid (antiguo)
  const userField = "userUid";
  const legacyField = "studentUid";

  const by10 = (xs: string[]) => {
    const out: string[][] = [];
    for (let i = 0; i < xs.length; i += 10) out.push(xs.slice(i, i + 10));
    return out;
  };

  // Hace dos rondas (nuevo/legacy) para máxima compatibilidad
  for (const fieldName of [userField, legacyField]) {
    for (const chunk of by10(ids)) {
      try {
        const qy = query(
          collection(db, "attempts"),
          where(fieldName, "==", studentUid),
          where("assignmentId", "in", chunk)
        );
        const snap = await getDocs(qy);
        for (const d of snap.docs) attempts.value.push({ id: d.id, ...(d.data() as any) });
      } catch (e) {
        // Si falla por índice o por no existir el campo, seguimos (podría bastar la otra vuelta)
        console.warn(`[MyAssignments] attempts query (${fieldName})`, e);
      }
    }
  }
}

// status por assignment (terminada si hay intento finished/finishedAt/isFinished)
const lastAttemptByAssignment = computed(() => {
  const map = new Map<string, Attempt>();
  for (const at of attempts.value) {
    const key = at.assignmentId;
    const cur = map.get(key);
    const curT = cur ? (tsToMillis(cur.finishedAt) || tsToMillis(cur.answeredAt) || tsToMillis(cur.startedAt)) : -1;
    const atT  = tsToMillis(at.finishedAt) || tsToMillis(at.answeredAt) || tsToMillis(at.startedAt);
    if (!cur || atT > curT) map.set(key, at);
  }
  return map;
});

function isFinished(aid: string): boolean {
  const last = lastAttemptByAssignment.value.get(aid);
  if (!last) return false;
  if (last.status === "finished") return true;
  if (last.isFinished === true) return true;
  if (last.finishedAt) return true;
  return false;
}

const assignmentsPending = computed(() =>
  assignments.value.filter((a) => !isFinished(a.id))
);
const assignmentsDone = computed(() =>
  assignments.value.filter((a) => isFinished(a.id))
);

function handleAction(a: Assignment) {
  const last = lastAttemptByAssignment.value.get(a.id);
  if (isFinished(a.id) && last?.id) {
    router.push({ name: 'AssignmentResult', params: { id: a.id }, query: { attempt: last.id } });
  } else {
    router.push({ name: 'SolveAssignment', params: { id: a.id } });
  }
}

onMounted(async () => {
  try {
    loading.value = true;
    errorMsg.value = null;
    const u = uid.value;
    if (!u) throw new Error("No se pudo determinar el usuario.");
    await loadAssignmentsForStudent(u);
    await loadAttemptsForAssignments(u);
  } catch (e: any) {
    console.error(e);
    errorMsg.value = e?.message ?? "No se pudieron cargar tus asignaciones.";
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <section class="p-4 max-w-5xl mx-auto space-y-6">
    <header class="flex items-center justify-between">
      <h1 class="text-2xl font-semibold">Mis asignaciones</h1>
      <router-link
        :to="{ name: 'MyAttemptsHistory' }"
        class="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg border hover:bg-gray-50"
      >
        Ver historial
      </router-link>
    </header>

    <div v-if="loading">Cargando…</div>
    <div v-else-if="errorMsg" class="text-red-600">{{ errorMsg }}</div>

    <div v-else class="space-y-8">
      <!-- Pendientes -->
      <section>
        <h2 class="text-lg font-medium mb-2">Pendientes</h2>
        <div v-if="assignmentsPending.length === 0" class="text-sm text-gray-500">
          No tienes asignaciones pendientes.
        </div>

        <div v-else class="grid gap-3 md:grid-cols-2">
          <article
            v-for="a in assignmentsPending"
            :key="a.id"
            class="rounded-2xl border p-4 shadow-sm flex items-center justify-between"
          >
            <div>
              <h3 class="font-medium">{{ a.title || a.id }}</h3>
              <p class="text-sm text-gray-500">
                {{ (a.problemIds?.length || 0) }} problema(s) · publicada: {{ fmtDate(a.publishedAt || a.createdAt) }}
              </p>
            </div>
            <button class="px-3 py-1.5 rounded-lg text-sm bg-black text-white" @click="handleAction(a)">
              Continuar
            </button>
          </article>
        </div>
      </section>

      <!-- Entregadas -->
      <section>
        <h2 class="text-lg font-medium mb-2">Entregadas</h2>
        <div v-if="assignmentsDone.length === 0" class="text-sm text-gray-500">
          Aún no has entregado asignaciones.
        </div>

        <div v-else class="grid gap-3 md:grid-cols-2">
          <article
            v-for="a in assignmentsDone"
            :key="a.id"
            class="rounded-2xl border p-4 shadow-sm flex items-center justify-between"
          >
            <div>
              <h3 class="font-medium">{{ a.title || a.id }}</h3>
              <p class="text-sm text-gray-500">
                {{ (a.problemIds?.length || 0) }} problema(s) · publicada: {{ fmtDate(a.publishedAt || a.createdAt) }}
              </p>
            </div>
            <button class="px-3 py-1.5 rounded-lg text-sm bg-white border" @click="handleAction(a)">
              Ver resultados
            </button>
          </article>
        </div>
      </section>
    </div>
  </section>
</template>



