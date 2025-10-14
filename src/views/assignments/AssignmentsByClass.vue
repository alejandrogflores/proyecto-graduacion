<!-- src/views/assignments/AssignmentsByClass.vue -->
<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { getDocs, query, where, orderBy } from "firebase/firestore";
import { colAssignments } from "@/services/firebase";
import { useProfileStore } from "@/stores/profile";

type Assignment = {
  id: string;
  title?: string;
  isPublished: boolean;
  classId?: string | null;
  createdAt?: any;
  publishedAt?: any;
  timeLimitSec?: number | null;
};

const route = useRoute();
const router = useRouter();
const profile = useProfileStore();
if (!profile.ready) profile.init?.();

const classId = ref<string>(route.params.id as string);
const includeDrafts = ref(true);

const loading = ref(false);
const items = ref<Assignment[]>([]);

async function load() {
  if (!profile.uid) return;
  loading.value = true;
  try {
    const promises: Promise<any>[] = [];

    // Publicadas de la clase
    const qPub = query(
      colAssignments,
      where("classId", "==", classId.value),
      where("isPublished", "==", true),
      where("ownerUid", "==", profile.uid),
      orderBy("createdAt", "desc"),
    );
    promises.push(getDocs(qPub));

    // Borradores del owner para esa clase (si se pide)
    if (includeDrafts.value) {
      const qDraft = query(
        colAssignments,
        where("classId", "==", classId.value),
        where("isPublished", "==", false),
        where("ownerUid", "==", profile.uid),
        orderBy("createdAt", "desc"),
      );
      promises.push(getDocs(qDraft));
    }

    const results = await Promise.all(promises);
    const flat = results.flatMap((qs) => qs.docs.map((d: any) => ({ id: d.id, ...(d.data() as any) })));

    // ordena por fecha de creación desc
    flat.sort((a, b) => (b?.createdAt?.seconds ?? 0) - (a?.createdAt?.seconds ?? 0));
    items.value = flat;
  } finally {
    loading.value = false;
  }
}

function newAssignment() {
  router.push({ name: "AssignmentNew" });
}

watch([() => route.params.id, includeDrafts], () => {
  classId.value = route.params.id as string;
  load();
});

onMounted(load);
</script>

<template>
  <section class="max-w-5xl mx-auto p-4">
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-2xl font-bold">Asignaciones</h1>

      <div class="flex items-center gap-2">
        <label class="text-sm flex items-center gap-2">
          <input type="checkbox" v-model="includeDrafts" />
          Incluir borradores
        </label>
        <button class="px-3 py-1.5 rounded border" @click="newAssignment">Nueva asignación</button>
      </div>
    </div>

    <p v-if="loading">Cargando…</p>
    <p v-else-if="items.length === 0">No hay asignaciones para esta clase.</p>

    <ul v-else class="space-y-3">
      <li v-for="a in items" :key="a.id" class="border rounded p-3">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="font-semibold">
              {{ a.title || a.id }}
              <span class="ml-2 text-xs px-2 py-0.5 rounded border"
                    :class="a.isPublished ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'">
                {{ a.isPublished ? 'Publicado' : 'Borrador' }}
              </span>
            </h3>
            <p class="text-xs text-gray-500" v-if="a.timeLimitSec">Límite: {{ a.timeLimitSec }}s</p>
          </div>

          <div class="flex items-center gap-2">
            <router-link :to="{ name: 'SolveAssignment', params: { id: a.id } }"
                         class="px-3 py-1.5 rounded border">Ver</router-link>
            <router-link :to="{ name: 'AssignmentNew' }"
                         class="px-3 py-1.5 rounded bg-black text-white">Duplicar/Crear</router-link>
          </div>
        </div>
      </li>
    </ul>
  </section>
</template>







