<script setup lang="ts">
import { ref } from "vue";
import { getDocs, updateDoc } from "firebase/firestore";
import { colProblems } from "@/services/firebase";
import { auth } from "@/services/firebase";

const running = ref(false);
const result = ref<string | null>(null);

async function backfillCreatedBy() {
  result.value = null;
  if (!auth.currentUser) { result.value = "Inicia sesión."; return; }

  // Opcional: valida que sea admin en tu UI (las reglas también deben proteger)
  // Aquí asumimos que solo admin puede llegar a esta vista.
  running.value = true;
  try {
    const snap = await getDocs(colProblems);
    let fixed = 0;
    for (const d of snap.docs) {
      const data = d.data() as any;
      if (!("createdBy" in data) || !data.createdBy) {
        await updateDoc(d.ref, { createdBy: auth.currentUser.uid });
        fixed++;
      }
    }
    result.value = `Backfill listo. Documentos actualizados: ${fixed}`;
  } catch (e: any) {
    console.error(e);
    result.value = e?.message ?? "Error durante el backfill.";
  } finally {
    running.value = false;
  }
}
</script>

<template>
  <section class="max-w-xl mx-auto p-4 space-y-3">
    <h1 class="text-2xl font-semibold">Herramientas de Admin</h1>
    <p class="text-sm text-gray-600">
      Esta utilidad completa el campo <code>createdBy</code> en problemas antiguos.
    </p>
    <button
      class="px-3 py-2 rounded bg-blue-600 text-white disabled:opacity-60"
      :disabled="running"
      @click="backfillCreatedBy"
    >
      {{ running ? "Ejecutando..." : "Backfill createdBy" }}
    </button>

    <p v-if="result" class="text-sm mt-2">{{ result }}</p>
  </section>
</template>
