<script setup lang="ts">
import { computed } from "vue";
const props = defineProps<{ modelValue: any }>();
const emit = defineEmits<{ (e: "update:modelValue", v: any): void }>();

const value = computed({
  get: () => props.modelValue,
  set: (v) => emit("update:modelValue", v),
});

if (!value.value.spec) {
  value.value.spec = { mode: "exact", answers: [""], trim: true, caseSensitive: false, threshold: 1 };
}

function addAnswer() { value.value.spec.answers.push(""); }
function delAnswer(i: number) { value.value.spec.answers.splice(i, 1); }
</script>

<template>
  <div class="space-y-3">
    <div class="flex gap-2 items-center">
      <label class="font-medium w-32">Modo</label>
      <select class="border rounded px-2 py-1" v-model="value.spec.mode">
        <option value="exact">Exacto</option>
        <option value="regex">Regex</option>
        <option value="levenshtein">Levenshtein</option>
      </select>
    </div>

    <div class="flex gap-2 items-center" v-if="value.spec.mode!=='regex'">
      <label class="font-medium w-32">Mayúsc./min.</label>
      <input type="checkbox" v-model="value.spec.caseSensitive" />
      <label class="ml-4 font-medium">Trim</label>
      <input type="checkbox" v-model="value.spec.trim" />
    </div>

    <div class="flex gap-2 items-center" v-if="value.spec.mode==='levenshtein'">
      <label class="font-medium w-32">Tolerancia</label>
      <input type="number" class="border rounded px-2 py-1 w-24" v-model.number="value.spec.threshold" min="0" />
    </div>

    <div>
      <label class="font-medium block mb-1">Respuestas válidas</label>
      <div class="space-y-2">
        <div v-for="(ans,i) in value.spec.answers" :key="i" class="flex items-center gap-2">
          <input class="border rounded px-2 py-1 w-full" v-model="value.spec.answers[i]" placeholder="Texto o patrón" />
          <button type="button" class="border rounded px-2 py-1" @click="delAnswer(i)" :disabled="value.spec.answers.length===1">-</button>
        </div>
        <button type="button" class="border rounded px-2 py-1" @click="addAnswer">Agregar</button>
      </div>
    </div>
  </div>
</template>
