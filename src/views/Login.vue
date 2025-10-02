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
import { useRoute, useRouter } from "vue-router";
import { auth } from "@/services/firebase";
import { GoogleAuthProvider, signInWithPopup, signInWithRedirect } from "firebase/auth";

const route = useRoute();
const router = useRouter();

const provider = new GoogleAuthProvider();
const LS_KEY = "redirectAfterLogin";

const nextPath = computed(() => (route.query.redirect as string) || "/");

async function login() {
  // 1) Guardamos el destino robustamente
  const dest = nextPath.value || "/";
  localStorage.setItem(LS_KEY, dest);

  try {
    if (import.meta.env.DEV) {
      // 2) En dev, popup para NO recargar la SPA
      await signInWithPopup(auth, provider);
      // 3) Por si el listener tarda, lo intentamos aquí también
      router.replace(dest).catch(() => {});
    } else {
      // 2b) En prod, redirect (cookies 3rd party)
      await signInWithRedirect(auth, provider);
      // 3b) Al volver, el listener global de main.ts hará el redirect leyendo LS_KEY
    }
  } catch (e) {
    console.error("[Login] error:", e);
  }
}
</script>




