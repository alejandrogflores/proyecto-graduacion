<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
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
const { ready, role, uid } = storeToRefs(profile); // 👈 como pediste

const canManage = computed(() => role.value === "teacher" || role.value === "admin");
const revealAnswers = computed(() => ready.value && canManage.value);

const loading = ref(true);
const error = ref<string | null>(null);
const rows = ref<Row[]>([]);
let off: (() => void) | null = null;

function looksLikeJsonArray(s: string) {
  const t = s.trim();
  return t.startsWith("[") && t.endsWith("]");
}
function coerceOptions(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string" && looksLikeJsonArray(raw)) {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p.map(String) : [raw];
    } catch {
      return [raw];
    }
  }
  if (typeof raw === "string") return [raw];
  return [];
}
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

onMounted(() => {
  loading.value = true;
  error.value = null;
  const qRef = (() => {
    try {
      return query(colProblems, orderBy("createdAt", "desc"));
    } catch {
      return query(colProblems);
    }
  })();
  off = onSnapshot(
    qRef,
    (snap: QuerySnapshot<DocumentData>) => {
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
        };
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
onBeforeUnmount(() => {
  if (off) off();
});

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
  } catch (e: any) {
    console.error(e);
    alert(
      e?.code === "permission-denied"
        ? "Solo un administrador puede eliminar problemas."
        : "No se pudo eliminar. Revisa la consola."
    );
  }
}
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

    <p v-if="!ready" class="text-gray-600">Cargando perfil…</p>
    <p v-else-if="loading">Cargando…</p>
    <p v-else-if="error" class="text-red-600">{{ error }}</p>

    <div v-else class="space-y-4">
      <article v-for="p in rows" :key="p.id" class="border rounded-lg p-4 mb-4">
        <h2 class="font-medium text-lg">{{ p.title }}</h2>
        <p class="text-sm text-gray-600 mb-3">{{ p.statement }}</p>

        <ul v-if="revealAnswers" class="text-sm text-gray-700 mb-3">
          <li v-for="(opt, i) in p.options" :key="i">
            {{ String.fromCharCode(65 + i) }}) {{ opt }}
            <span v-if="i === p.correctIndex">✔</span>
          </li>
        </ul>

        <div class="flex gap-2">
          <router-link
            class="px-3 py-1 rounded border"
            :to="{ name: 'ProblemSolve', params: { id: p.id } }"
          >
            Resolver
          </router-link>

          <!-- ✅ condición pedida -->
          <button
            v-if="canManage || p.createdBy === profile.uid"
            class="px-3 py-1 rounded bg-amber-500 text-white"
            @click="goEdit(p.id)"
          >
            Editar
          </button>
        </div>

        <p class="text-xs text-gray-500 mt-2">
          Creado: {{ fmtTs(p.createdAt) }} — Actualizado: {{ fmtTs(p.updatedAt) }}
        </p>
      </article>

      <p v-if="rows.length === 0 && !loading" class="text-gray-600">Aún no hay problemas.</p>
    </div>
  </section>
</template>




