// src/router/index.ts
import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/services/firebase";
import { useProfileStore } from "@/stores/profile";

// ===== Importes ESTÁTICOS (sin lazy imports) =====
import Login from "@/views/Login.vue";
import Dashboard from "@/views/Dashboard.vue";
import ProblemsList from "@/views/problems/ProblemsList.vue";
import ProblemForm from "@/views/problems/ProblemForm.vue";
import SolveProblem from "@/views/solve/SolveProblem.vue";
import Reports from "@/views/reports/Reports.vue";
import AttemptsView from "@/views/AttemptsView.vue";
import AdminTools from "@/views/AdminTools.vue"; // si no existe, comenta esta línea y la ruta

const routes: RouteRecordRaw[] = [
  { path: "/login", name: "Login", component: Login, meta: { hideHeader: true } },

  { path: "/", name: "Dashboard", component: Dashboard, meta: { requiresAuth: true } },

  { path: "/problems", name: "ProblemsList", component: ProblemsList, meta: { requiresAuth: true } },

  { path: "/problems/new", name: "ProblemNew", component: ProblemForm, meta: { requiresAuth: true, requiresTeacher: true } },

  { path: "/problems/:id/solve", name: "ProblemSolve", component: SolveProblem, props: true, meta: { requiresAuth: true } },

  { path: "/problems/:id", name: "ProblemEdit", component: ProblemForm, props: true, meta: { requiresAuth: true, requiresTeacher: true } },

  { path: "/reports", name: "Reports", component: Reports, meta: { requiresAuth: true } },

  { path: "/teacher/:problemId?", name: "AttemptsView", component: AttemptsView, props: true, meta: { requiresAuth: true, requiresTeacher: true } },
  { path: "/attempts/:problemId?", redirect: (to) => (to.params.problemId ? `/teacher/${to.params.problemId}` : "/teacher") },
  { path: "/reports/teacher/:problemId?", redirect: (to) => (to.params.problemId ? `/teacher/${to.params.problemId}` : "/teacher") },

  // SOLO admin (comenta esta ruta si no tienes la vista todavía)
  { path: "/admin-tools", name: "AdminTools", component: AdminTools, meta: { requiresAuth: true, requiresAdmin: true } },

  { path: "/:pathMatch(.*)*", redirect: "/" },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});

// ===== Helpers =====
function waitForAuthInit(): Promise<void> {
  return new Promise<void>((resolve) => {
    const off = onAuthStateChanged(auth, () => {
      off();
      resolve();
    });
  });
}

// Espera a que el store termine de cargar (profile.ready === true).
// Tiene un límite de ~2s para no colgar la navegación si algo falla.
async function waitForProfileReady(): Promise<void> {
  const profile = useProfileStore();
  if (!profile.ready) {
    try { profile.init(); } catch {}
  }
  if (profile.ready) return;

  await new Promise<void>((resolve) => {
    let elapsed = 0;
    const iv = setInterval(() => {
      if (profile.ready || elapsed >= 2000) {
        clearInterval(iv);
        resolve();
      }
      elapsed += 50;
    }, 50);
  });
}

// ===== Guard principal =====
router.beforeEach(async (to, _from, next) => {
  const requiresAuth = to.matched.some((r) => r.meta?.requiresAuth);
  const requiresTeacher = to.matched.some((r) => (r.meta as any)?.requiresTeacher);
  const requiresAdmin = to.matched.some((r) => (r.meta as any)?.requiresAdmin);

  // Rutas públicas: seguir
  if (!requiresAuth && !requiresTeacher && !requiresAdmin) return next();

  // Espera a que Firebase emita el estado inicial de auth
  await waitForAuthInit();

  // Si va a /login estando autenticado, redirigir al dashboard
  if (to.name === "Login" && auth.currentUser) return next({ name: "Dashboard" });

  // Si requiere auth y no hay usuario: forzar login
  if (!auth.currentUser) return next({ name: "Login", query: { redirect: to.fullPath } });

  // Carga/espera el perfil (lee role desde /users/{uid} si no hay claim)
  await waitForProfileReady();
  const profile = useProfileStore();
  const role = profile.role; // "teacher" | "admin" | "student" | null

  // Rutas solo admin
  if (requiresAdmin && role !== "admin") {
    return next({ name: "Dashboard" });
  }

  // Rutas solo teacher/admin
  if (requiresTeacher && !(role === "teacher" || role === "admin")) {
    return next({ name: "Dashboard" });
  }

  next();
});

export default router;
