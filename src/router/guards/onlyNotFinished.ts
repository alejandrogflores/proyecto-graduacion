// src/router/guards/onlyNotFinished.ts
import type { NavigationGuardNext, RouteLocationNormalized } from "vue-router";
import { auth, colAttempts } from "@/services/firebase";
import {
  query, where, orderBy, limit, getDocs
} from "firebase/firestore";

export async function onlyNotFinished(to: RouteLocationNormalized, _from: RouteLocationNormalized, next: NavigationGuardNext) {
  try {
    const uid = auth.currentUser?.uid;
    const assignmentId = String(to.params.id || "");
    if (!uid || !assignmentId) return next({ name: "Login", query: { redirect: to.fullPath } });

    // Busca el último intento del usuario (soporta userUid y studentUid)
    const qs: any[] = [];

    qs.push(
      getDocs(
        query(
          colAttempts,
          where("assignmentId", "==", assignmentId),
          where("userUid", "==", uid),
          orderBy("answeredAt", "desc"),
          limit(1)
        )
      )
    );

    qs.push(
      getDocs(
        query(
          colAttempts,
          where("assignmentId", "==", assignmentId),
          where("studentUid", "==", uid),
          orderBy("answeredAt", "desc"),
          limit(1)
        )
      )
    );

    const [snapA, snapB] = await Promise.all(qs);
    const docs = [...snapA.docs, ...snapB.docs];
    const last = docs
      .map((d) => d.data() as any)
      .sort((a, b) => (b?.answeredAt?.toMillis?.() ?? 0) - (a?.answeredAt?.toMillis?.() ?? 0))[0];

    const finished =
      !!last &&
      (last.status === "finished" || last.isFinished === true || !!last.finishedAt);

    if (finished) {
      // Redirige a resultados (si tienes result por intento)
      const attemptId = (snapA.docs[0] || snapB.docs[0])?.id;
      return next({ name: "AssignmentResult", params: { id: assignmentId }, query: { attempt: attemptId } });
    }

    return next(); // permitir resolver
  } catch (e) {
    console.warn("[onlyNotFinished] fallback allow due to error:", e);
    return next(); // en caso de error, deja pasar para no bloquear al alumno
  }
}

