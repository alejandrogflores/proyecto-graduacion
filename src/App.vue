<!-- src/App.vue -->
<script setup lang="ts">
import { RouterView, useRoute } from "vue-router";
import AppTopBar from "@/components/AppTopBar.vue"; // asegúrate que existe
const route = useRoute();
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <!-- Barra superior (excepto en Login si tienes meta.hideHeader) -->
    <AppTopBar v-if="!route.meta?.hideHeader" />

    <!-- Aquí se renderizan las vistas -->
    <main class="flex-1">
      <RouterView :key="route.fullPath" />
    </main>
  </div>
</template>






