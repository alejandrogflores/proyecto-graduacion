<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

import { useProfileStore } from "@/stores/profile";
import {
  colAttempts,
  assignmentDoc,
  problemDoc,
} from "@/services/firebase";

// ===== Tipos mínimos =====
type Problem = {
  id: string;
  type: "multiple-choice";
  title: string;
  statement: string;
  options: string[];
  correctIndex: number;
};

type Assignment = {
  id: string;
  title: string;
  ownerUid: string;
  classId: string;
  problemIds: string[];
  isPublished: boolean;
  timeLimitSec?: number;
  publishedAt?: any;
};

type Answer = { problemId: string; selectedIndex: number; correct: boolean };

// ===== estado =====
const route = useRoute();
const router = useRouter();
const assignmentId = route.params.id as string;

const profileStore = useProfileStore();
const { uid, email } = storeToRefs(profileStore);

const loading = ref(true);
const saving = ref(false);
const errorMsg = ref("");

const assignment = ref<Assignment | null>(null);
const problems = ref<Problem[]>([]);
const attemptId = ref<string | null>(null);
const answers = ref<Answer[]>([]);
const timeLimitSec = ref<number | null>(null);

// timer
const remaining = ref<number | null>(null);
let timerHandle: any = null;

// ===== helpers =====
function computeScore(ans: Answer[], problemMap: Map<string, Problem>) {
  let correct = 0;
  for (const a of ans) {
    const p = problemMap.get(a.problemId);
    if (!p) continue;
    a.correct = a.selectedIndex === p.correctIndex;
    if (a.correct) correct++;
  }
  const total = ans.length || 1;
  const score = Math.round((100 * correct) / total);
  return { correct, total, score };
}

async function fetchAssignmentAndProblems() {
  const aSnap = await getDoc(assignmentDoc(assignmentId));
  if (!aSnap.exists()) throw new Error("La asignación no existe.");
  const a = { id: aSnap.id, ...(aSnap.data() as any) } as Assignment;
  assignment.value = a;

  timeLimitSec.value = a.timeLimitSec ?? null;

  const list: Problem[] = [];
  for (const pid of a.problemIds || []) {
    const psnap = await getDoc(problemDoc(pid));
    if (psnap.exists()) {
      const data = psnap.data() as any;
      list.push({
        id: psnap.id,
        type: (data.type ?? "multiple-choice") as "multiple-choice",
        title: data.title ?? "(Sin título)",
        statement: data.statement ?? "",
        options: data.options ?? [],
        correctIndex: data.correctIndex ?? -1,
      });
    }
  }
  problems.value = list;
}

async function ensureAttempt() {
  const key = `${assignmentId}_${uid.value!}`;
  const ref = doc(colAttempts, key);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    const data: any = snap.data();
    if (data.finishedAt) {
      alert("Esta asignación ya fue entregada.");
      router.push("/assignments/my");
      return;
    }
    attemptId.value = key;
    answers.value = Array.isArray(data.answers)
      ? data.answers.map((a: any) => ({ ...a }))
      : problems.value.map((p) => ({ problemId: p.id, selectedIndex: -1, correct: false }));
    await setDoc(ref, { answers: answers.value }, { merge: true });
    return;
  }

  // crear intento nuevo (ID determinístico)
  const init = problems.value.map((p) => ({ problemId: p.id, selectedIndex: -1, correct: false }));
  const payload = {
    assignmentId,
    assignmentTitle: assignment.value!.title,
    ownerUid: assignment.value!.ownerUid,
    studentUid: uid.value!,
    studentEmail: email.value ?? undefined,
    answers: init,
    correctCount: 0,
    total: init.length,
    score: 0,
    startedAt: serverTimestamp(),
    finishedAt: null,
    version: 1,
  } as any;

  await setDoc(ref, payload);
  attemptId.value = key;
  answers.value = init;
}

async function saveAnswer(problemId: string, selectedIndex: number) {
  if (!attemptId.value) return;
  const idx = answers.value.findIndex(a => a.problemId === problemId);
  if (idx >= 0) answers.value[idx].selectedIndex = selectedIndex;

  await setDoc(doc(colAttempts, attemptId.value), {
    answers: answers.value,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

async function finishAttempt() {
  if (!attemptId.value || !assignment.value) return;
  saving.value = true;
  try {
    const pmap = new Map(problems.value.map(p => [p.id, p]));
    const summary = computeScore(answers.value, pmap);

    await setDoc(doc(colAttempts, attemptId.value), {
      answers: answers.value,
      correctCount: summary.correct,
      total: summary.total,
      score: summary.score,
      finishedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });

    alert(`¡Enviado! Puntaje: ${summary.score} (${summary.correct}/${summary.total})`);
    router.push("/assignments/my");
  } catch (e: any) {
    console.error(e);
    errorMsg.value = e?.message ?? String(e);
  } finally {
    saving.value = false;
  }
}

function startTimerIfNeeded() {
  if (!timeLimitSec.value) return;
  remaining.value = timeLimitSec.value;
  if (timerHandle) clearInterval(timerHandle);
  timerHandle = setInterval(async () => {
    if (remaining.value === null) return;
    remaining.value = Math.max(0, remaining.value - 1);
    if (remaining.value === 0) {
      clearInterval(timerHandle);
      await finishAttempt();
    }
  }, 1000);
}

onMounted(async () => {
  try {
    loading.value = true;
    if (!uid.value) throw new Error("No hay sesión activa.");
    await fetchAssignmentAndProblems();
    await ensureAttempt();
    startTimerIfNeeded();
  } catch (e: any) {
    console.error(e);
    errorMsg.value = e?.message ?? String(e);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="max-w-3xl mx-auto p-4">
    <h1 class="text-2xl font-bold mb-2">Resolver: {{ assignment?.title }}</h1>

    <div v-if="assignment?.timeLimitSec" class="mb-4">
      <span class="px-2 py-1 rounded bg-gray-100">Tiempo límite: {{ assignment.timeLimitSec }}s</span>
      <span v-if="remaining !== null" class="ml-3 px-2 py-1 rounded bg-black text-white">Restante: {{ remaining }}s</span>
    </div>

    <p v-if="loading">Cargando…</p>
    <p v-if="errorMsg" class="text-red-600">{{ errorMsg }}</p>

    <div v-if="!loading">
      <div v-for="(p, i) in problems" :key="p.id" class="mb-6 p-4 rounded border">
        <h3 class="font-semibold mb-1">Pregunta {{ i + 1 }} — {{ p.title }}</h3>
        <p class="mb-3">{{ p.statement }}</p>

        <div v-if="p.type === 'multiple-choice'" class="space-y-2">
          <label v-for="(opt, j) in p.options" :key="j" class="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              :name="`q-${p.id}`"
              :value="j"
              :checked="answers.find(a => a.problemId === p.id)?.selectedIndex === j"
              @change="saveAnswer(p.id, j)"
            />
            <span>{{ opt }}</span>
          </label>
        </div>
      </div>

      <div class="flex items-center gap-3">
        <button class="px-4 py-2 rounded bg-black text-white" :disabled="saving" @click="finishAttempt">
          Entregar
        </button>
        <RouterLink class="px-4 py-2 rounded border" to="/assignments/my">Cancelar</RouterLink>
      </div>
    </div>
  </div>
</template>

