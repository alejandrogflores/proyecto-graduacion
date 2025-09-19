// src/stores/profile.ts
import { defineStore } from "pinia";
import { onAuthStateChanged, getIdTokenResult } from "firebase/auth";
import { getDoc } from "firebase/firestore";
import { auth, userDoc } from "@/services/firebase";

type Role = "student" | "teacher" | "admin" | null;

export const useProfileStore = defineStore("profile", {
  state: () => ({
    uid: null as string | null,
    email: null as string | null,
    role: null as Role,     // 👈 aquí caerá "teacher" si existe
    ready: false,
  }),
  getters: {
    isTeacherOrAdmin: (s) => s.role === "teacher" || s.role === "admin",
  },
  actions: {
    init() {
      if (this.ready) return;
      this.ready = true;

      onAuthStateChanged(auth, async (user) => {
        if (!user) {
          this.uid = null;
          this.email = null;
          this.role = null;
          return;
        }

        this.uid = user.uid;
        this.email = user.email ?? null;

        // 1) Refrescar token y leer claims
        try {
          const tokenRes = await getIdTokenResult(user, true);
          const claimRole = tokenRes.claims?.role as Role | undefined;
          console.log("[PROFILE] claims.role =", claimRole);

          // 2) Si no hay claim, intenta leer del doc de usuario
          if (claimRole) {
            this.role = claimRole;
          } else {
            const snap = await getDoc(userDoc(user.uid));
            const docRole = (snap.exists() ? (snap.data() as any).role : null) as Role | null;
            console.log("[PROFILE] doc.role =", docRole);
            this.role = docRole ?? null;
          }
        } catch (e) {
          console.error("[PROFILE] error leyendo role:", e);
          this.role = null;
        }
      });
    },
  },
});







