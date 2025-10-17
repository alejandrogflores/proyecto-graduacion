<!-- src/components/AppTopBar.vue -->
<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useProfileStore } from "@/stores/profile";

const router = useRouter();
const route = useRoute();
const profile = useProfileStore();
if (!profile.ready) profile.init?.();

const isReady = computed(() => profile.ready);
const role = computed(() => profile.role);
const isTeacher = computed(() => role.value === "teacher" || role.value === "admin");
const isStudent = computed(() => role.value === "student");

function go(name: string) {
  if (router.hasRoute(name)) router.push({ name });
}
function isActive(name: string) {
  return route.name === name;
}

const studentLinks = computed(() => ([
  { name: "Dashboard", label: "Dashboard" },
  { name: "ProblemsList", label: "Problemas" },
  { name: "MyAssignments", label: "Mis asignaciones" },
]));
const teacherLinks = computed(() => ([
  { name: "Dashboard", label: "Dashboard" },
  { name: "ProblemsList", label: "Problemas" },
  { name: "AssignmentNew", label: "Nueva asignación" },
  { name: "Reports", label: "Reportes" },
]));

// ===== Menú (Ayuda / Ajustes / Cerrar sesión)
const showMenu = ref(false);
const rootRef = ref<HTMLElement | null>(null);
function toggleMenu() { showMenu.value = !showMenu.value; }
function closeMenu() { showMenu.value = false; }

function onDocClick(e: MouseEvent) {
  const el = rootRef.value;
  if (!el) return;
  if (!el.contains(e.target as Node)) closeMenu();
}
onMounted(() => document.addEventListener("click", onDocClick));
onBeforeUnmount(() => document.removeEventListener("click", onDocClick));

function goIfRoute(name: string) {
  closeMenu();
  if (router.hasRoute(name)) router.push({ name });
}

async function logout() {
  try {
    await profile.logout?.();
  } finally {
    closeMenu();
    if (router.hasRoute("Login")) {
      router.push({ name: "Login" });
    } else {
      router.push({ name: "Dashboard" });
    }
  }
}
</script>

<template>
  <nav class="flex items-center gap-4 px-4 py-3 border-b bg-white sticky top-0 z-40" ref="rootRef">
    <!-- Marca -->
    <button class="font-semibold text-lg" @click="go('Dashboard')">EduApp</button>

    <!-- Enlaces rápidos -->
    <div v-if="isReady" class="flex items-center gap-1 overflow-x-auto no-scrollbar">
      <template v-if="isStudent">
        <button
          v-for="l in studentLinks"
          :key="l.name"
          class="px-3 py-1.5 rounded text-sm border"
          :class="isActive(l.name) ? 'bg-black text-white border-black' : 'bg-white hover:bg-gray-50'"
          @click="go(l.name)"
        >
          {{ l.label }}
        </button>
      </template>

      <template v-else-if="isTeacher">
        <button
          v-for="l in teacherLinks"
          :key="l.name"
          class="px-3 py-1.5 rounded text-sm border"
          :class="isActive(l.name) ? 'bg-black text-white border-black' : 'bg-white hover:bg-gray-50'"
          @click="go(l.name)"
        >
          {{ l.label }}
        </button>
      </template>
    </div>

    <div class="flex-1" />

    <!-- Chip de rol + email + menú -->
    <div v-if="isReady" class="relative flex items-center gap-2">
      <span class="text-xs px-2 py-0.5 rounded bg-gray-100">
        {{ role || '—' }}
      </span>
      <span class="text-xs text-gray-600">{{ profile.email }}</span>

      <!-- Trigger del menú -->
      <button
        class="ml-1 p-2 rounded border hover:bg-gray-50"
        aria-haspopup="menu"
        :aria-expanded="showMenu ? 'true' : 'false'"
        @click.stop="toggleMenu"
        title="Menú"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19.14 12.94a7.952 7.952 0 0 0 .06-.94c0-.32-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.2 7.2 0 0 0-1.63-.94l-.36-2.54A.5.5 0 0 0 13.88 1h-3.76a.5.5 0 0 0-.49.41l-.36 2.54c-.58.24-1.12.55-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.73 7.97a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.62-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.4.31.64.22l2.39-.96c.51.39 1.05.7 1.63.94l.36 2.54c.05.24.25.41.49.41h3.76c.24 0 .44-.17.49-.41l.36-2.54c.58-.24 1.12-.55 1.63-.94l2.39.96c.24.09.51 0 .64-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z"/>
        </svg>
      </button>

      <!-- Menú (hermano del trigger, no anidado dentro del botón) -->
      <div
        v-show="showMenu"
        class="absolute right-0 top-10 w-44 bg-white border rounded shadow-lg text-sm"
        role="menu"
      >
        <button class="w-full text-left px-3 py-2 hover:bg-gray-50" role="menuitem" @click="goIfRoute('Help')">
          Ayuda
        </button>
        <button class="w-full text-left px-3 py-2 hover:bg-gray-50" role="menuitem" @click="goIfRoute('Settings')">
          Ajustes
        </button>
        <div class="border-t my-1"></div>
        <button class="w-full text-left px-3 py-2 hover:bg-gray-50 text-red-600" role="menuitem" @click="logout">
          Cerrar sesión
        </button>
      </div>
    </div>
  </nav>
</template>

<style scoped>
.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
</style>







