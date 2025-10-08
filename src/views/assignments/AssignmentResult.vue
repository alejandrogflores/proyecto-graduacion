<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useRoute } from "vue-router";
import { getDoc, doc } from "firebase/firestore";
import { attemptDoc, colProblems } from "@/services/firebase";


const route = useRoute();
const assignmentId = route.params.id as string;
const attemptId = (route.query.attempt as string) || "";

const loading = ref(true);
const attempt = ref<any>(null);
const problemMap = ref<Record<string, any>>({});
const notice = ref("");

onMounted(() => {
  const msg = sessionStorage.getItem("assignmentNotice");
  if (msg) {
    notice.value = msg;
    sessionStorage.removeItem("assignmentNotice");
    setTimeout(() => (notice.value = ""), 4000); // desaparece en 4s
  }
});

onMounted(load);

async function load() {
  try {
    if (!attemptId) throw new Error("Falta attempt id.");
    const aSnap = await getDoc(attemptDoc(attemptId));
    if (!aSnap.exists()) throw new Error("Intento no encontrado.");
    attempt.value = { id: aSnap.id, ...(aSnap.data() as any) };

    // Trae textos de los problemas para el desglose
    for (const ans of attempt.value.answers ?? []) {
      const pSnap = await getDoc(doc(colProblems, ans.problemId));
      if (pSnap.exists()) {
        problemMap.value[ans.problemId] = { id: pSnap.id, ...(pSnap.data() as any) };
      }
    }
  } finally {
    loading.value = false;
  }
}

const score = computed(() => attempt.value?.score ?? 0);
</script>

<template>
    <transition name="fade">
        <div
            v-if="notice"
            class="fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow bg-emerald-100 text-emerald-800"
            role="status"
            aria-live="polite"
        >
            {{ notice }}
        </div>
    </transition>
  <div class="p-6">
    <h1 class="text-2xl font-semibold mb-2">Resultados</h1>

    <div v-if="loading">Cargando…</div>

    <div v-else>
      <p class="mb-4">
        <strong>Puntaje:</strong> {{ score }} / 100 •
        <strong>Correctas:</strong> {{ attempt.correctCount }}/{{ attempt.total }}
      </p>

      <div class="space-y-4">
        <div
          v-for="a in attempt.answers"
          :key="a.problemId"
          class="border rounded p-4"
        >
          <div class="font-medium mb-1">
            {{ problemMap[a.problemId]?.title ?? "Problema" }}
          </div>

          <div class="text-sm mb-1">
            {{ problemMap[a.problemId]?.statement }}
          </div>

          <div class="text-sm">
            Tu respuesta:
            <strong>
              {{ problemMap[a.problemId]?.options?.[a.selectedIndex] ?? "—" }}
            </strong>
            <span :class="a.correct ? 'text-green-700' : 'text-red-700'">
              • {{ a.correct ? 'Correcto' : 'Incorrecto' }}
            </span>
          </div>

          <div v-if="!a.correct" class="text-xs mt-1">
            Correcta:
            <strong>
              {{
                problemMap[a.problemId]?.options?.[
                  problemMap[a.problemId]?.correctIndex
                ]
              }}
            </strong>
          </div>
        </div>
      </div>

      <div class="mt-6">
        <router-link class="px-3 py-2 rounded bg-gray-200" to="/assignments/my">
          Volver a mis asignaciones
        </router-link>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active { transition: opacity 0.4s; }
.fade-enter-from,
.fade-leave-to { opacity: 0; }
</style>
