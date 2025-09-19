<script setup lang="ts">
import { ref, computed } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { useProfileStore } from "@/stores/profile";
import { signOut } from "firebase/auth";
import { auth } from "@/services/firebase";

const router = useRouter();
const profile = useProfileStore();

const { ready, uid, role } = storeToRefs(profile);
const isLogged = computed(() => !!uid.value);
const isTeacher = computed(() => {
  const r = (role.value ?? "").toLowerCase();
  return r === "teacher" || r === "admin";
});

const loggingOut = ref(false);

async function logout() {
  if (loggingOut.value) return;
  loggingOut.value = true;
  try {
    await signOut(auth);           // 👈 el listener actualizará el store a "sin sesión"
    await router.replace({ name: "Login" });
  } catch (e) {
    console.error(e);
    await router.replace({ name: "Login" });
  } finally {
    loggingOut.value = false;
  }
}
</script>

<template>
  <header class="flex items-center justify-between px-6 py-3 bg-gray-100 border-b">
    <RouterLink to="/" class="text-lg font-bold">EduApp</RouterLink>

    <nav class="flex items-center gap-4">
      <RouterLink to="/" class="hover:underline">Dashboard</RouterLink>
      <RouterLink to="/problems" class="hover:underline">Problemas</RouterLink>
      <RouterLink to="/reports" class="hover:underline">Reportes</RouterLink>

      <RouterLink
        v-if="ready && isTeacher"
        to="/teacher"
        class="hover:underline text-blue-600 font-semibold"
      >
        Panel Teacher
      </RouterLink>

      <button
        v-if="isLogged"
        @click="logout"
        :disabled="loggingOut"
        class="px-3 py-1 rounded bg-red-500 text-white hover:bg-red-600 disabled:opacity-60"
      >
        {{ loggingOut ? 'Cerrando…' : 'Cerrar sesión' }}
      </button>

      <RouterLink
        v-else
        to="/login"
        class="px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
      >
        Iniciar sesión
      </RouterLink>
    </nav>
  </header>
</template>













