<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useProfileStore } from "@/stores/profile";
import { storeToRefs } from "pinia";

const router = useRouter();
const profile = useProfileStore();
if (!profile.ready) profile.init?.();

const { ready, role, email } = storeToRefs(profile);
const isTeacher = computed(() => role.value === "teacher" || role.value === "admin");
const isStudent = computed(() => role.value === "student");

function goProblems()       { router.push({ name: "ProblemsList" }); }
function goNewAssignment()  { router.push({ name: "AssignmentNew" }); }
function goReports()        { router.push({ name: "Reports" }); }
function goMyAssignments()  { router.push({ name: "MyAssignments" }); }

const greeting = computed(() => {
  const h = new Date().getHours();
  if (h < 12) return "¡Buenos días!";
  if (h < 19) return "¡Buenas tardes!";
  return "¡Buenas noches!";
});
</script>

<template>
  <section class="mx-auto max-w-7xl px-4 py-6">
    <!-- ===== HERO ===== -->
    <div
      class="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 p-[1px] shadow-lg"
    >
      <div
        class="rounded-2xl bg-white/90 dark:bg-white/95 p-6 md:p-8 backdrop-blur"
      >
        <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div class="max-w-2xl">
            <p class="text-sm text-gray-600">{{ greeting }}</p>
            <h1 class="mt-1 text-2xl font-bold tracking-tight text-gray-900 md:text-3xl">
              Bienvenido a <span class="text-indigo-600">EduApp</span>
            </h1>
            <p class="mt-2 text-gray-600">
              {{ isTeacher ? 'Desde aquí puedes crear problemas, gestionar asignaciones y ver reportes.' :
                              'Desde aquí puedes practicar con problemas y ver tus tareas publicadas.' }}
            </p>
            <p class="mt-1 text-xs text-gray-500" v-if="ready && email">Sesión: {{ email }}</p>
          </div>

          <!-- Quick actions by role -->
          <div class="flex flex-wrap gap-2">
            <button
              v-if="isTeacher"
              class="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-white shadow hover:bg-indigo-700 transition"
              @click="goNewAssignment"
            >
              <span class="i">🧩</span> Nueva asignación
            </button>

            <button
              class="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-gray-800 hover:bg-gray-50 transition"
              @click="goProblems"
            >
              <span class="i">📚</span> Problemas
            </button>

            <button
              v-if="isTeacher"
              class="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-gray-800 hover:bg-gray-50 transition"
              @click="goReports"
            >
              <span class="i">📈</span> Reportes
            </button>

            <button
              v-if="isStudent"
              class="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-gray-800 hover:bg-gray-50 transition"
              @click="goMyAssignments"
            >
              <span class="i">🗂️</span> Mis asignaciones
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== GRID CARDS ===== -->
    <div class="mt-8 grid gap-6 md:grid-cols-2">
      <!-- ===== Card: Problemas (compartida) ===== -->
      <div
        class="group rounded-2xl border p-6 shadow-sm transition hover:shadow-md"
      >
        <div class="flex items-start gap-4">
          <div
            class="rounded-xl bg-blue-50 p-3 text-2xl leading-none ring-1 ring-blue-100"
            aria-hidden="true"
          >
            📚
          </div>
          <div class="flex-1">
            <h3 class="text-lg font-semibold text-gray-900">Problemas</h3>
            <p class="mt-1 text-sm text-gray-600">
              Explora el banco de problemas {{ isTeacher ? 'para crear o editar' : 'para practicar y mejorar' }}.
            </p>
            <div class="mt-4">
              <button
                class="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition"
                @click="goProblems"
              >
                Abrir problemas
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- ===== Card: Reportes (solo teacher) ===== -->
      <div
        v-if="isTeacher"
        class="group rounded-2xl border p-6 shadow-sm transition hover:shadow-md"
      >
        <div class="flex items-start gap-4">
          <div
            class="rounded-xl bg-emerald-50 p-3 text-2xl leading-none ring-1 ring-emerald-100"
            aria-hidden="true"
          >
            📈
          </div>
          <div class="flex-1">
            <h3 class="text-lg font-semibold text-gray-900">Reportes</h3>
            <p class="mt-1 text-sm text-gray-600">
              Revisa intentos, promedios, tiempos y exporta CSV por asignación.
            </p>
            <div class="mt-4">
              <button
                class="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 transition"
                @click="goReports"
              >
                Ir a reportes
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- ===== Card: Nueva asignación (solo teacher) ===== -->
      <div
        v-if="isTeacher"
        class="group rounded-2xl border p-6 shadow-sm transition hover:shadow-md"
      >
        <div class="flex items-start gap-4">
          <div
            class="rounded-xl bg-indigo-50 p-3 text-2xl leading-none ring-1 ring-indigo-100"
            aria-hidden="true"
          >
            🧩
          </div>
          <div class="flex-1">
            <h3 class="text-lg font-semibold text-gray-900">Nueva asignación</h3>
            <p class="mt-1 text-sm text-gray-600">
              Publica una tarea con problemas seleccionados y comparte el enlace con tu clase.
            </p>
            <div class="mt-4">
              <button
                class="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 transition"
                @click="goNewAssignment"
              >
                Crear asignación
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- ===== Card: Mis asignaciones (solo student) ===== -->
      <div
        v-if="isStudent"
        class="group rounded-2xl border p-6 shadow-sm transition hover:shadow-md"
      >
        <div class="flex items-start gap-4">
          <div
            class="rounded-xl bg-amber-50 p-3 text-2xl leading-none ring-1 ring-amber-100"
            aria-hidden="true"
          >
            🗂️
          </div>
          <div class="flex-1">
            <h3 class="text-lg font-semibold text-gray-900">Mis asignaciones</h3>
            <p class="mt-1 text-sm text-gray-600">
              Accede a tus tareas publicadas, completa los problemas y monitorea tu progreso.
            </p>
            <div class="mt-4">
              <button
                class="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 transition"
                @click="goMyAssignments"
              >
                Ver mis asignaciones
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== Helpful tip for students ===== -->
    <div
      v-if="isStudent"
      class="mt-8 rounded-xl border bg-gray-50 p-4 text-sm text-gray-700"
    >
      💡 <span class="font-medium">Consejo:</span> Practica desde el banco de problemas para
      llegar preparado a tus asignaciones. Si te equivocas, vuelve a intentar con calma.
    </div>
  </section>
</template>

