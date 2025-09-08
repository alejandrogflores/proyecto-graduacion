import { createRouter, createWebHistory } from 'vue-router';
import { getCurrentUser } from '../utils/authGuard';

const routes = [
  { path: '/login', component: () => import('../pages/Login.vue') },
  { path: '/', component: () => import('../pages/Exercises.vue') }, // pública por ahora
  { path: '/exercise/:id', component: () => import('../pages/Exercise.vue'), meta: { auth: true } },
  { path: '/progress', component: () => import('../pages/Progress.vue'), meta: { auth: true } },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// Guard global: verifica meta.auth
router.beforeEach(async (to) => {
  if (!to.meta.auth) return true;               // ruta pública
  const user = await getCurrentUser();          // espera a que Firebase resuelva
  if (user) return true;                        // hay sesión, continúa
  return { path: '/login', query: { redirect: to.fullPath } }; // redirige y guarda adónde volver
});

export default router;
