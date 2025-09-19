<!-- src/views/Login.vue (opcional) -->
<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth } from "@/services/firebase";
import { useAuthStore } from "@/stores/auth";

const router = useRouter();
const loading = ref(false);
const error = ref<string | null>(null);
const authStore = useAuthStore();

async function loginGoogle() {
  loading.value = true; error.value = null;
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
    router.push({ name: "Dashboard" });
  } catch (e: any) {
    error.value = e?.message ?? "Error al iniciar sesión";
  } finally {
    loading.value = false;
  }
}
async function logout() { await authStore.logout(); }
</script>

<template>
  <main class="p-8 flex flex-col items-center gap-4">
    <h1 class="text-4xl font-bold">Iniciar sesión</h1>

    <button v-if="authStore.isLogged" class="px-4 py-2 rounded bg-gray-200" @click="logout">
      Cerrar sesión
    </button>

    <button class="px-4 py-2 rounded bg-blue-600 text-white" :disabled="loading" @click="loginGoogle">
      <span v-if="!loading">Continuar con Google</span>
      <span v-else>Conectando…</span>
    </button>

    <p v-if="error" class="text-red-600">{{ error }}</p>
  </main>
</template>



