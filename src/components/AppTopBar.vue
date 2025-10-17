<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { useProfileStore } from "@/stores/profile";
import { auth } from "@/services/firebase";
import { signOut } from "firebase/auth";

const router = useRouter();
const profile = useProfileStore();

const isReady   = computed(() => profile.ready);
const role      = computed(() => profile.role);
const isTeacher = computed(() => role.value === "teacher" || role.value === "admin");
const isStudent = computed(() => role.value === "student");

const menuOpen   = ref(false);
const loggingOut = ref(false);

function toggleMenu() { menuOpen.value = !menuOpen.value; }
function closeMenu()  { menuOpen.value = false; }

// ⬇️ handler robusto para el botón del menú
async function logoutFromMenu() {
  try {
    loggingOut.value = true;
    // cierra el popover para evitar que se quede abierto en la navegación
    closeMenu();
    // cierra sesión en Firebase
    await signOut(auth);
    // resetea el store si tienes $reset
    (profile as any).$reset?.();
    // navega a tu pantalla pública (ajústala a tu ruta)
    await router.replace({ name: "Landing" }); // o router.replace("/")
  } finally {
    loggingOut.value = false;
    // cinturón y tirantes: limpia watchers que pudieron seguir disparando
    setTimeout(() => location.reload(), 0);
  }
}
</script>

<template>
  <nav class="flex items-center gap-4 px-4 py-3 border-b bg-white">
    <button class="font-semibold" @click="$router.push({name:'Dashboard'})">EduApp</button>

    <!-- … tus enlaces … -->

    <div class="ml-auto flex items-center gap-2" v-if="isReady">
      <span class="text-xs px-2 py-0.5 rounded bg-gray-100">{{ role }}</span>
      <span class="text-sm text-gray-600">{{ profile.email || "" }}</span>

      <!-- Botón del engrane -->
      <div class="relative">
        <button class="px-2 py-1 rounded border hover:bg-gray-50" @click="toggleMenu" title="Menú">
          ⚙️
        </button>

        <!-- Menu -->
        <div v-if="menuOpen" class="absolute right-0 mt-2 w-48 rounded-lg border bg-white shadow-lg z-10">
          <button class="w-full text-left px-3 py-2 hover:bg-gray-50" @click.stop="$router.push({ name: 'Dashboard' })">
            Ajustes
          </button>
          <button class="w-full text-left px-3 py-2 hover:bg-gray-50" @click.stop="$router.push({ name: 'Dashboard' })">
            Mi perfil
          </button>
          <div class="my-1 h-px bg-gray-100"></div>
          <button
            class="w-full text-left px-3 py-2 text-red-600 hover:bg-red-50 disabled:opacity-50"
            :disabled="loggingOut"
            @click.stop="logoutFromMenu"
          >
            {{ loggingOut ? "Cerrando…" : "Cerrar sesión" }}
          </button>
        </div>
      </div>
    </div>
  </nav>
</template>




