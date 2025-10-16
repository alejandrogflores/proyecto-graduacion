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
} from "firebase/firestore";
import { colProblems, colTags, problemDoc } from "@/services/firebase";
import { useProfileStore } from "@/stores/profile";
import { storeToRefs } from "pinia";

// --- Perfil / permisos ---
const profile = useProfileStore();
if (!profile.ready) profile.init();

const { ready, role, uid } = storeToRefs(profile);
const isTeacherLike = computed(() => (role.value === "teacher" || role.value === "admin"));
// Guard/alias explícito para bloques de solución
const isTeacher = computed(() => role.value === "teacher" || role.value === "admin");

// --- Estado UI ---
const router = useRouter();
const loading = ref(false);
const error = ref<string | null>(null);

// --- Datos ---
type Problem = {
  id: string;
  title?: string;
  statement?: string;

  // Campos legacy MC
  options?: any[];          // puede ser string[] (legacy) o {text, correct}[]
  correctIndex?: number;

  // Campos nuevos por tipo
  type?: "multiple_choice" | "true_false" | "numeric" | "short_text" | "open_rubric" | string;
  answer?: { correct?: boolean } | any;
  spec?: any;

  createdAt?: any;
  updatedAt?: any;
  ownerUid?: string | null;
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

// ===== Helpers de formato para las claves =====
function formatNumericSpec(spec: any): string {
  if (!spec) return "—";
  const p = (n: any) => (Number.isFinite(n) ? String(n) : "—");

  switch (spec.mode) {
    case "value":
    case "tolerance": {
      const value = p(spec.value);
      const tol   = Number.isFinite(spec.tolerance) ? ` ± ${spec.tolerance}` : "";
      const prec  = Number.isFinite(spec.precision) ? ` (prec: ${spec.precision})` : "";
      return `${value}${tol}${prec}`.trim();
    }
    case "range":
      return `${p(spec.min)} … ${p(spec.max)}`;
    default:
      return "—";
  }
}

function formatShortText(spec: any): string {
  if (!spec) return "—";
  const modeMap: Record<string,string> = {
    exact: "exacto",
    regex: "regex",
    levenshtein: "levenshtein",
  };
  const mode = modeMap[spec.mode] ?? spec.mode ?? "—";
  const answers = Array.isArray(spec.answers) ? spec.answers.filter(Boolean) : [];
  const head = answers.slice(0, 3).map((s: string) => `“${s}”`).join(", ");
  const more = answers.length > 3 ? ` (+${answers.length - 3})` : "";
  const extra: string[] = [];
  if (spec.threshold != null && spec.mode === "levenshtein") extra.push(`≤${spec.threshold}`);
  if (spec.caseSensitive) extra.push("sens. mayúsc/minúsc");
  if (spec.trim === false) extra.push("no-trim");
  const suffix = extra.length ? ` · ${extra.join(", ")}` : "";
  return `${head}${more} · modo: ${mode}${suffix}`;
}

function mcCorrectLabels(p: any): string[] {
  // p.options puede ser [{text, correct}] (nuevo) o string[] (legacy)
  if (Array.isArray(p.options) && typeof p.options[0] === "object") {
    return p.options
      .map((o: any) => (o?.correct ? (o?.text ?? "") : null))
      .filter(Boolean);
  }
  // legacy: usa correctIndex
  const opts = Array.isArray(p.options) ? p.options : [];
  const idx = Number.isInteger(p.correctIndex) ? p.correctIndex : -1;
  return idx >= 0 && idx < opts.length ? [opts[idx]] : [];
}

// --- Cargas ---
async function loadTags() {
  try {
    const snap = await getDocs(colTags);
    tags.value = snap.docs.map((d) => ({ slug: d.data().slug, name: d.data().name }));
  } catch {
    // si no tienes colección de tags, no pasa nada
    tags.value = [];
  }
}

async function loadProblems() {
  if (!ready.value) return;
  loading.value = true;
  error.value = null;
  try {
    // 🔎 Maestro/Admin: ve SOLO lo suyo. Otros: ven públicos
    const conds: any[] = isTeacherLike.value
      ? [where("ownerUid", "==", uid.value)]
      : [where("visibility", "==", "public")];

    if (selectedTag.value) conds.push(where("tags", "array-contains", selectedTag.value));
    if (selectedDifficulty.value) conds.push(where("difficulty", "==", selectedDifficulty.value));

    const qRef = query(
      colProblems,
      ...conds,
      orderBy("createdAt", "desc"),
      limit(pageSize)
    );
    const snap = await getDocs(qRef);
    problems.value = snap.docs.map((d) => {
      const data = d.data() as any;
      return {
        id: d.id,
        ...data,
        title: data.title ?? d.id,
        statement: data.statement ?? "",
        tags: data.tags ?? [],
        difficulty: data.difficulty ?? "medium",
        visibility: data.visibility ?? (isTeacherLike.value ? "private" : "public"),
        version: data.version ?? 1,
        type: data.type,          // puede ser undefined (legacy)
        options: Array.isArray(data.options) ? data.options : [],
        correctIndex:
          Number.isInteger(data.correctIndex) && data.correctIndex >= 0
            ? data.correctIndex
            : 0,
      } as Problem;
    });
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
  if (ready.value) await loadProblems();
});
watch(ready, (r) => r && loadProblems());
watch([selectedTag, selectedDifficulty], loadProblems);
</script>

<template>
  <section class="max-w-5xl mx-auto p-4">
    <header class="flex items-center justify-between mb-4">
      <h1 class="text-2xl font-semibold">
        {{ isTeacherLike ? "Mi banco de problemas" : "Banco de problemas" }}
      </h1>
      <button
        v-if="ready && isTeacherLike"
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
            <h2 class="font-medium text-lg">{{ p.title || p.id }}</h2>
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

        <!-- Clave/solución SOLO visible para docentes -->
        <div v-if="isTeacher" class="mt-2 text-xs text-gray-700">
          <!-- Multiple choice: lista con check (nuevo y legacy) -->
          <template v-if="p.type === 'multiple_choice'">
            <div v-for="(opt, i) in p.options" :key="i" class="flex items-center gap-2">
              <span class="font-mono">{{ String.fromCharCode(65+i) }})</span>
              <code class="break-all">
                {{
                  typeof opt === 'string'
                    ? `"${opt}"`
                    : `{ "text": "${opt?.text ?? ''}", "correct": ${Boolean(opt?.correct)} }`
                }}
              </code>
              <span
                v-if="(typeof opt==='object' ? opt?.correct : i===p.correctIndex)"
                class="text-purple-600"
              >✔</span>
            </div>
          </template>

          <!-- True/False -->
          <template v-else-if="p.type === 'true_false'">
            <div><span class="font-semibold">Clave:</span> {{ p?.answer?.correct ? 'Verdadero' : 'Falso' }} ✅</div>
          </template>

          <!-- Numérica -->
          <template v-else-if="p.type === 'numeric'">
            <div>
              <span class="font-semibold">Clave:</span>
              {{ formatNumericSpec(p.spec) }} ✅
            </div>
          </template>

          <!-- Respuesta corta -->
          <template v-else-if="p.type === 'short_text'">
            <div>
              <span class="font-semibold">Acepta:</span>
              {{ formatShortText(p.spec) }} ✅
            </div>
          </template>

          <!-- Abierta / Rubrica -->
          <template v-else-if="p.type === 'open_rubric'">
            <div><span class="font-semibold">Corrección manual</span> 📝 (rúbrica)</div>
          </template>

          <!-- Compat legacy: por si no hay 'type' pero sí hay MC legacy -->
          <template v-else>
            <div v-if="mcCorrectLabels(p).length">
              <span class="font-semibold">Clave:</span> {{ mcCorrectLabels(p).join(", ") }} ✅
            </div>
          </template>
        </div>

        <div class="flex gap-2 mt-3">
          <router-link
            v-if="isTeacherLike"
            class="px-3 py-1 rounded border"
            :to="{ name: 'ProblemSolve', params: { id: p.id } }"
          >
            Previsualizar
          </router-link>

          <button
            v-if="isTeacherLike && (p.ownerUid === uid || role === 'admin')"
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

        <p v-if="!isTeacherLike" class="text-xs text-gray-600 mt-2">
          Para responder, ve a
          <router-link class="underline" :to="{ name: 'MyAssignments' }">
            Mis asignaciones
          </router-link>.
        </p>

        <p class="text-xs text-gray-500 mt-2">
          Creado: {{ fmtTs(p.createdAt) }} — Actualizado: {{ fmtTs(p.updatedAt) }}
        </p>
      </article>

      <p v-if="problems.length === 0 && !loading" class="text-gray-600">Aún no hay problemas.</p>
    </div>
  </section>
</template>

