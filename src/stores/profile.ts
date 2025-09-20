// src/stores/profile.ts
import { defineStore } from "pinia";
import { onAuthStateChanged, getIdTokenResult, type User } from "firebase/auth";
import { auth, userDoc } from "@/services/firebase";
import { getDoc, setDoc, serverTimestamp } from "firebase/firestore";

export type Role = "student" | "teacher" | "admin";
type NullableRole = Role | null;

interface ProfileState {
  ready: boolean;
  uid: string | null;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  role: NullableRole;
  _unsub?: () => void;
}

/**
 * Intenta rol por:
 * 1) Custom claims ({ role })
 * 2) Doc /users/{uid}.role
 * 3) Por defecto "student"
 */
async function resolveRole(u: User): Promise<Role> {
  // 1) custom claims
  const { claims } = await getIdTokenResult(u);
  const claimRole = (claims?.role as Role | undefined) ?? null;
  if (claimRole === "teacher" || claimRole === "admin" || claimRole === "student") {
    return claimRole;
  }

  // 2) fallback: doc users/{uid}
  const snap = await getDoc(userDoc(u.uid));
  const docRole = (snap.exists() ? (snap.data() as any)?.role : null) as NullableRole;
  if (docRole === "teacher" || docRole === "admin") return docRole;

  // 3) por defecto
  return "student";
}

export const useProfileStore = defineStore("profile", {
  state: (): ProfileState => ({
    ready: false,
    uid: null,
    email: null,
    displayName: null,
    photoURL: null,
    role: null,
    _unsub: undefined,
  }),

  getters: {
    isTeacherOrAdmin: (s) => s.role === "teacher" || s.role === "admin",
  },

  actions: {
    init() {
      // evita suscribirte más de una vez
      if (this._unsub) return;

      // marca como no listo mientras se resuelve
      this.ready = false;

      this._unsub = onAuthStateChanged(auth, async (u) => {
        try {
          if (!u) {
            // sesión cerrada
            this.uid = this.email = this.displayName = this.photoURL = null;
            this.role = null;
            return; // ready se marca en finally
          }

          // sesión abierta → datos básicos
          this.uid = u.uid;
          this.email = u.email ?? null;
          this.displayName = u.displayName ?? null;
          this.photoURL = u.photoURL ?? null;

          // resuelve rol (claims -> users doc -> "student")
          this.role = await resolveRole(u);

          // (opcional pero útil) asegura que /users/{uid} exista
          // y registra lastSeen (para auditoría, no afecta reglas)
          const uref = userDoc(u.uid);
          const usnap = await getDoc(uref);
          if (!usnap.exists()) {
            await setDoc(uref, {
              uid: u.uid,
              email: this.email,
              displayName: this.displayName,
              photoURL: this.photoURL,
              role: this.role ?? "student",
              createdAt: serverTimestamp(),
              lastSeen: serverTimestamp(),
            }, { merge: true });
          } else {
            await setDoc(uref, { lastSeen: serverTimestamp() }, { merge: true });
          }
        } catch (e) {
          console.error("[profile.init] error:", e);
          // no bloquees la UI: usa el último rol conocido o "student"
          this.role = (this.role as Role) ?? "student";
        } finally {
          // ✅ siempre marca listo para que la UI (badge/botón) reaccione
          this.ready = true;
        }
      });
    },

    async refresh() {
      const u = auth.currentUser;
      if (!u) return;
      await u.getIdToken(true); // fuerza refresco de claims
      this.role = await resolveRole(u);
    },

    reset() {
      if (this._unsub) {
        this._unsub();
        this._unsub = undefined;
      }
      this.$reset();
    },
  },
});










