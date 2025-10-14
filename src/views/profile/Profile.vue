<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useProfileStore } from "@/stores/profile";
const profile = useProfileStore();
const p = profile; // ✅ usa el store directo
</script>

<template>
  <section class="space-y-3">
    <h1 class="text-2xl font-semibold">Mi perfil</h1>
    <div class="border rounded p-4">
      <p><strong>UID:</strong> {{ p?.uid }}</p>
      <p><strong>Email:</strong> {{ p?.email }}</p>
      <p><strong>Nombre:</strong> {{ p?.displayName }}</p>
      <p><strong>Rol:</strong> {{ p?.role }}</p>
      <p class="text-sm text-slate-600 mt-2">El rol por defecto es "student". Para activar vistas de docente, pon tu UID como docente (ver reglas más abajo).</p>
    </div>
  </section>
</template>
