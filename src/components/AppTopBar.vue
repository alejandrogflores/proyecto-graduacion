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
if (!profile.ready) profile.init?.();

const { email, role, ready } = storeToRefs(profile);

const roleLower = computed(() => (role.value ?? "").toLowerCase());
const isStudent = computed(() => roleLower.value === "student");
const isTeacherLike = computed(() => roleLower.value === "teacher" || roleLower.value === "admin");

async function logout() {
  try {
    await signOut(auth);
    router.push({ name: "Login" });
  } catch (e) {
    console.error("logout error", e);
    alert("No se pudo cerrar sesión");
  }
}
</script>

<template>
  <header v-if="!route.meta?.hideHeader" class="w-full border-b bg-white">
    <nav class="max-w-6xl mx-auto flex items-center gap-4 p-3">
      <RouterLink to="/dashboard" class="font-semibold nav-link">EduApp</RouterLink>

      <!-- Navegación base -->
      <RouterLink to="/dashboard" class="nav-link">Dashboard</RouterLink>
      <RouterLink to="/problems"  class="nav-link">Problemas</RouterLink>
      <RouterLink v-if="role === 'teacher' || role === 'admin'" to="/reports"   class="nav-link">Reportes</RouterLink>

      <!-- Rama por rol -->
      <RouterLink
        v-if="ready && isStudent"
        to="/assignments/my"
        class="ml-2 inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg border hover:bg-gray-50"
      >
        Mis asignaciones
      </RouterLink>

      <template v-else-if="ready && isTeacherLike">
        <RouterLink
          to="/assignments/new"
          class="ml-2 inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg border hover:bg-gray-50"
        >
          Nueva asignación
        </RouterLink>

        <RouterLink
          v-if="route.params?.id"
          :to="`/classes/${route.params.id}/assignments`"
          class="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg border hover:bg-gray-50"
        >
          Asignaciones de la clase
        </RouterLink>
      </template>

      <!-- Lado derecho -->
      <div class="ml-auto flex items-center gap-3 text-sm text-gray-700">
        <span v-if="ready && roleLower" class="px-2 py-0.5 rounded bg-gray-100 border capitalize">
          {{ roleLower }}
        </span>
        <span v-if="ready && email">{{ email }}</span>

        <button
          class="px-3 py-1 rounded bg-red-600 text-white hover:bg-red-700"
          @click="logout"
        >
          Cerrar sesión
        </button>
      </div>
    </nav>
  </header>
</template>

<style scoped>
.nav-link{
  position: relative;
  display: inline-block;
  padding: .25rem .5rem;
  border-radius: .375rem;
  caret-color: transparent; /* oculta el cursor de texto */
  user-select: none;
  cursor: pointer;
}
.nav-link:hover { text-decoration: underline; }
.nav-link:focus { outline: none; }
</style>
