<script setup lang="ts">
import { RouterLink, useRoute, useRouter } from "vue-router";
import { signOut } from "firebase/auth";
import { auth } from "@/services/firebase";
import { useProfileStore } from "@/stores/profile";
import { storeToRefs } from "pinia";

const route = useRoute();
const router = useRouter();

const profile = useProfileStore();
const { email, role, ready } = storeToRefs(profile);

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
  <!-- Oculta el header en páginas con meta.hideHeader (como Login) -->
  <header v-if="!route.meta?.hideHeader" class="w-full border-b bg-white">
    <nav class="max-w-6xl mx-auto flex items-center gap-4 p-3">
      <RouterLink to="/dashboard" class="font-semibold">EduApp</RouterLink>
      <RouterLink to="/dashboard">Dashboard</RouterLink>
      <RouterLink to="/problems">Problemas</RouterLink>
      <RouterLink to="/reports">Reportes</RouterLink>

      <div class="ml-auto flex items-center gap-3 text-sm text-gray-700">
        <!-- Badge rol + correo -->
        <span v-if="ready && role" class="px-2 py-0.5 rounded bg-gray-100 border">
          {{ role }}
        </span>
        <span v-if="ready && email">{{ email }}</span>

        <!-- Botón de Cerrar sesión -->
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

