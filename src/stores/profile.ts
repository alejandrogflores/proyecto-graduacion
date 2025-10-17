// src/stores/profile.ts
import { defineStore } from "pinia";
import {
  onAuthStateChanged,
  getIdTokenResult,
  type User,
  signOut,                // 👈 importa signOut
} from "firebase/auth";
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
  lastClassId: string | null;
  _unsub?: () => void;
}

/**
 * Intenta rol por:
 * 1) Custom claims ({ role })
 * 2) Doc /users/{uid}.role
 * 3) Por defecto "student"
 */
async function resolveRole(u: User): Promise<Role> {
  const { claims } = await getIdTokenResult(u);
  const claimRole = (claims?.role as Role | undefined) ?? null;
  if (claimRole === "teacher" || claimRole === "admin" || claimRole === "student") {
    return claimRole;
  }

  const snap = await getDoc(userDoc(u.uid));
  const docRole = (snap.exists() ? (snap.data() as any)?.role : null) as NullableRole;
  if (docRole === "teacher" || docRole === "admin") return docRole;

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
    lastClassId: null,
    _unsub: undefined,
  }),

  getters: {
    isTeacherOrAdmin: (s) => s.role === "teacher" || s.role === "admin",
  },

  actions: {
    // 👉 centraliza limpieza de estado
    clear() {
      this.uid = null;
      this.email = null;
      this.displayName = null;
      this.photoURL = null;
      this.role = null;
      this.lastClassId = null;
    },

    // setter auxiliar ya existente
    setLastClassId(id: string) {
      this.lastClassId = id;
    },

    init() {
      // evita suscribirte más de una vez
      if (this._unsub) return;

      this.ready = false;

      this._unsub = onAuthStateChanged(auth, async (u) => {
        try {
          if (!u) {
            // usuario deslogueado
            this.clear();
            return;
          }

          this.uid = u.uid;
          this.email = u.email ?? null;
          this.displayName = u.displayName ?? null;
          this.photoURL = u.photoURL ?? null;

          this.role = await resolveRole(u);

          // asegura /users/{uid} y registra lastSeen
          const uref = userDoc(u.uid);
          const usnap = await getDoc(uref);
          if (!usnap.exists()) {
            await setDoc(
              uref,
              {
                uid: u.uid,
                email: this.email,
                displayName: this.displayName,
                photoURL: this.photoURL,
                role: this.role ?? "student",
                createdAt: serverTimestamp(),
                lastSeen: serverTimestamp(),
              },
              { merge: true }
            );
          } else {
            await setDoc(uref, { lastSeen: serverTimestamp() }, { merge: true });
          }
        } catch (e) {
          console.error("[profile.init] error:", e);
          this.role = (this.role as Role) ?? "student";
        } finally {
          this.ready = true;
        }
      });
    },

    async refresh() {
      const u = auth.currentUser;
      if (!u) return;
      await u.getIdToken(true);
      this.role = await resolveRole(u);
    },

    // 👇 NUEVO: acción de logout tipada (soluciona el error en AppTopBar.vue)
    async logout() {
      try {
        await signOut(auth);
      } finally {
        this.clear();
        // opcional: mantener la suscripción para que init no se duplique
        this.ready = true;
      }
    },

    // mantiene la opción de reset manual (si la usas en otros flujos)
    reset() {
      if (this._unsub) {
        this._unsub();
        this._unsub = undefined;
      }
      this.$reset();
    },
  },
});
