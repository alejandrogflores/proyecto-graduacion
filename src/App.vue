<template>
  <nav style="padding:12px;border-bottom:1px solid #eee">
    <RouterLink to="/" style="margin-right:12px">Inicio</RouterLink>
    <RouterLink to="/progress" style="margin-right:12px">Mi progreso</RouterLink>
    <button v-if="user" @click="logout">Salir ({{ user.displayName }})</button>
    <RouterLink v-else to="/login">Login</RouterLink>
  </nav>
  <RouterView />
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { RouterLink, RouterView } from 'vue-router';
import { auth } from './services/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { ensureUserDocument } from './services/usersRepo'; //  importamos el helper

const user = ref<any>(null);

// Detecta cambios de sesión al montar la app
onMounted(() => {
  onAuthStateChanged(auth, async (u) => {
    user.value = u;
    if (u) {
      //  asegura que exista/actualice el documento en Firestore
      await ensureUserDocument(u);
    }
  });
});

// Cierra sesión y redirige a /login
async function logout() {
  await signOut(auth);
  window.location.href = '/login';
}
</script>

