<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from "vue";

const props = withDefaults(defineProps<{
  seconds?: number;   // cuenta atrás en segundos
  until?: number;     // timestamp absoluto en ms (opcional)
  tickMs?: number;    // frecuencia de actualización
}>(), { tickMs: 250 });

const emit = defineEmits<{ (e: "finished"): void }>();

const now = () => Date.now();
const endAt = computed(() => props.until ?? (now() + (props.seconds ?? 0) * 1000));
const remainingMs = ref(Math.max(0, endAt.value - now()));
let t: number | undefined;

function tick() {
  remainingMs.value = Math.max(0, endAt.value - now());
  if (remainingMs.value <= 0) {
    if (t) { clearInterval(t); t = undefined; }
    emit("finished");
  }
}
onMounted(() => { tick(); t = window.setInterval(tick, props.tickMs); });
onUnmounted(() => { if (t) clearInterval(t); });

function pad(n: number) { return n < 10 ? `0${n}` : `${n}`; }
const mmss = computed(() => {
  const total = Math.ceil(remainingMs.value / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${pad(m)}:${pad(s)}`;
});
</script>

<template>
  <span>{{ mmss }}</span>
</template>

<style scoped>
span { font-variant-numeric: tabular-nums; }
</style>
