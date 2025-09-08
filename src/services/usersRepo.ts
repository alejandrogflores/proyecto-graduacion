import { db } from './firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import type { User } from 'firebase/auth';

export type AppUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  role: 'student' | 'teacher';
  createdAt?: any;
  updatedAt?: any;
  grade?: string | null;
};

export async function ensureUserDocument(u: User): Promise<void> {
  const ref = doc(db, 'users', u.uid);
  const snap = await getDoc(ref);

  const base: AppUser = {
    uid: u.uid,
    email: u.email,
    displayName: u.displayName,
    photoURL: u.photoURL,
    role: 'student',
  };

  if (!snap.exists()) {
    await setDoc(ref, { ...base, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  } else {
    await setDoc(ref, { ...base, updatedAt: serverTimestamp() }, { merge: true });
  }
}
