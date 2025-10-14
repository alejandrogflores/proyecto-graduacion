<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { getDocs, query, where, orderBy, limit } from "firebase/firestore";
import { colProblems } from "@/services/firebase";
import { useProfileStore } from "@/stores/profile";

const open = defineModel<boolean>("open");
const props = defineProps<{ preselected?: string[] }>();
const emit = defineEmits<{ (e:"confirm", ids:string[], summaries:{id:string;title:string;difficulty?:string}[]): void }>();

const profile = useProfileStore();

type Row = { id:string; title:string; difficulty?:string; ownerUid?:string; visibility?:string };
const rows = ref<Row[]>([]);
const picked = ref<Set<string>>(new Set(props.preselected ?? []));
const search = ref("");
const difficulty = ref<"" | "easy" | "medium" | "hard">("");

const filtered = computed(() => {
  const s = search.value.toLowerCase().trim();
  return rows.value.filter(r => {
    const okS = !s || r.title.toLowerCase().includes(s);
    const okD = !difficulty.value || r.difficulty === difficulty.value;
    return okS && okD;
  });
});

async function load() {
  const conds:any[] = [];
  // si quieres, aquí podrías filtrar por ownerUid === profile.uid para mostrar solo los del profe
  // conds.push(where("ownerUid","==", profile.uid));

  const qs = await getDocs(query(colProblems, ...conds, orderBy("createdAt","desc"), limit(200)));
  rows.value = qs.docs.map(d => {
    const x:any = d.data();
    return {
      id: d.id,
      title: x.title ?? d.id,
      difficulty: x.difficulty ?? "medium",
      ownerUid: x.ownerUid,
      visibility: x.visibility ?? "private",
    };
  });
}

function toggle(id:string) {
  if (picked.value.has(id)) picked.value.delete(id); else picked.value.add(id);
}
function confirm() {
  const ids = Array.from(picked.value);
  const summaries = ids.map(id => {
    const r = rows.value.find(rr => rr.id === id)!;
    return { id: r.id, title: r.title, difficulty: r.difficulty };
  });
  emit("confirm", ids, summaries);
  open.value = false;
}
onMounted(load);
</script>

<template>
  <div v-if="open" class="fixed inset-0 bg-black/30 flex items-start justify-center p-6 z-50">
    <div class="bg-white rounded-2xl shadow-xl w-full max-w-3xl p-4">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-lg font-semibold">Seleccionar problemas</h3>
        <button class="px-2 py-1 text-sm" @click="open=false">Cerrar</button>
      </div>

      <div class="flex gap-2 mb-3">
        <input v-model="search" type="text" placeholder="Buscar por título…" class="border rounded px-3 py-2 w-full" />
        <select v-model="difficulty" class="border rounded px-3 py-2">
          <option value="">Todas</option>
          <option value="easy">Fácil</option>
          <option value="medium">Media</option>
          <option value="hard">Difícil</option>
        </select>
      </div>

      <div class="max-h-80 overflow-auto border rounded">
        <table class="w-full text-sm">
          <thead class="bg-gray-50">
            <tr>
              <th class="text-left p-2">Seleccionar</th>
              <th class="text-left p-2">Título</th>
              <th class="text-left p-2">Dificultad</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in filtered" :key="r.id" class="border-t">
              <td class="p-2">
                <input type="checkbox" :checked="picked.has(r.id)" @change="toggle(r.id)" />
              </td>
              <td class="p-2">{{ r.title }}</td>
              <td class="p-2">{{ r.difficulty }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="mt-4 flex items-center justify-between">
        <div class="text-sm text-gray-600">Seleccionados: {{ picked.size }}</div>
        <button class="px-4 py-2 rounded bg-black text-white" @click="confirm">Añadir ({{ picked.size }})</button>
      </div>
    </div>
  </div>
</template>
