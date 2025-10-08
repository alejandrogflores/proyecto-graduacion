import { query, where, limit, getDocs } from "firebase/firestore";
import { colAttempts, auth } from "@/services/firebase";

/**
 * Bloquea el ingreso a /assignments/:id/solve si ya hay un intento "finished".
 * - Si no hay sesión => redirige a /login con redirect.
 * - Si hay intento finalizado => redirige a resultados con ?attempt=<id>.
 * - Si no hay finalizado => deja pasar.
 */
export async function onlyNotFinished(to: any) {
  const assignmentId = String(to.params.id ?? "");
  if (!assignmentId) return { path: "/" };

  const user = auth.currentUser;
  if (!user) {
    return { path: "/login", query: { redirect: to.fullPath } };
  }

  // ¿Existe intento terminado?
  // Consulta por status = finished (y opcionalmente finishedAt != null si tienes docs antiguos).
  const q = query(
    colAttempts,
    where("assignmentId", "==", assignmentId),
    where("studentUid", "==", user.uid),
    where("status", "==", "finished"),
    limit(1)
  );

  const snap = await getDocs(q);
  if (!snap.empty) {
    const attemptId = snap.docs[0].id;
    // ✅ Guarda aviso de redirección
    sessionStorage.setItem("assignmentNotice", "Ya completaste esta asignación");
    return {
      name: "AssignmentResult",
      params: { id: assignmentId },
      query: { attempt: attemptId },
    };
  }

  // (Fallback opcional por compatibilidad con intentos viejos sin "status")
  // Descomenta si lo necesitas:
  // const qLegacy = query(
  //   colAttempts,
  //   where("assignmentId", "==", assignmentId),
  //   where("studentUid", "==", user.uid),
  //   where("finishedAt", "!=", null),
  //   limit(1)
  // );
  // const snapLegacy = await getDocs(qLegacy);
  // if (!snapLegacy.empty) {
  //   const attemptId = snapLegacy.docs[0].id;
  //   return { name: "AssignmentResult", params: { id: assignmentId }, query: { attempt: attemptId } };
  // }

  // Sin finalizados: permitir acceso
  return true;
}
