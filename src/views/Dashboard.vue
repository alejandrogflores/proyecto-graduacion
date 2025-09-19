<script setup lang="ts">
import { useProfileStore } from "@/stores/profile";
const profile = useProfileStore();
</script>

<template>
  <section class="space-y-4">
    <div class="w-full bg-blue-600 text-white text-sm px-4 py-2">
      Bienvenido a EduApp
    </div>
    <h1 class="text-4xl font-bold">Dashboard</h1>
    <p class="text-slate-600">Bienvenido. Desde aquí puedes crear problemas, resolver y ver tus reportes.</p>

    <div class="grid sm:grid-cols-3 gap-4">
      <RouterLink to="/problems" class="block border rounded-xl p-4 hover:bg-slate-50">
        <h3 class="font-medium">Problemas</h3>
        <p class="text-sm text-slate-600">Listar y crear</p>
      </RouterLink>

      <RouterLink to="/reports" class="block border rounded-xl p-4 hover:bg-slate-50">
        <h3 class="font-medium">Reportes</h3>
        <p class="text-sm text-slate-600">Intentos y aciertos</p>
      </RouterLink>

      <!-- AQUÍ: link docente hacia /attempts -->
      <RouterLink
        v-if="profile.isTeacher"
        to="/attempts"
        class="block border rounded-xl p-4 hover:bg-slate-50"
      >
        <h3 class="font-medium">Reporte Docente</h3>
        <p class="text-sm text-slate-600">Ver alumnos y detalles</p>
      </RouterLink>
    </div>
  </section>
</template>



