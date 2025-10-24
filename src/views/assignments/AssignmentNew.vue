<!-- src/views/assignments/AssignmentNew.vue -->
<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useRouter } from "vue-router";
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  DocumentData,
  QueryConstraint,
  // 👇 nuevos imports para el parche
  doc,
  getDoc,
  updateDoc,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { db } from "@/services/firebase";
import { useProfileStore } from "@/stores/profile";

type ClassRow = { id: string; name: string };
type ProblemRow = { id: string; title: string };

const router = useRouter();
const profile = useProfileStore();

// ----- state -----
const loading = ref(false);
const saving  = ref(false);
const error   = ref<string | null>(null);

const title = ref("");
const selectedClassId = ref<string | null>(null);
const timeLimit = ref<"none" | "30m" | "1h" | "2h" | "24h">("none");
const publishNow = ref(true);
const selectedProblemIds = ref<string[]>([]);

// data lists
const classes = ref<ClassRow[]>([]);
const problems = ref<ProblemRow[]>([]);

// helpers
const canSave = computed(() =>
  title.value.trim().length > 0 &&
  selectedProblemIds.value.length > 0 &&
  !saving.value
);

// utils
function dueFromLimit(): Date | null {
  const now = new Date();
  switch (timeLimit.value) {
    case "30m": return new Date(now.getTime() + 30 * 60 * 1000);
    case "1h":  return new Date(now.getTime() + 60 * 60 * 1000);
    case "2h":  return new Date(now.getTime() + 2 * 60 * 60 * 1000);
    case "24h": return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    default:    return null;
  }
}

async function loadClasses() {
  classes.value = [];
  const uid = getAuth().currentUser?.uid || "";
  if (!uid) return;

  try {
    const q = query(collection(db, "classes"), where("ownerUid", "==", uid), limit(100));
    const snap = await getDocs(q);

    const rows = snap.docs.map(d => ({ id: d.id, name: d.data().name || "(sin título)" }));
    rows.sort((a, b) => a.name.localeCompare(b.name, "es"));
    classes.value = rows;
  } catch (e) {
    console.error("loadClasses error", e);
    alert("No se pudieron cargar las clases. Revisa la consola por si falta un índice.");
  }
}

async function loadProblems() {
  problems.value = [];
  const uid = getAuth().currentUser?.uid || "";
  const common: QueryConstraint[] = [orderBy("createdAt", "desc"), limit(200)];

  const qPublic = query(
    collection(db, "problems"),
    where("visibility", "==", "public"),
    ...common
  );

  const qMineOwner = uid
    ? query(collection(db, "problems"), where("ownerUid", "==", uid), ...common)
    : null;

  const qMineCreated = uid
    ? query(collection(db, "problems"), where("createdBy", "==", uid), ...common)
    : null;

  const snaps = await Promise.all([
    getDocs(qPublic),
    qMineOwner ? getDocs(qMineOwner) : Promise.resolve({ docs: [] } as any),
    qMineCreated ? getDocs(qMineCreated) : Promise.resolve({ docs: [] } as any),
  ]);

  const seen = new Set<string>();
  for (const snap of snaps) {
    for (const d of snap.docs) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      problems.value.push({
        id: d.id,
        title: d.data().title || "(sin título)"
      });
    }
  }
}

async function onSave() {
  try {
    saving.value = true;
    error.value = null;

    const uid = getAuth().currentUser?.uid || "";
    if (!uid) throw new Error("No hay usuario autenticado");

    const docData: any = {
      title: title.value.trim(),
      ownerUid: uid,
      classId: selectedClassId.value || null,
      problemIds: selectedProblemIds.value,
      isPublished: publishNow.value === true,
      status: publishNow.value ? "published" : "draft",
      createdAt: serverTimestamp(),
      dueAt: dueFromLimit(), // puede ser null (Firestore acepta Date)
    };
    if (publishNow.value) docData.publishedAt = serverTimestamp();

    const colRef = collection(db, "assignments");
    const docRef = await addDoc(colRef, docData);

    // ✅ Parche: si publicas y elegiste clase, copia el roster a la asignación
    if (publishNow.value && selectedClassId.value) {
      try {
        const clsSnap = await getDoc(doc(db, "classes", selectedClassId.value));
        const data = clsSnap.exists() ? (clsSnap.data() as any) : null;
        const assignees: string[] =
          (data?.studentUids as string[] | undefined)     // <-- revisa nombre de campo
          ?? (data?.rosterUids as string[] | undefined)   // fallback común
          ?? [];

        await updateDoc(docRef, {
          assigneeUids: assignees,
          assigneeCount: assignees.length,
        });
      } catch (e) {
        console.warn("No se pudo copiar roster en la asignación:", e);
        // No rompemos el flujo si falla este paso
      }
    }

    // Navegación
    if (selectedClassId.value) {
      router.push({ name: "assignmentsByClass", params: { id: selectedClassId.value } });
    } else {
      router.push({ name: "Dashboard" });
    }
  } catch (e: any) {
    console.error(e);
    error.value = e?.message ?? "No se pudo crear la asignación.";
    alert(error.value);
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  loading.value = true;
  try {
    if (!profile.ready) profile.init();
    await Promise.all([loadClasses(), loadProblems()]);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <section class="max-w-6xl mx-auto p-4 space-y-6">
    <header class="flex items-center justify-between">
      <h1 class="text-2xl font-semibold">Nueva asignación</h1>
    </header>

    <div v-if="loading">Cargando…</div>
    <div v-else class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Columna izquierda -->
      <div class="border rounded-lg p-4 space-y-4">
        <div>
          <label class="block text-sm font-medium mb-1">Título</label>
          <input v-model="title" type="text" class="w-full border rounded px-3 py-2" placeholder="Quiz 1, Evaluación 2…" />
        </div>

        <div>
          <label class="block text-sm font-medium mb-1">Problemas</label>
          <div class="border rounded p-2 h-56 overflow-auto space-y-1">
            <label v-for="p in problems" :key="p.id" class="flex items-center gap-2 text-sm">
              <input type="checkbox" :value="p.id" v-model="selectedProblemIds" />
              <span>{{ p.title }}</span>
            </label>
          </div>
          <p class="text-xs text-gray-500 mt-1">
            Seleccionados: {{ selectedProblemIds.length }}
          </p>
        </div>
      </div>

      <!-- Columna derecha -->
      <div class="border rounded-lg p-4 space-y-4">
        <div>
          <label class="block text-sm font-medium mb-1">Asignar a clase (opcional)</label>
          <select v-model="selectedClassId" class="w-full border rounded px-3 py-2">
            <option :value="null">No asignar (borrador)</option>
            <option v-for="c in classes" :key="c.id" :value="c.id">
              {{ c.name }}
            </option>
          </select>
          <p class="text-xs text-gray-500 mt-1">
            Si publicas y eliges una clase, se copiará el roster en <code>assigneeUids</code>.
          </p>
        </div>

        <div>
          <label class="block text-sm font-medium mb-1">Tiempo límite</label>
          <select v-model="timeLimit" class="w-full border rounded px-3 py-2">
            <option value="none">Sin límite</option>
            <option value="30m">30 minutos</option>
            <option value="1h">1 hora</option>
            <option value="2h">2 horas</option>
            <option value="24h">24 horas</option>
          </select>
        </div>

        <label class="flex items-center gap-2">
          <input type="checkbox" v-model="publishNow" />
          <span class="text-sm">Publicar ahora</span>
        </label>

        <div class="pt-2">
          <button
            :disabled="!canSave"
            class="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
            @click="onSave"
          >
            {{ saving ? 'Guardando…' : 'Guardar' }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

