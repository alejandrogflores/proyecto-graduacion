<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  getDoc, addDoc, serverTimestamp, query, where, orderBy, limit, getDocs
} from "firebase/firestore";
import { problemDoc, colAttempts, type Problem } from "@/services/firebase";
import { useAuthStore } from "@/stores/auth";

const route = useRoute(); const router = useRouter();
const auth = useAuthStore();

const loading = ref(true);
const error = ref<string | null>(null);
const problem = ref<Problem | null>(null);
const selected = ref<number | null>(null);
const saving = ref(false);
const lastAnswer = ref<number | null>(null);
const lastResult = ref<"correct" | "incorrect" | null>(null);

onMounted(async () => {
  loading.value = true; error.value = null;
  const id = route.params.id as string;

  // 1) problema (crítico)
  try {
    const snap = await getDoc(problemDoc(id));
    if (!snap.exists()) { error.value = "El problema no existe."; return; }
    problem.value = snap.data() as Problem;
  } catch (e: any) {
    error.value = "No se pudo cargar el problema."; return;
  }

  // 2) último intento (no bloquea)
  try {
    const q = query(
      colAttempts,
      where("userUid", "==", auth.currentUser?.uid ?? "anon"),
      where("problemId", "==", id),
      orderBy("answeredAt", "desc"),
      limit(1)
    );
    const last = await getDocs(q);
    if (!last.empty) {
      const d = last.docs[0].data() as any;
      lastAnswer.value = d.answerIndex ?? null;
      lastResult.value = d.isCorrect ? "correct" : "incorrect";
    }
  } catch (e) { /* ignora (faltaría índice compuesto) */ }
  finally { loading.value = false; }
});

async function submit() {
  if (!problem.value || selected.value === null) return;
  saving.value = true; error.value = null;
  try {
    const isCorrect = selected.value === problem.value.correctIndex;
    await addDoc(colAttempts, {
      userUid: auth.currentUser?.uid ?? "anon",
      userEmail: auth.currentUser?.email ?? null,
      problemId: route.params.id as string,
      answerIndex: selected.value,
      isCorrect,
      answeredAt: serverTimestamp(),
    });
    lastAnswer.value = selected.value;
    lastResult.value = isCorrect ? "correct" : "incorrect";
    alert(isCorrect ? "¡Correcto! 🎉" : "Incorrecto. Inténtalo de nuevo.");
  } catch (e: any) {
    error.value = e?.message ?? "No se pudo guardar el intento.";
  } finally { saving.value = false; }
}
</script>

<template>
  <section class="max-w-3xl mx-auto p-4">
    <h1 class="text-2xl font-semibold mb-4">Resolver problema</h1>
    <div v-if="loading">Cargando…</div>
    <p v-else-if="error" class="text-red-600">{{ error }}</p>

    <div v-else-if="problem" class="space-y-4">
      <h2 class="text-xl font-semibold">{{ problem.title }}</h2>
      <p class="text-gray-700">{{ problem.statement }}</p>

      <div class="space-y-2">
        <label v-for="(opt, i) in problem.options" :key="i" class="flex items-center gap-2 cursor-pointer">
          <input type="radio" :value="i" v-model="selected" />
          <span>{{ String.fromCharCode(65 + i) }}) {{ opt }}</span>
        </label>
      </div>

      <div class="flex gap-2">
        <button class="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-60"
                :disabled="selected === null || saving" @click="submit">
          Enviar respuesta
        </button>
        <button class="px-4 py-2 rounded border" @click="router.back()">Volver</button>
      </div>

      <div v-if="lastAnswer !== null" class="text-sm text-gray-600">
        Último intento: {{ String.fromCharCode(65 + lastAnswer) }} —
        <strong :class="lastResult === 'correct' ? 'text-green-600' : 'text-red-600'">
          {{ lastResult === 'correct' ? 'Correcto' : 'Incorrecto' }}
        </strong>
      </div>
    </div>
  </section>
</template>


