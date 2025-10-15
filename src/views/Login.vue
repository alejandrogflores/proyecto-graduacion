<template>
  <div class="min-h-screen grid place-items-center bg-gray-50">
    <div class="w-full max-w-sm rounded-2xl shadow p-6 bg-white space-y-4">
      <h1 class="text-2xl font-semibold text-center">Iniciar sesión</h1>

      <!-- Email / Password -->
      <form class="space-y-3" @submit.prevent="loginWithEmail">
        <div class="space-y-1">
          <label class="text-sm text-gray-600">Correo</label>
          <input
            v-model.trim="email"
            type="email"
            required
            autocomplete="username"
            class="w-full border rounded-lg px-3 py-2 outline-none focus:ring"
            placeholder="student@demo.test"
          />
        </div>

        <div class="space-y-1">
          <label class="text-sm text-gray-600">Contraseña</label>
          <input
            v-model="password"
            :type="showPass ? 'text' : 'password'"
            required
            autocomplete="current-password"
            class="w-full border rounded-lg px-3 py-2 outline-none focus:ring"
            placeholder="••••••"
          />
          <button
            type="button"
            class="text-xs text-gray-500 hover:underline mt-1"
            @click="showPass = !showPass"
          >
            {{ showPass ? 'Ocultar' : 'Mostrar' }} contraseña
          </button>
        </div>

        <button
          type="submit"
          class="w-full rounded-lg py-2 bg-black text-white disabled:opacity-50"
          :disabled="loading"
        >
          {{ loading ? 'Ingresando…' : 'Entrar' }}
        </button>

        <p v-if="errMsg" class="text-sm text-red-600 text-center">{{ errMsg }}</p>
      </form>

      <div class="flex items-center gap-3">
        <div class="h-px bg-gray-200 flex-1"></div>
        <span class="text-xs text-gray-400">o</span>
        <div class="h-px bg-gray-200 flex-1"></div>
      </div>

      <!-- Google (opcional) -->
      <button
        class="w-full border rounded-lg py-2 hover:bg-gray-100"
        @click="loginWithGoogle"
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
import { ref, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { auth } from "@/services/firebase";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signInWithEmailAndPassword,
} from "firebase/auth";

const route = useRoute();
const router = useRouter();
const provider = new GoogleAuthProvider();

const LS_KEY = "redirectAfterLogin";
const nextPath = computed(() => (route.query.redirect as string) || "/");

// form state
const email = ref("");
const password = ref("");
const showPass = ref(false);
const loading = ref(false);
const errMsg = ref("");

function rememberDest() {
  const dest = nextPath.value || "/";
  localStorage.setItem(LS_KEY, dest);
  return dest;
}

async function loginWithEmail() {
  errMsg.value = "";
  const dest = rememberDest();

  try {
    loading.value = true;
    await signInWithEmailAndPassword(auth, email.value, password.value);
    await router.replace(dest).catch(() => {});
  } catch (e: any) {
    // mensajes amistosos
    const code = e?.code || "";
    if (code === "auth/invalid-credential" || code === "auth/wrong-password") {
      errMsg.value = "Correo o contraseña incorrectos.";
    } else if (code === "auth/user-not-found") {
      errMsg.value = "No existe un usuario con ese correo.";
    } else if (code === "auth/too-many-requests") {
      errMsg.value = "Demasiados intentos. Intenta de nuevo en unos minutos.";
    } else {
      errMsg.value = "No se pudo iniciar sesión. Intenta de nuevo.";
      console.error("[Login] email error:", e);
    }
  } finally {
    loading.value = false;
  }
}

async function loginWithGoogle() {
  const dest = rememberDest();
  try {
    if (import.meta.env.DEV) {
      await signInWithPopup(auth, provider);
      await router.replace(dest).catch(() => {});
    } else {
      await signInWithRedirect(auth, provider);
      // Al volver, tu listener global hará el redirect leyendo LS_KEY
    }
  } catch (e) {
    console.error("[Login] google error:", e);
  }
}
</script>