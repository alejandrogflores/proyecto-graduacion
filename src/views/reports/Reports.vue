<!-- src/views/reports/Reports.vue -->
<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { auth, colAttempts, db } from "@/services/firebase";
import { getDoc, doc, getDocs, query, where } from "firebase/firestore";

type Role = "teacher" | "student" | "unknown";
const loading = ref(true);
const role = ref<Role>("unknown");
const total = ref(0);
const corrects = ref(0);
const errorMsg = ref("");

const accuracy = computed(() => (total.value ? Math.round((corrects.value / total.value) * 100) : 0));

async function getRole(uid: string): Promise<Role> {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (snap.exists()) {
      const r = (snap.data() as any)?.role;
      return r === "teacher" || r === "student" ? r : "unknown";
    }
  } catch (e) { console.error("[Reports] getRole error:", e); }
  return "unknown";
}

async function load() {
  loading.value = true;
  errorMsg.value = "";

  const u = auth.currentUser;
  if (!u) { errorMsg.value = "No has iniciado sesión."; loading.value = false; return; }

  role.value = await getRole(u.uid);

  try {
    let snap = await getDocs(query(colAttempts, where("ownerUid", "==", u.uid)));
    let docs = snap.docs;
    if (docs.length === 0) {
      snap = await getDocs(query(colAttempts, where("userUid", "==", u.uid)));
      docs = snap.docs;
    }
    total.value = docs.length;
    corrects.value = docs.filter(d => (d.data() as any).isCorrect === true).length;
    if (docs.length === 0) errorMsg.value = "No hay intentos para el criterio seleccionado.";
  } catch (e: any) {
    console.error("[Reports] query error:", e);
    errorMsg.value = "No se pudo cargar el reporte. Revisa la consola por índices.";
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section class="text-center space-y-6">
    <h1 class="text-3xl font-bold">Reportes</h1>

    <div class="grid sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
      <div class="border rounded-xl p-4">
        <div class="text-slate-500 mb-1">Intentos</div>
        <div class="text-2xl font-semibold">{{ total }}</div>
      </div>
      <div class="border rounded-xl p-4">
        <div class="text-slate-500 mb-1">Correctos</div>
        <div class="text-2xl font-semibold">{{ corrects }}</div>
      </div>
      <div class="border rounded-xl p-4">
        <div class="text-slate-500 mb-1">Precisión</div>
        <div class="text-2xl font-semibold">{{ accuracy }}%</div>
      </div>
    </div>

    <p v-if="loading" class="text-slate-500">Cargando…</p>
    <p v-else-if="errorMsg" class="text-slate-500">{{ errorMsg }}</p>
  </section>
</template>





