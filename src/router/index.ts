// src/router/index.ts
import { createRouter, createWebHistory, RouteRecordRaw } from "vue-router";
import { useProfileStore } from "@/stores/profile";

// Base
import Dashboard from "@/views/Dashboard.vue";
import Login from "@/views/Login.vue";

// Problemas (tuyos)
import ProblemsList from "@/views/problems/ProblemsList.vue";
import ProblemForm from "@/views/problems/ProblemForm.vue";
import ProblemSolve from "@/views/solve/SolveProblem.vue";

// Asignaciones
import AssignmentForm from "@/views/assignments/AssignmentForm.vue";
import AssignmentsByClass from "@/views/assignments/AssignmentsByClass.vue";
import MyAssignments from "@/views/assignments/MyAssignments.vue";
import SolveAssignment from "@/views/assignments/SolveAssignment.vue";

// Reportes
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
  { path: "/assignments/:id/play", name: "AssignmentPlay", component: () => import("@/views/assignments/AssignmentPlay.vue"), meta: { requiresAuth: true } },
  // ✅ Asignaciones
  { path: "/assignments/new", name: "AssignmentNew", component: AssignmentForm },
  { path: "/classes/:id/assignments", name: "AssignmentsByClass", component: AssignmentsByClass, props: true },
  { path: "/assignments/my", name: "MyAssignments", component: MyAssignments },
  { path: "/assignments/:id/solve", name: "SolveAssignment", component: SolveAssignment, props: true },
  {
    path: "/attempts",
    name: "TeacherAttempts",
    component: () => import("@/views/reports/AttemptsList.vue"),
    meta: { requiresAuth: true },
  },

  // ✅ Reportes
  { path: "/reports", name: "Reports", component: Reports, meta: { requiresAuth: true, teacherOnly: true } },
  {
    path: "/attempts/:id",
    name: "AttemptDetail",
    component: () => import("@/views/reports/AttemptDetail.vue"),
    meta: { requiresAuth: true, teacherOnly: true },
    props: true,
  },
  {
    path: "/assignments/:id/report",
    name: "AssignmentReport",
    component: () => import("@/views/reports/AssignmentReport.vue"),
    meta: { requiresAuth: true },
    props: true,
  },
  {
    path: "/attempts/:id",
    name: "AttemptDetail",
    component: () => import("@/views/reports/AttemptDetail.vue"),
    meta: { requiresAuth: true },
    props: true,
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(async (to) => {
  if (to.name === "Login") return true;
  const profile = useProfileStore();
  if (!profile.ready) profile.init?.();
  if (!profile.ready) await new Promise(r => setTimeout(r, 0));
  if (!profile.uid) return { name: "Login" };

  // 👇 bloquea rutas solo-docentes
  const role = profile.role;
  if (to.meta?.teacherOnly && role !== "teacher" && role !== "admin") {
    return { name: "Dashboard" }; // o donde prefieras
  }
  return true;
});

export default router;






