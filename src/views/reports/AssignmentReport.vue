<script setup lang="ts">
import { onMounted, ref, watchEffect } from "vue";
import { useRoute, RouterLink } from "vue-router";
import { getDocs, query, where, orderBy, doc, getDoc } from "firebase/firestore";
import { colAttempts, assignmentDoc, classDoc } from "@/services/firebase";
import { useProfileStore } from "@/stores/profile";
import { storeToRefs } from "pinia";

type Row = {
  id: string;
  studentEmail?: string;
  score?: number;
  correctCount?: number;
  total?: number;
  finishedAt?: any;
};

const route = useRoute();
const assignmentId = route.params.id as string;

const profile = useProfileStore();
const { uid } = storeToRefs(profile);

const loading = ref(false);
const error = ref("");
const rows = ref<Row[]>([]);
const title = ref<string>(assignmentId);
const assigneeCount = ref<number | null>(null);

function fmtTs(ts: any): string {
  try {
    if (!ts) return "—";
    if (typeof ts.toDate === "function") return ts.toDate().toLocaleString();
    if (typeof ts.seconds === "number") return new Date(ts.seconds * 1000).toLocaleString();
    return new Date(ts).toLocaleString();
  } catch { return "—"; }
}

function avg(nums: number[]) { return nums.length ? Math.round(nums.reduce((a,b)=>a+b,0)/nums.length) : 0; }
function median(nums: number[]) {
  if (!nums.length) return 0;
  const a = [...nums].sort((x,y)=>x-y);
  const m = Math.floor(a.length/2);
  return a.length % 2 ? a[m] : Math.round((a[m-1]+a[m])/2);
}

async function load() {
  if (!uid.value) return;
  loading.value = true; error.value = "";
  rows.value = [];
  try {
    // metadata de la asignación
    const as = await getDoc(assignmentDoc(assignmentId));
    if (as.exists()) {
      const d = as.data() as any;
      title.value = d.title || assignmentId;
      // contar asignados desde la class (si está populado)
      assigneeCount.value = Array.isArray(d.assigneeUids) ? d.assigneeUids.length : null;
    }
    // intentos finalizados de esa asignación (orden cronológico)
    let qy = query(colAttempts,
      where("ownerUid", "==", uid.value),
      where("assignmentId", "==", assignmentId),
      orderBy("finishedAt", "desc")
    );
    let qs;
    try { qs = await getDocs(qy); }
    catch (e:any) {
      if (String(e?.message||"").includes("index")) {
        qy = query(colAttempts,
          where("ownerUid", "==", uid.value),
          where("assignmentId", "==", assignmentId));
        qs = await getDocs(qy);
      } else { throw e; }
    }

    rows.value = qs.docs.map(d => {
      const x = d.data() as any;
      return {
        id: d.id,
        studentEmail: x.studentEmail,
        score: x.score,
        correctCount: x.correctCount,
        total: x.total,
        finishedAt: x.finishedAt,
      };
    });
  } catch (e:any) {
    console.error("[AssignmentReport]", e);
    error.value = e?.message ?? "No se pudo cargar el reporte.";
  } finally {
    loading.value = false;
  }
}

const doneCount = () => rows.value.length;
const avgScore = () => avg(rows.value.filter(r => typeof r.score === "number").map(r => r.score as number));
const medianScore = () => median(rows.value.filter(r => typeof r.score === "number").map(r => r.score as number));

onMounted(() => {
  if (!profile.ready) profile.init?.();
  let started = false;
  watchEffect(() => {
    if (!started && profile.ready && uid.value) { started = true; load(); }
  });
});
</script>

<template>
  <section class="max-w-7xl mx-auto p-4">
    <div class="flex items-center justify-between mb-3">
      <h1 class="text-2xl font-bold">Reporte: {{ title }}</h1>
      <RouterLink class="px-3 py-1.5 border rounded" to="/attempts">Volver</RouterLink>
    </div>

    <p v-if="loading">Cargando…</p>
    <p v-else-if="error" class="text-red-600">{{ error }}</p>

    <div v-else>
      <div class="grid md:grid-cols-4 gap-4 mb-4">
        <div class="border rounded p-3"><div class="text-xs text-gray-500">Asignados</div><div class="text-2xl">{{ assigneeCount ?? "—" }}</div></div>
        <div class="border rounded p-3"><div class="text-xs text-gray-500">Entregados</div><div class="text-2xl">{{ doneCount() }}</div></div>
        <div class="border rounded p-3"><div class="text-xs text-gray-500">Promedio</div><div class="text-2xl">{{ avgScore() }}%</div></div>
        <div class="border rounded p-3"><div class="text-xs text-gray-500">Mediana</div><div class="text-2xl">{{ medianScore() }}%</div></div>
      </div>

      <div class="overflow-auto">
        <table class="min-w-full text-sm">
          <thead>
            <tr class="border-b text-left">
              <th class="py-2 pr-4">Alumno</th>
              <th class="py-2 pr-4">Puntaje</th>
              <th class="py-2 pr-4">Aciertos</th>
              <th class="py-2 pr-4">Finalizado</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.id" class="border-b">
              <td class="py-1 pr-4">
                <RouterLink :to="{ name: 'AttemptDetail', params: { id: r.id } }"
                            class="underline decoration-dotted">
                  {{ r.studentEmail || "—" }}
                </RouterLink>
              </td>
              <td class="py-1 pr-4">{{ r.score != null ? r.score + "%" : "—" }}</td>
              <td class="py-1 pr-4">{{ r.correctCount ?? "—" }}/{{ r.total ?? "—" }}</td>
              <td class="py-1 pr-4">{{ fmtTs(r.finishedAt) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

