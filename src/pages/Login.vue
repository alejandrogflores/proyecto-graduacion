<!-- src/views/Login.vue (o src/pages/Login.vue) -->
<template>
  <div class="min-h-screen grid place-items-center bg-gray-50">
    <div class="w-full max-w-sm rounded-2xl shadow p-6 bg-white space-y-4">
      <h1 class="text-2xl font-semibold text-center">Iniciar sesión</h1>

      <button
        class="w-full border rounded-lg py-2 hover:bg-gray-100"
        @click="login"
      >
        Continuar con Google
      </button>

      <p class="text-xs text-gray-500 text-center">
        Te enviaremos a {{ nextPath || '/' }} luego de iniciar sesión.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRouter, useRoute } from "vue-router";
import { auth } from "@/services/firebase";
import { GoogleAuthProvider, signInWithPopup, signInWithRedirect } from "firebase/auth";

const router = useRouter();
const route = useRoute();

const provider = new GoogleAuthProvider();
const LS_KEY = "postLoginRedirect";
const nextPath = computed(() => (route.query.redirect as string) || "/");

async function login() {
  const dest = nextPath.value || "/";
  localStorage.setItem(LS_KEY, dest); // <- el main.ts lo leerá tras el login

  try {
    if (import.meta.env.DEV) {
      // En desarrollo evita recargar la SPA
      await signInWithPopup(auth, provider);
      // El listener en main.ts hará el redirect; por si acaso, también lo disparamos aquí:
      router.replace(dest).catch(() => {});
    } else {
      await signInWithRedirect(auth, provider);
      // Al volver del redirect, main.ts hará el redirect usando LS_KEY
    }
  } catch (e) {
    console.error("[Login] error:", e);
  }
}
</script>


