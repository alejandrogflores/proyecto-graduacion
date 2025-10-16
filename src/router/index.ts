// src/router/index.ts
import { createRouter, createWebHistory, RouteRecordRaw } from "vue-router";
import { useProfileStore } from "@/stores/profile";

// Base
import Dashboard from "@/views/Dashboard.vue";
import Login from "@/views/Login.vue";

// Problemas
import ProblemsList from "@/views/problems/ProblemsList.vue";
import ProblemForm from "@/views/problems/ProblemForm.vue";
import ProblemSolve from "@/views/solve/SolveProblem.vue";

// Asignaciones
import AssignmentForm from "@/views/assignments/AssignmentForm.vue";
import AssignmentsByClass from "@/views/assignments/AssignmentsByClass.vue";
import MyAssignments from "@/views/assignments/MyAssignments.vue";
import SolveAssignment from "@/views/assignments/SolveAssignment.vue";

// Reportes (usa el que sí existe en tu árbol)
import Reports from "@/views/reports/Reports.vue";

const routes: RouteRecordRaw[] = [
  { path: "/", redirect: "/dashboard" },
  { path: "/login", name: "Login", component: Login, meta: { hideHeader: true } },

  { path: "/dashboard", name: "Dashboard", component: Dashboard },

  // ✅ Problemas
  { path: "/problems", name: "ProblemsList", component: ProblemsList },
  { path: "/problems/new", name: "ProblemNew", component: ProblemForm },
  { path: "/problems/:id/edit", name: "ProblemEdit", component: ProblemForm, props: true },
  { path: "/problems/:id", name: "ProblemSolve", component: ProblemSolve, props: true },

  // ✅ Asignaciones (alumno/teacher)
  {
    path: "/assignments/:id/play", name: "AssignmentPlay", component: () => import("@/views/assignments/AssignmentPlay.vue"), meta: { requiresAuth: true }, },
  { path: "/assignments/new", name: "AssignmentNew", component: AssignmentForm, meta: { requiresAuth: true } },
  { path: "/classes/:id/assignments", name: "AssignmentsByClass", component: AssignmentsByClass, props: true, meta: { requiresAuth: true }, },
  { path: "/assignments/my", name: "MyAssignments", component: MyAssignments, meta: { requiresAuth: true } },
  { path: "/assignments/:id/solve", name: "SolveAssignment", component: SolveAssignment, props: true, meta: { requiresAuth: true } },
  { path: "/assignments/:id/report", name: "AssignmentReport", component: () => import("@/views/reports/AssignmentReport.vue"), meta: { requiresAuth: true, teacherOnly: true }, props: true, },
  // ✅ Reportes (solo docentes) → usa Reports.vue (existe en tu proyecto)
  { path: "/reports", name: "Reports", component: Reports, meta: { requiresAuth: true, teacherOnly: true } },

  // Intentos y detalle
  {
    path: "/attempts",
    name: "TeacherAttempts",
    component: () => import("@/views/reports/AttemptsList.vue"),
    meta: { requiresAuth: true, teacherOnly: true },
  },
  {
    path: "/attempts/:id",
    name: "AttemptDetail",
    component: () => import("@/views/reports/AttemptDetail.vue"),
    meta: { requiresAuth: true, teacherOnly: true },
    props: true,
  },

  // Reporte por asignación (si lo usas)
  {
    path: "/assignments/:id/report",
    name: "AssignmentReport",
    component: () => import("@/views/reports/AssignmentReport.vue"),
    meta: { requiresAuth: true, teacherOnly: true },
    props: true,
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// Guard recomendado (preserva query/hash; redirige a login con redirect)
router.beforeEach(async (to) => {
  if (to.name === "Login") return true;

  const profile = useProfileStore();

  if (!profile.ready) {
    await profile.init?.();
  }

  if (!profile.uid) {
    return { name: "Login", query: { redirect: to.fullPath } };
  }

  const role = profile.role;
  if (to.meta?.teacherOnly && role !== "teacher" && role !== "admin") {
    return { name: "Dashboard" };
  }

  return true;
});

export default router;
