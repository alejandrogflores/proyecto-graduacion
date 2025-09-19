<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from "vue";
import { query, where, orderBy, onSnapshot, Unsubscribe } from "firebase/firestore";
import { colAttempts, type Attempt } from "@/services/firebase";

type Student = { uid: string; email?: string; total: number; correct: number; accuracy: number };

// Props opcionales para filtrar/externar selección
const props = defineProps<{
  activityId?: string | null;
  selectedUid?: string | null;
}>();

const emit = defineEmits<{
  (e: "update:selectedUid", val: string | null): void;
}>();

const loading = ref(false);
const error = ref<string | null>(null);
const attemptsAll = ref<Attempt[]>([]);
const students = ref<Student[]>([]);
const localSelectedUid = ref<string | null>(props.selectedUid ?? null);
const unsub = ref<Unsubscribe | null>(null);

// Sincroniza prop <-> estado local
watch(
  () => props.selectedUid,
  (v) => (localSelectedUid.value = v ?? null)
);

function isCorrectAttempt(a: Attempt): boolean {
  if (typeof (a as any).correct === "boolean") return (a as any).correct;
  if (typeof (a as any).isCorrect === "boolean") return (a as any).isCorrect;
  if (typeof (a as any).score === "number" && typeof (a as any).maxScore === "number") {
    return (a as any).score >= (a as any).maxScore;
  }
  if ((a as any).result && String((a as any).result).toLowerCase() === "correct") return true;
  return false;
}

function buildAttemptsQuery() {
  let qRef = query(colAttempts, orderBy("createdAt", "desc"));
  if (props.activityId) {
    qRef = query(colAttempts, where("activityId", "==", props.activityId), orderBy("createdAt", "desc"));
  }
  return qRef;
}

function subscribeAttempts() {
  loading.value = true;
  error.value = null;
  if (unsub.value) unsub.value();

  const qRef = buildAttemptsQuery();
  unsub.value = onSnapshot(
    qRef,
    (snap) => {
      const arr: Attempt[] = [];
      snap.forEach((doc) => {
        const data = doc.data() as Attempt;
        (data as any).id = doc.id;
        arr.push(data);
      });
      attemptsAll.value = arr;
      recomputeStudents();
      loading.value = false;
    },
    (err) => {
      console.error(err);
      error.value = err.message ?? "Error al escuchar intentos";
      loading.value = false;
    }
  );
}

function recomputeStudents() {
  const map = new Map<string, Student>();
  const filtered = localSelectedUid.value
    ? attemptsAll.value.filter((a) => (a as any).uid === localSelectedUid.value)
    : attemptsAll.value;

  for (const a of filtered) {
    const uid = (a as any).uid as string | undefined;
    if (!uid) continue;
    const email = (a as any).email as string | undefined;

    if (!map.has(uid)) map.set(uid, { uid, email, total: 0, correct: 0, accuracy: 0 });
    const entry = map.get(uid)!;
    entry.total++;
    if (isCorrectAttempt(a)) entry.correct++;
  }

  students.value = Array.from(map.values())
    .map((s) => ({ ...s, accuracy: s.total ? Number(((s.correct / s.total) * 100).toFixed(1)) : 0 }))
    .sort((a, b) => (b.accuracy - a.accuracy) || (b.total - a.total));
}

watch(localSelectedUid, () => {
  emit("update:selectedUid", localSelectedUid.value);
  recomputeStudents();
});

subscribeAttempts();

onBeforeUnmount(() => {
  if (unsub.value) unsub.value();
});
</script>

<template>
  <section class="p-4">
    <div class="mb-3 flex gap-2 items-center">
      <label class="text-sm">Filtrar por UID:</label>
      <input
        v-model="localSelectedUid"
        placeholder="UID del estudiante (opcional)"
        class="border rounded px-2 py-1 w-64"
      />
      <button class="border px-3 py-1 rounded" @click="localSelectedUid = null">Limpiar filtro</button>
    </div>

    <div v-if="loading" class="text-sm">Cargando intentos...</div>
    <div v-else-if="error" class="text-red-600 text-sm">Error: {{ error }}</div>

    <table v-else class="w-full text-sm border-collapse">
      <thead>
        <tr class="border-b">
          <th class="text-left py-2">Estudiante</th>
          <th class="text-left py-2">UID</th>
          <th class="text-right py-2">Intentos</th>
          <th class="text-right py-2">Correctos</th>
          <th class="text-right py-2">% Acierto</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="s in students" :key="s.uid" class="border-b hover:bg-gray-50">
          <td class="py-2">{{ s.email ?? "—" }}</td>
          <td class="py-2"><code class="text-xs">{{ s.uid }}</code></td>
          <td class="py-2 text-right">{{ s.total }}</td>
          <td class="py-2 text-right">{{ s.correct }}</td>
          <td class="py-2 text-right">{{ s.accuracy }}%</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
