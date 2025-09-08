import { getAuth, onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';

/**
 * Devuelve el usuario actual de Firebase (o null) resolviendo
 * cuando Firebase termina de inicializar el estado de auth.
 */
export function getCurrentUser(): Promise<User | null> {
  const auth = getAuth();
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      resolve(user);
    });
  });
}

