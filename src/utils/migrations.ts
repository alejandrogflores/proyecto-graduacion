import { getDocs, updateDoc } from "firebase/firestore";
import { colProblems } from "@/services/firebase";

export async function migrateProblemsOnce() {
  const snap = await getDocs(colProblems);
  const ops = snap.docs.map((d) => {
    const data = d.data() as any;
    if (!data.type) {
      return updateDoc(d.ref, { type: "multiple-choice" });
    }
    return null;
  });
  await Promise.all(ops);
  console.log("Migración: type=multiple-choice aplicado donde faltaba.");
}
