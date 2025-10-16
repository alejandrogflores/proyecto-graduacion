<script setup lang="ts">
import type { Problem } from "@/models/problem";
import type { UserAnswer } from "@/models/answer";
import { computed } from "vue";

const props = defineProps<{ problem: Problem; modelValue?: UserAnswer | null }>();
const emit = defineEmits<{ (e:"update:modelValue", v:UserAnswer):void }>();

const ans = computed<UserAnswer>({
  get: () => props.modelValue ?? { type:"true_false", value: true },
  set: (v) => emit("update:modelValue", v),
});
</script>

<template>
  <div class="flex gap-4">
    <label class="flex items-center gap-2">
      <input type="radio" name="tf" :checked="(ans as any).value===true"
             @change="ans = { type:'true_false', value: true }" />
      Verdadero
    </label>
    <label class="flex items-center gap-2">
      <input type="radio" name="tf" :checked="(ans as any).value===false"
             @change="ans = { type:'true_false', value: false }" />
      Falso
    </label>
  </div>
</template>
