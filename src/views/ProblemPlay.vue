<!-- src/views/ProblemPlay.vue -->
<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRoute } from "vue-router";
import { getDoc, addDoc, serverTimestamp } from "firebase/firestore";
import { problemDoc, colAttempts, type Problem } from "@/services/firebase";
import { auth } from "@/services/firebase";

const route = useRoute();
const problemId = route.params.id as string;
const loading = ref(true);
const error = ref<string | null>(null);
const problem = ref<Problem | null>(null);

// Respuesta del alumno
const answer = ref<string>(""); // para MC/TF guarda índice en string: "0","1",...
const saved = ref(false);

onMounted(async () => {
  try {
    const snap = await getDoc(problemDoc(problemId));
    if (!snap.exists()) throw new Error("Problema no encontrado");
    // IMPORTANTE: Aquí asumes que el estudiante ya NO ve los campos de solución (por tus reglas o fetch “sanitizado”)
    problem.value = snap.data() as Problem;
  } catch (e: any) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
});

function setAnswerIndex(i: number) { answer.value = String(i); }

async function submit() {
  try {
    const u = auth.currentUser;
    if (!u) throw new Error("No estás autenticado");

    if (!answer.value.trim()) throw new Error("Debes ingresar una respuesta");

    await addDoc(colAttempts, {
      uid: u.uid,
      problemId,
      answer: answer.value,
      createdAt: serverTimestamp(),
    });

    saved.value = true;
  } catch (e: any) {
    error.value = e.message;
  }
}
</script>

<template>
  <div class="max-w-3xl mx-auto p-4">
    <h1 class="text-xl font-semibold">Resolver problema</h1>
    <p v-if="loading">Cargando...</p>
    <p v-else-if="error" class="text-red-600">{{ error }}</p>

    <div v-else-if="problem" class="space-y-4">
      <h2 class="text-lg font-medium">{{ problem.title }}</h2>
      <p class="whitespace-pre-line">{{ problem.statement }}</p>

      <!-- UI según tipo -->
      <div v-if="problem.type==='multiple-choice' || problem.type==='true-false'">
        <div class="space-y-2">
          <label v-for="(opt,i) in problem.options" :key="i" class="flex items-center gap-2">
            <input type="radio" name="ans" :value="String(i)" v-model="answer" />
            <span>{{ opt }}</span>
          </label>
        </div>
      </div>

      <div v-else-if="problem.type==='numeric'">
        <input class="border rounded p-2" v-model="answer" placeholder="Escribe un número" />
      </div>

      <div v-else>
        <textarea class="border rounded p-2 w-full min-h-[120px]" v-model="answer" placeholder="Escribe tu respuesta"></textarea>
      </div>

      <div class="flex gap-3">
        <button @click="submit" class="px-4 py-2 rounded bg-green-600 text-white">Enviar</button>
        <span v-if="saved" class="text-green-700">¡Respuesta enviada!</span>
      </div>
    </div>
  </div>
</template>
