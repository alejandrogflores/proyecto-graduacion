<script setup lang="ts">
import type { Problem } from "@/models/problem";
import type { UserAnswer } from "@/models/answer";
import { computed } from "vue";

const props = defineProps<{ problem: Problem; modelValue?: UserAnswer | null }>();
const emit = defineEmits<{ (e:"update:modelValue", v:UserAnswer):void }>();

const ans = computed<UserAnswer>({
  get: () => props.modelValue ?? { type:"short_text", value: "" },
  set: (v) => emit("update:modelValue", v),
});
</script>

<template>
  <input
    class="border rounded px-2 py-1 w-full"
    :placeholder="props.problem?.type==='short_text' && props.problem.spec.mode==='regex' ? 'Se evalúa con regex' : 'Escribe tu respuesta'"
    :value="(ans as any).value"
    @input="ans = { type:'short_text', value: ($event.target as HTMLInputElement).value }"
  />
</template>
