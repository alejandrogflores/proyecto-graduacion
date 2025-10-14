<!-- src/components/RoleQuickLinks.vue -->
<script setup lang="ts">
import { onMounted, ref, computed } from "vue";
import { useRoute } from "vue-router";
import { storeToRefs } from "pinia";
import { useProfileStore } from "@/stores/profile";
import { db } from "@/services/firebase";
import { collection, getDocs, query, where, limit } from "firebase/firestore";

const route = useRoute();
const profile = useProfileStore();
const { uid, role } = storeToRefs(profile);

const isTeacher = computed(() => {
  const r = (role.value ?? "").toLowerCase();
  return r === "teacher" || r === "admin";
});
const isStudent = computed(() => (role.value ?? "").toLowerCase() === "student");

// classId preferido para navegar (ver abajo cómo lo resolvemos)
const classId = ref<string | null>(null);

// Resuelve un classId usable:
// 1) Si ya estamos en una ruta /classes/:id, úsalo.
// 2) Si el store recuerda un lastClassId, úsalo.
// 3) Sino, toma la primera clase que sea del teacher (ownerUid == uid).
onMounted(async () => {
  // 1) parámetro en la ruta actual
  if (typeof route.params.id === "string") {
    classId.value = route.params.id;
    return;
  }

  // 2) recordado en el store (si lo tienes; ver sección 2)
  // @ts-ignore - si aún no añadiste lastClassId al store, esto será undefined y no pasa nada
  if ((profile as any).lastClassId) {
    // @ts-ignore
    classId.value = (profile as any).lastClassId;
    return;
  }

  // 3) busca una clase propiedad del docente (primera que encuentre)
  if (uid.value && isTeacher.value) {
    const q = query(
      collection(db, "classes"),
      where("ownerUid", "==", uid.value),
      limit(1)
    );
    const snap = await getDocs(q);
    if (!snap.empty) classId.value = snap.docs[0].id;
  }
});
</script>

<template>
  <div class="flex items-center gap-2">
    <!-- Alumno -->
    <RouterLink
      v-if="isStudent"
      to="/assignments/my"
      class="px-3 py-1 border rounded hover:bg-gray-50"
    >
      Mis asignaciones
    </RouterLink>

    <!-- Docente/Admin -->
    <RouterLink
      v-if="isTeacher"
      to="/assignments/new"
      class="px-3 py-1 border rounded hover:bg-gray-50"
    >
      Nueva asignación
    </RouterLink>

    <RouterLink
      v-if="isTeacher && classId"
      :to="{ name: 'assignmentsByClass', params: { id: classId } }"
      class="px-3 py-1 border rounded hover:bg-gray-50"
    >
      Asignaciones de la clase
    </RouterLink>
    <!-- Si no hay classId aún (docente sin clases), simplemente no mostramos el botón -->
  </div>
</template>
