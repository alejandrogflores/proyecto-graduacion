<!-- src/layouts/AppLayout.vue -->
<script setup lang="ts">
import { RouterView } from "vue-router";
</script>

<template>
  <div class="container">
    <RouterView />
  </div>
</template>

<style scoped>
.container { max-width:960px; margin:0 auto; padding:16px; }
</style>
