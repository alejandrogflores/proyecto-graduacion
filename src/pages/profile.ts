import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/services/firebase";
import { userDoc, getUser, upsertUser } from "@/services/usersRepo";

export async function loadProfile() {
  return new Promise<void>((resolve) => {
    const off = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        console.warn("No hay usuario autenticado");
        off();
        return resolve();
      }

      // ejemplo: leer y actualizar algo
      const data = await getUser(u.uid);
      console.log("Perfil:", data);
      await upsertUser(u.uid, { lastSeen: new Date() } as any);

      off();
      resolve();
    });
  });
}


