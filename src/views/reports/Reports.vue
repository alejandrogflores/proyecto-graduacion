<!-- src/views/reports/Reports.vue -->
<script setup lang="ts">
import { ref, onMounted } from "vue";
import { getDocs, query, where } from "firebase/firestore";
import { colAssignments, colAttempts } from "@/services/firebase";
import { useProfileStore } from "@/stores/profile";

const profile = useProfileStore();
if (!profile.ready) profile.init?.();

const loading = ref(true);
const totalAssignments = ref(0);
const publishedAssignments = ref(0);
const myAttempts = ref(0);

async function load() {
  if (!profile.uid) return;
  loading.value = true;
  try {
    if (profile.isTeacherOrAdmin) {
      const qAll = query(colAssignments, where("ownerUid", "==", profile.uid!));
      totalAssignments.value = (await getDocs(qAll)).size;

      const qPub = query(colAssignments, where("ownerUid", "==", profile.uid!), where("isPublished", "==", true));
      publishedAssignments.value = (await getDocs(qPub)).size;
    }

    const qMine = query(colAttempts, where("studentUid", "==", profile.uid!));
    myAttempts.value = (await getDocs(qMine)).size;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section class="max-w-6xl mx-auto p-4">
    <h1 class="text-2xl font-bold mb-4">Reportes</h1>
    <p v-if="loading">Cargando…</p>
    <div v-else class="grid md:grid-cols-3 gap-4">
      <div class="border rounded p-4">
        <h3 class="font-semibold">Asignaciones creadas</h3>
        <p class="text-3xl">{{ totalAssignments }}</p>
      </div>
      <div class="border rounded p-4">
        <h3 class="font-semibold">Asignaciones publicadas</h3>
        <p class="text-3xl">{{ publishedAssignments }}</p>
      </div>
      <div class="border rounded p-4">
        <h3 class="font-semibold">Mis intentos</h3>
        <p class="text-3xl">{{ myAttempts }}</p>
      </div>
    </div>
  </section>
</template>

