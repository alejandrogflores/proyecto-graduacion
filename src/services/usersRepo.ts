// src/services/usersRepo.ts
import { db } from "@/services/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

export type UserRole = "teacher" | "student";
export interface UserProfile {
  uid: string;
  email?: string;
  displayName?: string;
  role: UserRole;
}

export const userDoc = (uid: string) => doc(db, "users", uid);

export async function getUser(uid: string) {
  const snap = await getDoc(userDoc(uid));
  return snap.exists() ? (snap.data() as UserProfile) : null;
}

export async function upsertUser(uid: string, data: Partial<UserProfile>) {
  await setDoc(userDoc(uid), data, { merge: true });
}




