<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useRouter, useRoute } from "vue-router";
import { addDoc, setDoc, getDoc, updateDoc, deleteField } from "firebase/firestore";
import { assignmentDoc, colAssignments, auth } from "@/services/firebase";
// import { useProfileStore } from "@/stores/profile"; // ← no se usa aquí

// ====== estado base del form ======
const route = useRoute();
const router = useRouter();
const isEdit = computed(() => Boolean(route.params.id));
const assignmentId = route.params.id as string | undefined;

const title = ref("");
const problemIdsText = ref(""); // texto JSON o lista por comas

// Selector de tiempo límite (en MINUTOS); null = Sin límite
const timeLimitMinutes = ref<null | number>(null);
const timeOptions = [
  { label: "Sin límite", value: null },
  { label: "5 minutos", value: 5 },
  { label: "10 minutos", value: 10 },
  { label: "15 minutos", value: 15 },
  { label: "30 minutos", value: 30 },
];

const loading = ref(false);
const saving  = ref(false);
const errorMsg = ref("");

onMounted(async () => {
  if (!isEdit.value) return;

  loading.value = true;
  try {
    const snap = await getDoc(assignmentDoc(assignmentId!));
    if (snap.exists()) {
      const data = snap.data() as any;
      title.value = data.title ?? "";
      problemIdsText.value = JSON.stringify(data.problemIds ?? []);

      if (typeof data.timeLimitSec === "number") {
        timeLimitMinutes.value = Math.round(data.timeLimitSec / 60);
      } else {
        timeLimitMinutes.value = null; // Sin límite
      }
    }
  } catch (e: any) {
    errorMsg.value = e?.message ?? String(e);
  } finally {
    loading.value = false;
  }
});

function parseProblemIds(text: string): string[] {
  try {
    return text ? JSON.parse(text) : [];
  } catch {
    // fallback: coma separada
    return text
      .split(",")
      .map(s => s.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }
}

async function save() {
  try {
    saving.value = true;

    const parsedIds = parseProblemIds(problemIdsText.value);

    // Construye el payload base (incluye problemIds)
    const payload: Record<string, any> = {
      title: title.value,
      problemIds: parsedIds,
      ownerUid: auth.currentUser?.uid,
    };

    // timeLimitSec solo si NO es "Sin límite"
    if (timeLimitMinutes.value != null) {
      payload.timeLimitSec = timeLimitMinutes.value * 60; // minutos → segundos
    }

    if (isEdit.value) {
      // Guardar cambios (merge true)
      await setDoc(assignmentDoc(assignmentId!), payload, { merge: true });

      // Si el usuario eligió "Sin límite", elimina el campo si existía
      if (timeLimitMinutes.value == null) {
        await updateDoc(assignmentDoc(assignmentId!), { timeLimitSec: deleteField() });
      }
    } else {
      // Crear: no incluyas timeLimitSec si es null (ya no está en payload)
      await addDoc(colAssignments, payload);
    }

    router.push({ name: "MyAssignments" });
  } catch (e: any) {
    errorMsg.value = e?.message ?? String(e);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="max-w-2xl mx-auto space-y-6">
    <h1 class="text-2xl font-semibold">
      {{ isEdit ? "Editar asignación" : "Nueva asignación" }}
    </h1>

    <div class="space-y-4">
      <!-- Título -->
      <label class="block">
        <span class="text-sm font-medium">Título</span>
        <input
          v-model="title"
          class="mt-1 w-full border rounded px-3 py-2"
          type="text"
          placeholder="Ej. Asignación de práctica 1"
        />
      </label>

      <!-- Problemas -->
      <label class="block">
        <span class="text-sm font-medium">Problemas (IDs en JSON o separados por coma)</span>
        <textarea
          v-model="problemIdsText"
          class="mt-1 w-full border rounded px-3 py-2"
          rows="3"
          placeholder='["probId1","probId2"]  o  probId1, probId2'
        ></textarea>
      </label>

      <!-- Selector de Límite de Tiempo -->
      <label class="block">
        <span class="text-sm font-medium">Tiempo límite</span>
        <select
          v-model="timeLimitMinutes"
          class="mt-1 w-full border rounded px-3 py-2 bg-white"
        >
          <option
            v-for="opt in timeOptions"
            :key="String(opt.value)"
            :value="opt.value"
          >
            {{ opt.label }}
          </option>
        </select>
        <p class="text-xs text-gray-500 mt-1">
          Si eliges “Sin límite”, no se guardará el campo <code>timeLimitSec</code>.
        </p>
      </label>
    </div>

    <div class="flex items-center gap-3">
      <button
        class="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
        :disabled="saving || loading"
        @click="save"
      >
        {{ saving ? "Guardando..." : "Guardar" }}
      </button>
      <span v-if="errorMsg" class="text-red-600 text-sm">{{ errorMsg }}</span>
    </div>
  </div>
</template>

