<script setup lang="ts">
import { computed } from "vue";
const props = defineProps<{ modelValue: any }>();
const emit = defineEmits<{ (e: "update:modelValue", v: any): void }>();

const value = computed({
  get: () => props.modelValue,
  set: (v) => emit("update:modelValue", v),
});
if (!value.value.answer) value.value.answer = { correct: true };
</script>

<template>
  <div class="space-y-2">
    <label class="font-medium">Respuesta correcta</label>
    <select class="border rounded px-2 py-1" v-model="value.answer.correct">
      <option :value="true">Verdadero</option>
      <option :value="false">Falso</option>
    </select>
  </div>
</template>
