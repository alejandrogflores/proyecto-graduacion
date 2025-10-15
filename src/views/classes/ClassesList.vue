<!-- src/views/classes/ClassesList.vue -->
<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useProfileStore } from "@/stores/profile";
import { storeToRefs } from "pinia";
import { RouterLink } from "vue-router";

type ClassDoc = {
  id: string;
  title?: string;
  ownerUid?: string;
  studentUids?: string[];
  createdAt?: any;
};

const profile = useProfileStore();
if (!profile.ready) profile.init();

const { uid, role } = storeToRefs(profile);
const isAdmin = computed(() => (role.value ?? "").toLowerCase() === "admin");

const loading = ref(true);
const classes = ref<ClassDoc[]>([]);
const error = ref<string | null>(null);

onMounted(async () => {
  try {
    loading.value = true;

    // Teachers ven sus clases; admin ve todas
    const base = collection(db, "classes");
    const q = isAdmin.value
      ? query(base, orderBy("createdAt", "desc"))
      : query(base, where("ownerUid", "==", uid.value), orderBy("createdAt", "desc"));

    const snap = await getDocs(q);
    classes.value = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  } catch (e: any) {
    console.error("[ClassesList] load error:", e);
    error.value = e?.message ?? String(e);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="p-4 max-w-3xl mx-auto">
    <h1 class="text-2xl font-semibold mb-4">Lista de clases</h1>

    <div v-if="loading" class="text-gray-600">Cargando clases…</div>

    <div v-else-if="error" class="text-red-600">
      No se pudieron cargar las clases.<br />
      <small>{{ error }}</small>
    </div>

    <div v-else>
      <div v-if="classes.length === 0" class="text-gray-600">
        Aún no tienes clases registradas.
        <div class="mt-2">
          Crea una asignación y asígnala a una clase existente o nueva desde
          <RouterLink
            to="/assignments/new"
            class="text-blue-600 underline"
            >Nueva asignación</RouterLink
          >.
        </div>
      </div>

      <div v-else class="space-y-3">
        <RouterLink
          v-for="c in classes"
          :key="c.id"
          :to="`/classes/${c.id}/assignments`"
          class="block rounded-2xl border p-4 hover:bg-gray-50 transition"
        >
          <div class="flex items-center justify-between">
            <div>
              <h2 class="font-medium">
                {{ c.title || c.id }}
              </h2>
              <p class="text-sm text-gray-500">
                ID: {{ c.id }}
                <span v-if="c.studentUids?.length">• Estudiantes: {{ c.studentUids.length }}</span>
              </p>
            </div>
            <span class="text-sm px-3 py-1 rounded-lg border">Ver asignaciones</span>
          </div>
        </RouterLink>
      </div>
    </div>
  </div>
</template>


