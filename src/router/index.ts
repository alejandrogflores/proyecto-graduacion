// src/router/index.ts
import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/services/firebase";
import { useProfileStore } from "@/stores/profile";

// ===== Importes ESTÁTICOS =====
import Login from "@/views/Login.vue";
import Dashboard from "@/views/Dashboard.vue";
import ProblemsList from "@/views/problems/ProblemsList.vue";
import ProblemForm from "@/views/problems/ProblemForm.vue";
import SolveProblem from "@/views/solve/SolveProblem.vue";
import Reports from "@/views/reports/Reports.vue";
import AttemptsView from "@/views/AttemptsView.vue";
import AdminTools from "@/views/AdminTools.vue";
import { onlyAuth, onlyTeacher, onlyStaff, onlyAdmin } from "@/router/routeMeta";


const routes: RouteRecordRaw[] = [
  { path: "/login", name: "Login", component: Login, meta: { hideHeader: true } },

  { path: "/", name: "Dashboard", component: Dashboard, meta: onlyAuth() },

  { path: "/problems", name: "ProblemsList", component: ProblemsList, meta: onlyAuth() },

  { path: "/problems/new", name: "ProblemNew", component: ProblemForm, meta: onlyTeacher() },

  { path: "/problems/:id/solve", name: "ProblemSolve", component: SolveProblem, props: true, meta: onlyAuth() },

  { path: "/problems/:id", name: "ProblemEdit", component: ProblemForm, props: true, meta: onlyTeacher() },

  { path: "/reports", name: "Reports", component: Reports, meta: onlyAuth() },

  { path: "/teacher/:problemId?", name: "AttemptsView", component: AttemptsView, props: true, meta: onlyTeacher() },

  // Admin tools → solo teacher o admin
  { path: "/admin-tools", name: "admin-tools", component: AdminTools, meta: onlyStaff() },

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
  const requiresAuth = to.matched.some((r) => r.meta?.requiresAuth === true);
  const requiresTeacher = to.matched.some((r) => (r.meta as any)?.requiresTeacher === true);
  const rolesMeta = to.matched.find((r) => (r.meta as any)?.roles)?.meta?.roles as string[] | undefined;

  // Rutas públicas (sin auth ni roles)
  if (!requiresAuth && !requiresTeacher && !rolesMeta) return next();

  // Espera estado inicial de Firebase Auth
  await waitForAuthInit();

  // Si va a /login ya autenticado → Dashboard
  if (to.name === "Login" && auth.currentUser) {
    return next({ name: "Dashboard" });
  }

  // Si requiere auth y no hay usuario → Login
  if ((requiresAuth || requiresTeacher || rolesMeta) && !auth.currentUser) {
    return next({ name: "Login", query: { redirect: to.fullPath } });
  }

  // Asegura que el store tenga el role listo
  await waitForProfileReady();
  const profile = useProfileStore();
  const role = profile.role; // "student" | "teacher" | "admin" | null

  // Si hay restricción de roles explícitos (via onlyStaff / onlyAdmin)
  if (rolesMeta && (!role || !rolesMeta.includes(role))) {
    return next({ name: "Dashboard" });
  }

  // Si la ruta marcó requiresTeacher (teacher o admin)
  if (requiresTeacher && !(role === "teacher" || role === "admin")) {
    return next({ name: "Dashboard" });
  }

  next();
});

export default router;

