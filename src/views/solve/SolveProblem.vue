<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  getDoc, addDoc, serverTimestamp, query, where, orderBy, limit, getDocs
} from "firebase/firestore";
import { problemDoc, colAttempts, type Problem, auth } from "@/services/firebase"; // <-- trae auth aquí

const route = useRoute(); 
const router = useRouter();

const loading = ref(true);
const error = ref<string | null>(null);
const problem = ref<Problem | null>(null);
const selectedIndex = ref<number | null>(null); // <-- unifica el nombre
const saving = ref(false);
const lastAnswer = ref<number | null>(null);
const lastResult = ref<"correct" | "incorrect" | null>(null);

onMounted(async () => {
  loading.value = true; error.value = null;
  const id = route.params.id as string;

  // 1) Cargar problema
  try {
    const snap = await getDoc(problemDoc(id));
    if (!snap.exists()) { error.value = "El problema no existe."; return; }
    problem.value = snap.data() as Problem;
  } catch (e: any) {
    error.value = "No se pudo cargar el problema."; 
    return;
  }

  // 2) Último intento del usuario (ajusta a los campos del esquema)
  try {
    const uid = auth.currentUser?.uid ?? "__anon__";
    const q = query(
      colAttempts,
      where("studentId", "==", uid),
      where("problemId", "==", id),
      orderBy("createdAt", "desc"),
      limit(1)
    );
    const last = await getDocs(q);
    if (!last.empty) {
      const d = last.docs[0].data() as any;
      lastAnswer.value = typeof d.selectedIndex === "number" ? d.selectedIndex : null;
      // si quieres calcular correcto/incorrecto aquí, necesitarías comparar con problem.correctIndex
      lastResult.value = (lastAnswer.value === (problem.value?.correctIndex ?? -1)) ? "correct" : "incorrect";
    }
  } catch {
    // puede faltar índice compuesto; lo ignoramos
  } finally {
    loading.value = false;
  }
});

async function submit() {
  if (selectedIndex.value == null) return;
  const id = route.params.id as string;
  const uid = auth.currentUser!.uid;

  saving.value = true;
  try {
    await addDoc(colAttempts, {
      problemId: id,
      studentId: uid,
      selectedIndex: Number(selectedIndex.value),
      createdAt: serverTimestamp(),
    });
    // feedback mínimo
    router.back();
  } catch (e:any) {
    error.value = e?.message ?? "No se pudo enviar la respuesta.";
  } finally {
    saving.value = false;
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
      <p class="text-gray-700">{{ problem.statement }}</p>

      <div class="space-y-2">
        <label v-for="(opt, i) in problem.options" :key="i" class="flex items-center gap-2 cursor-pointer">
          <input type="radio" :value="i" v-model.number="selectedIndex" />
          <span>{{ String.fromCharCode(65 + i) }}) {{ opt }}</span>
        </label>
      </div>

      <div class="flex gap-2">
        <button class="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-60"
                :disabled="selectedIndex === null || saving" @click="submit">
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



