<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue";
import { useRouter } from "vue-router";

import {
  query,
  orderBy,
  onSnapshot,
  deleteDoc,
  type DocumentData,
  type QuerySnapshot,
} from "firebase/firestore";
import { colProblems, problemDoc } from "@/services/firebase";
import { useProfileStore } from "@/stores/profile";
import { storeToRefs } from "pinia";

type Row = {
  id: string;
  title: string;
  statement: string;
  options: string[];
  correctIndex: number;
  createdAt?: any;
  updatedAt?: any;
  createdBy?: string | null;
};

const router = useRouter();

// ===== Perfil (reactivo) =====
const profile = useProfileStore();
const { ready } = storeToRefs(profile);

// Política Opción A:
const canEdit = () => profile.isTeacherOrAdmin;   // cualquier teacher/admin
const canDelete = () => profile.role === "admin"; // solo admin

const loading = ref(true);
const error = ref<string | null>(null);
const rows = ref<Row[]>([]);
let off: (() => void) | null = null;

/** Normaliza el campo options para soportar docs viejos que lo guardaron como string JSON */
function looksLikeJsonArray(s: string) {
  const t = s.trim();
  return t.startsWith("[") && t.endsWith("]");
}

function coerceOptions(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    const arr = raw.map(String);
    if (arr.length === 1 && looksLikeJsonArray(arr[0])) {
      try {
        const parsed = JSON.parse(arr[0]);
        return Array.isArray(parsed) ? parsed.map(String) : arr;
      } catch { return arr; }
    }
    return arr;
  }
  if (typeof raw === "string") {
    if (looksLikeJsonArray(raw)) {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.map(String) : [raw];
      } catch { return [raw]; }
    }
    return [raw];
  }
  return [];
}

/** Formateador robusto de timestamps */
function fmtTs(ts: any): string {
  if (!ts) return "—";
  try {
    if (typeof ts.toDate === "function") return ts.toDate().toLocaleString();
    if (typeof ts.seconds === "number") return new Date(ts.seconds * 1000).toLocaleString();
    return new Date(ts).toLocaleString();
  } catch { return "—"; }
}

onMounted(() => {
  loading.value = true;
  error.value = null;

  let qRef: any;
  try {
    qRef = query(colProblems, orderBy("createdAt", "desc"));
  } catch {
    qRef = query(colProblems);
  }

  off = onSnapshot(
    qRef,
    (snap: QuerySnapshot<DocumentData>) => {
      console.log("[problems] docs:", snap.size);
      rows.value = snap.docs.map((d) => {
        const data = d.data() as any;
        const options = coerceOptions(data.options);

        let correctIndex = Number.isInteger(data.correctIndex) ? data.correctIndex : 0;
        if (correctIndex < 0 || correctIndex >= options.length) correctIndex = 0;

        return {
          id: d.id,
          title: data.title ?? "",
          statement: data.statement ?? "",
          options,
          correctIndex,
          createdAt: data.createdAt ?? null,
          updatedAt: data.updatedAt ?? null,
          createdBy: data.createdBy ?? null,
        } as Row;
      });
      loading.value = false;
    },
    (e) => {
      console.error("[snapshot] error:", e);
      error.value = e?.message ?? "No se pudieron cargar los problemas.";
      loading.value = false;
    }
  );
});

onBeforeUnmount(() => { if (off) off(); });

function goNew() {
  router.push({ name: "ProblemNew" });
}
function goEdit(id: string) {
  router.push({ name: "ProblemEdit", params: { id } });
}

async function removeRow(id: string) {
  if (!confirm("¿Eliminar este problema? (solo admin)")) return;
  try {
    await deleteDoc(problemDoc(id));
  } catch (e: any) {
    console.error(e);
    if (e?.code === "permission-denied") {
      alert("Solo un administrador puede eliminar problemas.");
    } else {
      alert("No se pudo eliminar. Revisa la consola.");
    }
  }
}
</script>

<template>
  <section class="max-w-5xl mx-auto p-4">
    <header class="flex items-center justify-between mb-4">
      <h1 class="text-2xl font-semibold">Banco de problemas</h1>

      <!-- Botón solo visible para teacher/admin cuando el perfil ya cargó -->
      <button
        v-if="ready && profile.isTeacherOrAdmin"
        class="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
        @click="goNew"
      >
        + Nuevo problema
      </button>
    </header>

    <p v-if="!ready" class="text-gray-600">Cargando perfil…</p>
    <p v-else-if="loading">Cargando…</p>
    <p v-else-if="error" class="text-red-600">{{ error }}</p>

    <div v-else class="space-y-4">
      <article
        v-for="r in rows"
        :key="r.id"
        class="border rounded p-4 hover:shadow-sm transition"
      >
        <h2 class="font-semibold text-xl mb-1">{{ r.title }}</h2>
        <p class="text-sm text-gray-700 mb-3">{{ r.statement }}</p>

        <ul class="options list-none pl-0 ml-0 mt-2 text-sm space-y-1">
          <li v-for="(opt, i) in r.options" :key="i" class="flex items-start gap-2">
            <span class="inline-block min-w-6 font-mono">
              {{ String.fromCharCode(65 + i) }})
            </span>
            <span :class="i === r.correctIndex ? 'font-semibold' : ''">
              <span v-if="i === r.correctIndex">[✔] </span>
              <span v-else>[ ] </span>
              {{ opt }}
            </span>
          </li>
        </ul>

        <p class="text-xs text-gray-500 mt-1">
          <span v-if="r.createdAt">Creado: {{ fmtTs(r.createdAt) }}</span>
          <span v-if="r.updatedAt"> · Actualizado: {{ fmtTs(r.updatedAt) }}</span>
        </p>

        <div class="mt-3 flex gap-2">
          <!-- Alumnos ven "Resolver" -->
          <RouterLink
            v-if="!profile.isTeacherOrAdmin"
            :to="{ name: 'ProblemSolve', params: { id: r.id } }"
            class="inline-block px-2 py-1 rounded border hover:bg-gray-50"
          >
            Resolver
          </RouterLink>

          <!-- Docentes/Admin -->
          <button
            v-if="canEdit()"
            class="px-2 py-1 rounded border hover:bg-gray-50"
            @click="goEdit(r.id)"
          >
            Editar
          </button>
          <button
            v-if="canDelete()"
            class="px-2 py-1 rounded border border-red-400 text-red-600 hover:bg-red-50"
            @click="removeRow(r.id)"
          >
            Eliminar
          </button>
        </div>
      </article>

      <p v-if="rows.length === 0 && !loading" class="text-gray-600">
        Aún no hay problemas.
      </p>
    </div>
  </section>
</template>

<style scoped>
.options { list-style: none; padding-left: 0; margin-left: 0; }
.options li::marker { content: ""; }
</style>

