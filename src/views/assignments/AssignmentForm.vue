<!-- src/views/assignments/AssignmentForm.vue -->
<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import {
  addDoc, serverTimestamp, getDocs, query, where, collection,
} from "firebase/firestore";
import { auth, db, colAssignments, colClasses, colProblems } from "@/services/firebase";
import { useProfileStore } from "@/stores/profile";

type ProblemLite = { id: string; title?: string };
type ClassLite = { id: string; name?: string; rosterUids?: string[] };

const router = useRouter();
const profile = useProfileStore();
if (!profile.ready) profile.init?.();

const title = ref("");
const classId = ref<string | null>(null);
const publishNow = ref(true);
const timeLimitSec = ref<number | null>(null);
const selectedProblems = ref<string[]>([]);

const loading = ref(true);
const classes = ref<ClassLite[]>([]);
const problems = ref<ProblemLite[]>([]);

const isValid = computed(() =>
  title.value.trim().length > 0 && selectedProblems.value.length > 0
);

async function loadOptions() {
  loading.value = true;
  try {
    const clsQs = await getDocs(collection(db, "classes"));
    classes.value = clsQs.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

    const probQs = await getDocs(colProblems);
    problems.value = probQs.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  } finally {
    loading.value = false;
  }
}

onMounted(loadOptions);

async function onSave() {
  if (!auth.currentUser) {
    alert("Sesión expirada.");
    return;
  }
  if (!isValid.value) {
    alert("Completa título y selecciona al menos un problema.");
    return;
  }

  // Foto de roster (si hay clase y se publica)
  let assigneeUids: string[] = [];
  if (classId.value && publishNow.value) {
    const found = classes.value.find((c) => c.id === classId.value);
    assigneeUids = Array.isArray(found?.rosterUids) ? found!.rosterUids! : [];
  }

  const docData: any = {
    title: title.value.trim(),
    ownerUid: auth.currentUser.uid,
    classId: classId.value ?? null,
    problemIds: selectedProblems.value,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),

    // 🚀 NUEVOS CAMPOS SIEMPRE PRESENTES
    isPublished: publishNow.value === true,
    assigneeUids, // si es borrador: [], si se publica: roster

    // Opcional
    timeLimitSec: timeLimitSec.value ?? null,
  };

  if (docData.isPublished) {
    docData.publishedAt = serverTimestamp();
  }

  const ref = await addDoc(colAssignments, docData);
  alert("Asignación guardada.");
  router.push({ name: "AssignmentsByClass", params: { id: classId.value || "all" } });
}
</script>

<template>
  <section class="max-w-5xl mx-auto p-4">
    <h1 class="text-2xl font-bold mb-4">Nueva asignación</h1>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div>
        <label class="block text-sm font-medium">Título</label>
        <input v-model="title" class="mt-1 w-full border rounded p-2" placeholder="Quiz 1, Evaluación 2…" />
      </div>

      <div>
        <label class="block text-sm font-medium">Asignar a clase</label>
        <select v-model="classId" class="mt-1 w-full border rounded p-2">
          <option :value="null">No asignar (borrador)</option>
          <option v-for="c in classes" :key="c.id" :value="c.id">
            {{ c.name || c.id }}
          </option>
        </select>
        <p class="text-xs text-gray-500 mt-1">
          Si publicas y eliges una clase, se copiará el roster en <code>assigneeUids</code>.
        </p>
      </div>

      <div>
        <label class="block text-sm font-medium">Problemas</label>
        <div class="mt-1 border rounded p-2 h-40 overflow-auto space-y-1">
          <label v-for="p in problems" :key="p.id" class="flex items-center gap-2 text-sm">
            <input type="checkbox" :value="p.id" v-model="selectedProblems" />
            <span>{{ p.title || p.id }}</span>
          </label>
        </div>
      </div>

      <div>
        <label class="block text-sm font-medium">Tiempo límite</label>
        <select v-model="timeLimitSec" class="mt-1 w-full border rounded p-2">
          <option :value="null">Sin límite</option>
          <option :value="300">5 minutos</option>
          <option :value="600">10 minutos</option>
          <option :value="900">15 minutos</option>
        </select>

        <label class="mt-4 flex items-center gap-2 text-sm">
          <input type="checkbox" v-model="publishNow" />
          <span>Publicar ahora</span>
        </label>
      </div>
    </div>

    <div class="mt-6">
      <button :disabled="!isValid" class="px-4 py-2 rounded bg-black text-white disabled:opacity-50" @click="onSave">
        Guardar
      </button>
    </div>
  </section>
</template>




