<!-- src/components/AppTopBar.vue -->
<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useProfileStore } from "@/stores/profile";

const router = useRouter();
const profile = useProfileStore();

const isReady = computed(() => profile.ready);
const role = computed(() => profile.role);
const isTeacher = computed(() => role.value === "teacher" || role.value === "admin");
const isStudent = computed(() => role.value === "student");

function go(name: string) {
  router.push({ name });
}
</script>

<template>
  <nav class="flex items-center gap-4 px-4 py-3 border-b bg-white">
    <button class="font-semibold" @click="go('Dashboard')">EduApp</button>

    <!-- Enlaces visibles para TEACHER -->
    <template v-if="isReady && isTeacher">
      <button class="hover:underline" @click="go('Dashboard')">Dashboard</button>
      <button class="hover:underline" @click="go('ProblemsList')">Problemas</button>
      <button class="hover:underline" @click="go('Reports')">Reportes</button>
      <button class="ml-auto px-3 py-1 border rounded" @click="go('AssignmentNew')">Nueva asignación</button>
    </template>

    <!-- Enlaces visibles para STUDENT -->
    <template v-else-if="isReady && isStudent">
      <button class="hover:underline" @click="go('Dashboard')">Dashboard</button>
      <button class="hover:underline" @click="go('ProblemsList')">Problemas</button>
      <button class="hover:underline" @click="go('MyAssignments')">Mis asignaciones</button>
    </template>

    <!-- (Opcional) mientras carga perfil -->
    <template v-else>
      <span class="text-sm text-gray-500">Cargando…</span>
    </template>

    <!-- Perfil / sesión -->
    <div class="ml-auto flex items-center gap-2" v-if="isReady">
      <span class="text-xs px-2 py-0.5 rounded bg-gray-100">{{ role }}</span>
      <span class="text-sm text-gray-600">{{ profile.email || '' }}</span>
      <!-- tu botón Cerrar sesión ya existente va aquí -->
    </div>
  </nav>
</template>

