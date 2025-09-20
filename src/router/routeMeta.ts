// src/router/routeMeta.ts
export function onlyAuth(extra: Record<string, any> = {}) {
  return { requiresAuth: true, ...extra };
}
export function onlyTeacher(extra: Record<string, any> = {}) {
  return { requiresAuth: true, requiresTeacher: true, ...extra };
}
export function onlyStaff(extra: Record<string, any> = {}) {
  return { requiresAuth: true, roles: ["teacher", "admin"], ...extra };
}
export function onlyAdmin(extra: Record<string, any> = {}) {
  return { requiresAuth: true, roles: ["admin"], ...extra };
}


