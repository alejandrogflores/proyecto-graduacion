<template>
  <div class="w-full border rounded p-6 text-center text-sm text-gray-600">
    <div v-if="state==='loading'">
      <div class="animate-pulse flex flex-col items-center gap-2">
        <div class="h-4 w-40 bg-gray-200 rounded"></div>
        <div class="h-3 w-64 bg-gray-100 rounded"></div>
      </div>
    </div>
    <div v-else-if="state==='empty'">
      <p class="mb-2">{{ title || 'Sin datos' }}</p>
      <p class="text-gray-500">{{ subtitle || 'Intenta ajustar filtros o refrescar.' }}</p>
      <slot name="actions"></slot>
    </div>
    <div v-else-if="state==='error'">
      <p class="text-red-600 font-medium">Ocurrió un error</p>
      <p class="text-gray-500">{{ message }}</p>
      <slot name="actions"></slot>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  state: 'loading' | 'empty' | 'error';
  title?: string;
  subtitle?: string;
  message?: string;
}>();
</script>
