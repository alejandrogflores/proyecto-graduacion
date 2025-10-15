// src/models/problem.ts
import { db } from "@/services/firebase";
export type Difficulty = "easy" | "medium" | "hard";
export type Visibility = "public" | "private" | "archived";

export type Problem = {
  title: string;
  statement: string;
  options: string[];
  correctIndex: number;
  createdAt?: any;
  updatedAt?: any;
  createdBy?: string;

  // NUEVOS (opcionales)
  tags?: string[];
  difficulty?: Difficulty;
  version?: number;
  visibility?: Visibility;
};

export function withProblemDefaults(p: any) {
  return {
    ...p,
    tags: Array.isArray(p?.tags) ? p.tags : [],
    difficulty: (["easy", "medium", "hard"].includes(p?.difficulty)
      ? p.difficulty
      : "medium") as Difficulty,
    version: Number.isFinite(p?.version) ? p.version : 1,
    visibility: (["public", "private", "archived"].includes(p?.visibility)
      ? p.visibility
      : "public") as Visibility,
  };
}

/** Normaliza un input de tags (csv o array) a string[] sin vacíos/duplicados */
export function normalizeTags(input: string | string[] | undefined): string[] {
  const arr = Array.isArray(input)
    ? input
    : (input ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
  // dedupe y en minúsculas
  const set = new Set(arr.map((t) => t.toLowerCase()));
  return Array.from(set);
}

// al final del archivo si no existía ya
import { collection, doc } from "firebase/firestore";
export const colProblems = collection(db, "problems");
export const problemDoc = (id: string) => doc(db, "problems", id);
