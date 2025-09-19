// src/stores/auth.ts
import { defineStore } from "pinia";
import { useProfileStore } from "@/stores/profile";
import {
  GoogleAuthProvider,
  signInWithPopup,
  setPersistence,
  browserSessionPersistence,
  inMemoryPersistence,
  browserLocalPersistence,
  onAuthStateChanged,
  signOut,
  type User,
} from "firebase/auth";
import { auth } from "@/services/firebase";

let unsubAuth: (() => void) | null = null;

export const useAuthStore = defineStore("auth", {
  state: () => ({
    user: null as User | null,
    ready: false,
  }),

  getters: {
    isLogged: (s) => !!s.user,
  },

  actions: {
    /** Suscribe UNA sola vez al estado de Firebase Auth */
    init() {
      if (unsubAuth) return; // ya suscrito
      unsubAuth = onAuthStateChanged(auth, (u) => {
        this.user = u;
        this.ready = true;
      });
    },

    async loginWithGoogle(persistence: "session" | "memory" | "local" = "session") {
      const map = {
        session: browserSessionPersistence,
        memory: inMemoryPersistence,
        local: browserLocalPersistence,
      } as const;
      await setPersistence(auth, map[persistence]);
      await signInWithPopup(auth, new GoogleAuthProvider());
    },

    async logout() {
      await signOut(auth);
      useProfileStore().clear();
    },
  },
});


