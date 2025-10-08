<script setup lang="ts">
defineProps<{ status: "not_started" | "in_progress" | "finished" }>();

const label: Record<string,string> = {
  not_started: "Sin iniciar",
  in_progress: "En curso",
  finished: "Finalizado",
};

const cls: Record<string,string> = {
  not_started: "bg-gray-100 text-gray-700",
  in_progress: "bg-amber-100 text-amber-800",
  finished: "bg-emerald-100 text-emerald-800",
};
</script>

<template>
  <span
    class="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
    :class="cls[status]"
  >
    {{ label[status] }}
  </span>
</template>
