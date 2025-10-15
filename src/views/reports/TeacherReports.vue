<template>
  <div class="p-4 max-w-7xl mx-auto">
    <h1 class="text-2xl font-bold mb-4">Reportes del docente</h1>

    <div class="bg-white rounded-xl p-4 shadow mb-6 grid gap-4 md:grid-cols-3">
      <div>
        <div class="text-sm text-gray-500">Intentos entregados</div>
        <div class="text-3xl font-bold">{{ deliveredCount }}</div>
      </div>
      <div>
        <div class="text-sm text-gray-500">Respuestas totales</div>
        <div class="text-3xl font-bold">{{ totalAnswers }}</div>
      </div>
      <div>
        <div class="text-sm text-gray-500">Precisión global</div>
        <div class="text-3xl font-bold">
          {{ totalAnswers ? ((totalCorrect / totalAnswers) * 100).toFixed(1) : '0.0' }}%
        </div>
      </div>
    </div>

    <div class="bg-white rounded-xl p-4 shadow overflow-auto">
      <h2 class="text-xl font-semibold mb-3">Resumen por estudiante</h2>
      <table class="min-w-full text-sm">
        <thead>
          <tr class="text-left border-b">
            <th class="p-2">Estudiante</th>
            <th class="p-2"># Resp.</th>
            <th class="p-2"># Correctas</th>
            <th class="p-2">% Acierto</th>
            <th class="p-2">Última entrega</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in studentsSummary" :key="s.uid" class="border-b">
            <td class="p-2">
              <div class="font-medium">{{ s.email || s.uid }}</div>
              <div class="text-xs text-gray-500">{{ s.uid }}</div>
            </td>
            <td class="p-2">{{ s.total }}</td>
            <td class="p-2">{{ s.correct }}</td>
            <td class="p-2">
              {{ s.total ? ((s.correct / s.total) * 100).toFixed(1) : '0.0' }}%
            </td>
            <td class="p-2">{{ fmt(s.lastFinishedAt) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="mt-6 bg-white rounded-xl p-4 shadow overflow-auto">
      <h2 class="text-xl font-semibold mb-3">Últimos intentos</h2>
      <table class="min-w-full text-sm">
        <thead>
          <tr class="text-left border-b">
            <th class="p-2">Fecha</th>
            <th class="p-2">Estudiante</th>
            <th class="p-2">Asignación</th>
            <th class="p-2"># Resp.</th>
            <th class="p-2">% Acierto</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in latestAttempts" :key="a.id" class="border-b">
            <td class="p-2">{{ fmt(a.finishedAt) }}</td>
            <td class="p-2">{{ a.studentEmail || a.studentUid }}</td>
            <td class="p-2">{{ a.assignmentTitle || a.assignmentId }}</td>
            <td class="p-2">{{ a.answers?.length ?? 0 }}</td>
            <td class="p-2">
              {{
                (a.answers?.length ?? 0)
                  ? (((a.answers?.filter(x => x.correct).length ?? 0) / (a.answers?.length ?? 1)) * 100).toFixed(1)
                  : '0.0'
              }}%
            </td>
          </tr>
        </tbody>
      </table>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { getDocs, query, where, orderBy, limit } from "firebase/firestore";
import { colAttempts, type Attempt } from "@/services/firebase";
import { useProfileStore } from "@/stores/profile";

const profile = useProfileStore();
const attemptsAll = ref<Attempt[]>([]);
const loading = ref(true);

onMounted(async () => {
  try {
    const uid = profile.uid;
    if (!uid) {
      attemptsAll.value = [];
      return;
    }
    // intentos cuyo owner es el docente actual
    const q = query(
      colAttempts,
      where("ownerUid", "==", uid),
      orderBy("finishedAt", "desc"),
      limit(500) // límite razonable
    );
    const snap = await getDocs(q);
    attemptsAll.value = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Attempt) }));
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
});

// derivados
const delivered = computed(() => attemptsAll.value.filter(a => a.finishedAt));
const deliveredCount = computed(() => delivered.value.length);

const totalAnswers = computed(() =>
  delivered.value.reduce((acc, a) => acc + (a.answers?.length ?? 0), 0)
);

const totalCorrect = computed(() =>
  delivered.value.reduce((acc, a) => acc + (a.answers?.filter(x => x.correct).length ?? 0), 0)
);

// resumen por estudiante
type StudentSummary = {
  uid: string;
  email: string;
  total: number;
  correct: number;
  lastFinishedAt: any | null;
};

const studentsSummary = computed<StudentSummary[]>(() => {
  const map = new Map<string, StudentSummary>();
  for (const a of delivered.value) {
    const sid = a.studentUid;
    if (!sid) continue;
    const email = a.studentEmail ?? "";
    if (!map.has(sid)) {
      map.set(sid, { uid: sid, email, total: 0, correct: 0, lastFinishedAt: null });
    }
    const s = map.get(sid)!;
    const ans = a.answers ?? [];
    s.total += ans.length;
    s.correct += ans.filter(x => x.correct).length;
    // actualizar último terminado
    const curTs = toMillis(a.finishedAt);
    if (curTs && (!s.lastFinishedAt || curTs > toMillis(s.lastFinishedAt))) {
      s.lastFinishedAt = a.finishedAt;
    }
  }
  // ordenar por % acierto desc
  const arr = Array.from(map.values());
  arr.sort((a, b) => {
    const ap = a.total ? a.correct / a.total : 0;
    const bp = b.total ? b.correct / b.total : 0;
    return bp - ap;
  });
  return arr;
});

// últimos intentos (ordenados por fecha)
const latestAttempts = computed(() =>
  [...delivered.value].sort((a, b) => toMillis(b.finishedAt) - toMillis(a.finishedAt)).slice(0, 50)
);

// utilidades de tiempo/formatos
function toMillis(x: any): number {
  if (!x) return 0;
  // @ts-ignore
  if (typeof x?.toMillis === "function") return x.toMillis();
  if (typeof x === "number") return x;
  const d = new Date(x);
  return isNaN(+d) ? 0 : +d;
}

function fmt(x: any) {
  if (!x) return "—";
  // @ts-ignore
  if (typeof x?.toDate === "function") return x.toDate().toLocaleString();
  if (typeof x === "number") return new Date(x).toLocaleString();
  return String(x);
}
</script>

<style scoped>
</style>






