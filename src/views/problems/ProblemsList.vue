<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { useRouter } from "vue-router";
import {
  query,
  where,
  orderBy,
  limit,
  getDocs,
  deleteDoc,
  Timestamp,
} from "firebase/firestore";
import { colProblems, colTags, problemDoc } from "@/services/firebase";
import { useProfileStore } from "@/stores/profile";
import { storeToRefs } from "pinia";

// --- Perfil / permisos ---
const profile = useProfileStore();
const { ready, role, uid } = storeToRefs(profile);
const canManage = computed(() => role.value === "teacher" || role.value === "admin");
const revealAnswers = computed(() => ready.value && canManage.value);

// --- Estado UI ---
const router = useRouter();
const loading = ref(false);
const error = ref<string | null>(null);

// --- Datos ---
type Problem = {
  id: string;
  title: string;
  statement: string;
  options: string[];
  correctIndex: number;
  createdAt?: any;
  updatedAt?: any;
  createdBy?: string | null;
  tags?: string[];
  difficulty?: "easy" | "medium" | "hard";
  visibility?: "public" | "private" | "archived";
  version?: number;
};

const problems = ref<Problem[]>([]);
const pageSize = 20;

const tags = ref<{ slug: string; name: string }[]>([]);
const selectedTag = ref<string | null>(null);
const selectedDifficulty = ref<"easy" | "medium" | "hard" | null>(null);

// --- Utils ---
function fmtTs(ts: any): string {
  try {
    if (!ts) return "—";
    if (typeof ts.toDate === "function") return ts.toDate().toLocaleString();
    if (typeof ts.seconds === "number") return new Date(ts.seconds * 1000).toLocaleString();
    return new Date(ts).toLocaleString();
  } catch {
    return "—";
  }
}

// --- Cargas ---
async function loadTags() {
  const snap = await getDocs(colTags);
  tags.value = snap.docs.map((d) => ({ slug: d.data().slug, name: d.data().name }));
}

async function loadProblems() {
  loading.value = true;
  error.value = null;
  try {
    const conds: any[] = [where("visibility", "==", "public")];
    if (selectedTag.value) conds.push(where("tags", "array-contains", selectedTag.value));
    if (selectedDifficulty.value) conds.push(where("difficulty", "==", selectedDifficulty.value));

    // Nota: si no tienes createdAt, quita el orderBy o pon fallback
    const qRef = query(colProblems, ...conds, orderBy("createdAt", "desc"), limit(pageSize));
    const snap = await getDocs(qRef);
    problems.value = snap.docs.map(
      (d) =>
        ({
          id: d.id,
          ...d.data(),
          // defaults seguros
          tags: d.data().tags ?? [],
          difficulty: d.data().difficulty ?? "medium",
          visibility: d.data().visibility ?? "public",
          version: d.data().version ?? 1,
          options: Array.isArray(d.data().options) ? d.data().options : [],
          correctIndex:
            Number.isInteger(d.data().correctIndex) && d.data().correctIndex >= 0
              ? d.data().correctIndex
              : 0,
        } as Problem)
    );
  } catch (e: any) {
    console.error(e);
    error.value = e?.message ?? "No se pudieron cargar los problemas.";
  } finally {
    loading.value = false;
  }
}

// --- Navegación / acciones ---
function goCreate() {
  router.push({ name: "ProblemNew" });
}
function goEdit(id: string) {
  router.push({ name: "ProblemEdit", params: { id } });
}
async function removeRow(id: string) {
  if (!confirm("¿Eliminar este problema? (solo admin)")) return;
  try {
    await deleteDoc(problemDoc(id));
    await loadProblems(); // refrescar
  } catch (e: any) {
    console.error(e);
    alert(
      e?.code === "permission-denied"
        ? "Solo un administrador puede eliminar problemas."
        : "No se pudo eliminar. Revisa la consola."
    );
  }
}

// --- Lifecycle ---
onMounted(async () => {
  await loadTags();
  await loadProblems();
});
watch([selectedTag, selectedDifficulty], loadProblems);
</script>

<template>
  <section class="max-w-5xl mx-auto p-4">
    <header class="flex items-center justify-between mb-4">
      <h1 class="text-2xl font-semibold">Banco de problemas</h1>
      <button
        v-if="ready && canManage"
        class="px-3 py-2 rounded bg-blue-600 text-white"
        @click="goCreate"
      >
        Nuevo problema
      </button>
    </header>

    <!-- Filtros -->
    <div class="flex gap-3 items-center mb-4">
      <select v-model="selectedTag" class="border rounded px-3 py-2">
        <option :value="null">Todos los tags</option>
        <option v-for="t in tags" :key="t.slug" :value="t.slug">{{ t.name }}</option>
      </select>

      <select v-model="selectedDifficulty" class="border rounded px-3 py-2">
        <option :value="null">Todas las dificultades</option>
        <option value="easy">Fácil</option>
        <option value="medium">Media</option>
        <option value="hard">Difícil</option>
      </select>

      <button class="border rounded px-3 py-2" @click="loadProblems">Aplicar</button>
    </div>

    <p v-if="!ready" class="text-gray-600">Cargando perfil…</p>
    <p v-else-if="loading">Cargando…</p>
    <p v-else-if="error" class="text-red-600">{{ error }}</p>

    <div v-else class="space-y-4">
      <article v-for="p in problems" :key="p.id" class="border rounded-lg p-4 mb-4">
        <div class="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 class="font-medium text-lg">{{ p.title }}</h2>
            <p class="text-sm text-gray-600 mb-2">{{ p.statement }}</p>
          </div>

          <!-- Badges -->
          <div class="flex items-center gap-2">
            <span class="text-xs bg-gray-100 px-2 py-1 rounded">{{ p.difficulty }}</span>
            <span class="text-xs bg-gray-100 px-2 py-1 rounded">{{ p.visibility }}</span>
            <span class="text-xs text-gray-500">v{{ p.version }}</span>
          </div>
        </div>

        <!-- Tags -->
        <div class="flex flex-wrap gap-1 mb-3">
          <span v-for="t in p.tags" :key="t" class="text-xs bg-blue-50 px-2 py-0.5 rounded">
            {{ t }}
          </span>
        </div>

        <!-- Opciones (solo teachers/admin) -->
        <ul v-if="revealAnswers" class="text-sm text-gray-700 mb-3">
          <li v-for="(opt, i) in p.options" :key="i">
            {{ String.fromCharCode(65 + i) }}) {{ opt }}
            <span v-if="i === p.correctIndex">✔</span>
          </li>
        </ul>

        <div class="flex gap-2">
          <router-link class="px-3 py-1 rounded border" :to="{ name: 'ProblemSolve', params: { id: p.id } }">
            Resolver
          </router-link>

          <button
            v-if="canManage || p.createdBy === uid"
            class="px-3 py-1 rounded bg-amber-500 text-white"
            @click="goEdit(p.id)"
          >
            Editar
          </button>

          <button
            v-if="role === 'admin'"
            class="px-3 py-1 rounded bg-red-600 text-white"
            @click="removeRow(p.id)"
          >
            Eliminar
          </button>
        </div>

        <p class="text-xs text-gray-500 mt-2">
          Creado: {{ fmtTs(p.createdAt) }} — Actualizado: {{ fmtTs(p.updatedAt) }}
        </p>
      </article>

      <p v-if="problems.length === 0 && !loading" class="text-gray-600">Aún no hay problemas.</p>
    </div>
  </section>
</template>

