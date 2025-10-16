<script setup lang="ts">
import { computed } from "vue";
const props = defineProps<{ modelValue: any }>();
const emit = defineEmits<{ (e: "update:modelValue", v: any): void }>();

const value = computed({
  get: () => props.modelValue,
  set: (v) => emit("update:modelValue", v),
});

if (!value.value.spec) {
  value.value.spec = { mode: "value", value: 0, tolerance: 0, precision: 2 };
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex gap-2 items-center">
      <label class="font-medium w-32">Modo</label>
      <select class="border rounded px-2 py-1" v-model="value.spec.mode">
        <option value="value">Valor</option>
        <option value="range">Rango</option>
        <option value="tolerance">Tolerancia</option>
      </select>
    </div>

    <div v-if="value.spec.mode==='value' || value.spec.mode==='tolerance'" class="flex gap-2 items-center">
      <label class="font-medium w-32">Valor</label>
      <input type="number" class="border rounded px-2 py-1 w-40" v-model.number="value.spec.value" />
    </div>

    <div v-if="value.spec.mode==='range'" class="flex gap-2 items-center">
      <label class="font-medium w-32">Mín</label>
      <input type="number" class="border rounded px-2 py-1 w-40" v-model.number="value.spec.min" />
      <label class="font-medium">Máx</label>
      <input type="number" class="border rounded px-2 py-1 w-40" v-model.number="value.spec.max" />
    </div>

    <div v-if="value.spec.mode==='value' || value.spec.mode==='tolerance'" class="flex gap-2 items-center">
      <label class="font-medium w-32">Tolerancia ±</label>
      <input type="number" class="border rounded px-2 py-1 w-40" v-model.number="value.spec.tolerance" min="0" />
    </div>

    <div class="flex gap-2 items-center">
      <label class="font-medium w-32">Precisión</label>
      <input type="number" class="border rounded px-2 py-1 w-24" v-model.number="value.spec.precision" min="0" />
    </div>
  </div>
</template>
