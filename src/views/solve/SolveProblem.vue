<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  getDoc,
  addDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  limit,
  getDocs,
} from "firebase/firestore";
import {
  problemDoc,
  colAttempts,
  type Problem,
  auth,
} from "@/services/firebase";

const route = useRoute();
const router = useRouter();

const loading = ref(true);
const error = ref<string | null>(null);
const problem = ref<Problem | null>(null);

const selected = ref<number | null>(null);
const lastAnswer = ref<number | null>(null);
const lastResult = ref<"correct" | "incorrect" | null>(null);

onMounted(async () => {
  loading.value = true;
  error.value = null;

  const id = String(route.params.id ?? "");
  if (!id) {
    error.value = "Falta el ID del problema.";
    loading.value = false;
    return;
  }

  try {
    const snap = await getDoc(problemDoc(id));
    if (!snap.exists()) {
      error.value = "El problema no existe.";
      loading.value = false;
      return;
    }
    problem.value = snap.data() as Problem;
  } catch (e: any) {
    error.value = "No se pudo cargar el problema.";
    loading.value = false;
    return;
  }

  try {
    const user = auth.currentUser;
    if (user) {
      const q = query(
        colAttempts,
        where("uid", "==", user.uid),
        where("problemId", "==", id),
        orderBy("createdAt", "desc"),
        limit(1)
      );
      const last = await getDocs(q);
      if (!last.empty) {
        const d = last.docs[0].data() as any;
        lastAnswer.value =
          typeof d.answerIndex === "number" ? d.answerIndex : null;
        const correct = problem.value?.correctIndex ?? -1;
        lastResult.value =
          lastAnswer.value != null && lastAnswer.value === correct
            ? "correct"
            : "incorrect";
      }
    }
  } catch {
    // puede fallar si falta un índice compuesto
  } finally {
    loading.value = false;
  }
});

async function submitAttempt() {
  if (selected.value == null) {
    alert("Elige una opción");
    return;
  }
  const user = auth.currentUser;
  if (!user) {
    error.value = "Debes iniciar sesión para responder.";
    return;
  }

  const problemId = String(route.params.id ?? "");
  if (!problemId) return;

  try {
    await addDoc(colAttempts, {
      uid: user.uid,                // 👈 requerido por reglas
      problemId,                    // id del problema
      answerIndex: selected.value,  // índice de la respuesta
      createdAt: serverTimestamp(),
    });

    router.back();
  } catch (e: any) {
    console.error(e);
    error.value =
      e?.code === "permission-denied"
        ? "No tienes permisos para registrar intentos."
        : "No se pudo enviar el intento.";
  }
}
</script>

<template>
  <section class="max-w-3xl mx-auto p-4">
    <h1 class="text-2xl font-semibold mb-4">Resolver problema</h1>

    <div v-if="loading">Cargando…</div>
    <p v-else-if="error" class="text-red-600">{{ error }}</p>

    <div v-else-if="problem" class="space-y-4">
      <h2 class="text-xl font-semibold">{{ problem.title }}</h2>
      <p class="text-gray-700 whitespace-pre-line">{{ problem.statement }}</p>

      <div
        v-if="problem.type === 'multiple-choice' || problem.type === 'true-false'"
        class="space-y-2"
      >
        <label
          v-for="(opt, i) in problem.options"
          :key="i"
          class="flex items-center gap-2 cursor-pointer"
        >
          <input type="radio" :value="i" v-model.number="selected" />
          <span>{{ String.fromCharCode(65 + i) }}) {{ opt }}</span>
        </label>
      </div>
      <div v-else class="text-sm text-amber-700 bg-amber-50 p-3 rounded">
        Este tipo de problema ({{ problem.type }}) aún no está soportado aquí.
      </div>

      <div class="flex gap-2">
        <button
          class="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-60"
          :disabled="selected === null"
          @click="submitAttempt"
        >
          Enviar respuesta
        </button>
        <button class="px-4 py-2 rounded border" @click="router.back()">Volver</button>
      </div>

      <div v-if="lastAnswer !== null" class="text-sm text-gray-700">
        Último intento: {{ String.fromCharCode(65 + lastAnswer) }} —
        <strong :class="lastResult === 'correct' ? 'text-green-600' : 'text-red-600'">
          {{ lastResult === 'correct' ? 'Correcto' : 'Incorrecto' }}
        </strong>
      </div>
    </div>
  </section>
</template>
