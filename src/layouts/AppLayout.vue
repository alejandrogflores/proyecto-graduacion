<template>
  <div>
    <AppHeader />
    <main class="container">
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import AppHeader from "@/components/AppHeader.vue";
</script>

<style scoped>
.container { max-width:960px; margin:0 auto; padding:16px; }
</style>

