// src/router/index.ts
import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/services/firebase";
import { useProfileStore } from "@/stores/profile";

import Login from "@/views/Login.vue";
// Dashboard en lazy-load (nuevo path /dashboard)
const Dashboard = () => import("@/views/Dashboard.vue");

import ProblemsList from "@/views/problems/ProblemsList.vue";
import ProblemForm from "@/views/problems/ProblemForm.vue";
import SolveProblem from "@/views/solve/SolveProblem.vue";
import Reports from "@/views/reports/Reports.vue";
import AttemptsView from "@/views/AttemptsView.vue";
import AdminTools from "@/views/AdminTools.vue";
import { onlyAuth, onlyTeacher, onlyStaff } from "@/router/routeMeta";

// 👇 nuevo guard de reintentos
import { onlyNotFinished } from "@/router/guards/onlyNotFinished";

const LS_KEY = "postLoginRedirect";

const routes: RouteRecordRaw[] = [
  { path: "/login", name: "Login", component: Login, meta: { hideHeader: true } },

  // ⬇ raíz redirige al dashboard real
  { path: "/", redirect: { name: "Dashboard" } },
  { path: "/dashboard", name: "Dashboard", component: Dashboard, meta: onlyAuth() },

  { path: "/problems", name: "ProblemsList", component: ProblemsList, meta: onlyAuth() },
  { path: "/problems/new", name: "ProblemNew", component: ProblemForm, meta: onlyTeacher() },
  { path: "/problems/:id/solve", name: "ProblemSolve", component: SolveProblem, props: true, meta: onlyAuth() },
  { path: "/problems/:id", name: "ProblemEdit", component: ProblemForm, props: true, meta: onlyTeacher() },

  { path: "/reports", name: "Reports", component: Reports, meta: onlyTeacher() },
  { path: "/teacher/:problemId?", name: "AttemptsView", component: AttemptsView, props: true, meta: onlyTeacher() },
  { path: "/admin-tools", name: "admin-tools", component: AdminTools, meta: onlyStaff() },

  { path: "/classes", name: "classes", component: () => import("@/views/classes/ClassesList.vue"), meta: onlyAuth() },
  { path: "/classes/:id/assignments", name: "assignmentsByClass", component: () => import("@/views/assignments/AssignmentsByClass.vue"), meta: onlyAuth() },

  { path: "/assignments/my", name: "MyAssignments", component: () => import("@/views/assignments/MyAssignments.vue"), meta: onlyAuth() },

  {
    path: "/assignments/:id/solve",
    name: "SolveAssignment",
    component: () => import("@/views/assignments/SolveAssignment.vue"),
    beforeEnter: [onlyNotFinished],
    meta: onlyAuth(),
  },

  {
    path: "/assignments/:id/result",
    name: "AssignmentResult",
    component: () => import("@/views/assignments/AssignmentResult.vue"),
  },
  
  {
    path: "/assignments/new",
    name: "AssignmentNew",
    component: () => import("@/views/assignments/AssignmentNew.vue"),
    meta: onlyTeacher(),
  },

  { path: "/attempts/my", name: "MyAttemptsHistory", component: () => import("@/views/assignments/AttemptHistory.vue"), meta: onlyAuth() },

  // ⬇️ Debe ir al final
  { path: "/:pathMatch(.*)*", redirect: { name: "Dashboard" } },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});

// ==== Helpers
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
    try {
      profile.init();
    } catch {}
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

function consumePostLoginRedirect(currentPath: string): string | null {
  const stored = localStorage.getItem(LS_KEY);
  if (!stored) return null;
  if (stored !== currentPath) {
    localStorage.removeItem(LS_KEY);
    return stored;
  }
  localStorage.removeItem(LS_KEY);
  return null;
}

// ==== Global Guard
router.beforeEach(async (to, _from, next) => {
  const requiresAuth = to.matched.some((r) => r.meta?.requiresAuth === true);
  const requiresTeacher = to.matched.some((r) => (r.meta as any)?.requiresTeacher === true);
  const rolesMeta = to.matched.find((r) => (r.meta as any)?.roles)?.meta?.roles as string[] | undefined;

  // Rutas públicas
  if (!requiresAuth && !requiresTeacher && !rolesMeta) {
    if (to.name === "Login" && auth.currentUser) {
      const fromLS = consumePostLoginRedirect(to.fullPath);
      if (fromLS) return next(fromLS);
      const q = (to.query?.redirect as string) || { name: "Dashboard" };
      return next(q);
    }
    return next();
  }

  // Espera Auth
  await waitForAuthInit();

  // Si hay user y redirect pendiente, aplícalo
  if (auth.currentUser) {
    const fromLS = consumePostLoginRedirect(to.fullPath);
    if (fromLS) return next(fromLS);
  }

  // Requiere auth
  if ((requiresAuth || requiresTeacher || rolesMeta) && !auth.currentUser) {
    return next({ name: "Login", query: { redirect: to.fullPath } });
  }

  // Si voy a /login estando logueado, respeta ?redirect
  if (to.name === "Login" && auth.currentUser) {
    const q = (to.query?.redirect as string) || { name: "Dashboard" };
    return next(q);
  }

  // Roles
  await waitForProfileReady();
  const profile = useProfileStore();
  const role = profile.role;

  if (rolesMeta && (!role || !rolesMeta.includes(role))) {
    return next({ name: "Dashboard" });
  }
  if (requiresTeacher && !(role === "teacher" || role === "admin")) {
    return next({ name: "Dashboard" });
  }

  next();
});

export default router;
