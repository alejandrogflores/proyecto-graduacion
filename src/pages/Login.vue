<!-- src/views/auth/Login.vue -->
<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { auth, userDoc } from "@/services/firebase";
import { setDoc, serverTimestamp } from "firebase/firestore";

const router = useRouter();

const email = ref("");
const password = ref("");
const loading = ref(false);
const errorMsg = ref("");

async function ensureUserDoc(uid: string, role: "teacher" | "student") {
  await setDoc(
    userDoc(uid),
    {
      uid,
      role,
      email: auth.currentUser?.email ?? null,
      displayName: auth.currentUser?.displayName ?? null,
      createdAt: serverTimestamp(),
      lastSeen: serverTimestamp(),
    },
    { merge: true }
  );
}

async function createIfMissing(e: string, p: string, role: "teacher" | "student") {
  try {
    const cred = await createUserWithEmailAndPassword(auth, e, p);
    if (!cred.user.displayName) {
      await updateProfile(cred.user, { displayName: role === "teacher" ? "Profesor Demo" : "Alumno Demo" });
    }
    await ensureUserDoc(cred.user.uid, role);
    return cred;
  } catch (err: any) {
    // si ya existía u otro error, lo propagamos y dejamos que signIn lo maneje
    throw err;
  }
}

async function loginWithEmail() {
  loading.value = true;
  errorMsg.value = "";
  try {
    await signInWithEmailAndPassword(auth, email.value.trim(), password.value);
    router.push({ name: "Dashboard" });
  } catch (err: any) {
    // si el usuario no existe, lo creamos como student por defecto
    if (err?.code === "auth/invalid-credential" || err?.code === "auth/user-not-found") {
      try {
        const cred = await createIfMissing(email.value.trim(), password.value, "student");
        await ensureUserDoc(cred.user.uid, "student");
        router.push({ name: "Dashboard" });
        return;
      } catch (e2: any) {
        errorMsg.value = e2?.message ?? "No se pudo iniciar sesión.";
      }
    } else {
      errorMsg.value = err?.message ?? "No se pudo iniciar sesión.";
    }
  } finally {
    loading.value = false;
  }
}

async function loginDemo(role: "teacher" | "student") {
  const demoEmail = role === "teacher" ? "teacher@demo.test" : "student@demo.test";
  const demoPass = "123456";
  loading.value = true;
  errorMsg.value = "";
  try {
    await signInWithEmailAndPassword(auth, demoEmail, demoPass);
  } catch (err: any) {
    // si no existe en el emulador, lo creamos con el rol adecuado
    if (err?.code === "auth/invalid-credential" || err?.code === "auth/user-not-found") {
      const cred = await createIfMissing(demoEmail, demoPass, role);
      await ensureUserDoc(cred.user.uid, role);
    } else {
      errorMsg.value = err?.message ?? "No se pudo iniciar sesión.";
      loading.value = false;
      return;
    }
  }
  loading.value = false;
  router.push({ name: "Dashboard" });
}
</script>

<template>
  <main class="min-h-screen grid place-items-center bg-gray-50">
    <div class="w-full max-w-md bg-white border rounded-2xl shadow-sm p-6">
      <h1 class="text-2xl font-semibold text-center mb-6">Iniciar sesión</h1>

      <div class="space-y-3">
        <div>
          <label class="text-sm block mb-1">Correo</label>
          <input
            v-model="email"
            type="email"
            class="w-full border rounded-lg px-3 py-2"
            placeholder="tucorreo@ejemplo.com"
            autocomplete="username"
          />
        </div>

        <div>
          <label class="text-sm block mb-1">Contraseña</label>
          <input
            v-model="password"
            type="password"
            class="w-full border rounded-lg px-3 py-2"
            placeholder="••••••"
            autocomplete="current-password"
          />
        </div>

        <button
          :disabled="loading"
          class="w-full mt-2 rounded-lg bg-black text-white py-2 disabled:opacity-50"
          @click="loginWithEmail"
        >
          {{ loading ? "Entrando…" : "Entrar" }}
        </button>

        <p v-if="errorMsg" class="text-sm text-red-600 mt-2">{{ errorMsg }}</p>
      </div>

      <div class="my-6 h-px bg-gray-200"></div>

      <div class="space-y-2">
        <button
          :disabled="loading"
          class="w-full rounded-lg border py-2 disabled:opacity-50"
          @click="loginDemo('teacher')"
        >
          Entrar como <strong>Teacher Demo</strong>
        </button>
        <button
          :disabled="loading"
          class="w-full rounded-lg border py-2 disabled:opacity-50"
          @click="loginDemo('student')"
        >
          Entrar como <strong>Student Demo</strong>
        </button>
        <p class="text-xs text-gray-500 text-center">
          (Emulador: se crean usuarios demo si no existen)
        </p>
      </div>
    </div>
  </main>
</template>



