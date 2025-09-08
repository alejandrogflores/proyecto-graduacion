<template>
  <main style="max-width:420px;margin:40px auto;text-align:center">
    <h1>Iniciar Sesión</h1>
    <p>Autentícate para continuar</p>
    <button @click="loginWithGoogle">Continuar con Google</button>
    <p v-if="err" style="color:#b00;margin-top:10px">{{ err }}</p>
  </main>
</template>

<script setup lang="ts">
import { auth } from '../services/firebase';
import { GoogleAuthProvider, signInWithPopup, signInWithRedirect } from 'firebase/auth';
import { useRoute } from 'vue-router';
import { ensureUserDocument } from '../services/usersRepo';

const route = useRoute();

async function loginWithGoogle() {
  const provider = new GoogleAuthProvider();
  try {
    const res = await signInWithPopup(auth, provider);
    if (res.user) {
      await ensureUserDocument(res.user); // 👈 crea/actualiza /users/{uid}
    }
  } catch (e: any) {
    if (e?.code === 'auth/popup-blocked' || e?.code === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(auth, provider);
      return;
    }
    console.error(e);
  }
  const redirect = (route.query.redirect as string) || '/';
  window.location.href = redirect;
}
</script>




