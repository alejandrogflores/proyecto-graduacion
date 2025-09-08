<template>
  <div v-if="loading">Cargando…</div>
  <div v-else>
    <h1>Mi Progreso</h1>
    <p v-if="profile">Bienvenido, <b>{{ profile.displayName || profile.email }}</b></p>
    <pre style="background:#f7f7f7;padding:12px;border-radius:8px">{{ profile }}</pre>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getCurrentUser } from '../utils/authGuard';
import { db } from '../services/firebase';
import { doc, getDoc } from 'firebase/firestore';

const loading = ref(true);
const profile = ref<any>(null);

onMounted(async () => {
  const u = await getCurrentUser(); // ya estás autenticado por el guard
  if (u) {
    const ref = doc(db, 'users', u.uid);
    const snap = await getDoc(ref);
    if (snap.exists()) profile.value = snap.data();
  }
  loading.value = false;
});
</script>

