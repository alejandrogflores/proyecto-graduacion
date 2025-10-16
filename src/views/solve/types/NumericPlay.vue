<script setup lang="ts">
import type { Problem } from "@/models/problem";
import type { UserAnswer } from "@/models/answer";
import { computed } from "vue";

const props = defineProps<{ problem: Problem; modelValue?: UserAnswer | null }>();
const emit = defineEmits<{ (e:"update:modelValue", v:UserAnswer):void }>();

const ans = computed<UserAnswer>({
  get: () => props.modelValue ?? { type:"numeric", value: 0 },
  set: (v) => emit("update:modelValue", v),
});

function onInput(e: Event) {
  const v = Number((e.target as HTMLInputElement).value);
  ans.value = { type:"numeric", value: Number.isFinite(v) ? v : 0 };
}
</script>

<template>
  <input type="number" class="border rounded px-2 py-1 w-40"
         :value="(ans as any).value" @input="onInput" />
</template>
