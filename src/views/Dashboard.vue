<script setup lang="ts">
import { useProfileStore } from "@/stores/profile";
import { computed } from "vue";
import { storeToRefs } from "pinia";


const profile = useProfileStore();
if (!profile.ready) profile.init?.();

const { role } = storeToRefs(profile);
const isTeacher = computed(() => role.value === "teacher" || role.value === "admin");
</script>

<template>
  <section class="space-y-4">
    <div class="w-full bg-blue-600 text-white text-sm px-4 py-2">
      Bienvenido a EduApp
    </div>
    <h1 class="text-4xl font-bold">Dashboard</h1>
    <p class="text-slate-600">Bienvenido. Desde aquí puedes crear problemas, resolver y ver tus reportes.</p>

    <div class="grid md:grid-cols-2 gap-4">
      <!-- Card de Problemas (la de la izquierda) -->
      <RouterLink
        class="block border rounded p-4 hover:bg-gray-50 transition"
        :to="{ name: 'ProblemsList' }"
      >
        <h3 class="font-semibold">Problemas</h3>
        <p class="text-sm text-gray-600">Listar y crear</p>
      </RouterLink>

      <!-- Card de Reportes: ocúltala para alumnos -->
      <RouterLink
        v-if="isTeacher"
        class="block border rounded p-4 hover:bg-gray-50 transition"
        :to="{ name: 'Reports' }"
      >
        <h3 class="font-semibold">Reportes</h3>
        <p class="text-sm text-gray-600">Intentos y aciertos</p>
      </RouterLink>
    </div>
    
  </section>
</template>



