<!-- src/components/AppTopBar.vue -->
<script setup lang="ts">
import { RouterLink, useRoute, useRouter } from "vue-router";
import { signOut } from "firebase/auth";
import { auth } from "@/services/firebase";
import { useProfileStore } from "@/stores/profile";
import { storeToRefs } from "pinia";
import { computed } from "vue";

const route = useRoute();
const router = useRouter();

const profile = useProfileStore();
if (!profile.ready) profile.init();

const { email, role, ready } = storeToRefs(profile);

// Docentes: teacher o admin
const canCreate = computed(
  () => ready.value && (role.value === "teacher" || role.value === "admin")
);

async function logout() {
  try {
    await signOut(auth);
    router.push({ name: "Login" });
  } catch (e) {
    console.error("logout error", e);
    alert("No se pudo cerrar sesión");
  }
}

function isActive(pathStartsWith: string | string[]) {
  const paths = Array.isArray(pathStartsWith) ? pathStartsWith : [pathStartsWith];
  return paths.some((p) => route.path.startsWith(p));
}
</script>

<template>
  <header v-if="!route.meta?.hideHeader" class="w-full border-b bg-white">
    <nav class="max-w-6xl mx-auto flex items-center gap-4 px-4 py-2">
      <!-- Brand -->
      <RouterLink to="/dashboard" class="font-semibold text-gray-800 hover:opacity-90">
        EduApp
      </RouterLink>

      <!-- Tabs -->
      <div class="flex items-center gap-2">
        <RouterLink
          to="/dashboard"
          class="px-2.5 py-1 rounded text-sm"
          :class="isActive('/dashboard') ? 'bg-black text-white' : 'hover:bg-gray-100 text-gray-700'"
        >
          Dashboard
        </RouterLink>

        <RouterLink
          to="/problems"
          class="px-2.5 py-1 rounded text-sm"
          :class="isActive('/problems') ? 'bg-black text-white' : 'hover:bg-gray-100 text-gray-700'"
        >
          Problemas
        </RouterLink>

        <!-- Docentes -->
        <template v-if="canCreate">
          <RouterLink
            :to="{ name: 'AssignmentNew' }"
            class="px-2.5 py-1 rounded text-sm"
            :class="isActive('/assignments/new') ? 'bg-black text-white' : 'hover:bg-gray-100 text-gray-700'"
          >
            Nueva asignación
          </RouterLink>

          <RouterLink
            :to="{ name: 'Reports' }"
            class="px-2.5 py-1 rounded text-sm"
            :class="isActive('/reports') ? 'bg-black text-white' : 'hover:bg-gray-100 text-gray-700'"
          >
            Reportes
          </RouterLink>
        </template>

        <!-- Alumnos -->
        <template v-else>
          <RouterLink
            :to="{ name: 'MyAssignments' }"
            class="px-2.5 py-1 rounded text-sm"
            :class="isActive('/assignments/my') ? 'bg-black text-white' : 'hover:bg-gray-100 text-gray-700'"
          >
            Mis asignaciones
          </RouterLink>
        </template>
      </div>

      <!-- Right side -->
      <div class="ml-auto flex items-center gap-3 text-sm text-gray-700">
        <span v-if="ready && role" class="px-2 py-0.5 rounded border capitalize bg-gray-50">
          {{ role }}
        </span>
        <span v-if="ready && email" class="hidden sm:inline">{{ email }}</span>

        <button class="px-3 py-1 rounded bg-red-600 text-white hover:bg-red-700" @click="logout">
          Cerrar sesión
        </button>
      </div>
    </nav>
    <div class="h-1 bg-blue-600"></div>
  </header>
</template>

